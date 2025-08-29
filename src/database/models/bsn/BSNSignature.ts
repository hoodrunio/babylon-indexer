/**
 * BSN Signature Database Model (Unified)
 * Stores finality provider signatures with 10k limit per FP
 */

import mongoose, { Schema, Document, Types, Model } from 'mongoose';
import { Network } from '../../../types/bsn';

export interface IBSNSignature extends Document {
  fp_id: Types.ObjectId;           // Reference to BSNFinalityProvider
  consumer_id: string;             // Denormalized for fast queries
  fp_btc_pk_hex: string;          // Denormalized for fast queries
  sequence_number: number;         // Auto-increment per FP (for 10k limit)
  block_height: number;
  signature_hex: string;
  tx_hash: string;
  network: Network;
  signed_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBSNSignatureStatics {
  getNextSequenceNumber(fpId: Types.ObjectId): Promise<number>;
  cleanupOldSignatures(fpId: Types.ObjectId, keepLatest?: number): Promise<{ deletedCount: number; oldestHeight?: number }>;
  getSignatureCountByFP(fpId: Types.ObjectId): Promise<number>;
  getLatestSignatures(fpId: Types.ObjectId, limit?: number): Promise<IBSNSignature[]>;
}

export interface IBSNSignatureModel extends Model<IBSNSignature>, IBSNSignatureStatics {}

const BSNSignatureSchema = new Schema<IBSNSignature>({
  fp_id: {
    type: Schema.Types.ObjectId,
    ref: 'BSNFinalityProvider',
    required: true,
    index: true
  },
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
  sequence_number: {
    type: Number,
    required: true,
    index: true
  },
  block_height: {
    type: Number,
    required: true,
    index: true
  },
  signature_hex: {
    type: String,
    required: true
  },
  tx_hash: {
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
  signed_at: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'bsn_signatures'
});

// Unique constraint per FP + sequence
BSNSignatureSchema.index({ 
  fp_id: 1, 
  sequence_number: 1 
}, { unique: true });

// Unique constraint to prevent duplicate signatures
BSNSignatureSchema.index({ 
  consumer_id: 1, 
  fp_btc_pk_hex: 1, 
  block_height: 1, 
  network: 1 
}, { unique: true });

// Performance indexes for common queries
BSNSignatureSchema.index({ fp_id: 1, signed_at: -1 });
BSNSignatureSchema.index({ consumer_id: 1, signed_at: -1 });
BSNSignatureSchema.index({ network: 1, consumer_id: 1, block_height: -1 });
BSNSignatureSchema.index({ fp_btc_pk_hex: 1, network: 1, signed_at: -1 });
BSNSignatureSchema.index({ network: 1, signed_at: -1 });

// TTL index for additional safety (30 days)
BSNSignatureSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Static methods for signature management
BSNSignatureSchema.statics.getNextSequenceNumber = async function(fpId: Types.ObjectId): Promise<number> {
  const lastSignature = await this.findOne(
    { fp_id: fpId },
    { sequence_number: 1 }
  ).sort({ sequence_number: -1 });
  
  return lastSignature ? lastSignature.sequence_number + 1 : 1;
};

BSNSignatureSchema.statics.cleanupOldSignatures = async function(
  fpId: Types.ObjectId, 
  keepLatest: number = 10000
): Promise<{ deletedCount: number; oldestHeight?: number }> {
  // Find signatures to keep (latest N)
  const signaturesToKeep = await this.find(
    { fp_id: fpId },
    { sequence_number: 1, block_height: 1 }
  )
  .sort({ sequence_number: -1 })
  .limit(keepLatest);

  if (signaturesToKeep.length <= keepLatest) {
    return { deletedCount: 0 };
  }

  // Delete old signatures
  const oldestKeptSequence = signaturesToKeep[signaturesToKeep.length - 1].sequence_number;
  const deleteResult = await this.deleteMany({
    fp_id: fpId,
    sequence_number: { $lt: oldestKeptSequence }
  });

  const oldestHeight = signaturesToKeep[signaturesToKeep.length - 1].block_height;

  return { 
    deletedCount: deleteResult.deletedCount || 0,
    oldestHeight
  };
};

BSNSignatureSchema.statics.getSignatureCountByFP = async function(fpId: Types.ObjectId): Promise<number> {
  return this.countDocuments({ fp_id: fpId });
};

BSNSignatureSchema.statics.getLatestSignatures = async function(
  fpId: Types.ObjectId, 
  limit: number = 100
): Promise<IBSNSignature[]> {
  return this.find({ fp_id: fpId })
    .sort({ sequence_number: -1 })
    .limit(limit);
};

export const BSNSignature = mongoose.model<IBSNSignature, IBSNSignatureModel>('BSNSignature', BSNSignatureSchema);
