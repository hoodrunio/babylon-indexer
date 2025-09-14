/**
 * BSN Rollup Signature Database Model
 * Tracks finality provider signatures for rollup BSNs
 */

import mongoose, { Schema, Document } from 'mongoose';
import { Network } from '../../../types/bsn';

export interface IBSNRollupSignature extends Document {
  consumer_id: string;
  fp_pubkey_hex: string;
  block_height: number;
  contract_address: string;
  tx_hash: string;
  network: Network;
  signed_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BSNRollupSignatureSchema = new Schema<IBSNRollupSignature>({
  consumer_id: {
    type: String,
    required: true,
    index: true
  },
  fp_pubkey_hex: {
    type: String,
    required: true,
    index: true
  },
  block_height: {
    type: Number,
    required: true,
    index: true
  },
  contract_address: {
    type: String,
    required: true,
    index: true
  },
  tx_hash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  network: {
    type: String,
    required: true,
    enum: Object.values(Network),
    index: true
  },
  signed_at: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'bsn_rollup_signatures'
});

// Compound indexes for common query patterns
BSNRollupSignatureSchema.index({ consumer_id: 1, fp_pubkey_hex: 1, signed_at: -1 });
BSNRollupSignatureSchema.index({ network: 1, consumer_id: 1, block_height: -1 });
BSNRollupSignatureSchema.index({ fp_pubkey_hex: 1, network: 1, signed_at: -1 });
BSNRollupSignatureSchema.index({ contract_address: 1, block_height: -1 });
BSNRollupSignatureSchema.index({ network: 1, signed_at: -1 });

// Unique constraint to prevent duplicate signatures
BSNRollupSignatureSchema.index({ 
  consumer_id: 1, 
  fp_pubkey_hex: 1, 
  block_height: 1, 
  network: 1 
}, { unique: true });

export const BSNRollupSignature = mongoose.model<IBSNRollupSignature>('BSNRollupSignature', BSNRollupSignatureSchema);
