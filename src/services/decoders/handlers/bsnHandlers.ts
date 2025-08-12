/**
 * BSN Message Handlers
 * Special handlers for BSN (Bitcoin Supercharged Networks) messages
 */

import { SpecialCaseHandler } from '../types';
import { MESSAGE_TYPES } from '../messageTypes';
import { logger } from '../../../utils/logger';

/**
 * Create BSN Register Consumer handler
 */
export function createBSNRegisterConsumerHandler(): SpecialCaseHandler {
    return async (message: any) => {
        try {
            const msg = message.value || message;
            
            const processedMessage = {
                type: MESSAGE_TYPES.BSN_REGISTER_CONSUMER,
                consumer_id: msg.consumer_id,
                consumer_name: msg.consumer_name,
                consumer_description: msg.consumer_description || '',
                consumer_type: msg.rollup_finality_contract_address ? 'ROLLUP' : 'COSMOS',
                rollup_finality_contract_address: msg.rollup_finality_contract_address,
                babylon_rewards_commission: msg.babylon_rewards_commission,
                signer: msg.signer,
                raw_message: msg
            };

            logger.debug(`[BSN Handler] Processed consumer registration: ${msg.consumer_id}`);
            return processedMessage;

        } catch (error) {
            logger.error('[BSN Handler] Error processing MsgRegisterConsumer:', error);
            return {
                type: MESSAGE_TYPES.BSN_REGISTER_CONSUMER,
                error: error instanceof Error ? error.message : 'Unknown error',
                raw_message: message
            };
        }
    };
}

/**
 * Create BSN Update Consumer Params handler
 */
export function createBSNUpdateConsumerParamsHandler(): SpecialCaseHandler {
    return async (message: any) => {
        try {
            const msg = message.value || message;
            
            const processedMessage = {
                type: MESSAGE_TYPES.BSN_UPDATE_CONSUMER_PARAMS,
                authority: msg.authority,
                params: msg.params,
                raw_message: msg
            };

            logger.debug(`[BSN Handler] Processed consumer params update by: ${msg.authority}`);
            return processedMessage;

        } catch (error) {
            logger.error('[BSN Handler] Error processing MsgUpdateConsumerParams:', error);
            return {
                type: MESSAGE_TYPES.BSN_UPDATE_CONSUMER_PARAMS,
                error: error instanceof Error ? error.message : 'Unknown error',
                raw_message: message
            };
        }
    };
}

/**
 * Create BSN Update ZoneConcierge Params handler
 */
export function createBSNUpdateZoneConciergeParamsHandler(): SpecialCaseHandler {
    return async (message: any) => {
        try {
            const msg = message.value || message;
            
            const processedMessage = {
                type: MESSAGE_TYPES.BSN_UPDATE_ZONECONCIERGE_PARAMS,
                authority: msg.authority,
                params: msg.params,
                raw_message: msg
            };

            logger.debug(`[BSN Handler] Processed zoneconcierge params update by: ${msg.authority}`);
            return processedMessage;

        } catch (error) {
            logger.error('[BSN Handler] Error processing MsgUpdateZoneConciergeParams:', error);
            return {
                type: MESSAGE_TYPES.BSN_UPDATE_ZONECONCIERGE_PARAMS,
                error: error instanceof Error ? error.message : 'Unknown error',
                raw_message: message
            };
        }
    };
}

/**
 * Get all BSN message handlers
 */
export function getBSNMessageHandlers(): Record<string, SpecialCaseHandler> {
    return {
        [MESSAGE_TYPES.BSN_REGISTER_CONSUMER]: createBSNRegisterConsumerHandler(),
        [MESSAGE_TYPES.BSN_UPDATE_CONSUMER_PARAMS]: createBSNUpdateConsumerParamsHandler(),
        [MESSAGE_TYPES.BSN_UPDATE_ZONECONCIERGE_PARAMS]: createBSNUpdateZoneConciergeParamsHandler()
    };
}

/**
 * Check if a message type is BSN-related
 */
export function isBSNMessageType(messageType: string): boolean {
    const bsnMessageTypes = [
        MESSAGE_TYPES.BSN_REGISTER_CONSUMER,
        MESSAGE_TYPES.BSN_UPDATE_CONSUMER_PARAMS,
        MESSAGE_TYPES.BSN_UPDATE_ZONECONCIERGE_PARAMS
    ];
    
    return bsnMessageTypes.includes(messageType);
}

/**
 * Extract BSN-specific information from transaction
 */
export function extractBSNTransactionInfo(tx: any): {
    hasBSNMessages: boolean;
    consumerRegistrations: number;
    parameterUpdates: number;
    consumerIds: string[];
} {
    const info = {
        hasBSNMessages: false,
        consumerRegistrations: 0,
        parameterUpdates: 0,
        consumerIds: [] as string[]
    };

    try {
        if (!tx.body?.messages) return info;

        for (const message of tx.body.messages) {
            const messageType = message['@type'] || message.type;
            
            if (isBSNMessageType(messageType)) {
                info.hasBSNMessages = true;
                
                switch (messageType) {
                    case MESSAGE_TYPES.BSN_REGISTER_CONSUMER:
                        info.consumerRegistrations++;
                        const msg = message.value || message;
                        if (msg.consumer_id) {
                            info.consumerIds.push(msg.consumer_id);
                        }
                        break;
                    case MESSAGE_TYPES.BSN_UPDATE_CONSUMER_PARAMS:
                    case MESSAGE_TYPES.BSN_UPDATE_ZONECONCIERGE_PARAMS:
                        info.parameterUpdates++;
                        break;
                }
            }
        }
    } catch (error) {
        logger.error('[BSN Handler] Error extracting BSN transaction info:', error);
    }

    return info;
}
