/**
 * ZoneConcierge Controller
 * Handles BSN finality and header finalization API endpoints
 */

import { ZoneConciergeService } from '../../../services/bsn/ZoneConciergeService';
import { BSNSignatureService } from '../../../services/bsn/BSNSignatureService';
import { Network } from '../../../types/bsn';
import { FinalityQuery } from '../../../types/bsn/finality';
import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';

export class ZoneConciergeController {
    private static instance: ZoneConciergeController | null = null;
    private zoneConciergeService: ZoneConciergeService;
    private bsnSignatureService: BSNSignatureService;

    private constructor() {
        this.zoneConciergeService = ZoneConciergeService.getInstance();
        this.bsnSignatureService = BSNSignatureService.getInstance();
    }

    public static getInstance(): ZoneConciergeController {
        if (!ZoneConciergeController.instance) {
            ZoneConciergeController.instance = new ZoneConciergeController();
        }
        return ZoneConciergeController.instance;
    }

    /**
     * Register ZoneConcierge routes on the provided router
     * @param router Express router
     */
    public registerRoutes(router: Router): void {
        // Get ZoneConcierge parameters
        router.get('/finality/params', this.getFinalityParams.bind(this));
        
        // Get finalized BSN information
        router.get('/finality/bsns', this.getFinalizedBSNs.bind(this));
        
        // Get finalized BSN info for specific consumer
        router.get('/finality/bsns/:consumerId', this.getFinalizedBSNById.bind(this));
        
        // Get finalization status for multiple BSNs
        router.get('/finality/status', this.getBSNFinalizationStatus.bind(this));
        
        // Get latest finalized epoch for a BSN
        router.get('/finality/bsns/:consumerId/epoch', this.getLatestFinalizedEpoch.bind(this));
        
        // Get current epoch information
        router.get('/finality/epoch/current', this.getCurrentEpochInfo.bind(this));
        
        // Get finality providers for a specific BSN
        router.get('/finality/bsns/:consumerId/providers', this.getBSNFinalityProviders.bind(this));
        
        // Get BSN information with finality providers included
        router.get('/finality/bsns/:consumerId/with-providers', this.getBSNWithFinalityProviders.bind(this));
        
        // FP signature endpoints
        // Get detailed block signature status for a specific FP (last N blocks)
        router.get('/finality/bsns/:consumerId/providers/:fpPubkeyHex/blocks', this.getFPBlockSignatures.bind(this));
        
        // Get signature statistics for a specific FP (last N blocks)
        router.get('/finality/bsns/:consumerId/providers/:fpPubkeyHex/stats', this.getFPSignatureStats.bind(this));
        
        // Get signature statistics for all FPs in a consumer (last N blocks)
        router.get('/finality/bsns/:consumerId/providers/stats', this.getAllFPSignatureStats.bind(this));
    }

