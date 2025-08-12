/**
 * BSN IBC Packet Database Model
 * Stores IBC packet information between Babylon and BSNs
 */

import mongoose, { Schema, Document } from 'mongoose';
import { Network } from '../../../types/bsn';
import { IBCPacketDirection, IBCPacketStatus } from '../../../types/bsn/ibc';

export interface IBSNIBCPacket extends Document {
  consumer_id: string;
  packet_type: string;
  direction: IBCPacketDirection;
  sequence: number;
  source_port: string;
  source_channel: string;
  destination_port: string;
  destination_channel: string;
  status: IBCPacketStatus;
  data: Record<string, any>;
  send_time?: Date;
  receive_time?: Date;
  ack_time?: Date;
  timeout_time?: Date;
  tx_hash: string;
  block_height: number;
  network: Network;
  error_message?: string;
  delivery_duration?: number; // seconds from send to receive
  acknowledgment_duration?: number; // seconds from receive to ack
  createdAt: Date;
  updatedAt: Date;
}

const BSNIBCPacketSchema = new Schema<IBSNIBCPacket>({
  consumer_id: {
    type: String,
    required: true,
    index: true
  },
  packet_type: {
    type: String,
    required: true,
    index: true
  },
  direction: {
    type: String,
    required: true,
    enum: Object.values(IBCPacketDirection),
    index: true
  },
  sequence: {
    type: Number,
    required: true,
    index: true
  },
  source_port: {
    type: String,
    required: true,
    index: true
  },
  source_channel: {
    type: String,
    required: true,
    index: true
  },
  destination_port: {
    type: String,
    required: true,
    index: true
  },
  destination_channel: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: Object.values(IBCPacketStatus),
    index: true
  },
  data: {
    type: Schema.Types.Mixed,
    required: true
  },
  send_time: {
    type: Date,
    required: false,
    index: true
  },
  receive_time: {
    type: Date,
    required: false,
    index: true
  },
  ack_time: {
    type: Date,
    required: false,
    index: true
  },
  timeout_time: {
    type: Date,
    required: false,
    index: true
  },
  tx_hash: {
    type: String,
    required: true,
    index: true
  },
  block_height: {
    type: Number,
    required: true,
    index: true
  },
  network: {
    type: String,
    required: true,
    enum: Object.values(Network),
    index: true
  },
  error_message: {
    type: String,
    required: false
  },
  delivery_duration: {
    type: Number,
    required: false,
    index: true
  },
  acknowledgment_duration: {
    type: Number,
    required: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'bsn_ibc_packets'
});

// Unique constraint on consumer_id + direction + sequence + network
BSNIBCPacketSchema.index({ 
  consumer_id: 1, 
  direction: 1, 
  sequence: 1, 
  network: 1 
}, { unique: true });

// Compound indexes for common query patterns
BSNIBCPacketSchema.index({ network: 1, consumer_id: 1, sequence: -1 });
BSNIBCPacketSchema.index({ network: 1, packet_type: 1, send_time: -1 });
BSNIBCPacketSchema.index({ network: 1, status: 1, send_time: -1 });
BSNIBCPacketSchema.index({ source_channel: 1, destination_channel: 1, sequence: -1 });
BSNIBCPacketSchema.index({ consumer_id: 1, direction: 1, status: 1 });
BSNIBCPacketSchema.index({ block_height: 1, network: 1 });
BSNIBCPacketSchema.index({ tx_hash: 1, network: 1 });

export const BSNIBCPacket = mongoose.model<IBSNIBCPacket>('BSNIBCPacket', BSNIBCPacketSchema);
