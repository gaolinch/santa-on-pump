import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Find and load .env file
function findEnvFile(): string | undefined {
  let currentDir = process.cwd();
  
  // Try current directory first
  const envPath = path.join(currentDir, '.env');
  if (fs.existsSync(envPath)) {
    return envPath;
  }
  
  // Try parent directories
  for (let i = 0; i < 5; i++) {
    currentDir = path.dirname(currentDir);
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
  }
  
  return undefined;
}

const envPath = findEnvFile();
if (envPath) {
  console.log('📁 Loading .env from:', envPath);
  dotenv.config({ path: envPath });
} else {
  // Fall back to default behavior (look in current directory)
  console.log('📁 Loading .env from current directory');
  dotenv.config();
}

// Debug: Log WebSocket configuration
console.log('🔧 WebSocket Config Debug:');
console.log('  WEBSOCKET_ENABLED:', JSON.stringify(process.env.WEBSOCKET_ENABLED));
console.log('  HELIUS_API_KEY:', process.env.HELIUS_API_KEY ? '***' + process.env.HELIUS_API_KEY.slice(-4) : 'NOT SET');
console.log('  POOL_TOKEN_ACCOUNT:', JSON.stringify(process.env.POOL_TOKEN_ACCOUNT));
console.log('  PUMP_FUN_TOKEN:', JSON.stringify(process.env.PUMP_FUN_TOKEN));

export const config = {
  env: process.env.NODE_ENV || 'development',
  
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  solana: {
    rpcPrimary: process.env.RPC_URL_PRIMARY || 'https://api.mainnet-beta.solana.com',
    rpcFallback: process.env.RPC_URL_FALLBACK || 'https://api.mainnet-beta.solana.com',
    rpcDevnet: process.env.RPC_DEVNET_URL || 'https://api.devnet.solana.com',
    network: process.env.SOLANA_NETWORK || 'mainnet-beta',
    // RPC Rate Limiting Configuration
    maxConcurrentRequests: parseInt(process.env.RPC_MAX_CONCURRENT || '30', 10), // Max simultaneous RPC calls
    requestDelayMs: parseInt(process.env.RPC_REQUEST_DELAY_MS || '50', 10), // Min delay between requests
    maxQueueSize: parseInt(process.env.RPC_MAX_QUEUE_SIZE || '1000', 10), // Max queued requests (prevents memory issues)
    poolTokenAccount: process.env.POOL_TOKEN_ACCOUNT || 'ELoXCCRa1HcFGgothnMFUeFz7vcqKCHHG5HxBnX7xkMf',
    pumpFunToken: process.env.PUMP_FUN_TOKEN || 'AjckotsSBsw19EG47nz2Kav9DwkVU1A22Vabm6wRpump', // Default to user's token
    pumpFunDecimals: parseInt(process.env.PUMP_FUN_DECIMALS || '9', 10), // Token decimals (9 = standard Solana/lamports)
    pumpFunTotalSupply: parseInt(process.env.PUMP_FUN_TOTAL_SUPPLY || '1000000000', 10), // 1 billion tokens
    // Pump.fun program addresses for buy/sell detection
    pumpFunProgram: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // Pump.fun AMM program
    pumpFunBondingCurve: 'ELoXCCRa1HcFGgothnMFUeFz7vcqKCHHG5HxBnX7xkMf', // Bonding curve (if different)
  },

  santa: {
    tokenMint: process.env.SANTA_TOKEN_MINT || process.env.PUMP_FUN_TOKEN || '',
    treasuryWallet: process.env.SANTA_TREASURY_WALLET || '',
    treasuryPrivateKey: process.env.SANTA_TREASURY_PRIVATE_KEY || '',
    decimals: parseInt(process.env.SANTA_DECIMALS || process.env.PUMP_FUN_DECIMALS || '9', 10),
    totalSupply: 1_000_000_000,
    // Token transfer mode: 'real' to send actual tokens, 'dryrun' to only log
    transferMode: (process.env.TOKEN_TRANSFER_MODE || 'dryrun') as 'real' | 'dryrun',
    // Dev and airdrop wallets (always excluded from gifts and airdrops)
    devWallet: process.env.DEV_WALLET || '',
    airdropWallet: process.env.AIRDROP_WALLET || '',
    // Excluded wallets (comma-separated) - these wallets will never receive gifts or airdrops
    // Automatically includes DEV_WALLET and AIRDROP_WALLET if configured
    excludedWallets: (() => {
      const excluded = (process.env.EXCLUDED_WALLETS || '').split(',').filter(w => w.trim().length > 0).map(w => w.trim());
      const devWallet = process.env.DEV_WALLET?.trim();
      const airdropWallet = process.env.AIRDROP_WALLET?.trim();
      
      // Automatically add DEV_WALLET and AIRDROP_WALLET if they're configured
      if (devWallet && !excluded.includes(devWallet)) {
        excluded.push(devWallet);
      }
      if (airdropWallet && !excluded.includes(airdropWallet)) {
        excluded.push(airdropWallet);
      }
      
      return excluded;
    })(),
  },

  multisig: {
    address: process.env.MULTISIG_ADDRESS || '',
    threshold: parseInt(process.env.MULTISIG_THRESHOLD || '3', 10),
    signers: parseInt(process.env.MULTISIG_SIGNERS || '5', 10),
  },

  database: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'santa',
    user: process.env.DB_USER || 'santa',
    password: process.env.DB_PASSWORD || 'santa',
    // Auto-enable SSL if DATABASE_URL is provided (Railway, Heroku, etc.)
    ssl: process.env.DB_SSL === 'true' || !!process.env.DATABASE_URL,
  },

  security: {
    adminApiKey: process.env.ADMIN_API_KEY || '',
    adminIpWhitelist: (process.env.ADMIN_IP_WHITELIST || '127.0.0.1,::1').split(','),
  },

  twitter: {
    apiKey: process.env.X_API_KEY || '',
    apiSecret: process.env.X_API_SECRET || '',
    accessToken: process.env.X_ACCESS_TOKEN || '',
    accessSecret: process.env.X_ACCESS_SECRET || '',
    postHookSecret: process.env.X_POST_HOOK_SECRET || '',
  },

  gifts: {
    hashFile: process.env.GIFTS_HASH_FILE || './data/gifts-hash.json',
    fullFile: process.env.GIFTS_FULL_FILE || './data/gifts-full.json',
    salt: process.env.GIFTS_SALT || '',
    // Daily fee cap: Maximum USD value that can be distributed per day (default: 5000 USD)
    // This will be converted to SOL dynamically based on current SOL/USD price
    // If creator fees exceed this USD value, the cap is used instead
    dailyFeeLimitUSD: parseFloat(process.env.DAILY_FEE_LIMIT_USD || '5000'),
  },

  monitoring: {
    logLevel: process.env.LOG_LEVEL || 'debug', // Changed to debug for troubleshooting
    sentryDsn: process.env.SENTRY_DSN || '',
  },

  websocket: {
    enabled: process.env.WEBSOCKET_ENABLED === 'true',
    heliusApiKey: process.env.HELIUS_API_KEY || '',
    commitment: (process.env.WEBSOCKET_COMMITMENT as 'processed' | 'confirmed' | 'finalized') || 'confirmed',
    reconnectMaxAttempts: parseInt(process.env.WEBSOCKET_RECONNECT_MAX_ATTEMPTS || '10', 10),
    pingInterval: parseInt(process.env.WEBSOCKET_PING_INTERVAL || '30000', 10), // 30 seconds
  },

  schedule: {
    dailyCloseCron: process.env.DAILY_CLOSE_CRON || '5 0 * * *', // 00:05 UTC
  },

  frontendUrl: process.env.FRONTEND_URL || 'https://santa-pump.fun',
};

