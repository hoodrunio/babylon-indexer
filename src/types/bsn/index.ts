/**
 * BSN (Bitcoin Supercharged Networks) Types
 * Main exports for BSN-related types
 */

// Consumer types
export * from './consumer';

// Header types (with namespace to avoid conflicts)
export type {
  IndexedHeader,
  IndexedHeaderWithProof,
  BTCChainSegment,
  BSNBTCState
} from './header';

// Finality types (with namespace to avoid conflicts)
export type {
  FinalizedBSNData,
  EpochInfo,
  RawCheckpoint,
  ZoneConciergeParams,
  BTCHeaders
} from './finality';

// Export enums explicitly
export { CheckpointStatus } from './finality';

// IBC types
export * from './ibc';

// Common types that may overlap - use qualified names
import type {
  TransactionInfo as HeaderTransactionInfo,
  SubmissionKey as HeaderSubmissionKey,
  BTCTransaction as HeaderBTCTransaction,
  InclusionProof as HeaderInclusionProof,
  ProofOps as HeaderProofOps,
  ProofOp as HeaderProofOp
} from './header';

import type {
  TransactionInfo as FinalityTransactionInfo,
  SubmissionKey as FinalitySubmissionKey,
  BTCTransaction as FinalityBTCTransaction,
  InclusionProof as FinalityInclusionProof,
  ProofOps as FinalityProofOps,
  ProofOp as FinalityProofOp
} from './finality';

// Re-export with qualified names
export type {
  HeaderTransactionInfo,
  HeaderSubmissionKey,
  HeaderBTCTransaction,
  HeaderInclusionProof,
  HeaderProofOps,
  HeaderProofOp,
  FinalityTransactionInfo,
  FinalitySubmissionKey,
  FinalityBTCTransaction,
  FinalityInclusionProof,
  FinalityProofOps,
  FinalityProofOp
};

// Common BSN enums and base types
export enum Network {
  MAINNET = 'mainnet',
  TESTNET = 'testnet'
}

export enum ConsumerType {
  COSMOS = 'COSMOS',
  ROLLUP = 'ROLLUP'
}

// Base BSN interface for all BSN entities
export interface BSNBase {
  consumer_id: string;
  network: Network;
  created_at: Date;
  updated_at: Date;
}

// BSN Status enum
export enum BSNStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  FINALIZED = 'FINALIZED'
}

// Common pagination interface
export interface BSNPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

// Generic BSN response wrapper
export interface BSNResponse<T> {
  data: T;
  timestamp: number;
  meta?: {
    pagination?: BSNPagination;
    network?: Network;
  };
}
