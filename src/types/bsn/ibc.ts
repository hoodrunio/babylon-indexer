/**
 * BSN IBC Packet Types
 * Based on babylon.zoneconcierge.v1 IBC packet definitions
 */

import { BSNBase } from './index';
import { IndexedHeader } from './header';
import { BTCHeaders } from './finality';
import { EpochInfo, RawCheckpoint, SubmissionKey, ProofFinalizedHeader } from './finality';

// IBC packet directions
export enum IBCPacketDirection {
  OUTBOUND = 'OUTBOUND', // Babylon -> BSN
  INBOUND = 'INBOUND'    // BSN -> Babylon
}

// IBC packet status
export enum IBCPacketStatus {
  SENT = 'SENT',
  RECEIVED = 'RECEIVED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  TIMEOUT = 'TIMEOUT',
  FAILED = 'FAILED'
}

// Base IBC packet interface
export interface BSNIBCPacket extends BSNBase {
  packet_type: string;
  direction: IBCPacketDirection;
  sequence: number;
  source_port: string;
  source_channel: string;
  destination_port: string;
  destination_channel: string;
  status: IBCPacketStatus;
  data: IBCPacketData;
  send_time?: Date;
  receive_time?: Date;
  ack_time?: Date;
  timeout_time?: Date;
  tx_hash: string;
  block_height: number;
  error_message?: string;
}

// Union type for different packet data
export type IBCPacketData = BTCTimestampPacket | BSNSlashingPacket | BTCHeadersPacket;

// Outbound packet: BTC timestamp
export interface BTCTimestampPacket {
  type: 'BTCTimestamp';
  header: IndexedHeader;
  btc_headers: BTCHeaders;
  epoch_info: EpochInfo;
  raw_checkpoint: RawCheckpoint;
  btc_submission_key: SubmissionKey;
  proof: ProofFinalizedHeader;
}

// Outbound packet: BTC headers
export interface BTCHeadersPacket {
  type: 'BTCHeaders';
  headers: BTCHeaders;
  sync_info: {
    last_sent_height: number;
    current_tip_height: number;
    reorg_detected: boolean;
  };
}

// Inbound packet: BSN slashing
export interface BSNSlashingPacket {
  type: 'BSNSlashing';
  evidence: SlashingEvidence;
  finality_provider_btc_pk: string;
  bsn_block_height: number;
  slash_time: Date;
}

// Slashing evidence
export interface SlashingEvidence {
  fp_btc_pk: string;
  block_height: number;
  pub_rand: string;
  proof: string;
  evidence_type: SlashingEvidenceType;
  double_sign_evidence?: DoubleSignEvidence;
}

export enum SlashingEvidenceType {
  DOUBLE_SIGN = 'DOUBLE_SIGN',
  DOWNTIME = 'DOWNTIME',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE'
}

export interface DoubleSignEvidence {
  vote_a: Vote;
  vote_b: Vote;
  total_voting_power: string;
  validator_power: string;
  timestamp: Date;
}

export interface Vote {
  type: number;
  height: number;
  round: number;
  block_id: BlockID;
  timestamp: Date;
  validator_address: string;
  validator_index: number;
  signature: string;
}

export interface BlockID {
  hash: string;
  part_set_header: PartSetHeader;
}

export interface PartSetHeader {
  total: number;
  hash: string;
}

// IBC channel information
export interface IBCChannel {
  port_id: string;
  channel_id: string;
  counterparty_port_id: string;
  counterparty_channel_id: string;
  connection_id: string;
  state: IBCChannelState;
  ordering: IBCChannelOrdering;
  version: string;
}

export enum IBCChannelState {
  UNINITIALIZED = 'STATE_UNINITIALIZED',
  INIT = 'STATE_INIT',
  TRYOPEN = 'STATE_TRYOPEN',
  OPEN = 'STATE_OPEN',
  CLOSED = 'STATE_CLOSED'
}

export enum IBCChannelOrdering {
  NONE = 'ORDER_NONE',
  UNORDERED = 'ORDER_UNORDERED',
  ORDERED = 'ORDER_ORDERED'
}

// IBC packet statistics
export interface IBCPacketStats {
  consumer_id: string;
  channel_id: string;
  total_sent: number;
  total_received: number;
  total_acknowledged: number;
  total_timeout: number;
  total_failed: number;
  success_rate: number;
  avg_delivery_time: number; // in seconds
  last_packet_sent?: Date;
  last_packet_received?: Date;
  last_acknowledgment?: Date;
}

// IBC packet query parameters
export interface IBCPacketQuery {
  consumer_id?: string;
  packet_type?: string;
  direction?: IBCPacketDirection;
  status?: IBCPacketStatus;
  channel_id?: string;
  sequence_min?: number;
  sequence_max?: number;
  start_time?: Date;
  end_time?: Date;
  limit?: number;
  offset?: number;
  sort_by?: 'sequence' | 'send_time' | 'receive_time' | 'block_height';
  sort_order?: 'asc' | 'desc';
}

// Packet acknowledgment
export interface PacketAcknowledgment {
  result?: string;
  error?: string;
  timestamp: Date;
}

// Packet timeout
export interface PacketTimeout {
  timeout_height?: {
    revision_number: number;
    revision_height: number;
  };
  timeout_timestamp?: Date;
}