    /**
     * Get ZoneConcierge finality parameters
     */
    public async getFinalityParams(req: Request, res: Response): Promise<Response> {
        try {
            const network = (req.query.network as Network) || Network.MAINNET;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            const params = await this.zoneConciergeService.getZoneConciergeParams(network);

            return res.json({
                params,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting ZoneConcierge parameters:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get finalized BSN information
     */
    public async getFinalizedBSNs(req: Request, res: Response): Promise<Response> {
        try {
            const network = (req.query.network as Network) || Network.MAINNET;
            const consumerIds = req.query.consumer_ids as string;
            const prove = req.query.prove === 'true';
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            // Validate pagination parameters
            if (limit < 1 || limit > 100) {
                return res.status(400).json({
                    error: 'Invalid limit parameter. Must be between 1 and 100'
                });
            }

            if (offset < 0) {
                return res.status(400).json({
                    error: 'Invalid offset parameter. Must be >= 0'
                });
            }

            let result;

            if (consumerIds) {
                // Parse consumer IDs from comma-separated string
                const consumerIdArray = consumerIds.split(',').map(id => id.trim()).filter(id => id);
                
                if (consumerIdArray.length === 0) {
                    return res.status(400).json({
                        error: 'Invalid consumer_ids parameter. Must be comma-separated list of consumer IDs'
                    });
                }

                const finalizedData = await this.zoneConciergeService.getFinalizedBSNsInfo(
                    consumerIdArray,
                    prove,
                    network
                );

                result = {
                    data: finalizedData,
                    pagination: {
                        limit,
                        offset,
                        total: finalizedData.length,
                        hasMore: false
                    }
                };
            } else {
                // Get all finalized BSNs with pagination
                const query: FinalityQuery = {
                    prove,
                    limit,
                    offset
                };

                result = await this.zoneConciergeService.getAllFinalizedBSNs(query, network);
            }

            return res.json({
                finalized_bsns: result.data,
                pagination: result.pagination,
                network,
                prove,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting finalized BSNs:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get finalized BSN info for specific consumer
     */
    public async getFinalizedBSNById(req: Request, res: Response): Promise<Response> {
        try {
            const { consumerId } = req.params;
            const network = (req.query.network as Network) || Network.MAINNET;
            const prove = req.query.prove === 'true';

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            if (!consumerId) {
                return res.status(400).json({
                    error: 'Consumer ID is required'
                });
            }

            const finalizedData = await this.zoneConciergeService.getFinalizedBSNInfo(
                consumerId,
                prove,
                network
            );

            if (!finalizedData) {
                return res.status(404).json({
                    error: 'Finalized BSN not found',
                    message: `No finalized BSN data found for consumer ID: ${consumerId}`
                });
            }

            return res.json({
                finalized_bsn: finalizedData,
                network,
                prove,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting finalized BSN by ID:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get finalization status for multiple BSNs
     */
    public async getBSNFinalizationStatus(req: Request, res: Response): Promise<Response> {
        try {
            const network = (req.query.network as Network) || Network.MAINNET;
            const consumerIds = req.query.consumer_ids as string;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            if (!consumerIds) {
                return res.status(400).json({
                    error: 'consumer_ids parameter is required'
                });
            }

            // Parse consumer IDs from comma-separated string
            const consumerIdArray = consumerIds.split(',').map(id => id.trim()).filter(id => id);
            
            if (consumerIdArray.length === 0) {
                return res.status(400).json({
                    error: 'Invalid consumer_ids parameter. Must be comma-separated list of consumer IDs'
                });
            }

            const status = await this.zoneConciergeService.getBSNFinalizationStatus(
                consumerIdArray,
                network
            );

            return res.json({
                finalization_status: status,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting BSN finalization status:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get latest finalized epoch for a BSN
     */
    public async getLatestFinalizedEpoch(req: Request, res: Response): Promise<Response> {
        try {
            const { consumerId } = req.params;
            const network = (req.query.network as Network) || Network.MAINNET;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            if (!consumerId) {
                return res.status(400).json({
                    error: 'Consumer ID is required'
                });
            }

            const latestEpoch = await this.zoneConciergeService.getLatestFinalizedEpoch(
                consumerId,
                network
            );

            if (latestEpoch === null) {
                return res.status(404).json({
                    error: 'No finalized epoch found',
                    message: `No finalized epochs found for consumer ID: ${consumerId}`
                });
            }

            const isFinalized = await this.zoneConciergeService.isBSNFinalized(consumerId, network);

            return res.json({
                consumer_id: consumerId,
                latest_finalized_epoch: latestEpoch,
                is_finalized: isFinalized,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting latest finalized epoch:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get current epoch information
     */
    public async getCurrentEpochInfo(req: Request, res: Response): Promise<Response> {
        try {
            const network = (req.query.network as Network) || Network.MAINNET;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            const epochInfo = await this.zoneConciergeService.getCurrentEpochInfo(network);

            if (!epochInfo) {
                return res.status(404).json({
                    error: 'Current epoch info not available',
                    message: 'Current epoch information is not available at this time'
                });
            }

            return res.json({
                current_epoch: epochInfo,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting current epoch info:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get finality providers for a specific BSN
     */
    public async getBSNFinalityProviders(req: Request, res: Response): Promise<Response> {
        try {
            const { consumerId } = req.params;
            const network = (req.query.network as Network) || Network.MAINNET;
            const activeOnly = req.query.active_only === 'true';

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            if (!consumerId) {
                return res.status(400).json({
                    error: 'Consumer ID is required'
                });
            }

            const finalityProviders = await this.zoneConciergeService.getBSNFinalityProviders(
                consumerId,
                network,
                activeOnly
            );

            return res.json({
                consumer_id: consumerId,
                finality_providers: finalityProviders,
                active_only: activeOnly,
                count: finalityProviders.length,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting BSN finality providers:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get BSN information with finality providers included
     */
    public async getBSNWithFinalityProviders(req: Request, res: Response): Promise<Response> {
        try {
            const { consumerId } = req.params;
            const network = (req.query.network as Network) || Network.MAINNET;
            const prove = req.query.prove === 'true';
            const activeOnly = req.query.active_only === 'true';

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            if (!consumerId) {
                return res.status(400).json({
                    error: 'Consumer ID is required'
                });
            }

            // Get BSN info and finality providers separately to allow activeOnly filtering
            const [bsnInfo, finalityProviders] = await Promise.all([
                this.zoneConciergeService.getFinalizedBSNInfo(consumerId, prove, network),
                this.zoneConciergeService.getBSNFinalityProviders(consumerId, network, activeOnly)
            ]);

            if (!bsnInfo) {
                return res.status(404).json({
                    error: 'BSN not found',
                    message: `No BSN data found for consumer ID: ${consumerId}`
                });
            }

            const isFinalized = bsnInfo.epoch_info !== undefined && 
                              bsnInfo.epoch_info.epoch_number > 0;

            return res.json({
                consumer_id: consumerId,
                bsn_info: bsnInfo,
                finality_providers: finalityProviders,
                is_finalized: isFinalized,
                finality_providers_count: finalityProviders.length,
                active_only: activeOnly,
                network,
                prove,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting BSN with finality providers:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get detailed block signature status for a specific FP (last N blocks)
     */
    public async getFPBlockSignatures(req: Request, res: Response): Promise<Response> {
        try {
            const { consumerId, fpPubkeyHex } = req.params;
            const network = (req.query.network as Network) || Network.MAINNET;
            const blockCount = parseInt(req.query.blocks as string) || 100;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            if (!consumerId || !fpPubkeyHex) {
                return res.status(400).json({
                    error: 'Consumer ID and FP public key are required'
                });
            }

            // Validate block count
            if (blockCount < 1 || blockCount > 1000) {
                return res.status(400).json({
                    error: 'Invalid blocks parameter. Must be between 1 and 1000'
                });
            }

            const blockSignatures = await this.bsnSignatureService.getFPBlockSignatureStatus(
                fpPubkeyHex,
                consumerId,
                network,
                blockCount
            );

            const signedCount = blockSignatures.filter(b => b.signed).length;
            const missedCount = blockSignatures.length - signedCount;
            const signaturePercentage = blockSignatures.length > 0 
                ? Math.round((signedCount / blockSignatures.length) * 10000) / 100 
                : 0;

            return res.json({
                consumer_id: consumerId,
                fp_pubkey_hex: fpPubkeyHex,
                block_count: blockCount,
                block_signatures: blockSignatures,
                summary: {
                    total_blocks: blockSignatures.length,
                    signed_blocks: signedCount,
                    missed_blocks: missedCount,
                    signature_percentage: signaturePercentage
                },
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting FP block signatures:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get signature statistics for a specific FP (last N blocks)
     */
    public async getFPSignatureStats(req: Request, res: Response): Promise<Response> {
        try {
            const { consumerId, fpPubkeyHex } = req.params;
            const network = (req.query.network as Network) || Network.MAINNET;
            const blockCount = parseInt(req.query.blocks as string) || 10000;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            if (!consumerId || !fpPubkeyHex) {
                return res.status(400).json({
                    error: 'Consumer ID and FP public key are required'
                });
            }

            // Validate block count
            if (blockCount < 1 || blockCount > 100000) {
                return res.status(400).json({
                    error: 'Invalid blocks parameter. Must be between 1 and 100000'
                });
            }

            const statistics = await this.bsnSignatureService.getFPSignatureStatistics(
                fpPubkeyHex,
                consumerId,
                network,
                blockCount
            );

            if (!statistics) {
                return res.status(404).json({
                    error: 'FP signature statistics not found',
                    message: `No signature data found for FP ${fpPubkeyHex} in consumer ${consumerId}`
                });
            }

            return res.json({
                consumer_id: consumerId,
                fp_pubkey_hex: fpPubkeyHex,
                block_count: blockCount,
                statistics,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting FP signature statistics:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get signature statistics for all FPs in a consumer (last N blocks)
     */
    public async getAllFPSignatureStats(req: Request, res: Response): Promise<Response> {
        try {
            const { consumerId } = req.params;
            const network = (req.query.network as Network) || Network.MAINNET;
            const blockCount = parseInt(req.query.blocks as string) || 10000;
            const sortBy = (req.query.sort as string) || 'percentage'; // percentage, signed, missed
            const order = (req.query.order as string) || 'desc'; // asc, desc

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            if (!consumerId) {
                return res.status(400).json({
                    error: 'Consumer ID is required'
                });
            }

            // Validate block count
            if (blockCount < 1 || blockCount > 100000) {
                return res.status(400).json({
                    error: 'Invalid blocks parameter. Must be between 1 and 100000'
                });
            }

            // Validate sort parameters
            if (!['percentage', 'signed', 'missed'].includes(sortBy)) {
                return res.status(400).json({
                    error: 'Invalid sort parameter. Must be one of: percentage, signed, missed'
                });
            }

            if (!['asc', 'desc'].includes(order)) {
                return res.status(400).json({
                    error: 'Invalid order parameter. Must be one of: asc, desc'
                });
            }

            let statistics = await this.bsnSignatureService.getAllFPSignatureStatistics(
                consumerId,
                network,
                blockCount
            );

            // Apply sorting
            if (sortBy === 'percentage') {
                statistics.sort((a, b) => order === 'desc' 
                    ? b.signature_percentage - a.signature_percentage
                    : a.signature_percentage - b.signature_percentage);
            } else if (sortBy === 'signed') {
                statistics.sort((a, b) => order === 'desc'
                    ? b.signed_blocks - a.signed_blocks
                    : a.signed_blocks - b.signed_blocks);
            } else if (sortBy === 'missed') {
                statistics.sort((a, b) => order === 'desc'
                    ? b.missed_blocks - a.missed_blocks
                    : a.missed_blocks - b.missed_blocks);
            }

            // Calculate overall statistics
            const totalFPs = statistics.length;
            const avgSignaturePercentage = totalFPs > 0
                ? statistics.reduce((sum, stat) => sum + stat.signature_percentage, 0) / totalFPs
                : 0;
            
            const totalActiveBlocks = statistics.reduce((sum, stat) => sum + stat.active_blocks, 0);
            const totalSignedBlocks = statistics.reduce((sum, stat) => sum + stat.signed_blocks, 0);
            const totalMissedBlocks = statistics.reduce((sum, stat) => sum + stat.missed_blocks, 0);

            const bestPerformer = statistics.length > 0 ? statistics[0] : null;
            const worstPerformer = statistics.length > 0 
                ? statistics.reduce((worst, current) => 
                    current.signature_percentage < worst.signature_percentage ? current : worst)
                : null;

            return res.json({
                consumer_id: consumerId,
                block_count: blockCount,
                total_fps: totalFPs,
                sort: { by: sortBy, order },
                overall_stats: {
                    total_active_blocks: totalActiveBlocks,
                    total_signed_blocks: totalSignedBlocks,
                    total_missed_blocks: totalMissedBlocks,
                    average_signature_percentage: Math.round(avgSignaturePercentage * 100) / 100,
                    best_performer: bestPerformer ? {
                        fp_pubkey_hex: bestPerformer.fp_pubkey_hex,
                        signature_percentage: bestPerformer.signature_percentage
                    } : null,
                    worst_performer: worstPerformer ? {
                        fp_pubkey_hex: worstPerformer.fp_pubkey_hex,
                        signature_percentage: worstPerformer.signature_percentage
                    } : null
                },
                fp_statistics: statistics,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting all FP signature statistics:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
