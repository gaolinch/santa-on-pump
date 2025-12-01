import WebSocket from 'ws';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { solanaService } from './solana.js';
import { txRawRepo } from '../database/index.js';

interface SubscriptionInfo {
  id: number;
  requestId: number;
  type: 'transaction' | 'account';
  accounts: string[];
  confirmedAt: Date;
}

interface SubscriptionConfig {
  type: 'transaction' | 'account';
  accounts: string[];
}

export class WebSocketListener {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<number, SubscriptionInfo>();
  private subscriptionConfigs: SubscriptionConfig[] = [];
  private reconnectAttempts = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastPongReceived: Date | null = null;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('WebSocket listener already running');
      return;
    }

    // Validate configuration
    if (!config.websocket.enabled) {
      logger.info('WebSocket listener is disabled in configuration');
      return;
    }

    if (!config.websocket.heliusApiKey) {
      throw new Error('HELIUS_API_KEY is required for WebSocket listener');
    }

    if (!config.solana.pumpFunToken) {
      throw new Error('PUMP_FUN_TOKEN is required for WebSocket listener');
    }

    this.isRunning = true;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const wsUrl = this.getWebSocketUrl();
    logger.info({ 
      url: wsUrl.replace(/api-key=[^&]+/, 'api-key=***'),
      network: config.solana.network 
    }, 'Connecting to Helius WebSocket');

    this.ws = new WebSocket(wsUrl);
    this.setupEventHandlers();
  }

  private getWebSocketUrl(): string {
    // Use standard endpoint for Standard WebSockets (logsSubscribe - all plans)
    const network = config.solana.network === 'mainnet-beta' ? 'mainnet' : 'devnet';
    return `wss://${network}.helius-rpc.com/?api-key=${config.websocket.heliusApiKey}`;
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      logger.info('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      
      // Subscribe to all configured subscriptions
      if (this.subscriptionConfigs.length === 0) {
        // First time setup
        this.subscribeToPoolTransactions();
      } else {
        // Reconnection - restore subscriptions
        this.resubscribeAll();
      }
    });

    this.ws.on('message', (data: Buffer) => {
      this.handleMessage(data);
    });

    this.ws.on('pong', () => {
      this.lastPongReceived = new Date();
      logger.debug('Pong received from server');
    });

    this.ws.on('error', (error: Error) => {
      this.handleError(error);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      logger.warn({ 
        code, 
        reason: reason.toString(),
        wasRunning: this.isRunning 
      }, 'WebSocket closed');
      
      this.stopHeartbeat();
      
      if (this.isRunning) {
        this.reconnect();
      }
    });
  }

  private handleError(error: Error): void {
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('unauthorized')) {
      logger.error({ 
        error,
        apiKey: config.websocket.heliusApiKey ? '***' + config.websocket.heliusApiKey.slice(-4) : 'NOT SET'
      }, '❌ Invalid API key - check HELIUS_API_KEY environment variable');
    } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
      logger.error({ error }, '❌ Rate limit exceeded - consider upgrading Helius plan');
    } else if (errorMsg.includes('econnrefused')) {
      logger.error({ error }, '❌ Connection refused - check network connectivity');
    } else if (errorMsg.includes('etimedout')) {
      logger.error({ error }, '❌ Connection timeout - check network or Helius status');
    } else {
      logger.error({ error }, '❌ WebSocket error');
    }
  }

  private async subscribeToPoolTransactions(): Promise<void> {
    // Option 1: Monitor ALL Pump.fun activity (recommended for high volume)
    // Option 2: Monitor specific token only
    
    const monitorAllPumpFun = process.env.MONITOR_ALL_PUMPFUN === 'true';
    const targetAddress = monitorAllPumpFun 
      ? config.solana.pumpFunProgram  // All Pump.fun transactions
      : config.solana.pumpFunToken;    // Specific token only
    
    if (!targetAddress) {
      logger.error('No target address configured (pumpFunProgram or pumpFunToken)');
      return;
    }

    // Use logsSubscribe for Standard WebSocket (available on all Helius plans)
    const logsRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "logsSubscribe",
      params: [
        {
          mentions: [targetAddress]
        },
        {
          commitment: config.websocket.commitment || "confirmed"
        }
      ]
    };

    // Store config for reconnection
    this.subscriptionConfigs.push({
      type: 'transaction',
      accounts: [targetAddress]
    });

    this.ws?.send(JSON.stringify(logsRequest));
    logger.info({ 
      targetAddress,
      mode: monitorAllPumpFun ? 'ALL_PUMPFUN' : 'SPECIFIC_TOKEN',
      method: 'logsSubscribe',
      commitment: config.websocket.commitment || 'confirmed'
    }, '📡 Subscription request sent');
  }

  private async resubscribeAll(): Promise<void> {
    logger.info({ count: this.subscriptionConfigs.length }, '🔄 Restoring subscriptions after reconnect');
    
    for (const configItem of this.subscriptionConfigs) {
      try {
        if (configItem.type === 'transaction') {
          // Use logsSubscribe for Standard WebSocket
          const request = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "logsSubscribe",
            params: [
              {
                mentions: configItem.accounts
              },
              {
                commitment: config.websocket.commitment || "confirmed"
              }
            ]
          };
          this.ws?.send(JSON.stringify(request));
        } else if (configItem.type === 'account') {
          const request = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "accountSubscribe",
            params: [
              configItem.accounts[0],
              {
                encoding: "jsonParsed",
                commitment: "confirmed"
              }
            ]
          };
          this.ws?.send(JSON.stringify(request));
        }
        
        logger.info({ config: configItem }, '✅ Subscription restored');
      } catch (error) {
        logger.error({ error, config: configItem }, '❌ Failed to restore subscription');
      }
    }
  }

  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString('utf8'));
      
      // Subscription confirmation (result is subscription ID)
      if (message.result && typeof message.result === 'number' && !message.method) {
        const subscriptionId = message.result;
        const config = this.subscriptionConfigs.find((_, idx) => idx === this.subscriptions.size);
        
        this.subscriptions.set(message.id, {
          id: subscriptionId,
          requestId: message.id,
          type: config?.type || 'transaction',
          accounts: config?.accounts || [],
          confirmedAt: new Date()
        });
        
        logger.info({ 
          requestId: message.id,
          subscriptionId,
          totalSubscriptions: this.subscriptions.size
        }, '✅ Subscription confirmed');
        return;
      }
      
      // Log notification (Standard WebSocket)
      if (message.method === 'logsNotification') {
        this.handleLogsNotification(message.params);
        return;
      }
      
      // Transaction notification (Enhanced WebSocket - not available on all plans)
      if (message.method === 'transactionNotification') {
        this.handleTransactionNotification(message.params);
        return;
      }
      
      // Account notification
      if (message.method === 'accountNotification') {
        this.handleAccountNotification(message.params);
        return;
      }
      
      // Error response
      if (message.error) {
        logger.error({ 
          error: message.error,
          requestId: message.id 
        }, '❌ WebSocket error response');
        
        // Handle specific error codes
        if (message.error.code === -32602) {
          logger.error('Invalid params - check subscription request format');
        } else if (message.error.code === -32600) {
          logger.error('Invalid request - check JSON-RPC format');
        } else if (message.error.code === -32601) {
          logger.error('Method not found - check subscription method name');
        }
        return;
      }
      
      // Unknown message type
      logger.debug({ message }, 'Unknown WebSocket message type');
      
    } catch (error) {
      logger.error({ 
        error, 
        raw: data.toString('utf8').substring(0, 200) 
      }, 'Failed to parse WebSocket message');
    }
  }

  private async handleLogsNotification(params: any): Promise<void> {
    const { result, subscription } = params;
    const { signature, err, logs } = result.value;

    logger.debug({ signature, subscription, err }, '📩 Log notification received');

    // Skip if transaction failed
    if (err) {
      logger.debug({ signature, err }, '⏭️  Transaction failed, skipping');
      return;
    }

    try {
      // Check if already exists (deduplication)
      const existing = await txRawRepo.findBySignature(signature);
      if (existing) {
        logger.debug({ signature }, '⏭️  Transaction already exists (duplicate)');
        return;
      }

      // Fetch full transaction details using getTransaction
      logger.debug({ signature }, '🔍 Fetching full transaction details...');
      const transaction = await solanaService.getTransaction(signature);
      
      if (!transaction) {
        logger.debug({ signature }, '⏭️  Could not fetch transaction details');
        return;
      }

      // Parse transaction using existing service
      const transfer = solanaService.parseTokenTransfer(transaction, signature);
      if (!transfer) {
        logger.debug({ signature }, '⏭️  No token transfer found in transaction');
        return;
      }

      // Extract Pump.fun fees
      const protocolFee = transfer.protocolFee || BigInt(0);
      const creatorFee = transfer.creatorFee || BigInt(0);
      const creatorFeeBps = transfer.creatorFeeBps || 30;

      // Get slot and block_time from transaction
      const slot = transaction.slot || 0;
      const block_time = transaction.blockTime ? new Date(transaction.blockTime * 1000) : new Date();
      
      // Get transaction fee (Solana network fee)
      const networkFee = transaction.meta?.fee || 0;
      
      // Log warning if network fee is missing
      if (!transaction.meta || networkFee === 0) {
        logger.warn({ 
          signature, 
          hasMeta: !!transaction.meta,
          metaFee: transaction.meta?.fee 
        }, '⚠️  [WebSocket-Logs] Network fee is missing or zero');
      }

      // Fee logging
      if (transfer.creatorFee) {
        logger.info({ 
          signature,
          protocolFee: protocolFee.toString(),
          creatorFee: creatorFee.toString(),
          creatorFeeBps,
          source: 'pump_fees_program'
        }, '[WebSocket-Logs] Using Pump.fun fees from transaction');
      }

      // Debug: Log what we're about to insert
      logger.info({
        signature,
        fee: protocolFee.toString(),
        creator_fee: creatorFee.toString(),
        creator_fee_bps: creatorFeeBps,
        network_fee: networkFee.toString()
      }, '🔍 DEBUG: About to insert into database');

      // Save to database
      await txRawRepo.insert({
        signature,
        slot,
        block_time,
        from_wallet: transfer.from,
        to_wallet: transfer.to || undefined,
        amount: transfer.amount,
        kind: transfer.kind,
        fee: protocolFee,
        network_fee: BigInt(networkFee),
        creator_fee: creatorFee,
        creator_fee_bps: creatorFeeBps,
        status: 'confirmed', // WebSocket uses 'confirmed' commitment
        metadata: {
          source: 'websocket-logs',
          subscriptionId: subscription,
          capturedAt: new Date().toISOString(),
          logs: logs?.slice(0, 5) // Store first 5 log lines for debugging
        }
      });

      logger.info({ 
        signature, 
        kind: transfer.kind,
        from: transfer.from.substring(0, 8) + '...',
        to: (transfer.to || 'N/A').substring(0, 8) + '...',
        amount: transfer.amount.toString(),
        networkFee: (networkFee / 1e9).toFixed(9) + ' SOL',
        protocolFee: (Number(protocolFee) / 1e9).toFixed(9) + ' SOL',
        creatorFee: (Number(creatorFee) / 1e9).toFixed(9) + ' SOL'
      }, '✅ NEW transaction saved via WebSocket (logsSubscribe)!');
      
    } catch (error) {
      logger.error({ 
        signature, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, '❌ Error processing WebSocket log notification');
    }
  }

  private async handleTransactionNotification(params: any): Promise<void> {
    const { result, subscription } = params;
    const { signature, transaction, slot } = result;

    logger.debug({ signature, subscription }, '📩 Transaction notification received');

    try {
      // Check if already exists (deduplication)
      const existing = await txRawRepo.findBySignature(signature);
      if (existing) {
        logger.debug({ signature }, '⏭️  Transaction already exists (duplicate)');
        return;
      }

      // Parse transaction using existing service
      const transfer = solanaService.parseTokenTransfer(transaction, signature);
      if (!transfer) {
        logger.debug({ signature }, '⏭️  No token transfer found in transaction');
        return;
      }

      // Debug: Log what we got from parseTokenTransfer
      logger.info({
        signature,
        hasProtocolFee: !!transfer.protocolFee,
        hasCreatorFee: !!transfer.creatorFee,
        protocolFeeValue: transfer.protocolFee?.toString(),
        creatorFeeValue: transfer.creatorFee?.toString(),
        creatorFeeBpsValue: transfer.creatorFeeBps
      }, '🔍 DEBUG: Transfer object from parseTokenTransfer');

      // Extract Pump.fun fees
      const protocolFee = transfer.protocolFee || BigInt(0);
      const creatorFee = transfer.creatorFee || BigInt(0);
      const creatorFeeBps = transfer.creatorFeeBps || 30;
      
      // Get network fee (Enhanced WebSocket path)
      const networkFee = transaction?.meta?.fee || 0;
      
      // Log warning if network fee is missing
      if (!transaction?.meta || networkFee === 0) {
        logger.warn({ 
          signature, 
          hasMeta: !!transaction?.meta,
          metaFee: transaction?.meta?.fee 
        }, '⚠️  [WebSocket] Network fee is missing or zero');
      }

      // Fee logging
      if (transfer.creatorFee) {
        logger.info({ 
          signature,
          protocolFee: protocolFee.toString(),
          protocolFeeSol: (Number(protocolFee) / 1e9).toFixed(9),
          creatorFee: creatorFee.toString(),
          creatorFeeSol: (Number(creatorFee) / 1e9).toFixed(9),
          creatorFeeBps,
          source: 'pump_fees_program'
        }, '[WebSocket] Using Pump.fun fees from transaction');
      } else {
        logger.debug({ signature }, '[WebSocket] No Pump.fun fees found');
      }

      // Save to database
      await txRawRepo.insert({
        signature,
        slot,
        block_time: new Date(),
        from_wallet: transfer.from,
        to_wallet: transfer.to || undefined,
        amount: transfer.amount,
        kind: transfer.kind,
        fee: protocolFee,
        network_fee: BigInt(networkFee),
        creator_fee: creatorFee,
        creator_fee_bps: creatorFeeBps,
        status: 'confirmed', // WebSocket uses 'confirmed' commitment
        metadata: {
          source: 'websocket',
          subscriptionId: subscription,
          capturedAt: new Date().toISOString()
        }
      });

      logger.info({ 
        signature, 
        kind: transfer.kind,
        from: transfer.from.substring(0, 8) + '...',
        to: (transfer.to || 'N/A').substring(0, 8) + '...',
        amount: transfer.amount.toString(),
        networkFee: (networkFee / 1e9).toFixed(9) + ' SOL',
        protocolFee: (Number(protocolFee) / 1e9).toFixed(9) + ' SOL',
        creatorFee: (Number(creatorFee) / 1e9).toFixed(9) + ' SOL'
      }, '✅ NEW transaction saved via WebSocket!');
      
    } catch (error) {
      logger.error({ error, signature }, '❌ Error processing WebSocket transaction');
    }
  }

  private async handleAccountNotification(params: any): Promise<void> {
    const { result, subscription } = params;
    const { context, value } = result;
    
    logger.debug({ 
      subscription,
      slot: context.slot,
      lamports: value.lamports,
      owner: value.owner
    }, '📩 Account notification received');
    
    // If using account notifications, you'd need to:
    // 1. Detect that a change occurred
    // 2. Fetch recent signatures for this account
    // 3. Get transaction details
    // 4. Process transactions
    // This is why transactionSubscribe is preferred - it's all-in-one!
    
    logger.info({ 
      slot: context.slot,
      lamports: value.lamports 
    }, 'Account state changed (using accountSubscribe)');
  }

  private startHeartbeat(): void {
    const interval = config.websocket.pingInterval || 30000; // 30 seconds
    
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
        logger.debug('💓 Heartbeat ping sent');
        
        // Check if we haven't received a pong in a while
        if (this.lastPongReceived) {
          const timeSinceLastPong = Date.now() - this.lastPongReceived.getTime();
          if (timeSinceLastPong > 120000) { // 2 minutes
            logger.warn({ timeSinceLastPong }, '⚠️  No pong received recently, connection may be stale');
          }
        }
      } else {
        logger.warn({ readyState: this.ws?.readyState }, '⚠️  WebSocket not open, cannot send ping');
      }
    }, interval);
    
    logger.info({ interval }, '💓 Heartbeat started');
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      logger.debug('💓 Heartbeat stopped');
    }
  }

  private async reconnect(): Promise<void> {
    const maxAttempts = config.websocket.reconnectMaxAttempts || 10;
    
    if (this.reconnectAttempts >= maxAttempts) {
      logger.error({ 
        attempts: this.reconnectAttempts,
        maxAttempts 
      }, '❌ Max reconnection attempts reached - giving up');
      this.isRunning = false;
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    logger.info({ 
      delay, 
      attempt: this.reconnectAttempts + 1,
      maxAttempts
    }, `🔄 Reconnecting in ${delay}ms...`);

    await new Promise(resolve => setTimeout(resolve, delay));
    this.reconnectAttempts++;

    try {
      await this.connect();
    } catch (error) {
      logger.error({ error }, '❌ Reconnection attempt failed');
      // Will trigger another reconnect via close handler
    }
  }

  stop(): void {
    logger.info('Stopping WebSocket listener...');
    this.isRunning = false;
    this.stopHeartbeat();
    
    // Unsubscribe from all subscriptions
    for (const [requestId, subInfo] of this.subscriptions) {
      try {
        const unsubscribeMethod = subInfo.type === 'transaction' ? 'logsUnsubscribe' : 'accountUnsubscribe';
        const unsubscribeRequest = {
          jsonrpc: "2.0",
          id: Date.now(),
          method: unsubscribeMethod,
          params: [subInfo.id]
        };
        this.ws?.send(JSON.stringify(unsubscribeRequest));
        logger.debug({ subscriptionId: subInfo.id, method: unsubscribeMethod }, 'Unsubscribed');
      } catch (error) {
        logger.error({ error, subscriptionId: subInfo.id }, 'Failed to unsubscribe');
      }
    }
    
    this.ws?.close();
    logger.info('✅ WebSocket listener stopped');
  }

  // Public method to get connection status
  getStatus() {
    return {
      isRunning: this.isRunning,
      isConnected: this.ws?.readyState === WebSocket.OPEN,
      readyState: this.ws?.readyState,
      subscriptions: this.subscriptions.size,
      reconnectAttempts: this.reconnectAttempts,
      lastPongReceived: this.lastPongReceived,
      configuredAccounts: this.subscriptionConfigs.flatMap(c => c.accounts)
    };
  }
}

export const websocketListener = new WebSocketListener();
