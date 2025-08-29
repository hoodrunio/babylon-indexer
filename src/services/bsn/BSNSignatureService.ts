/**
 * BSN Signature Service
 * Handles BSN signature processing with 10k limit per FP
 */

import { Types } from 'mongoose';
import { logger } from '../../utils/logger';
import { BSNSignature } from '../../database/models/bsn/BSNSignature';
import { Network } from '../../types/finality';
import { FinalityProviderService } from '../finality/FinalityProviderService';
import { ConsumerMapping } from '../../utils/bsn/ConsumerMapping';

export interface BSNSignatureData {
  fp_pubkey_hex: string;
  height: number;
  [key: string]: any;
}

export interface BSNSignatureContext {
  contractAddress: string;
  txHash: string;
  signedAt: Date;
  network: Network;
}

export interface FPSignatureStats {
  fp_pubkey_hex: string;
  consumer_id: string;
  total_signatures: number;
  last_signature_height: number;
  last_signature_time: Date;
  sequence_range: { oldest: number; latest: number };
}

export class BSNSignatureService {
  private static instance: BSNSignatureService | null = null;
  private readonly MAX_SIGNATURES_PER_FP = 10000;
  private readonly CLEANUP_BATCH_SIZE = 1000;
  private finalityProviderService: FinalityProviderService;
  private consumerMapping: ConsumerMapping;

  private constructor() {
    this.finalityProviderService = FinalityProviderService.getInstance();
    this.consumerMapping = ConsumerMapping.getInstance();
  }

  public static getInstance(): BSNSignatureService {
    if (!BSNSignatureService.instance) {
      BSNSignatureService.instance = new BSNSignatureService();
    }
    return BSNSignatureService.instance;
  }

  /**
   * Get or create BSN Finality Provider using FinalityProviderService
   */
  private async getOrCreateFP(
    consumerId: string,
    fpBtcPkHex: string,
    network: Network
  ): Promise<Types.ObjectId> {
    return await this.finalityProviderService.getOrCreateBSNFinalityProvider(
      consumerId,
      fpBtcPkHex,
      network
    );
  }

  /**
   * Process and save BSN signature (optimized with 10k limit)
   */
  async handleSignature(
    signatureData: BSNSignatureData,
    context: BSNSignatureContext
  ): Promise<void> {
    try {
      // Get consumer ID from contract address
      const consumerId = await this.consumerMapping.getConsumerIdFromContract(
        context.contractAddress,
        context.network
      );

      if (!consumerId) {
        logger.warn(`[BSNSignatureService] No consumer mapping found for contract: ${context.contractAddress}`);
        return;
      }

      // Get or create FP record
      const fpId = await this.getOrCreateFP(
        consumerId,
        signatureData.fp_pubkey_hex,
        context.network
      );

      // Check if signature already exists (prevent duplicates)
      const existingSignature = await BSNSignature.findOne({
        consumer_id: consumerId,
        fp_btc_pk_hex: signatureData.fp_pubkey_hex,
        block_height: signatureData.height,
        network: context.network
      });

      if (existingSignature) {
        logger.debug(`[BSNSignatureService] Signature already exists for FP ${signatureData.fp_pubkey_hex} at height ${signatureData.height}`);
        return;
      }

      // Get next sequence number for this FP
      const sequenceNumber = await BSNSignature.getNextSequenceNumber(fpId);

      // Create and save signature record
      const signature = new BSNSignature({
        fp_id: fpId,
        consumer_id: consumerId,
        fp_btc_pk_hex: signatureData.fp_pubkey_hex,
        sequence_number: sequenceNumber,
        block_height: signatureData.height,
        tx_hash: context.txHash,
        network: context.network,
        signed_at: context.signedAt
      });

      await signature.save();

      // Update FP metadata and check for cleanup
      await this.finalityProviderService.updateBSNFinalityProviderSignature(fpId, signatureData.height);
      
      const needsCleanup = await this.finalityProviderService.checkBSNFinalityProviderCleanup(fpId);
      if (needsCleanup) {
        await this.cleanupOldSignatures(fpId);
      }

      logger.info(`[BSNSignatureService] Saved signature: FP ${signatureData.fp_pubkey_hex} for block ${signatureData.height} on consumer ${consumerId}`);

    } catch (error) {
      logger.error(`[BSNSignatureService] Error handling signature:`, error);
      throw error;
    }
  }

