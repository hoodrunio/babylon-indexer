/**
 * BSN Finality Types
 * Based on babylon.zoneconcierge.v1 finality-related proto definitions
 */

import { BSNBase } from './index';
import { IndexedHeader, ProofData, BTCHeaderInfo } from './header';

// Finalized BSN data
export interface FinalizedBSNData extends BSNBase {
  latest_finalized_header: IndexedHeader;
  epoch_info: EpochInfo;
  raw_checkpoint: RawCheckpoint;
  btc_submission_key: SubmissionKey;
  proof?: ProofFinalizedHeader | null;
  finalization_time?: Date;
  is_verified?: boolean;
}

// Epoch information
export interface EpochInfo {
  epoch_number: number;
  current_epoch_interval: number;
  first_block_height: number;
  last_block_height?: number;
  last_block_time?: string;
  app_hash_root?: string;
  sealer_header?: SealerHeader;
  sealer_app_hash?: string;
  sealer_block_hash?: string;
}

// Raw checkpoint data
export interface RawCheckpoint {
  epoch_num: number;
  block_hash: string;
  bitmap: string;
  bls_multi_sig: string;
  status: CheckpointStatus;
  bls_aggr_pk: string;
  power_sum: string;
  lifecycle: CheckpointLifecycle[];
}

export enum CheckpointStatus {
  ACCUMULATING = 'CKPT_STATUS_ACCUMULATING',
  SEALED = 'CKPT_STATUS_SEALED',
  SUBMITTED = 'CKPT_STATUS_SUBMITTED',
  CONFIRMED = 'CKPT_STATUS_CONFIRMED',
  FINALIZED = 'CKPT_STATUS_FINALIZED'
}

export interface CheckpointLifecycle {
  state: CheckpointStatus;
  block_height: number;
  block_time: Date;
}

// Sealer header
export interface SealerHeader {
  hash: string;
  height: number;
  time: Date;
  app_hash: string;
  validator_hash: string;
}

// Submission key for BTC
export interface SubmissionKey {
  block_height: number;
  block_hash: string;
}

// Proof that a header is finalized
export interface ProofFinalizedHeader {
  proof_epoch_sealed: ProofData;
  proof_epoch_submitted: TransactionInfo[];
  proof_consumer_header_in_epoch: ProofOps;
}

export interface TransactionInfo {
  key: SubmissionKey;
  transaction: BTCTransaction;
  proof: InclusionProof;
}

export interface BTCTransaction {
  tx_hash: string;
  tx_hex: string;
  block_height: number;
  block_hash: string;
  confirmations: number;
}

export interface InclusionProof {
  merkle_proof: string[];
  index: number;
  total_transactions: number;
}

export interface ProofOps {
  ops: ProofOp[];
}

export interface ProofOp {
  type: string;
  key: string;
  data: string;
}

// ZoneConcierge parameters
export interface ZoneConciergeParams {
  version?: string;
  babylon_epoch_interval?: number;
  btc_confirmation_depth?: number;
  checkpoint_finalization_timeout?: number;
}

// Finality statistics
export interface FinalityStats {
  consumer_id: string;
  total_epochs: number;
  finalized_epochs: number;
  pending_epochs: number;
  finality_rate: number;
  avg_finalization_time: number; // in seconds
  last_finalized_epoch: number;
  last_finalization_time: Date;
  btc_confirmations_avg: number;
  checkpoint_success_rate: number;
}

// BTC timestamp packet
export interface BTCTimestamp {
  header: IndexedHeader;
  btc_headers: BTCHeaders;
  epoch_info: EpochInfo;
  raw_checkpoint: RawCheckpoint;
  btc_submission_key: SubmissionKey;
  proof: ProofFinalizedHeader;
  timestamp: Date;
}

export interface BTCHeaders {
  headers: BTCHeaderInfo[];
  start_height: number;
  end_height: number;
}

// Finality query parameters
export interface FinalityQuery {
  consumer_ids?: string[];
  epoch_min?: number;
  epoch_max?: number;
  status?: CheckpointStatus;
  is_finalized?: boolean;
  start_time?: Date;
  end_time?: Date;
  prove?: boolean; // Include proofs in response
  limit?: number;
  offset?: number;
  sort_by?: 'epoch_number' | 'finalization_time' | 'consumer_id';
  sort_order?: 'asc' | 'desc';
}
