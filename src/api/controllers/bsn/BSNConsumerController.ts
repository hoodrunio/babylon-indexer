/**
 * BSN Consumer Controller
 * Handles BSN consumer registry API endpoints
 */

import { BSNConsumerService } from '../../../services/bsn/BSNConsumerService';
import { Network, ConsumerType } from '../../../types/bsn';
import { ConsumerListQuery } from '../../../types/bsn/consumer';
import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';

export class BSNConsumerController {
    private static instance: BSNConsumerController | null = null;
    private bsnConsumerService: BSNConsumerService;

    private constructor() {
        this.bsnConsumerService = BSNConsumerService.getInstance();
    }

    public static getInstance(): BSNConsumerController {
        if (!BSNConsumerController.instance) {
            BSNConsumerController.instance = new BSNConsumerController();
        }
        return BSNConsumerController.instance;
    }

    /**
     * Register BSN consumer routes on the provided router
     * @param router Express router
     */
    public registerRoutes(router: Router): void {
        // Get BSN consumer parameters
        router.get('/params', this.getConsumerParams.bind(this));
        
        // Get all BSN consumers with filtering and pagination
        router.get('/consumers', this.getConsumers.bind(this));
        
        // Get consumer type counts and statistics
        router.get('/consumers/stats', this.getConsumerStats.bind(this));
        
        // Get specific BSN consumer by ID
        router.get('/consumers/:consumerId', this.getConsumerById.bind(this));
        
        // Get consumer activity status
        router.get('/consumers/:consumerId/status', this.getConsumerStatus.bind(this));
    }

    /**
     * Get BSN consumer parameters
     */
    public async getConsumerParams(req: Request, res: Response): Promise<Response> {
        try {
            const network = (req.query.network as Network) || Network.MAINNET;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            const params = await this.bsnConsumerService.getConsumerParams(network);

            return res.json({
                params,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting BSN consumer parameters:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get BSN consumers with optional filtering and pagination
     */
    public async getConsumers(req: Request, res: Response): Promise<Response> {
        try {
            const network = (req.query.network as Network) || Network.MAINNET;
            const consumerType = req.query.consumer_type as ConsumerType;
            const isActive = req.query.is_active ? req.query.is_active === 'true' : undefined;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;
            const sortBy = req.query.sort_by as string || 'consumer_name';
            const sortOrder = req.query.sort_order as string || 'asc';

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            // Validate consumer type if provided
            if (consumerType && !Object.values(ConsumerType).includes(consumerType)) {
                return res.status(400).json({
                    error: 'Invalid consumer_type parameter. Must be one of: COSMOS, ROLLUP'
                });
            }

            // Validate sort parameters
            const validSortFields = ['consumer_id', 'consumer_name', 'registration_time', 'last_activity'];
            if (sortBy && !validSortFields.includes(sortBy)) {
                return res.status(400).json({
                    error: `Invalid sort_by parameter. Must be one of: ${validSortFields.join(', ')}`
                });
            }

            if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
                return res.status(400).json({
                    error: 'Invalid sort_order parameter. Must be one of: asc, desc'
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

            const query: ConsumerListQuery = {
                consumer_type: consumerType,
                is_active: isActive,
                network,
                limit,
                offset,
                sort_by: sortBy as any,
                sort_order: sortOrder as any
            };

            const result = await this.bsnConsumerService.getConsumerRegistryList(query, network);

            return res.json({
                consumers: result.consumers,
                pagination: {
                    limit,
                    offset,
                    total: result.pagination.total,
                    hasMore: result.pagination.hasMore
                },
                filters: {
                    network,
                    consumer_type: consumerType,
                    is_active: isActive
                },
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting BSN consumers:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get BSN consumer statistics and counts
     */
    public async getConsumerStats(req: Request, res: Response): Promise<Response> {
        try {
            const network = (req.query.network as Network) || Network.MAINNET;

            // Validate network parameter
            if (!Object.values(Network).includes(network)) {
                return res.status(400).json({
                    error: 'Invalid network parameter. Must be one of: mainnet, testnet'
                });
            }

            const typeCounts = await this.bsnConsumerService.getConsumerTypeCounts(network);

            return res.json({
                stats: {
                    total_consumers: typeCounts.TOTAL,
                    active_consumers: typeCounts.ACTIVE,
                    cosmos_consumers: typeCounts.COSMOS || 0,
                    rollup_consumers: typeCounts.ROLLUP || 0,
                    inactive_consumers: typeCounts.TOTAL - typeCounts.ACTIVE
                },
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting BSN consumer statistics:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get specific BSN consumer by ID
     */
    public async getConsumerById(req: Request, res: Response): Promise<Response> {
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

            const consumer = await this.bsnConsumerService.getConsumerById(consumerId, network);

            if (!consumer) {
                return res.status(404).json({
                    error: 'Consumer not found',
                    message: `No BSN consumer found with ID: ${consumerId}`
                });
            }

            return res.json({
                consumer,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting BSN consumer by ID:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get BSN consumer activity status
     */
    public async getConsumerStatus(req: Request, res: Response): Promise<Response> {
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

            const isActive = await this.bsnConsumerService.isConsumerActive(consumerId, network);
            const consumer = await this.bsnConsumerService.getConsumerById(consumerId, network);

            if (!consumer) {
                return res.status(404).json({
                    error: 'Consumer not found',
                    message: `No BSN consumer found with ID: ${consumerId}`
                });
            }

            return res.json({
                consumer_id: consumerId,
                is_active: isActive,
                consumer_type: consumer.consumer_type,
                registration_time: consumer.registration_time,
                last_activity: consumer.last_activity,
                network,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting BSN consumer status:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
