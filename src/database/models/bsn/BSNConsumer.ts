/**
 * BSN Consumer Database Model
 * Stores BSN consumer registration and metadata information
 */

import mongoose, { Schema, Document } from 'mongoose';
import { ConsumerType, Network } from '../../../types/bsn';

export interface IBSNConsumer extends Document {
  consumer_id: string;
  consumer_name: string;
  consumer_description: string;
  consumer_type: ConsumerType;
  cosmos_channel_id?: string;
  rollup_finality_contract_address?: string;
  babylon_rewards_commission: string;
  is_active: boolean;
  registration_height: number;
  registration_tx_hash: string;
  network: Network;
  last_updated_height: number;
  createdAt: Date;
  updatedAt: Date;
}

const BSNConsumerSchema = new Schema<IBSNConsumer>({
  consumer_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  consumer_name: {
    type: String,
    required: true,
    index: true
  },
  consumer_description: {
    type: String,
    required: false,
    default: ''
  },
  consumer_type: {
    type: String,
    required: true,
    enum: Object.values(ConsumerType),
    index: true
  },
  cosmos_channel_id: {
    type: String,
    required: false,
    sparse: true,
    index: true
  },
  rollup_finality_contract_address: {
    type: String,
    required: false,
    sparse: true,
    index: true
  },
  babylon_rewards_commission: {
    type: String,
    required: true
  },
  is_active: {
    type: Boolean,
    required: true,
    default: true,
    index: true
  },
  registration_height: {
    type: Number,
    required: true,
    index: true
  },
  registration_tx_hash: {
    type: String,
    required: true,
    index: true
  },
  network: {
    type: String,
    required: true,
    enum: Object.values(Network),
    index: true
  },
  last_updated_height: {
    type: Number,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'bsn_consumers'
});

// Compound indexes for common query patterns
BSNConsumerSchema.index({ network: 1, consumer_type: 1 });
BSNConsumerSchema.index({ network: 1, is_active: 1 });
BSNConsumerSchema.index({ network: 1, registration_height: -1 });
BSNConsumerSchema.index({ consumer_type: 1, is_active: 1 });

// Text index for searching by name and description
BSNConsumerSchema.index({ 
  consumer_name: 'text', 
  consumer_description: 'text' 
});

export const BSNConsumer = mongoose.model<IBSNConsumer>('BSNConsumer', BSNConsumerSchema);
