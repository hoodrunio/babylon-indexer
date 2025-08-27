/**
 * BSN Consumer Service
 * Handles BSN consumer registry endpoints and caching
 */

import { Network, ConsumerType } from '../../types/bsn';
import { 
    ConsumerRegisterResponse, 
    BSNConsumerParams,
    ConsumerListQuery,
    ConsumerStats,
    ConsumerRegister
} from '../../types/bsn/consumer';
import { BabylonClient } from '../../clients/BabylonClient';
import { CacheService } from '../CacheService';
import { ZoneConciergeService } from './ZoneConciergeService';
import { logger } from '../../utils/logger';

interface CacheEntry<T> {
    data: T;
    lastFetched: number;
}

export class BSNConsumerService {
    private static instance: BSNConsumerService | null = null;
    private babylonClient: BabylonClient;
    private network: Network;
    private cache: CacheService;
    private revalidationPromises: Map<string, Promise<any>> = new Map();
    
    // Cache TTL values (in seconds)
    private readonly CACHE_TTL = {
        CONSUMERS_LIST: 300, // 5 minutes
        CONSUMER_DETAILS: 300, // 5 minutes
        CONSUMER_PARAMS: 600, // 10 minutes
        CONSUMER_STATS: 300 // 5 minutes
    };

    private constructor() {
        try {
            this.babylonClient = BabylonClient.getInstance();
            this.network = this.babylonClient.getNetwork();
            this.cache = CacheService.getInstance();
            logger.info(`[BSNConsumerService] Client initialized successfully for network: ${this.network}`);
        } catch (error) {
            logger.error('[BSNConsumerService] Failed to initialize BabylonClient:', error);
            throw new Error('[BSNConsumerService] Failed to initialize BabylonClient. Please check your NETWORK environment variable.');
        }
    }

    public static getInstance(): BSNConsumerService {
        if (!BSNConsumerService.instance) {
            BSNConsumerService.instance = new BSNConsumerService();
        }
        return BSNConsumerService.instance;
    }

    private getNetworkConfig() {
        return {
            nodeUrl: this.babylonClient.getBaseUrl(),
            rpcUrl: this.babylonClient.getRpcUrl()
        };
    }

    private async getWithRevalidate<T>(
        cacheKey: string,
        ttl: number,
        fetchFn: () => Promise<T>
    ): Promise<T> {
        try {
            const cachedEntry = await this.cache.get<CacheEntry<T>>(cacheKey);

            if (this.revalidationPromises.has(cacheKey)) {
                if (cachedEntry) {
                    return cachedEntry.data;
                }
                return this.revalidationPromises.get(cacheKey)!;
            }

            const now = Date.now();

            if (cachedEntry && (now - cachedEntry.lastFetched) < ttl * 1000) {
                return cachedEntry.data;
            }

            if (cachedEntry) {
                this.revalidateInBackground(cacheKey, fetchFn, ttl);
                return cachedEntry.data;
            }

            const revalidationPromise = this.fetchAndCache(cacheKey, fetchFn, ttl);
            this.revalidationPromises.set(cacheKey, revalidationPromise);

            const data = await revalidationPromise;
            this.revalidationPromises.delete(cacheKey);
            return data;
        } catch (error) {
            this.revalidationPromises.delete(cacheKey);
            throw error;
        }
    }

    private async revalidateInBackground<T>(
        cacheKey: string,
        fetchFn: () => Promise<T>,
        ttl: number
    ): Promise<void> {
        if (this.revalidationPromises.has(cacheKey)) {
            return;
        }

        const revalidationPromise = this.fetchAndCache(cacheKey, fetchFn, ttl);
        this.revalidationPromises.set(cacheKey, revalidationPromise);

        try {
            await revalidationPromise;
        } catch (error) {
            logger.error(`Background revalidation failed for ${cacheKey}:`, error);
        } finally {
            this.revalidationPromises.delete(cacheKey);
        }
    }

    private async fetchAndCache<T>(
        cacheKey: string,
        fetchFn: () => Promise<T>,
        ttl: number
    ): Promise<T> {
        const data = await fetchFn();
        const entry: CacheEntry<T> = {
            data,
            lastFetched: Date.now()
        };
        await this.cache.set(cacheKey, entry, ttl);
        return data;
    }

