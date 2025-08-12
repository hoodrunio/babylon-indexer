/**
 * BSN Header Types
 * Based on babylon.zoneconcierge.v1 proto definitions
 */

import { BSNBase, BSNStatus } from './index';

// Indexed header from BSN
export interface IndexedHeader extends BSNBase {
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
}

// Header with proof
export interface IndexedHeaderWithProof {
  header: IndexedHeader;
  proof?: ProofData;
  proof_raw?: string; // Raw proof data
}

// Proof data structure
export interface ProofData {
  epoch_sealed?: ProofEpochSealed;
  epoch_submitted?: TransactionInfo[];
  consumer_header_in_epoch?: ProofOps;
}

// Proof that an epoch is sealed
export interface ProofEpochSealed {
  validator_set: ValidatorWithBlsKey[];
  proof_epoch_info: ProofOps;
  proof_epoch_val_set: ProofOps;
}

// Validator with BLS key
export interface ValidatorWithBlsKey {
  validator_address: string;
  bls_public_key: string;
  voting_power: string;
}

// Proof operations
export interface ProofOps {
  ops: ProofOp[];
}

export interface ProofOp {
  type: string;
  key: string;
  data: string;
}

// Transaction info for BTC checkpoint
export interface TransactionInfo {
  key: SubmissionKey;
  transaction: BTCTransaction;
  proof: InclusionProof;
}

export interface SubmissionKey {
  block_height: number;
  block_hash: string;
}

export interface BTCTransaction {
  tx_hash: string;
  tx_hex: string;
  block_height: number;
  block_hash: string;
}

export interface InclusionProof {
  merkle_proof: string[];
  index: number;
}

// BSN BTC synchronization state
export interface BSNBTCState {
  consumer_id: string;
  last_sent_segment: BTCChainSegment;
  sync_height: number;
  last_sync_time: Date;
}

// BTC chain segment
export interface BTCChainSegment {
  btc_headers: BTCHeaderInfo[];
  start_height: number;
  end_height: number;
}

export interface BTCHeaderInfo {
  header_hex: string;
  hash: string;
  height: number;
  work: string;
}

// Header submission statistics
export interface HeaderStats {
  consumer_id: string;
  total_submitted: number;
  total_finalized: number;
  pending_finalization: number;
  finalization_rate: number;
  avg_submission_interval: number; // in seconds
  avg_finalization_time: number; // in seconds
  last_submission: Date;
  last_finalization: Date;
}

// Header query parameters
export interface HeaderQuery {
  consumer_id?: string;
  height_min?: number;
  height_max?: number;
  babylon_height_min?: number;
  babylon_height_max?: number;
  is_finalized?: boolean;
  status?: BSNStatus;
  start_time?: Date;
  end_time?: Date;
  limit?: number;
  offset?: number;
  sort_by?: 'height' | 'time' | 'babylon_height' | 'finalization_time';
  sort_order?: 'asc' | 'desc';
}
