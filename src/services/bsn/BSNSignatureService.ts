/**
 * BSN Signature Service
 * Handles rollup BSN signature processing and tracking
 */

import { BSNRollupSignature } from '../../database/models/bsn';
import { ConsumerMapping } from '../../utils/bsn/ConsumerMapping';
import { Network } from '../../types/bsn';
import { logger } from '../../utils/logger';

export interface BSNSignatureData {
  fp_pubkey_hex: string;
  height: number;
  [key: string]: any; // Additional signature data
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
}

export class BSNSignatureService {
  private static instance: BSNSignatureService | null = null;
  private consumerMapping: ConsumerMapping;

  private constructor() {
    this.consumerMapping = ConsumerMapping.getInstance();
  }

  public static getInstance(): BSNSignatureService {
    if (!BSNSignatureService.instance) {
      BSNSignatureService.instance = new BSNSignatureService();
    }
    return BSNSignatureService.instance;
  }

  /**
   * Process and save rollup BSN signature
   */
  async handleSignature(
    signatureData: BSNSignatureData,
    context: BSNSignatureContext
  ): Promise<void> {
    try {
      // Get consumer ID from contract mapping
      const consumerId = await this.consumerMapping.getConsumerIdFromContract(
        context.contractAddress,
        context.network
      );

      if (!consumerId) {
        logger.warn(`[BSNSignatureService] No consumer mapping found for contract: ${context.contractAddress}`);
        return;
      }

      // Check if signature already exists (prevent duplicates)
      const existingSignature = await BSNRollupSignature.findOne({
        tx_hash: context.txHash,
        network: context.network
      });

      if (existingSignature) {
        logger.debug(`[BSNSignatureService] Signature already exists for tx: ${context.txHash}`);
        return;
      }

      // Create and save signature record
      const rollupSignature = new BSNRollupSignature({
        consumer_id: consumerId,
        fp_pubkey_hex: signatureData.fp_pubkey_hex,
        block_height: signatureData.height,
        contract_address: context.contractAddress,
        tx_hash: context.txHash,
        network: context.network,
        signed_at: context.signedAt
      });

      await rollupSignature.save();

      logger.info(`[BSNSignatureService] Saved signature: FP ${signatureData.fp_pubkey_hex} for block ${signatureData.height} on consumer ${consumerId}`);

    } catch (error) {
      logger.error(`[BSNSignatureService] Error handling signature:`, error);
      throw error;
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

      const stats = await BSNRollupSignature.aggregate([
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

      return await BSNRollupSignature.find(filter)
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
      const latest = await BSNRollupSignature.findOne({
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
      const recentSignatures = await BSNRollupSignature.aggregate([
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

      return recentSignatures.map(sig => sig._id);
    } catch (error) {
      logger.error(`[BSNSignatureService] Error getting active FPs:`, error);
      return [];
    }
  }
}
