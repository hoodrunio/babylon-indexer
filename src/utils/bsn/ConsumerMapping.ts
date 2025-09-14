/**
 * BSN Consumer Mapping Utility
 * Maps contract addresses to consumer IDs and manages consumer metadata
 */

import { BSNConsumer } from '../../database/models/bsn';
import { Network, ConsumerType } from '../../types/bsn';
import { logger } from '../logger';

export interface ConsumerInfo {
  consumer_id: string;
  consumer_name: string;
  consumer_type: ConsumerType;
  contract_address?: string;
  cosmos_channel_id?: string;
  is_active: boolean;
}

export class ConsumerMapping {
  private static instance: ConsumerMapping | null = null;
  private contractToConsumerMap: Map<string, ConsumerInfo> = new Map();
  private consumerToContractMap: Map<string, string> = new Map();
  private lastRefresh: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): ConsumerMapping {
    if (!ConsumerMapping.instance) {
      ConsumerMapping.instance = new ConsumerMapping();
    }
    return ConsumerMapping.instance;
  }

  /**
   * Get consumer ID from contract address
   */
  async getConsumerIdFromContract(contractAddress: string, network: Network): Promise<string | null> {
    await this.ensureCacheIsValid(network);
    
    const consumerInfo = this.contractToConsumerMap.get(contractAddress);
    return consumerInfo?.consumer_id || null;
  }

  /**
   * Get consumer info from contract address
   */
  async getConsumerInfoFromContract(contractAddress: string, network: Network): Promise<ConsumerInfo | null> {
    await this.ensureCacheIsValid(network);
    
    return this.contractToConsumerMap.get(contractAddress) || null;
  }

  /**
   * Get contract address from consumer ID
   */
  async getContractFromConsumerId(consumerId: string, network: Network): Promise<string | null> {
    await this.ensureCacheIsValid(network);
    
    return this.consumerToContractMap.get(consumerId) || null;
  }

  /**
   * Get all active rollup consumers for a network
   */
  async getActiveRollupConsumers(network: Network): Promise<ConsumerInfo[]> {
    await this.ensureCacheIsValid(network);
    
    return Array.from(this.contractToConsumerMap.values()).filter(
      consumer => consumer.consumer_type === ConsumerType.ROLLUP && consumer.is_active
    );
  }

  /**
   * Add or update consumer mapping
   */
  async addConsumerMapping(
    consumerId: string,
    contractAddress: string,
    consumerName: string,
    consumerType: ConsumerType,
    network: Network,
    options: {
      cosmosChannelId?: string;
      isActive?: boolean;
      registrationHeight?: number;
      registrationTxHash?: string;
    } = {}
  ): Promise<void> {
    try {
      // Check if consumer already exists
      let consumer = await BSNConsumer.findOne({ consumer_id: consumerId, network });
      
      if (consumer) {
        // Update existing consumer
        consumer.consumer_name = consumerName;
        consumer.consumer_type = consumerType;
        consumer.is_active = options.isActive ?? consumer.is_active;
        
        if (consumerType === ConsumerType.ROLLUP) {
          consumer.rollup_finality_contract_address = contractAddress;
        } else {
          consumer.cosmos_channel_id = options.cosmosChannelId;
        }
        
        await consumer.save();
      } else {
        // Create new consumer
        consumer = new BSNConsumer({
          consumer_id: consumerId,
          consumer_name: consumerName,
          consumer_type: consumerType,
          rollup_finality_contract_address: consumerType === ConsumerType.ROLLUP ? contractAddress : undefined,
          cosmos_channel_id: consumerType === ConsumerType.COSMOS ? options.cosmosChannelId : undefined,
          babylon_rewards_commission: '0.1', // Default commission
          is_active: options.isActive ?? true,
          registration_height: options.registrationHeight ?? 0,
          registration_tx_hash: options.registrationTxHash ?? '',
          network,
          last_updated_height: options.registrationHeight ?? 0
        });
        
        await consumer.save();
      }

      // Update cache
      this.invalidateCache();
      await this.ensureCacheIsValid(network);
      
      logger.info(`[ConsumerMapping] Added/updated consumer mapping: ${consumerId} -> ${contractAddress}`);
    } catch (error) {
      logger.error(`[ConsumerMapping] Error adding consumer mapping: ${error}`);
      throw error;
    }
  }

  /**
   * Refresh consumer mappings from database
   */
  private async refreshMappings(network: Network): Promise<void> {
    try {
      this.contractToConsumerMap.clear();
      this.consumerToContractMap.clear();

      const consumers = await BSNConsumer.find({ network }).lean();
      
      for (const consumer of consumers) {
        const consumerInfo: ConsumerInfo = {
          consumer_id: consumer.consumer_id,
          consumer_name: consumer.consumer_name,
          consumer_type: consumer.consumer_type,
          is_active: consumer.is_active
        };

        if (consumer.consumer_type === ConsumerType.ROLLUP && consumer.rollup_finality_contract_address) {
          consumerInfo.contract_address = consumer.rollup_finality_contract_address;
          this.contractToConsumerMap.set(consumer.rollup_finality_contract_address, consumerInfo);
          this.consumerToContractMap.set(consumer.consumer_id, consumer.rollup_finality_contract_address);
        } else if (consumer.consumer_type === ConsumerType.COSMOS && consumer.cosmos_channel_id) {
          consumerInfo.cosmos_channel_id = consumer.cosmos_channel_id;
          this.consumerToContractMap.set(consumer.consumer_id, consumer.cosmos_channel_id);
        }
      }

      this.lastRefresh = Date.now();
      logger.info(`[ConsumerMapping] Refreshed mappings for ${consumers.length} consumers on ${network}`);
    } catch (error) {
      logger.error(`[ConsumerMapping] Error refreshing mappings: ${error}`);
      throw error;
    }
  }

  /**
   * Ensure cache is valid and refresh if needed
   */
  private async ensureCacheIsValid(network: Network): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefresh > this.CACHE_TTL) {
      await this.refreshMappings(network);
    }
  }

  /**
   * Invalidate cache to force refresh on next access
   */
  public invalidateCache(): void {
    this.lastRefresh = 0;
  }

  /**
   * Get all consumer mappings for debugging
   */
  async getAllMappings(network: Network): Promise<{ contractToConsumer: Map<string, ConsumerInfo>; consumerToContract: Map<string, string> }> {
    await this.ensureCacheIsValid(network);
    
    return {
      contractToConsumer: new Map(this.contractToConsumerMap),
      consumerToContract: new Map(this.consumerToContractMap)
    };
  }
}
