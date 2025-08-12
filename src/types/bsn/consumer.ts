/**
 * BSN Consumer Types
 * Based on babylon.btcstkconsumer.v1 proto definitions
 */

import { BSNBase, ConsumerType, Network } from './index';

// Consumer metadata types
export interface CosmosConsumerMetadata {
  channel_id: string;
}

export interface RollupConsumerMetadata {
  finality_contract_address: string;
}

// Union type for consumer metadata
export type ConsumerMetadata = CosmosConsumerMetadata | RollupConsumerMetadata;

// Consumer registration data
export interface ConsumerRegister extends BSNBase {
  consumer_name: string;
  consumer_description: string;
  consumer_type: ConsumerType;
  babylon_rewards_commission: string;
  cosmos_metadata?: CosmosConsumerMetadata;
  rollup_metadata?: RollupConsumerMetadata;
  is_active: boolean;
  registration_height: number;
  registration_tx_hash: string;
  last_updated_height: number;
}

// API response format for consumer queries
export interface ConsumerRegisterResponse {
  consumer_id: string;
  consumer_name: string;
  consumer_description: string;
  consumer_type: ConsumerType;
  cosmos_channel_id?: string;
  rollup_finality_contract_address?: string;
  babylon_rewards_commission: string;
  is_active: boolean;
  registration_time: Date;
  last_activity?: Date;
}

// Consumer parameters
export interface BSNConsumerParams {
  max_consumers?: number;
  min_commission_rate?: string;
  registration_fee?: string;
  // Add more parameters as they become available in proto
}

// Consumer events
export interface EventConsumerRegistered {
  consumer_id: string;
  consumer_name: string;
  consumer_description: string;
  consumer_type: ConsumerType;
  rollup_consumer_metadata?: RollupConsumerMetadata;
  babylon_rewards_commission: string;
  block_height: number;
  tx_hash: string;
  timestamp: Date;
}

// Consumer statistics
export interface ConsumerStats {
  consumer_id: string;
  total_headers_submitted: number;
  total_headers_finalized: number;
  finalization_rate: number;
  avg_finalization_time: number; // in seconds
  last_header_submission: Date;
  last_finalization: Date;
  total_rewards_distributed: string;
  commission_earned: string;
}

// Consumer list query parameters
export interface ConsumerListQuery {
  consumer_type?: ConsumerType;
  is_active?: boolean;
  network?: Network;
  limit?: number;
  offset?: number;
  sort_by?: 'consumer_id' | 'consumer_name' | 'registration_time' | 'last_activity';
  sort_order?: 'asc' | 'desc';
}
