/**
 * BSN Header Database Model
 * Stores BSN header information and finalization status
 */

import mongoose, { Schema, Document } from 'mongoose';
import { Network, BSNStatus } from '../../../types/bsn';

export interface IBSNHeader extends Document {
  consumer_id: string;
  hash: string;
  height: number;
  time: Date;
  babylon_header_hash: string;
  babylon_header_height: number;
  babylon_epoch: number;
  babylon_tx_hash: string;
  is_finalized: boolean;
  finalization_height?: number;
  finalization_tx_hash?: string;
  status: BSNStatus;
  network: Network;
  proof_data?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const BSNHeaderSchema = new Schema<IBSNHeader>({
  consumer_id: {
    type: String,
    required: true,
    index: true
  },
  hash: {
    type: String,
    required: true,
    index: true
  },
  height: {
    type: Number,
    required: true,
    index: true
  },
  time: {
    type: Date,
    required: true,
    index: true
  },
  babylon_header_hash: {
    type: String,
    required: true,
    index: true
  },
  babylon_header_height: {
    type: Number,
    required: true,
    index: true
  },
  babylon_epoch: {
    type: Number,
    required: true,
    index: true
  },
  babylon_tx_hash: {
    type: String,
    required: true,
    index: true
  },
  is_finalized: {
    type: Boolean,
    required: true,
    default: false,
    index: true
  },
  finalization_height: {
    type: Number,
    required: false,
    sparse: true,
    index: true
  },
  finalization_tx_hash: {
    type: String,
    required: false,
    sparse: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: Object.values(BSNStatus),
    index: true
  },
  network: {
    type: String,
    required: true,
    enum: Object.values(Network),
    index: true
  },
  proof_data: {
    type: Schema.Types.Mixed,
    required: false
  }
}, {
  timestamps: true,
  collection: 'bsn_headers'
});

// Unique constraint on consumer_id + height + network
BSNHeaderSchema.index({ consumer_id: 1, height: 1, network: 1 }, { unique: true });

// Compound indexes for common query patterns
BSNHeaderSchema.index({ network: 1, consumer_id: 1, height: -1 });
BSNHeaderSchema.index({ network: 1, is_finalized: 1, time: -1 });
BSNHeaderSchema.index({ babylon_epoch: 1, network: 1 });
BSNHeaderSchema.index({ status: 1, network: 1, time: -1 });
BSNHeaderSchema.index({ consumer_id: 1, is_finalized: 1, height: -1 });
BSNHeaderSchema.index({ babylon_header_height: 1, network: 1 });

export const BSNHeader = mongoose.model<IBSNHeader>('BSNHeader', BSNHeaderSchema);
