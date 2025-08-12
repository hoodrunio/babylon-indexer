/**
 * BSN Finality Database Model
 * Stores BSN finalization data and proofs
 */

import mongoose, { Schema, Document } from 'mongoose';
import { Network, CheckpointStatus } from '../../../types/bsn';

export interface IBSNFinality extends Document {
  consumer_id: string;
  epoch_number: number;
  latest_finalized_header: {
    hash: string;
    height: number;
    time: Date;
  };
  epoch_info: Record<string, any>;
  raw_checkpoint: Record<string, any>;
  btc_submission_key: Record<string, any>;
  proof_data: Record<string, any>;
  finalization_time: Date;
  is_verified: boolean;
  checkpoint_status: CheckpointStatus;
  network: Network;
  btc_confirmation_count?: number;
  finalization_duration?: number; // seconds from submission to finalization
  createdAt: Date;
  updatedAt: Date;
}

const BSNFinalitySchema = new Schema<IBSNFinality>({
  consumer_id: {
    type: String,
    required: true,
    index: true
  },
  epoch_number: {
    type: Number,
    required: true,
    index: true
  },
  latest_finalized_header: {
    hash: {
      type: String,
      required: true
    },
    height: {
      type: Number,
      required: true
    },
    time: {
      type: Date,
      required: true
    }
  },
  epoch_info: {
    type: Schema.Types.Mixed,
    required: true
  },
  raw_checkpoint: {
    type: Schema.Types.Mixed,
    required: true
  },
  btc_submission_key: {
    type: Schema.Types.Mixed,
    required: true
  },
  proof_data: {
    type: Schema.Types.Mixed,
    required: true
  },
  finalization_time: {
    type: Date,
    required: true,
    index: true
  },
  is_verified: {
    type: Boolean,
    required: true,
    default: false,
    index: true
  },
  checkpoint_status: {
    type: String,
    required: true,
    enum: Object.values(CheckpointStatus),
    index: true
  },
  network: {
    type: String,
    required: true,
    enum: Object.values(Network),
    index: true
  },
  btc_confirmation_count: {
    type: Number,
    required: false,
    index: true
  },
  finalization_duration: {
    type: Number,
    required: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'bsn_finality'
});

// Unique constraint on consumer_id + epoch_number + network
BSNFinalitySchema.index({ consumer_id: 1, epoch_number: 1, network: 1 }, { unique: true });

// Compound indexes for common query patterns
BSNFinalitySchema.index({ network: 1, consumer_id: 1, epoch_number: -1 });
BSNFinalitySchema.index({ network: 1, checkpoint_status: 1, finalization_time: -1 });
BSNFinalitySchema.index({ network: 1, is_verified: 1, finalization_time: -1 });
BSNFinalitySchema.index({ consumer_id: 1, is_verified: 1, epoch_number: -1 });
BSNFinalitySchema.index({ epoch_number: 1, network: 1 });
BSNFinalitySchema.index({ finalization_time: -1, network: 1 });

export const BSNFinality = mongoose.model<IBSNFinality>('BSNFinality', BSNFinalitySchema);