  /**
   * Cleanup old signatures for FP (keep only latest 10k)
   */
  private async cleanupOldSignatures(fpId: Types.ObjectId): Promise<void> {
    try {
      logger.info(`[BSNSignatureService] Starting cleanup for FP ${fpId}`);

      const result = await BSNSignature.cleanupOldSignatures(fpId, this.MAX_SIGNATURES_PER_FP);
      
      if (result.deletedCount > 0) {
        // Update FP metadata
        const remainingCount = await BSNSignature.getSignatureCountByFP(fpId);
        
        if (result.oldestHeight) {
          await this.finalityProviderService.updateBSNFinalityProviderAfterCleanup(
            fpId,
            remainingCount,
            result.oldestHeight
          );
        }

        logger.info(`[BSNSignatureService] Cleanup completed: deleted ${result.deletedCount} old signatures for FP ${fpId}`);
      }
    } catch (error) {
      logger.error(`[BSNSignatureService] Error during cleanup for FP ${fpId}:`, error);
    }
  }

  /**
   * Get signature statistics for a finality provider
   */
  async getFPSignatureStats(
    fpPubkeyHex: string,
    network: Network,
    consumerId?: string
  ): Promise<FPSignatureStats[]> {
    try {
      const matchFilter: any = {
        fp_pubkey_hex: fpPubkeyHex,
        network: network
      };

      if (consumerId) {
        matchFilter.consumer_id = consumerId;
      }

      const stats = await BSNSignature.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: {
              fp_pubkey_hex: '$fp_pubkey_hex',
              consumer_id: '$consumer_id'
            },
            total_signatures: { $sum: 1 },
            last_signature_height: { $max: '$block_height' },
            last_signature_time: { $max: '$signed_at' }
          }
        },
        {
          $project: {
            _id: 0,
            fp_pubkey_hex: '$_id.fp_pubkey_hex',
            consumer_id: '$_id.consumer_id',
            total_signatures: 1,
            last_signature_height: 1,
            last_signature_time: 1
          }
        }
      ]);

      return stats;
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting FP signature stats:`, error);
      return [];
    }
  }

  /**
   * Get signatures for a specific block range
   */
  async getSignaturesInRange(
    network: Network,
    fromHeight: number,
    toHeight: number,
    consumerId?: string
  ): Promise<any[]> {
    try {
      const filter: any = {
        network: network,
        block_height: { $gte: fromHeight, $lte: toHeight }
      };

      if (consumerId) {
        filter.consumer_id = consumerId;
      }

      return await BSNSignature.find(filter)
        .sort({ block_height: 1, signed_at: 1 })
        .lean();
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting signatures in range:`, error);
      return [];
    }
  }

  /**
   * Get missed signatures for finality providers
   */
  async getMissedSignatures(
    network: Network,
    consumerId: string,
    fromHeight: number,
    toHeight: number
  ): Promise<{ fp_pubkey_hex: string; missed_heights: number[] }[]> {
    try {
      // Get all signatures in the range
      const signatures = await this.getSignaturesInRange(network, fromHeight, toHeight, consumerId);
      
      // Get all unique FPs for this consumer
      const uniqueFPs = [...new Set(signatures.map(sig => sig.fp_pubkey_hex))];
      
      const missedByFP: { fp_pubkey_hex: string; missed_heights: number[] }[] = [];

      for (const fpPubkey of uniqueFPs) {
        const fpSignatures = signatures.filter(sig => sig.fp_pubkey_hex === fpPubkey);
        const signedHeights = new Set(fpSignatures.map(sig => sig.block_height));
        
        const missedHeights: number[] = [];
        for (let height = fromHeight; height <= toHeight; height++) {
          if (!signedHeights.has(height)) {
            missedHeights.push(height);
          }
        }

        if (missedHeights.length > 0) {
          missedByFP.push({
            fp_pubkey_hex: fpPubkey,
            missed_heights: missedHeights
          });
        }
      }

      return missedByFP;
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting missed signatures:`, error);
      return [];
    }
  }

  /**
   * Get latest signature height for a consumer
   */
  async getLatestSignatureHeight(network: Network, consumerId: string): Promise<number> {
    try {
      const latest = await BSNSignature.findOne({
        network: network,
        consumer_id: consumerId
      })
      .sort({ block_height: -1 })
      .select('block_height')
      .lean();

      return latest?.block_height || 0;
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting latest signature height:`, error);
      return 0;
    }
  }

  /**
   * Get all active finality providers for a consumer
   */
  async getActiveFPsForConsumer(network: Network, consumerId: string): Promise<string[]> {
    try {
      const recentSignatures = await BSNSignature.aggregate([
        {
          $match: {
            network: network,
            consumer_id: consumerId,
            signed_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
          }
        },
        {
          $group: {
            _id: '$fp_pubkey_hex'
          }
        }
      ]);

      return recentSignatures.map((sig: any) => sig._id);
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting active FPs:`, error);
      return [];
    }
  }

  /**
   * Get detailed block-by-block signature status for FP (last N active blocks)
   */
  async getFPBlockSignatureStatus(
    fpPubkeyHex: string,
    consumerId: string,
    network: Network,
    blockCount: number = 100
  ): Promise<{ block_height: number; signed: boolean; tx_hash?: string }[]> {
    try {
      // Get last N active blocks (blocks that had signatures from ANY FP)
      const lastActiveBlocks = await BSNSignature.aggregate([
        {
          $match: {
            consumer_id: consumerId,
            network: network
          }
        },
        {
          $group: {
            _id: '$block_height'
          }
        },
        {
          $sort: { _id: -1 }
        },
        {
          $limit: blockCount
        }
      ]);

      if (lastActiveBlocks.length === 0) {
        return [];
      }

      const activeBlockHeights = lastActiveBlocks.map(block => block._id as number);
      const minHeight = Math.min(...activeBlockHeights);
      const maxHeight = Math.max(...activeBlockHeights);

      // Get this FP's OVERALL signature info to check if FP was active during this period
      const fpOverallData = await BSNSignature.aggregate([
        {
          $match: {
            fp_btc_pk_hex: fpPubkeyHex,
            consumer_id: consumerId,
            network: network
          }
        },
        {
          $group: {
            _id: null,
            first_signature_height: { $min: '$block_height' },
            last_signature_height: { $max: '$block_height' }
          }
        }
      ]);

      if (!fpOverallData[0]) {
        // FP has no signatures, return all active blocks as missed
        return activeBlockHeights.map(height => ({
          block_height: height,
          signed: false
        })).sort((a, b) => b.block_height - a.block_height);
      }

      const fpData = fpOverallData[0];
      const firstSignatureHeight = fpData.first_signature_height;
      const lastSignatureHeight = fpData.last_signature_height;

      // Filter active blocks to only those within FP's active period
      const relevantBlocks = activeBlockHeights.filter(height => 
        height >= firstSignatureHeight && height <= lastSignatureHeight
      );

      // Get this FP's signatures in the relevant blocks
      const fpSignatures = await BSNSignature.find({
        fp_btc_pk_hex: fpPubkeyHex,
        consumer_id: consumerId,
        network: network,
        block_height: { $in: relevantBlocks }
      })
      .select('block_height tx_hash')
      .lean();

      // Create a map of this FP's signed blocks
      const fpSignedBlocks = new Map(
        fpSignatures.map(sig => [sig.block_height, sig.tx_hash])
      );

      // Build result array for relevant active blocks only
      const result: { block_height: number; signed: boolean; tx_hash?: string }[] = 
        relevantBlocks.map(blockHeight => {
          const txHash = fpSignedBlocks.get(blockHeight) as string | undefined;
          return {
            block_height: blockHeight,
            signed: !!txHash,
            tx_hash: txHash
          };
        }).sort((a, b) => b.block_height - a.block_height);

      return result;
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting FP block signature status:`, error);
      return [];
    }
  }

  /**
   * Get aggregate signature statistics for FP (last N active blocks)
   */
  async getFPSignatureStatistics(
    fpPubkeyHex: string,
    consumerId: string,
    network: Network,
    blockCount: number = 10000
  ): Promise<{
    fp_pubkey_hex: string;
    consumer_id: string;
    active_blocks: number;
    signed_blocks: number;
    missed_blocks: number;
    signature_percentage: number;
    block_range: { from: number; to: number };
    first_signature_height?: number;
    last_signature_height?: number;
    last_signature_time?: Date;
  } | null> {
    try {
      // Get last N active blocks (blocks that had signatures from ANY FP)
      const lastActiveBlocks = await BSNSignature.aggregate([
        {
          $match: {
            consumer_id: consumerId,
            network: network
          }
        },
        {
          $group: {
            _id: '$block_height'
          }
        },
        {
          $sort: { _id: -1 }
        },
        {
          $limit: blockCount
        }
      ]);

      if (lastActiveBlocks.length === 0) {
        return null;
      }

      const activeBlockHeights = lastActiveBlocks.map(block => block._id as number);
      const minHeight = Math.min(...activeBlockHeights);
      const maxHeight = Math.max(...activeBlockHeights);

      // Get this FP's OVERALL signature info
      const fpOverallData = await BSNSignature.aggregate([
        {
          $match: {
            fp_btc_pk_hex: fpPubkeyHex,
            consumer_id: consumerId,
            network: network
          }
        },
        {
          $group: {
            _id: null,
            first_signature_height: { $min: '$block_height' },
            last_signature_height: { $max: '$block_height' },
            last_signature_time: { $max: '$signed_at' }
          }
        }
      ]);

      if (!fpOverallData[0]) {
        return {
          fp_pubkey_hex: fpPubkeyHex,
          consumer_id: consumerId,
          active_blocks: activeBlockHeights.length,
          signed_blocks: 0,
          missed_blocks: activeBlockHeights.length,
          signature_percentage: 0,
          block_range: { from: minHeight, to: maxHeight }
        };
      }

      const fpData = fpOverallData[0];
      const firstSignatureHeight = fpData.first_signature_height;
      const lastSignatureHeight = fpData.last_signature_height;

      // Filter active blocks to only those within FP's active period
      const relevantBlocks = activeBlockHeights.filter(height => 
        height >= firstSignatureHeight && height <= lastSignatureHeight
      );

      if (relevantBlocks.length === 0) {
        return {
          fp_pubkey_hex: fpPubkeyHex,
          consumer_id: consumerId,
          active_blocks: 0,
          signed_blocks: 0,
          missed_blocks: 0,
          signature_percentage: 0,
          block_range: { from: minHeight, to: maxHeight }
        };
      }

      // Count this FP's signatures in the relevant active blocks
      const signedBlocks = await BSNSignature.countDocuments({
        fp_btc_pk_hex: fpPubkeyHex,
        consumer_id: consumerId,
        network: network,
        block_height: { $in: relevantBlocks }
      });

      const totalActiveBlocks = relevantBlocks.length;
      const missedBlocks = Math.max(0, totalActiveBlocks - signedBlocks);
      const signaturePercentage = totalActiveBlocks > 0 ? (signedBlocks / totalActiveBlocks) * 100 : 0;

      return {
        fp_pubkey_hex: fpPubkeyHex,
        consumer_id: consumerId,
        active_blocks: totalActiveBlocks,
        signed_blocks: signedBlocks,
        missed_blocks: missedBlocks,
        signature_percentage: Math.round(signaturePercentage * 100) / 100, // Round to 2 decimals
        block_range: { from: minHeight, to: maxHeight },
        first_signature_height: firstSignatureHeight,
        last_signature_height: lastSignatureHeight,
        last_signature_time: fpData.last_signature_time
      };
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting FP signature statistics:`, error);
      return null;
    }
  }

  /**
   * Get all finality providers signature statistics for a consumer
   */
  async getAllFPSignatureStatistics(
    consumerId: string,
    network: Network,
    blockCount: number = 10000
  ): Promise<Array<{
    fp_pubkey_hex: string;
    consumer_id: string;
    active_blocks: number;
    signed_blocks: number;
    missed_blocks: number;
    signature_percentage: number;
    block_range: { from: number; to: number };
    first_signature_height?: number;
    last_signature_height?: number;
    last_signature_time?: Date;
  }>> {
    try {
      // Get latest signature height for this consumer
      const latestHeight = await this.getLatestSignatureHeight(network, consumerId);
      if (latestHeight === 0) {
        return [];
      }

      const fromHeight = Math.max(1, latestHeight - blockCount + 1);

      // Get all unique FPs and their signature ranges in the period
      const fpStats = await BSNSignature.aggregate([
        {
          $match: {
            consumer_id: consumerId,
            network: network,
            block_height: { $gte: fromHeight, $lte: latestHeight }
          }
        },
        {
          $group: {
            _id: '$fp_btc_pk_hex',
            signed_blocks: { $sum: 1 },
            first_signature_height: { $min: '$block_height' },
            last_signature_height: { $max: '$block_height' },
            last_signature_time: { $max: '$signed_at' }
          }
        }
      ]);

      // Get all blocks that had signatures from ANY FP in the period
      const allSigningBlocks = await BSNSignature.aggregate([
        {
          $match: {
            consumer_id: consumerId,
            network: network,
            block_height: { $gte: fromHeight, $lte: latestHeight }
          }
        },
        {
          $group: {
            _id: '$block_height'
          }
        }
      ]);

      const signingBlocksSet = new Set(allSigningBlocks.map(block => block._id));

      return fpStats.map(stat => {
        const signedBlocks = stat.signed_blocks;
        const firstSignatureHeight = stat.first_signature_height;
        const lastSignatureHeight = stat.last_signature_height;

        // Count blocks that required signatures within this FP's active period
        const activeSigningBlocks = Array.from(signingBlocksSet).filter(
          height => height >= firstSignatureHeight && height <= lastSignatureHeight
        ).length;

        const missedBlocks = Math.max(0, activeSigningBlocks - signedBlocks);
        const signaturePercentage = activeSigningBlocks > 0 ? (signedBlocks / activeSigningBlocks) * 100 : 0;

        return {
          fp_pubkey_hex: stat._id,
          consumer_id: consumerId,
          active_blocks: activeSigningBlocks,
          signed_blocks: signedBlocks,
          missed_blocks: missedBlocks,
          signature_percentage: Math.round(signaturePercentage * 100) / 100,
          block_range: { from: fromHeight, to: latestHeight },
          first_signature_height: firstSignatureHeight,
          last_signature_height: lastSignatureHeight,
          last_signature_time: stat.last_signature_time
        };
      }).sort((a, b) => b.signature_percentage - a.signature_percentage); // Sort by performance
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting all FP signature statistics:`, error);
      return [];
    }
  }
}
