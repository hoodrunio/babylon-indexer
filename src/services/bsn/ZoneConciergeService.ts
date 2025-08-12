/**
 * ZoneConcierge Service
 * Handles BSN finality and header finalization endpoints
 */

import { Network } from '../../types/bsn';
import { 
    FinalizedBSNData,
    ZoneConciergeParams,
    FinalityQuery,
    FinalityStats
} from '../../types/bsn/finality';
import { BabylonClient } from '../../clients/BabylonClient';
import { CacheService } from '../CacheService';
import { logger } from '../../utils/logger';

interface CacheEntry<T> {
    data: T;
    lastFetched: number;
}

export class ZoneConciergeService {
    private static instance: ZoneConciergeService | null = null;
    private babylonClient: BabylonClient;
    private network: Network;
    private cache: CacheService;
    private revalidationPromises: Map<string, Promise<any>> = new Map();
    
    // Cache TTL values (in seconds)
    private readonly CACHE_TTL = {
        FINALIZED_BSNS: 300, // 5 minutes
        FINALITY_PARAMS: 600, // 10 minutes
        FINALITY_STATS: 300, // 5 minutes
        EPOCH_INFO: 180 // 3 minutes
    };

    private constructor() {
        try {
            this.babylonClient = BabylonClient.getInstance();
            this.network = this.babylonClient.getNetwork();
            this.cache = CacheService.getInstance();
            logger.info(`[ZoneConciergeService] Client initialized successfully for network: ${this.network}`);
        } catch (error) {
            logger.error('[ZoneConciergeService] Failed to initialize BabylonClient:', error);
            throw new Error('[ZoneConciergeService] Failed to initialize BabylonClient. Please check your NETWORK environment variable.');
        }
    }

    public static getInstance(): ZoneConciergeService {
        if (!ZoneConciergeService.instance) {
            ZoneConciergeService.instance = new ZoneConciergeService();
        }
        return ZoneConciergeService.instance;
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
     * Get ZoneConcierge parameters
     */
    public async getZoneConciergeParams(network: Network = this.network): Promise<ZoneConciergeParams> {
        const cacheKey = `zoneconcierge:params:${network}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.FINALITY_PARAMS,
            async () => {
                const { nodeUrl } = this.getNetworkConfig();
                const response = await fetch(`${nodeUrl}/babylon/zoneconcierge/v1/params`);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                return data.params || {};
            }
        );
    }

    /**
     * Get finalized BSN information
     */
    public async getFinalizedBSNsInfo(
        consumerIds: string[],
        prove: boolean = false,
        network: Network = this.network
    ): Promise<FinalizedBSNData[]> {
        const cacheKey = `zoneconcierge:finalized:${network}:${consumerIds.join(',')}:${prove}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.FINALIZED_BSNS,
            async () => {
                const { nodeUrl } = this.getNetworkConfig();
                const url = new URL(`${nodeUrl}/babylon/zoneconcierge/v1/finalized_bsns_info`);
                
                // Add consumer IDs as query parameters
                consumerIds.forEach(id => {
                    url.searchParams.append('consumer_ids', id);
                });
                
                // Add proof parameter
                url.searchParams.append('prove', prove.toString());

                const response = await fetch(url.toString());
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                return data.finalized_bsns_data || [];
            }
        );
    }

    /**
     * Get finalized BSN info for a single consumer
     */
    public async getFinalizedBSNInfo(
        consumerId: string,
        prove: boolean = false,
        network: Network = this.network
    ): Promise<FinalizedBSNData | null> {
        try {
            const results = await this.getFinalizedBSNsInfo([consumerId], prove, network);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            logger.error(`Error fetching finalized BSN info for ${consumerId}:`, error);
            return null;
        }
    }

