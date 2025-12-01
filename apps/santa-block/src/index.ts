import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { createApp } from './api';
import { transactionListener } from './services/listener';
import { websocketListener } from './services/websocket-listener';
import { giftScheduler } from './services/gift-scheduler';
import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function main() {
  try {
    // Validate configuration
    logger.info('Validating configuration...');
    validateConfig();

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(
        {
          port: config.server.port,
          host: config.server.host,
          env: config.env,
        },
        'Server started'
      );
    });

    // Start WebSocket listener (if enabled)
    if (config.env !== 'test' && config.websocket.enabled) {
      logger.info('Starting WebSocket listener...');
      try {
        await websocketListener.start();
        logger.info('✅ WebSocket listener started successfully');
      } catch (error) {
        logger.error({ error }, '❌ Failed to start WebSocket listener');
        // Continue without WebSocket if it fails
      }
    } else if (config.env !== 'test') {
      logger.info('WebSocket listener disabled in configuration');
    }

    // Start transaction listener (only if token is configured)
    // This can run in parallel with WebSocket for redundancy
    // DISABLED FOR TESTING: Testing WebSocket-only mode
    /*
    if (config.env !== 'test' && config.santa.tokenMint) {
      logger.info('Starting transaction listener (polling)...');
      await transactionListener.start();
    } else if (config.env !== 'test') {
      logger.warn('Transaction listener disabled: SANTA_TOKEN_MINT not configured');
    }
    */
    logger.info('📡 Polling listener DISABLED - Testing WebSocket-only mode');

    // Start gift scheduler (replaces old cron job)
    if (config.env !== 'test') {
      logger.info('Starting gift scheduler...');
      giftScheduler.start();
    }

    // Legacy cron job (kept as fallback, can be removed later)
    // cron.schedule(config.schedule.dailyCloseCron, async () => {
    //   logger.info('Running scheduled daily close');
    //   try {
    //     await execAsync('npm run close-day');
    //   } catch (error) {
    //     logger.error({ error }, 'Scheduled daily close failed');
    //   }
    // });

    logger.info('Santa Block backend is running');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      
      // Stop services
      giftScheduler.stop();
      websocketListener.stop();
      // transactionListener.stop(); // Disabled for testing
      
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      
      // Stop services
      giftScheduler.stop();
      websocketListener.stop();
      // transactionListener.stop(); // Disabled for testing
      
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start application');
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exit(1);
});

main();

