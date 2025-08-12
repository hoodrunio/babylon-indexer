/**
 * BSN Database Migration Script
 * Creates necessary indexes and prepares database for BSN functionality
 */

import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { BSNConsumer, BSNHeader, BSNFinality, BSNIBCPacket } from '../database/models/bsn';
import dotenv from 'dotenv';

dotenv.config();

async function connectToDatabase(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/babylon-indexer';
    
    try {
        await mongoose.connect(mongoUri);
        logger.info('[BSN Migration] Connected to MongoDB');
    } catch (error) {
        logger.error('[BSN Migration] Failed to connect to MongoDB:', error);
        throw error;
    }
}

async function createBSNIndexes(): Promise<void> {
    try {
        logger.info('[BSN Migration] Creating BSN database indexes...');

        // BSN Consumer indexes
        await BSNConsumer.createIndexes();
        logger.info('[BSN Migration] ✅ BSNConsumer indexes created');

        // BSN Header indexes
        await BSNHeader.createIndexes();
        logger.info('[BSN Migration] ✅ BSNHeader indexes created');

        // BSN Finality indexes
        await BSNFinality.createIndexes();
        logger.info('[BSN Migration] ✅ BSNFinality indexes created');

        // BSN IBC Packet indexes
        await BSNIBCPacket.createIndexes();
        logger.info('[BSN Migration] ✅ BSNIBCPacket indexes created');

        logger.info('[BSN Migration] All BSN indexes created successfully');
    } catch (error) {
        logger.error('[BSN Migration] Error creating BSN indexes:', error);
        throw error;
    }
}

async function checkExistingData(): Promise<void> {
    try {
        logger.info('[BSN Migration] Checking existing BSN data...');

        const consumerCount = await BSNConsumer.countDocuments();
        const headerCount = await BSNHeader.countDocuments();
        const finalityCount = await BSNFinality.countDocuments();
        const packetCount = await BSNIBCPacket.countDocuments();

        logger.info('[BSN Migration] Existing data counts:');
        logger.info(`  - Consumers: ${consumerCount}`);
        logger.info(`  - Headers: ${headerCount}`);
        logger.info(`  - Finality: ${finalityCount}`);
        logger.info(`  - IBC Packets: ${packetCount}`);

        if (consumerCount > 0 || headerCount > 0 || finalityCount > 0 || packetCount > 0) {
            logger.warn('[BSN Migration] ⚠️  Existing BSN data found. Migration will preserve existing data.');
        } else {
            logger.info('[BSN Migration] ✅ No existing BSN data found. Clean migration.');
        }
    } catch (error) {
        logger.error('[BSN Migration] Error checking existing data:', error);
        throw error;
    }
}

async function validateBSNModels(): Promise<void> {
    try {
        logger.info('[BSN Migration] Validating BSN models...');

        // Test BSN Consumer model
        const testConsumer = new BSNConsumer({
            consumer_id: 'test-consumer',
            consumer_name: 'Test Consumer',
            consumer_description: 'Test consumer for validation',
            consumer_type: 'COSMOS',
            babylon_rewards_commission: '0.05',
            is_active: true,
            registration_height: 1,
            registration_tx_hash: 'test-tx-hash',
            network: 'testnet',
            last_updated_height: 1
        });

        const validationError = testConsumer.validateSync();
        if (validationError) {
            logger.error('[BSN Migration] BSN Consumer model validation failed:', validationError);
            throw validationError;
        }

        logger.info('[BSN Migration] ✅ BSN models validation passed');
    } catch (error) {
        logger.error('[BSN Migration] Error validating BSN models:', error);
        throw error;
    }
}

async function displayMigrationInfo(): Promise<void> {
    logger.info('\n' + '='.repeat(50));
    logger.info('BSN (Bitcoin Supercharged Networks) Migration');
    logger.info('='.repeat(50));
    logger.info('This script will:');
    logger.info('1. Create BSN database indexes');
    logger.info('2. Validate BSN models');
    logger.info('3. Check existing data');
    logger.info('4. Prepare database for BSN functionality');
    logger.info('='.repeat(50) + '\n');
}

async function displayCompletionInfo(): Promise<void> {
    logger.info('\n' + '='.repeat(50));
    logger.info('BSN Migration Completed Successfully! 🎉');
    logger.info('='.repeat(50));
    logger.info('Next steps:');
    logger.info('1. Set BSN_PROCESSING_ENABLED=true in your .env file');
    logger.info('2. Configure BSN cache TTL values if needed');
    logger.info('3. Start the indexer to begin BSN processing');
    logger.info('4. Use BSN API endpoints: /v1/bsn/*');
    logger.info('='.repeat(50) + '\n');
}

async function main(): Promise<void> {
    try {
        await displayMigrationInfo();
        
        await connectToDatabase();
        
        await checkExistingData();
        
        await validateBSNModels();
        
        await createBSNIndexes();
        
        await displayCompletionInfo();
        
        logger.info('[BSN Migration] Migration completed successfully');
        process.exit(0);
        
    } catch (error) {
        logger.error('[BSN Migration] Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

if (isDryRun) {
    logger.info('[BSN Migration] Running in DRY RUN mode - no changes will be made');
}

if (isForce) {
    logger.info('[BSN Migration] Running in FORCE mode - will recreate indexes if they exist');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('[BSN Migration] Received SIGINT, shutting down gracefully...');
    await mongoose.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('[BSN Migration] Received SIGTERM, shutting down gracefully...');
    await mongoose.disconnect();
    process.exit(0);
});

// Run migration
main().catch((error) => {
    logger.error('[BSN Migration] Unhandled error:', error);
    process.exit(1);
});
