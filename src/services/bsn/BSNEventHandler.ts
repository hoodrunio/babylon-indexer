/**
 * BSN Event Handler
 * Processes BSN-related events from blocks and transactions
 */

import { Network, ConsumerType } from '../../types/bsn';
import { EventConsumerRegistered } from '../../types/bsn/consumer';
import { BSNConsumer } from '../../database/models/bsn';
import { logger } from '../../utils/logger';

export class BSNEventHandler {
    private static instance: BSNEventHandler | null = null;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): BSNEventHandler {
        if (!BSNEventHandler.instance) {
            BSNEventHandler.instance = new BSNEventHandler();
        }
        return BSNEventHandler.instance;
    }

    /**
     * Process BSN events from transaction results
     */
    public async processEvents(
        events: any[],
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            for (const event of events) {
                await this.processEvent(event, txHash, blockHeight, network);
            }
        } catch (error) {
            logger.error('[BSNEventHandler] Error processing events:', error);
            throw error;
        }
    }

    /**
     * Process a single BSN event
     */
    private async processEvent(
        event: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            switch (event.type) {
                case 'babylon.btcstkconsumer.v1.EventConsumerRegistered':
                    await this.handleConsumerRegistered(event, txHash, blockHeight, network);
                    break;
                case 'babylon.zoneconcierge.v1.EventHeaderIndexed':
                    await this.handleHeaderIndexed(event, txHash, blockHeight, network);
                    break;
                case 'babylon.zoneconcierge.v1.EventBSNFinalized':
                    await this.handleBSNFinalized(event, txHash, blockHeight, network);
                    break;
                default:
                    // Not a BSN event, skip silently
                    break;
            }
        } catch (error) {
            logger.error(`[BSNEventHandler] Error processing event type ${event.type}:`, error);
            throw error;
        }
    }

    /**
     * Handle consumer registration event
     */
    private async handleConsumerRegistered(
        event: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            const attributes = this.parseEventAttributes(event.attributes);
            
            const consumerData: EventConsumerRegistered = {
                consumer_id: attributes.consumer_id,
                consumer_name: attributes.consumer_name,
                consumer_description: attributes.consumer_description || '',
                consumer_type: attributes.consumer_type as ConsumerType,
                rollup_consumer_metadata: attributes.rollup_finality_contract_address ? {
                    finality_contract_address: attributes.rollup_finality_contract_address
                } : undefined,
                babylon_rewards_commission: attributes.babylon_rewards_commission,
                block_height: blockHeight,
                tx_hash: txHash,
                timestamp: new Date()
            };

            // Save to database
            const bsnConsumer = new BSNConsumer({
                consumer_id: consumerData.consumer_id,
                consumer_name: consumerData.consumer_name,
                consumer_description: consumerData.consumer_description,
                consumer_type: consumerData.consumer_type,
                rollup_finality_contract_address: consumerData.rollup_consumer_metadata?.finality_contract_address,
                babylon_rewards_commission: consumerData.babylon_rewards_commission,
                is_active: true,
                registration_height: blockHeight,
                registration_tx_hash: txHash,
                network,
                last_updated_height: blockHeight,
                created_at: consumerData.timestamp,
                updated_at: consumerData.timestamp
            });

            await bsnConsumer.save();

            logger.info(`[BSNEventHandler] Consumer registered: ${consumerData.consumer_id} (${consumerData.consumer_type})`);

        } catch (error) {
            logger.error('[BSNEventHandler] Error handling consumer registration:', error);
            throw error;
        }
    }

    /**
     * Handle header indexed event
     */
    private async handleHeaderIndexed(
        event: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            const attributes = this.parseEventAttributes(event.attributes);
            
            // TODO: Implement header indexing when BSNHeader events are available
            // This will store BSN headers in the BSNHeader collection
            
            logger.info(`[BSNEventHandler] Header indexed for consumer: ${attributes.consumer_id}`);

        } catch (error) {
            logger.error('[BSNEventHandler] Error handling header indexed:', error);
            throw error;
        }
    }

    /**
     * Handle BSN finalized event
     */
    private async handleBSNFinalized(
        event: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            const attributes = this.parseEventAttributes(event.attributes);
            
            // TODO: Implement BSN finalization when BSNFinality events are available
            // This will store finalization data in the BSNFinality collection
            
            logger.info(`[BSNEventHandler] BSN finalized for consumer: ${attributes.consumer_id}`);

        } catch (error) {
            logger.error('[BSNEventHandler] Error handling BSN finalized:', error);
            throw error;
        }
    }

    /**
     * Parse event attributes into a key-value object
     */
    private parseEventAttributes(attributes: any[]): Record<string, string> {
        const parsed: Record<string, string> = {};
        
        for (const attr of attributes) {
            if (attr.key && attr.value) {
                // Decode base64 if needed
                const key = this.decodeAttribute(attr.key);
                const value = this.decodeAttribute(attr.value);
                parsed[key] = value;
            }
        }
        
        return parsed;
    }

    /**
     * Decode attribute value (handles base64 encoding)
     */
    private decodeAttribute(value: string): string {
        try {
            // Try to decode as base64 first
            const decoded = Buffer.from(value, 'base64').toString('utf-8');
            // If it's valid UTF-8, return decoded value
            if (decoded && decoded.length > 0) {
                return decoded;
            }
        } catch (error) {
            // If base64 decoding fails, return original value
        }
        
        return value;
    }

    /**
     * Check if an event is BSN-related
     */
    public isBSNEvent(eventType: string): boolean {
        const bsnEventTypes = [
            'babylon.btcstkconsumer.v1.EventConsumerRegistered',
            'babylon.zoneconcierge.v1.EventHeaderIndexed',
            'babylon.zoneconcierge.v1.EventBSNFinalized'
        ];
        
        return bsnEventTypes.includes(eventType);
    }

    /**
     * Get supported BSN event types
     */
    public getSupportedEventTypes(): string[] {
        return [
            'babylon.btcstkconsumer.v1.EventConsumerRegistered',
            'babylon.zoneconcierge.v1.EventHeaderIndexed',
            'babylon.zoneconcierge.v1.EventBSNFinalized'
        ];
    }
}
