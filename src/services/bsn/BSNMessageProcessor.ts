/**
 * BSN Message Processor
 * Processes BSN-related transaction messages
 */

import { Network, ConsumerType } from '../../types/bsn';
import { BSNConsumer } from '../../database/models/bsn';
import { MESSAGE_TYPES } from '../decoders/messageTypes';
import { logger } from '../../utils/logger';

export class BSNMessageProcessor {
    private static instance: BSNMessageProcessor | null = null;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): BSNMessageProcessor {
        if (!BSNMessageProcessor.instance) {
            BSNMessageProcessor.instance = new BSNMessageProcessor();
        }
        return BSNMessageProcessor.instance;
    }

    /**
     * Process BSN messages from a transaction
     */
    public async processMessages(
        messages: any[],
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            for (const message of messages) {
                await this.processMessage(message, txHash, blockHeight, network);
            }
        } catch (error) {
            logger.error('[BSNMessageProcessor] Error processing messages:', error);
            throw error;
        }
    }

    /**
     * Process a single BSN message
     */
    private async processMessage(
        message: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            const messageType = message['@type'] || message.type;
            
            switch (messageType) {
                case MESSAGE_TYPES.BSN_REGISTER_CONSUMER:
                    await this.processMsgRegisterConsumer(message, txHash, blockHeight, network);
                    break;
                case MESSAGE_TYPES.BSN_UPDATE_CONSUMER_PARAMS:
                    await this.processMsgUpdateConsumerParams(message, txHash, blockHeight, network);
                    break;
                case MESSAGE_TYPES.BSN_UPDATE_ZONECONCIERGE_PARAMS:
                    await this.processMsgUpdateZoneConciergeParams(message, txHash, blockHeight, network);
                    break;
                default:
                    // Not a BSN message, skip silently
                    break;
            }
        } catch (error) {
            logger.error(`[BSNMessageProcessor] Error processing message type ${message['@type'] || message.type}:`, error);
            throw error;
        }
    }

    /**
     * Process MsgRegisterConsumer message
     */
    private async processMsgRegisterConsumer(
        message: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            const msg = message.value || message;
            
            // Determine consumer type based on metadata
            const consumerType = msg.rollup_finality_contract_address 
                ? ConsumerType.ROLLUP 
                : ConsumerType.COSMOS;

            // Check if consumer already exists
            const existingConsumer = await BSNConsumer.findOne({
                consumer_id: msg.consumer_id,
                network: network
            });

            if (existingConsumer) {
                logger.warn(`[BSNMessageProcessor] Consumer ${msg.consumer_id} already exists, updating...`);
                
                // Update existing consumer
                existingConsumer.consumer_name = msg.consumer_name;
                existingConsumer.consumer_description = msg.consumer_description || '';
                existingConsumer.consumer_type = consumerType;
                existingConsumer.rollup_finality_contract_address = msg.rollup_finality_contract_address;
                existingConsumer.babylon_rewards_commission = msg.babylon_rewards_commission;
                existingConsumer.last_updated_height = blockHeight;
                existingConsumer.updatedAt = new Date();

                await existingConsumer.save();
            } else {
                // Create new consumer
                const bsnConsumer = new BSNConsumer({
                    consumer_id: msg.consumer_id,
                    consumer_name: msg.consumer_name,
                    consumer_description: msg.consumer_description || '',
                    consumer_type: consumerType,
                    rollup_finality_contract_address: msg.rollup_finality_contract_address,
                    babylon_rewards_commission: msg.babylon_rewards_commission,
                    is_active: true,
                    registration_height: blockHeight,
                    registration_tx_hash: txHash,
                    network,
                    last_updated_height: blockHeight
                });

                await bsnConsumer.save();
            }

            logger.info(`[BSNMessageProcessor] Processed consumer registration: ${msg.consumer_id} (${consumerType})`);

        } catch (error) {
            logger.error('[BSNMessageProcessor] Error processing MsgRegisterConsumer:', error);
            throw error;
        }
    }

    /**
     * Process MsgUpdateParams for btcstkconsumer module
     */
    private async processMsgUpdateConsumerParams(
        message: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            const msg = message.value || message;
            
            // TODO: Implement parameter update handling
            // This could involve storing parameter history or updating cached values
            
            logger.info(`[BSNMessageProcessor] BSN consumer params updated by ${msg.authority} at height ${blockHeight}`);

        } catch (error) {
            logger.error('[BSNMessageProcessor] Error processing MsgUpdateConsumerParams:', error);
            throw error;
        }
    }

    /**
     * Process MsgUpdateParams for zoneconcierge module
     */
    private async processMsgUpdateZoneConciergeParams(
        message: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        try {
            const msg = message.value || message;
            
            // TODO: Implement parameter update handling
            // This could involve storing parameter history or updating cached values
            
            logger.info(`[BSNMessageProcessor] ZoneConcierge params updated by ${msg.authority} at height ${blockHeight}`);

        } catch (error) {
            logger.error('[BSNMessageProcessor] Error processing MsgUpdateZoneConciergeParams:', error);
            throw error;
        }
    }

    /**
     * Check if a message is BSN-related
     */
    public isBSNMessage(messageType: string): boolean {
        const bsnMessageTypes = [
            MESSAGE_TYPES.BSN_REGISTER_CONSUMER,
            MESSAGE_TYPES.BSN_UPDATE_CONSUMER_PARAMS,
            MESSAGE_TYPES.BSN_UPDATE_ZONECONCIERGE_PARAMS
        ];
        
        return bsnMessageTypes.includes(messageType);
    }

    /**
     * Get supported BSN message types
     */
    public getSupportedMessageTypes(): string[] {
        return [
            MESSAGE_TYPES.BSN_REGISTER_CONSUMER,
            MESSAGE_TYPES.BSN_UPDATE_CONSUMER_PARAMS,
            MESSAGE_TYPES.BSN_UPDATE_ZONECONCIERGE_PARAMS
        ];
    }

    /**
     * Extract consumer information from a transaction
     */
    public extractConsumerInfo(tx: any): {
        consumerId?: string;
        consumerName?: string;
        consumerType?: ConsumerType;
        messageType?: string;
    } | null {
        try {
            if (!tx.body?.messages) return null;

            for (const message of tx.body.messages) {
                const messageType = message['@type'] || message.type;
                
                if (messageType === MESSAGE_TYPES.BSN_REGISTER_CONSUMER) {
                    const msg = message.value || message;
                    const consumerType = msg.rollup_finality_contract_address 
                        ? ConsumerType.ROLLUP 
                        : ConsumerType.COSMOS;

                    return {
                        consumerId: msg.consumer_id,
                        consumerName: msg.consumer_name,
                        consumerType,
                        messageType
                    };
                }
            }

            return null;
        } catch (error) {
            logger.error('[BSNMessageProcessor] Error extracting consumer info:', error);
            return null;
        }
    }
}