    /**
     * Determine consumer type based on channel_id
     * If channel_id is empty -> ROLLUP, otherwise -> COSMOS
     */
    private determineConsumerType(consumer: ConsumerRegister): ConsumerType {
        if (consumer.cosmos_channel_id && consumer.cosmos_channel_id.trim() !== '') {
            return ConsumerType.COSMOS;
        }
        return ConsumerType.ROLLUP;
    }

    /**
     * Check if consumer is active by testing if it has finalized BSN data
     */
    private async checkConsumerActivity(consumerId: string, network: Network): Promise<boolean> {
        try {
            // We'll need to get ZoneConciergeService instance, but avoid circular dependency
            // For now, we'll make a direct API call to check finality
            const { nodeUrl } = this.getNetworkConfig();
            const url = new URL(`${nodeUrl}/babylon/zoneconcierge/v1/finalized_bsns_info`);
            url.searchParams.append('consumer_ids', consumerId);
            url.searchParams.append('prove', 'false');

            const response = await fetch(url.toString());
            
            if (response.status === 400) {
                // BSN not registered or no finalized data = inactive
                return false;
            }
            
            if (response.ok) {
                const data = await response.json() as { finalized_bsns_data?: any[] };
                return !!(data.finalized_bsns_data && data.finalized_bsns_data.length > 0);
            }
            
            return false;
        } catch (error) {
            logger.debug(`[BSNConsumerService] Could not check activity for ${consumerId}:`, error);
            return false;
        }
    }

