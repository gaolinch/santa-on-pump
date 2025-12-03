# Scripts Organization

This directory contains all utility scripts organized by theme into subfolders.

## Directory Structure

### 📦 `gifts/` - Gift Execution and Management
Scripts related to gift execution, gift specifications, and merkle tree operations.

- `execute-gift-interactive.ts` - Interactive gift execution with confirmation prompts
- `full-dryrun-day1.ts` - Full dry run of gift execution using real database data
- `check-gift-spec.ts` - Check gift specifications
- `check-gift-alignment.ts` - Verify gift alignment with database
- `sync-gifts-from-json.ts` - Sync gifts from JSON file to database
- `reseed-gifts.ts` - Reseed gift specifications
- `generate-merkle-commitment.ts` - Generate merkle tree commitments
- `populate-merkle-data.ts` - Populate merkle tree data
- `run-merkle-migration.ts` - Run merkle tree migrations
- `generate-merkle.js` - Generate merkle tree (JavaScript)
- `test-merkle-verification.js` - Test merkle verification (JavaScript)
- `populate-gift-hashes.js.DEPRECATED` - Deprecated gift hash population

### 💸 `transactions/` - Transaction Management and Processing
Scripts for managing, processing, and analyzing transactions.

- `backfill-date.ts` - Backfill transactions for a specific date
- `backfill-recent.ts` - Backfill recent transactions (configurable time range)
- `backfill-network-fee.ts` - Backfill network fees for transactions
- `backfill-network-fees.ts` - Alternative network fee backfill
- `backfill-creator-fees.ts` - Backfill creator fees
- `check-transaction-status.ts` - Check transaction status
- `check-transaction-fee.ts` - Check transaction fees
- `process-individual-transactions.ts` - Process individual transactions by index
- `insert-transaction-manually.ts` - Manually insert transactions
- `verify-transactions.ts` - Verify transactions
- `monitor-websocket-transactions.ts` - Monitor websocket transactions
- `check-websocket-transactions.ts` - Check websocket transactions
- `show-transaction-details.ts` - Show detailed transaction information
- `show-helius-transaction.ts` - Show Helius transaction details
- `show-transaction-ids.ts` - Show transaction IDs
- `debug-transaction.ts` - Debug transaction issues
- `debug-transaction-classification.ts` - Debug transaction classification
- `fix-misclassified-buys.ts` - Fix misclassified buy transactions
- `fix-misclassified-transactions.ts` - Fix misclassified transactions
- `analyze-pumpfun-tx.ts` - Analyze Pump.fun transactions
- `analyze-tx-accounts.ts` - Analyze transaction accounts
- `find-real-transfers.ts` - Find real token transfers
- `get-recent-sig.ts` - Get recent transaction signatures

### 📅 `day-management/` - Day Closure and Pool Management
Scripts for managing daily operations, day closure, and day pools.

- `close-day.ts` - Close a day and execute gift pipeline
- `close-day-pool.ts` - Close day pool manually
- `check-available-dates.ts` - Check which dates have transactions and holders
- `check-day-buyers.ts` - Check buyers for a specific day

### 📊 `data/` - Data Checking and Analysis
Scripts for checking and analyzing data in the database.

- `check-holders.ts` - Check holder snapshots
- `check-wallet-transactions.ts` - Check transactions for a specific wallet
- `check-creator-fee-data.ts` - Check creator fee data
- `check-amount-storage.ts` - Check how amounts are stored
- `calculate-wallet-balance.ts` - Calculate wallet balance from transactions
- `fix-creator-fee-data.ts` - Fix creator fee data issues
- `run-snapshot-fix.ts` - Fix holder snapshot issues

### 🪙 `tokens/` - Token and Airdrop Operations
Scripts for token transfers and airdrop operations.

- `send-token-bonus.ts` - Send token bonuses to recipients
- `transfer-tokens-to-airdrop.ts` - Transfer tokens to airdrop wallet
- `airdrop-wallets.ts` - Airdrop tokens to wallets
- `airdrop-cli.sh` - Airdrop CLI script (shell)
- `manual-hourly-airdrop.ts` - Manual hourly airdrop execution

### 🔄 `migrations/` - Database Migrations
Scripts for database schema migrations and updates.

- `migrate.ts` - Run database migrations
- `migrate-timezone.ts` - Migrate timezone data
- `migrate-execution-logs.ts` - Migrate execution logs
- `run-migration.ts` - Run a specific migration
- `run-migrations.ts` - Run all migrations
- `run-hint-migrations.ts` - Run hint-related migrations
- `add-subtx-column.ts` - Add sub-transaction column

### 🧪 `testing/` - Test Scripts
Test scripts for various components and features.

- `test-day1-gift.ts` - Test day 1 gift execution
- `test-day1-dryrun.ts` - Test day 1 dry run
- `test-day2-dryrun.ts` - Test day 2 dry run
- `test-scheduler.ts` - Test gift scheduler
- `test-hourly-dryrun.ts` - Test hourly airdrop dry run
- `test-gift-logger.ts` - Test gift logger
- `test-twitter.ts` - Test Twitter integration
- `test-sol-transfer.ts` - Test SOL transfer functionality
- `test-creator-fee-extraction.ts` - Test creator fee extraction
- `test-multi-buyer.ts` - Test multi-buyer scenarios
- `test-monitoring.ts` - Test monitoring functionality
- `test-request-queue.ts` - Test request queue
- `test-websocket-capture.ts` - Test websocket capture

### ⚙️ `execution/` - Execution Management and Debugging
Scripts for managing gift execution and debugging execution issues.

- `debug-execution.ts` - Debug gift execution issues
- `fix-execution-status.ts` - Fix execution status in database
- `view-execution-logs.ts` - View execution logs
- `clean-dryrun-logs.ts` - Clean dry run logs
- `demo-granular-logging.ts` - Demo granular logging features

### 🗄️ `database/` - Database Setup and Utilities
Scripts for database setup, seeding, and utilities.

- `seed.ts` - Seed database with initial data
- `seed-to-base58.ts` - Convert seed to base58 format
- `show-db-structure.ts` - Show database structure
- `create-hourly-table.ts` - Create hourly airdrop table

### 🛠️ `utilities/` - Utility Scripts
General utility scripts for various operations.

- `diagnostic-check.ts` - Run diagnostic checks
- `generate-test-transactions.ts` - Generate test transactions
- `fund-wallets.ts` - Fund wallets with SOL

## Usage

All scripts can be run using npm scripts defined in `package.json`. The paths have been updated to reflect the new organization.

Example:
```bash
npm run execute:gift -- --day 2
npm run backfill:date -- --day 2
npm run check:buyers -- --day 2
```

## Notes

- All scripts use relative imports (`../database`, `../services`, etc.) which still work from subdirectories
- Scripts are organized by functionality to make them easier to find and maintain
- Test scripts are separated from production scripts for clarity

