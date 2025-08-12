/**
 * BSN Integration Service
 * Integrates BSN processing with the existing block processor
 */

import { BSNEventHandler } from './BSNEventHandler';
import { BSNMessageProcessor } from './BSNMessageProcessor';
import { Network } from '../../types/bsn';
import { logger } from '../../utils/logger';

export class BSNIntegrationService {
    private static instance: BSNIntegrationService | null = null;
    private eventHandler: BSNEventHandler;
    private messageProcessor: BSNMessageProcessor;
    private isEnabled: boolean;

    private constructor() {
        this.eventHandler = BSNEventHandler.getInstance();
        this.messageProcessor = BSNMessageProcessor.getInstance();
        this.isEnabled = process.env.BSN_PROCESSING_ENABLED === 'true';
        
        if (this.isEnabled) {
            logger.info('[BSNIntegrationService] BSN processing enabled');
        } else {
            logger.info('[BSNIntegrationService] BSN processing disabled');
        }
    }

    public static getInstance(): BSNIntegrationService {
        if (!BSNIntegrationService.instance) {
            BSNIntegrationService.instance = new BSNIntegrationService();
        }
        return BSNIntegrationService.instance;
    }

    /**
     * Process a transaction for BSN-related content
     */
    public async processTransaction(
        tx: any,
        txHash: string,
        blockHeight: number,
        network: Network
    ): Promise<void> {
        if (!this.isEnabled) return;

        try {
            // Process BSN messages
            if (tx.body?.messages) {
                const bsnMessages = tx.body.messages.filter((msg: any) => 
                    this.messageProcessor.isBSNMessage(msg['@type'] || msg.type)
                );

                if (bsnMessages.length > 0) {
                    await this.messageProcessor.processMessages(
                        bsnMessages,
                        txHash,
                        blockHeight,
                        network
                    );
                }
            }

            // Process BSN events from transaction result
            if (tx.events) {
                const bsnEvents = tx.events.filter((event: any) => 
                    this.eventHandler.isBSNEvent(event.type)
                );

                if (bsnEvents.length > 0) {
                    await this.eventHandler.processEvents(
                        bsnEvents,
                        txHash,
                        blockHeight,
                        network
                    );
                }
            }

        } catch (error) {
            logger.error(`[BSNIntegrationService] Error processing transaction ${txHash}:`, error);
            // Don't throw - we don't want to break the main processing pipeline
        }
    }

    /**
     * Process a block for BSN-related content
     */
    public async processBlock(
        block: any,
        network: Network
    ): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const blockHeight = parseInt(block.header?.height || '0');
            
            // Process transactions in the block
            if (block.data?.txs) {
                for (let i = 0; i < block.data.txs.length; i++) {
                    const tx = block.data.txs[i];
                    const txHash = this.calculateTxHash(tx, i, blockHeight);
                    
                    await this.processTransaction(tx, txHash, blockHeight, network);
                }
            }

            // Process block events (if any BSN-related events exist at block level)
            if (block.events) {
                const bsnEvents = block.events.filter((event: any) => 
                    this.eventHandler.isBSNEvent(event.type)
                );

                if (bsnEvents.length > 0) {
                    await this.eventHandler.processEvents(
                        bsnEvents,
                        `block-${blockHeight}`,
                        blockHeight,
                        network
                    );
                }
            }

        } catch (error) {
            logger.error(`[BSNIntegrationService] Error processing block ${block.header?.height}:`, error);
            // Don't throw - we don't want to break the main processing pipeline
        }
    }

    /**
     * Check if BSN processing is enabled
     */
    public isProcessingEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Enable BSN processing
     */
    public enableProcessing(): void {
        this.isEnabled = true;
        logger.info('[BSNIntegrationService] BSN processing enabled');
    }

    /**
     * Disable BSN processing
     */
    public disableProcessing(): void {
        this.isEnabled = false;
        logger.info('[BSNIntegrationService] BSN processing disabled');
    }

    /**
     * Get BSN processing statistics
     */
    public getProcessingStats(): {
        enabled: boolean;
        supportedMessageTypes: string[];
        supportedEventTypes: string[];
    } {
        return {
            enabled: this.isEnabled,
            supportedMessageTypes: this.messageProcessor.getSupportedMessageTypes(),
            supportedEventTypes: this.eventHandler.getSupportedEventTypes()
        };
    }

    /**
     * Check if a transaction contains BSN-related content
     */
    public hasBSNContent(tx: any): boolean {
        try {
            // Check for BSN messages
            if (tx.body?.messages) {
                const hasBSNMessages = tx.body.messages.some((msg: any) => 
                    this.messageProcessor.isBSNMessage(msg['@type'] || msg.type)
                );
                if (hasBSNMessages) return true;
            }

            // Check for BSN events
            if (tx.events) {
                const hasBSNEvents = tx.events.some((event: any) => 
                    this.eventHandler.isBSNEvent(event.type)
                );
                if (hasBSNEvents) return true;
            }

            return false;
        } catch (error) {
            logger.error('[BSNIntegrationService] Error checking BSN content:', error);
            return false;
        }
    }

    /**
     * Calculate transaction hash (placeholder implementation)
     */
    private calculateTxHash(tx: any, index: number, blockHeight: number): string {
        // This is a simplified implementation
        // In a real implementation, you'd calculate the actual transaction hash
        return `tx-${blockHeight}-${index}`;
    }
}
