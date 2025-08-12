/**
 * BSN (Bitcoin Supercharged Networks) Types
 * Main exports for BSN-related types
 */

export * from './consumer';
export * from './header';
export * from './finality';
export * from './ibc';

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
