/**
 * BSN Finality Provider Database Model
 * Stores BSN finality provider registration and metadata
 */

import mongoose, { Schema, Document } from 'mongoose';
import { Network } from '../../../types/bsn';

export interface IBSNFinalityProvider extends Document {
  consumer_id: string;
  fp_btc_pk_hex: string;
  network: Network;
  is_active: boolean;
  registration_height: number;
  registration_tx_hash: string;
  signature_count: number;
  oldest_signature_height: number;
  latest_signature_height: number;
  last_cleanup: Date;
  last_signature_time: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  incrementSignatureCount(blockHeight: number): Promise<IBSNFinalityProvider>;
  needsCleanup(): boolean;
  updateAfterCleanup(remainingCount: number, newOldestHeight: number): Promise<IBSNFinalityProvider>;
}

const BSNFinalityProviderSchema = new Schema<IBSNFinalityProvider>({
  consumer_id: {
    type: String,
    required: true,
    index: true
  },
  fp_btc_pk_hex: {
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
    required: false,
    default: '',
    index: true
  },
  signature_count: {
    type: Number,
    required: true,
    default: 0,
    index: true
  },
  oldest_signature_height: {
    type: Number,
    required: false,
    index: true
  },
  latest_signature_height: {
    type: Number,
    required: false,
    index: true
  },
  last_cleanup: {
    type: Date,
    required: false,
    index: true
  },
  last_signature_time: {
    type: Date,
    required: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'bsn_finality_providers'
});

// Unique compound index - same FP can't exist twice in same consumer+network
BSNFinalityProviderSchema.index({ 
  consumer_id: 1, 
  fp_btc_pk_hex: 1, 
  network: 1 
}, { unique: true });

// Compound indexes for common query patterns
BSNFinalityProviderSchema.index({ network: 1, consumer_id: 1, is_active: 1 });
BSNFinalityProviderSchema.index({ network: 1, is_active: 1, last_signature_time: -1 });
BSNFinalityProviderSchema.index({ consumer_id: 1, is_active: 1, signature_count: -1 });
BSNFinalityProviderSchema.index({ fp_btc_pk_hex: 1, network: 1 });
BSNFinalityProviderSchema.index({ signature_count: -1, last_cleanup: 1 });

// Methods for signature count management
BSNFinalityProviderSchema.methods.incrementSignatureCount = async function(blockHeight: number) {
  this.signature_count += 1;
  this.latest_signature_height = Math.max(this.latest_signature_height || 0, blockHeight);
  if (!this.oldest_signature_height) {
    this.oldest_signature_height = blockHeight;
  }
  this.last_signature_time = new Date();
  return this.save();
};

BSNFinalityProviderSchema.methods.needsCleanup = function(): boolean {
  return this.signature_count >= 10000;
};

BSNFinalityProviderSchema.methods.updateAfterCleanup = async function(
  remainingCount: number, 
  newOldestHeight: number
) {
  this.signature_count = remainingCount;
  this.oldest_signature_height = newOldestHeight;
  this.last_cleanup = new Date();
  return this.save();
};

export const BSNFinalityProvider = mongoose.model<IBSNFinalityProvider>('BSNFinalityProvider', BSNFinalityProviderSchema);