    /**
     * Get all finalized BSNs with pagination support
     */
    public async getAllFinalizedBSNs(
        query: FinalityQuery = {},
        network: Network = this.network
    ): Promise<{
        data: FinalizedBSNData[];
        pagination: {
            total: number;
            hasMore: boolean;
        };
    }> {
        const cacheKey = `zoneconcierge:all-finalized:${network}:${JSON.stringify(query)}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.FINALIZED_BSNS,
            async () => {
                // If specific consumer IDs are provided, use them
                if (query.consumer_ids && query.consumer_ids.length > 0) {
                    const data = await this.getFinalizedBSNsInfo(
                        query.consumer_ids, 
                        query.prove || false, 
                        network
                    );
                    
                    return {
                        data,
                        pagination: {
                            total: data.length,
                            hasMore: false
                        }
                    };
                }

                // If no specific consumer IDs, we need to get all consumers first
                // This would require integration with BSNConsumerService
                logger.warn('[ZoneConciergeService] Getting all finalized BSNs without consumer IDs not yet implemented');
                return {
                    data: [],
                    pagination: {
                        total: 0,
                        hasMore: false
                    }
                };
            }
        );
    }

    /**
     * Get BSN finality statistics (from database)
     */
    public async getFinalityStats(
        consumerId: string,
        network: Network = this.network
    ): Promise<FinalityStats | null> {
        const cacheKey = `zoneconcierge:stats:${consumerId}:${network}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.FINALITY_STATS,
            async () => {
                // TODO: Implement database aggregation for finality statistics
                // This will be implemented when we have event processing in place
                logger.info(`[ZoneConciergeService] Finality stats not yet implemented for ${consumerId}`);
                return null;
            }
        );
    }

    /**
     * Check if a BSN is finalized
     */
    public async isBSNFinalized(
        consumerId: string,
        network: Network = this.network
    ): Promise<boolean> {
        try {
            const finalizedData = await this.getFinalizedBSNInfo(consumerId, false, network);
            return finalizedData !== null && finalizedData.is_verified;
        } catch (error) {
            logger.error(`Error checking BSN finalization for ${consumerId}:`, error);
            return false;
        }
    }

    /**
     * Get latest finalized epoch for a BSN
     */
    public async getLatestFinalizedEpoch(
        consumerId: string,
        network: Network = this.network
    ): Promise<number | null> {
        try {
            const finalizedData = await this.getFinalizedBSNInfo(consumerId, false, network);
            return finalizedData?.epoch_info.epoch_number || null;
        } catch (error) {
            logger.error(`Error getting latest finalized epoch for ${consumerId}:`, error);
            return null;
        }
    }

    /**
     * Get finalization status for multiple BSNs
     */
    public async getBSNFinalizationStatus(
        consumerIds: string[],
        network: Network = this.network
    ): Promise<Record<string, {
        isFinalized: boolean;
        latestEpoch: number | null;
        lastFinalizationTime: Date | null;
    }>> {
        const cacheKey = `zoneconcierge:status:${network}:${consumerIds.join(',')}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.FINALIZED_BSNS,
            async () => {
                const status: Record<string, {
                    isFinalized: boolean;
                    latestEpoch: number | null;
                    lastFinalizationTime: Date | null;
                }> = {};

                try {
                    const finalizedData = await this.getFinalizedBSNsInfo(consumerIds, false, network);
                    
                    // Initialize all consumers as not finalized
                    consumerIds.forEach(id => {
                        status[id] = {
                            isFinalized: false,
                            latestEpoch: null,
                            lastFinalizationTime: null
                        };
                    });

                    // Update with actual finalization data
                    finalizedData.forEach(data => {
                        status[data.consumer_id] = {
                            isFinalized: data.is_verified,
                            latestEpoch: data.epoch_info.epoch_number,
                            lastFinalizationTime: data.finalization_time
                        };
                    });

                } catch (error) {
                    logger.error('Error getting BSN finalization status:', error);
                    // Return default status for all consumers
                    consumerIds.forEach(id => {
                        status[id] = {
                            isFinalized: false,
                            latestEpoch: null,
                            lastFinalizationTime: null
                        };
                    });
                }

                return status;
            }
        );
    }

    /**
     * Get current Babylon epoch information
     */
    public async getCurrentEpochInfo(network: Network = this.network): Promise<{
        epoch_number: number;
        current_epoch_interval: number;
        first_block_height: number;
    } | null> {
        const cacheKey = `zoneconcierge:current-epoch:${network}`;
        return this.getWithRevalidate(
            cacheKey,
            this.CACHE_TTL.EPOCH_INFO,
            async () => {
                try {
                    // This would typically come from a Babylon epoching endpoint
                    // For now, we'll implement this when the endpoint is available
                    logger.info('[ZoneConciergeService] Current epoch info endpoint not yet implemented');
                    return null;
                } catch (error) {
                    logger.error('Error getting current epoch info:', error);
                    return null;
                }
            }
        );
    }
}