// Validate required configuration
export function validateConfig(): void {
  // Token mint is required
  const required = [
    { key: 'SANTA_TOKEN_MINT', value: config.santa.tokenMint },
  ];
  
  // Treasury wallet is only required in production
  const productionRequired = [
    { key: 'SANTA_TREASURY_WALLET', value: config.santa.treasuryWallet },
  ];

  const missing = required.filter(({ value }) => !value);

  if (missing.length > 0) {
    if (config.env === 'production') {
      throw new Error(
        `Missing required environment variables: ${missing.map((m) => m.key).join(', ')}`
      );
    } else {
      // Warn in development but don't fail
      console.warn(
        `⚠️  Missing required configuration: ${missing.map((m) => m.key).join(', ')}`
      );
      console.warn('⚠️  Transaction listener will be disabled. Set SANTA_TOKEN_MINT in .env to enable.');
    }
  }
  
  // Check production-only requirements
  const missingProduction = productionRequired.filter(({ value }) => !value);
  if (missingProduction.length > 0 && config.env !== 'production') {
    console.warn(
      `⚠️  Optional configuration (required in production): ${missingProduction.map((m) => m.key).join(', ')}`
    );
    console.warn('⚠️  Will monitor token mint directly. For production, configure treasury wallet.');
  }

  // Validate Solana addresses if provided
  if (config.santa.tokenMint) {
    try {
      new PublicKey(config.santa.tokenMint);
    } catch (error) {
      throw new Error('Invalid SANTA_TOKEN_MINT address');
    }
  }

  if (config.santa.treasuryWallet) {
    try {
      new PublicKey(config.santa.treasuryWallet);
    } catch (error) {
      throw new Error('Invalid SANTA_TREASURY_WALLET address');
    }
  }
}