    /**
     * Get BSN consumer parameters
     */
    public async getConsumerParams(network: Network = this.network): Promise<BSNConsumerParams> {
        const cacheKey = `bsn:params:${network}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.CONSUMER_PARAMS,
            async () => {
                const { nodeUrl } = this.getNetworkConfig();
                const response = await fetch(`${nodeUrl}/babylon/btcstkconsumer/v1/params`);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json() as { params?: BSNConsumerParams };
                return data.params || {};
            }
        );
    }

    /**
     * Get all registered BSN consumers
     */
    public async getConsumerRegistryList(
        query: ConsumerListQuery = {},
        network: Network = this.network
    ): Promise<{
        consumers: ConsumerRegisterResponse[];
        pagination: {
            total: number;
            hasMore: boolean;
        };
    }> {
        const cacheKey = `bsn:consumers:list:${network}:${JSON.stringify(query)}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.CONSUMERS_LIST,
            async () => {
                const { nodeUrl } = this.getNetworkConfig();
                const url = new URL(`${nodeUrl}/babylon/btcstkconsumer/v1/consumer_registry_list`);
                
                // Add pagination parameters
                if (query.limit) {
                    url.searchParams.append('pagination.limit', query.limit.toString());
                }
                if (query.offset) {
                    url.searchParams.append('pagination.offset', query.offset.toString());
                }

                const response = await fetch(url.toString());
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json() as { 
                    consumer_registers?: ConsumerRegister[]; 
                    pagination?: { total?: number; next_key?: string } 
                };
                const rawConsumers = data.consumer_registers || [];
                
                // Transform to response format with async activity checks
                const consumers: ConsumerRegisterResponse[] = await Promise.all(
                    rawConsumers.map(async (consumer: ConsumerRegister) => {
                        // Determine consumer type based on channel_id
                        const consumerType = this.determineConsumerType(consumer);
                        
                        // Check activity status using finalized BSN data
                        const isActive = await this.checkConsumerActivity(consumer.consumer_id, network);
                        
                        return {
                            consumer_id: consumer.consumer_id,
                            consumer_name: consumer.consumer_name,
                            consumer_description: consumer.consumer_description,
                            consumer_type: consumerType,
                            cosmos_channel_id: consumer.cosmos_channel_id,
                            rollup_finality_contract_address: consumer.rollup_finality_contract_address,
                            babylon_rewards_commission: consumer.babylon_rewards_commission,
                            is_active: isActive,
                            registration_time: consumer.created_at,
                            last_activity: consumer.updated_at
                        };
                    })
                );
                
                // Apply client-side filtering if needed
                let filteredConsumers = consumers;
                
                if (query.consumer_type) {
                    filteredConsumers = filteredConsumers.filter((c: ConsumerRegisterResponse) => 
                        c.consumer_type === query.consumer_type
                    );
                }
                
                if (query.is_active !== undefined) {
                    filteredConsumers = filteredConsumers.filter((c: ConsumerRegisterResponse) => 
                        c.is_active === query.is_active
                    );
                }

                // Apply sorting
                if (query.sort_by) {
                    filteredConsumers.sort((a: ConsumerRegisterResponse, b: ConsumerRegisterResponse) => {
                        const aValue = a[query.sort_by as keyof ConsumerRegisterResponse];
                        const bValue = b[query.sort_by as keyof ConsumerRegisterResponse];
                        
                        if (query.sort_order === 'desc') {
                            return (bValue || 0) > (aValue || 0) ? 1 : -1;
                        }
                        return (aValue || 0) > (bValue || 0) ? 1 : -1;
                    });
                }

                return {
                    consumers: filteredConsumers,
                    pagination: {
                        total: data.pagination?.total || filteredConsumers.length,
                        hasMore: !!data.pagination?.next_key
                    }
                };
            }
        );
    }

    /**
     * Get specific BSN consumers by IDs
     */
    public async getConsumersRegistry(
        consumerIds: string[],
        network: Network = this.network
    ): Promise<ConsumerRegisterResponse[]> {
        const cacheKey = `bsn:consumers:registry:${network}:${consumerIds.join(',')}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.CONSUMER_DETAILS,
            async () => {
                const { nodeUrl } = this.getNetworkConfig();
                const idsParam = consumerIds.join(',');
                const response = await fetch(
                    `${nodeUrl}/babylon/btcstkconsumer/v1/consumers_registry/${idsParam}`
                );
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json() as { consumer_registers?: ConsumerRegister[] };
                const rawConsumers = data.consumer_registers || [];
                
                // Transform to response format with computed fields (same logic as getConsumerRegistryList)
                return await Promise.all(
                    rawConsumers.map(async (consumer: ConsumerRegister) => {
                        // Determine consumer type based on channel_id
                        const consumerType = this.determineConsumerType(consumer);
                        
                        // Check activity status using finalized BSN data
                        const isActive = await this.checkConsumerActivity(consumer.consumer_id, network);
                        
                        return {
                            consumer_id: consumer.consumer_id,
                            consumer_name: consumer.consumer_name,
                            consumer_description: consumer.consumer_description,
                            consumer_type: consumerType,
                            cosmos_channel_id: consumer.cosmos_channel_id,
                            rollup_finality_contract_address: consumer.rollup_finality_contract_address,
                            babylon_rewards_commission: consumer.babylon_rewards_commission,
                            is_active: isActive,
                            registration_time: consumer.created_at,
                            last_activity: consumer.updated_at
                        };
                    })
                );
            }
        );
    }

    /**
     * Get a single BSN consumer by ID
     */
    public async getConsumerById(
        consumerId: string,
        network: Network = this.network
    ): Promise<ConsumerRegisterResponse | null> {
        try {
            const consumers = await this.getConsumersRegistry([consumerId], network);
            return consumers.length > 0 ? consumers[0] : null;
        } catch (error) {
            logger.error(`Error fetching consumer ${consumerId}:`, error);
            return null;
        }
    }

    /**
     * Get BSN consumer statistics (from database)
     */
    public async getConsumerStats(
        consumerId: string,
        network: Network = this.network
    ): Promise<ConsumerStats | null> {
        const cacheKey = `bsn:consumer:stats:${consumerId}:${network}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.CONSUMER_STATS,
            async () => {
                // TODO: Implement database aggregation for consumer statistics
                // This will be implemented when we have event processing in place
                logger.info(`[BSNConsumerService] Consumer stats not yet implemented for ${consumerId}`);
                return null;
            }
        );
    }

    /**
     * Check if a consumer is active
     */
    public async isConsumerActive(
        consumerId: string,
        network: Network = this.network
    ): Promise<boolean> {
        try {
            const consumer = await this.getConsumerById(consumerId, network);
            return consumer?.is_active || false;
        } catch (error) {
            logger.error(`Error checking consumer activity for ${consumerId}:`, error);
            return false;
        }
    }

    /**
     * Get consumer types with counts
     */
    public async getConsumerTypeCounts(
        network: Network = this.network
    ): Promise<Record<string, number>> {
        const cacheKey = `bsn:consumer:type-counts:${network}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.CONSUMERS_LIST,
            async () => {
                const { consumers } = await this.getConsumerRegistryList({}, network);
                
                const counts: Record<string, number> = {
                    COSMOS: 0,
                    ROLLUP: 0,
                    TOTAL: consumers.length,
                    ACTIVE: consumers.filter(c => c.is_active).length
                };

                consumers.forEach(consumer => {
                    counts[consumer.consumer_type] = (counts[consumer.consumer_type] || 0) + 1;
                });

                return counts;
            }
        );
    }
}
