/**
 * BSN (Bitcoin Supercharged Networks) Routes
 * Handles all BSN-related API endpoints
 */

import { Router } from 'express';
import { BSNConsumerController, ZoneConciergeController } from '../../controllers/bsn';
import { logger } from '../../../utils/logger';

const router = Router();

// Initialize controllers
const bsnConsumerController = BSNConsumerController.getInstance();
const zoneConciergeController = ZoneConciergeController.getInstance();

// Log BSN routes initialization
logger.info('[BSN Routes] Initializing BSN API routes...');

// BSN Consumer routes - handles consumer registry and management
bsnConsumerController.registerRoutes(router);

// ZoneConcierge routes - handles BSN finality and header finalization
zoneConciergeController.registerRoutes(router);

logger.info('[BSN Routes] BSN API routes initialized successfully');

export default router;
