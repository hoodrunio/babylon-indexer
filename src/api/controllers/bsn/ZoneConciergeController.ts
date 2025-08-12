/**
 * ZoneConcierge Controller
 * Handles BSN finality and header finalization API endpoints
 */

import { ZoneConciergeService } from '../../../services/bsn/ZoneConciergeService';
import { Network } from '../../../types/bsn';
import { FinalityQuery } from '../../../types/bsn/finality';
import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';

export class ZoneConciergeController {
    private static instance: ZoneConciergeController | null = null;
    private zoneConciergeService: ZoneConciergeService;

    private constructor() {
        this.zoneConciergeService = ZoneConciergeService.getInstance();
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
}
