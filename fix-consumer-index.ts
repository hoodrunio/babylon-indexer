#!/usr/bin/env ts-node

/**
 * Fix BSN Consumer index - drop old unique index and rebuild
 */

import mongoose from 'mongoose';
import { logger } from './src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function fixConsumerIndex() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/testnet-indexer';
        await mongoose.connect(mongoUri);
        logger.info('Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }
        const collection = db.collection('bsn_consumers');

        // List existing indexes
        const indexes = await collection.indexes();
        logger.info('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique })));

        // Drop the old unique index on consumer_id
        try {
            await collection.dropIndex('consumer_id_1');
            logger.info('✅ Dropped old unique index on consumer_id');
        } catch (error: any) {
            if (error.code === 27 || error.message.includes('index not found')) {
                logger.info('Old index consumer_id_1 not found (already removed)');
            } else {
                throw error;
            }
        }

        // Create new compound unique index
        try {
            await collection.createIndex(
                { consumer_id: 1, network: 1 }, 
                { unique: true, name: 'consumer_id_network_unique' }
            );
            logger.info('✅ Created new compound unique index on consumer_id + network');
        } catch (error: any) {
            if (error.code === 85 || error.message.includes('already exists')) {
                logger.info('Compound unique index already exists');
            } else {
                throw error;
            }
        }

        // List indexes after changes
        const newIndexes = await collection.indexes();
        logger.info('Updated indexes:', newIndexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique })));

        await mongoose.disconnect();
        logger.info('✅ Index fix completed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Index fix failed:', error);
        process.exit(1);
    }
}

fixConsumerIndex();
