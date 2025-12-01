/**
 * Gift Logger - Enhanced logging for gift execution
 * 
 * Provides structured logging for gift operations with:
 * - Gift-specific context
 * - Performance tracking
 * - Error categorization
 * - Audit trail integration
 */

import { logger } from '../utils/logger';
import { auditLogRepo, giftExecutionLogRepo, giftExecutionSummaryRepo } from '../database';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface GiftLogContext {
  day: number;
  giftType: string;
  phase: string;
  metadata?: Record<string, any>;
}

export interface GiftExecutionLog {
  day: number;
  giftType: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'started' | 'success' | 'failed' | 'skipped';
  winnerCount?: number;
  totalDistributed?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export class GiftLogger {
  private executionLogs: Map<number, GiftExecutionLog> = new Map();
  private currentExecutionId: string | null = null;
  private currentStepNumber: number = 0;
  private logsDir: string = path.join(process.cwd(), 'logs', 'executions');
  private fileStream: fs.WriteStream | null = null;

  /**
   * Log gift execution start
   */
  startExecution(day: number, giftType: string, metadata?: Record<string, any>): void {
    // Generate unique execution ID
    this.currentExecutionId = randomUUID();
    this.currentStepNumber = 0;

    const log: GiftExecutionLog = {
      day,
      giftType,
      startTime: new Date(),
      status: 'started',
      metadata,
    };

    this.executionLogs.set(day, log);

    logger.info({
      day,
      giftType,
      executionId: this.currentExecutionId,
      metadata,
    }, '🎁 Starting gift execution');

    // Initialize file logging
    this.initializeFileLogging(day, giftType);

    // Save to database
    this.saveSummaryToDatabase({
      execution_id: this.currentExecutionId,
      day,
      gift_type: giftType,
      start_time: log.startTime,
      status: 'started',
      metadata,
    }).catch(err => {
      logger.error({ err }, 'Failed to save execution summary to database');
    });
  }

  /**
   * Log gift execution success
   */
  async successExecution(
    day: number,
    winnerCount: number,
    totalDistributed: bigint,
    metadata?: Record<string, any>
  ): Promise<void> {
    const log = this.executionLogs.get(day);
    if (!log) {
      logger.warn({ day }, 'No execution log found for day');
      return;
    }

    log.endTime = new Date();
    log.duration = log.endTime.getTime() - log.startTime.getTime();
    log.status = 'success';
    log.winnerCount = winnerCount;
    log.totalDistributed = totalDistributed.toString();
    log.metadata = { ...log.metadata, ...metadata };

    logger.info({
      day: log.day,
      giftType: log.giftType,
      executionId: this.currentExecutionId,
      duration: `${log.duration}ms`,
      winnerCount: log.winnerCount,
      totalDistributed: log.totalDistributed,
      metadata: log.metadata,
    }, '✅ Gift execution successful');

    // Update database summary
    if (this.currentExecutionId) {
      await this.updateSummaryInDatabase(this.currentExecutionId, {
        end_time: log.endTime,
        duration_ms: log.duration,
        status: 'success',
        winner_count: winnerCount,
        total_distributed: totalDistributed,
        metadata: log.metadata,
      });
    }

    // Record in audit log
    await this.recordAudit(log);

    // Close file logging
    this.closeFileLogging();
    this.currentExecutionId = null;
    this.currentStepNumber = 0;
  }

  /**
   * Log gift execution failure
   */
  async failExecution(day: number, error: Error, metadata?: Record<string, any>): Promise<void> {
    const log = this.executionLogs.get(day);
    if (!log) {
      logger.warn({ day }, 'No execution log found for day');
      return;
    }

    log.endTime = new Date();
    log.duration = log.endTime.getTime() - log.startTime.getTime();
    log.status = 'failed';
    log.error = error.message;
    log.metadata = { ...log.metadata, ...metadata, stack: error.stack };

    logger.error({
      day: log.day,
      giftType: log.giftType,
      executionId: this.currentExecutionId,
      duration: `${log.duration}ms`,
      error: log.error,
      metadata: log.metadata,
    }, '❌ Gift execution failed');

    // Update database summary
    if (this.currentExecutionId) {
      await this.updateSummaryInDatabase(this.currentExecutionId, {
        end_time: log.endTime,
        duration_ms: log.duration,
        status: 'failed',
        error_message: error.message,
        metadata: log.metadata,
      });
    }

    // Record in audit log
    await this.recordAudit(log);

    // Close file logging
    this.closeFileLogging();
    this.currentExecutionId = null;
    this.currentStepNumber = 0;
  }

  /**
   * Log gift execution skipped
   */
  async skipExecution(day: number, reason: string): Promise<void> {
    const log = this.executionLogs.get(day);
    if (!log) {
      logger.warn({ day }, 'No execution log found for day');
      return;
    }

    log.endTime = new Date();
    log.duration = log.endTime.getTime() - log.startTime.getTime();
    log.status = 'skipped';
    log.metadata = { ...log.metadata, reason };

    logger.info({
      day: log.day,
      giftType: log.giftType,
      executionId: this.currentExecutionId,
      reason,
    }, '⏭️  Gift execution skipped');

    // Update database summary
    if (this.currentExecutionId) {
      await this.updateSummaryInDatabase(this.currentExecutionId, {
        end_time: log.endTime,
        duration_ms: log.duration,
        status: 'skipped',
        metadata: log.metadata,
      });
    }

    // Record in audit log
    await this.recordAudit(log);

    // Close file logging
    this.closeFileLogging();
    this.currentExecutionId = null;
    this.currentStepNumber = 0;
  }

  /**
   * Log phase progress
   */
  logPhase(day: number, phase: string, details?: Record<string, any>): void {
    logger.info({
      day,
      phase,
      ...details,
    }, `📍 Phase: ${phase}`);
  }

  /**
   * Log validation result
   */
  logValidation(day: number, validation: string, passed: boolean, details?: Record<string, any>): void {
    const emoji = passed ? '✅' : '❌';
    const level = passed ? 'info' : 'warn';
    
    logger[level]({
      day,
      validation,
      passed,
      ...details,
    }, `${emoji} Validation: ${validation}`);
  }

  /**
   * Log distribution details
   */
  logDistribution(day: number, distribution: {
    winnerCount: number;
    totalAmount: bigint;
    averageAmount?: bigint;
    minAmount?: bigint;
    maxAmount?: bigint;
  }): void {
    logger.info({
      day,
      winnerCount: distribution.winnerCount,
      totalAmount: distribution.totalAmount.toString(),
      averageAmount: distribution.averageAmount?.toString(),
      minAmount: distribution.minAmount?.toString(),
      maxAmount: distribution.maxAmount?.toString(),
    }, '💰 Distribution summary');
  }

  /**
   * Get execution log for a day
   */
  getExecutionLog(day: number): GiftExecutionLog | undefined {
    return this.executionLogs.get(day);
  }

  /**
   * Get all execution logs
   */
  getAllExecutionLogs(): GiftExecutionLog[] {
    return Array.from(this.executionLogs.values());
  }

  /**
   * Clear execution logs
   */
  clearLogs(): void {
    this.executionLogs.clear();
  }

  /**
   * Record execution in audit log
   */
  private async recordAudit(log: GiftExecutionLog): Promise<void> {
    try {
      await auditLogRepo.insert({
        ts: log.endTime || new Date(),
        actor: 'system',
        action: `gift_execution_${log.status}`,
        payload: {
          day: log.day,
          giftType: log.giftType,
          duration: log.duration,
          winnerCount: log.winnerCount,
          totalDistributed: log.totalDistributed,
          error: log.error,
          metadata: log.metadata,
        },
        resource_type: 'gift_execution',
        resource_id: log.day.toString(),
      });
    } catch (error) {
      logger.error({ error, day: log.day }, 'Failed to record audit log');
    }
  }

  /**
   * Create a child logger with gift context
   */
  withContext(context: GiftLogContext) {
    return {
      info: (msg: string, data?: Record<string, any>) => {
        logger.info({ ...context, ...data }, msg);
      },
      warn: (msg: string, data?: Record<string, any>) => {
        logger.warn({ ...context, ...data }, msg);
      },
      error: (msg: string, data?: Record<string, any>) => {
        logger.error({ ...context, ...data }, msg);
      },
      debug: (msg: string, data?: Record<string, any>) => {
        logger.debug({ ...context, ...data }, msg);
      },
    };
  }

  /**
   * Log a step in the execution
   */
  async logStep(
    day: number,
    giftType: string,
    stepName: string,
    message: string,
    data?: Record<string, any>,
    level: 'info' | 'warn' | 'error' | 'debug' = 'info'
  ): Promise<void> {
    if (!this.currentExecutionId) {
      logger.warn({ day }, 'No active execution for step logging');
      return;
    }

    this.currentStepNumber++;

    const stepLog = {
      day,
      gift_type: giftType,
      execution_id: this.currentExecutionId,
      step_number: this.currentStepNumber,
      step_name: stepName,
      step_status: 'completed' as const,
      log_level: level,
      message,
      data,
      timestamp: new Date(),
    };

    // Save to database
    await this.saveStepToDatabase(stepLog);

    // Save to file
    this.writeToFile(stepLog);
  }

  /**
   * Initialize file logging for an execution
   */
  private initializeFileLogging(day: number, giftType: string): void {
    try {
      // Ensure logs directory exists
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      // Create log file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `day${day}_${giftType}_${timestamp}.log`;
      const filepath = path.join(this.logsDir, filename);

      this.fileStream = fs.createWriteStream(filepath, { flags: 'a' });

      // Write header
      this.fileStream.write(`${'='.repeat(80)}\n`);
      this.fileStream.write(`Gift Execution Log\n`);
      this.fileStream.write(`Day: ${day}\n`);
      this.fileStream.write(`Gift Type: ${giftType}\n`);
      this.fileStream.write(`Execution ID: ${this.currentExecutionId}\n`);
      this.fileStream.write(`Start Time: ${new Date().toISOString()}\n`);
      this.fileStream.write(`${'='.repeat(80)}\n\n`);

      logger.info({ filepath }, 'Initialized execution log file');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize file logging');
    }
  }

  /**
   * Write log entry to file
   */
  private writeToFile(stepLog: any): void {
    if (!this.fileStream) return;

    try {
      const timestamp = new Date(stepLog.timestamp).toISOString();
      const level = stepLog.log_level.toUpperCase().padEnd(5);
      
      this.fileStream.write(`[${timestamp}] [${level}] Step ${stepLog.step_number}: ${stepLog.step_name}\n`);
      this.fileStream.write(`  ${stepLog.message}\n`);
      
      if (stepLog.data) {
        this.fileStream.write(`  Data: ${JSON.stringify(stepLog.data, null, 2)}\n`);
      }
      
      this.fileStream.write('\n');
    } catch (error) {
      logger.error({ error }, 'Failed to write to log file');
    }
  }

  /**
   * Close file logging
   */
  private closeFileLogging(): void {
    if (this.fileStream) {
      this.fileStream.write(`\n${'='.repeat(80)}\n`);
      this.fileStream.write(`End Time: ${new Date().toISOString()}\n`);
      this.fileStream.write(`${'='.repeat(80)}\n`);
      this.fileStream.end();
      this.fileStream = null;
    }
  }

  /**
   * Save step to database
   */
  private async saveStepToDatabase(stepLog: any): Promise<void> {
    try {
      await giftExecutionLogRepo.insert(stepLog);
    } catch (error) {
      logger.error({ error, stepLog }, 'Failed to save step to database');
    }
  }

  /**
   * Save summary to database
   */
  private async saveSummaryToDatabase(summary: any): Promise<void> {
    try {
      await giftExecutionSummaryRepo.insert(summary);
    } catch (error) {
      logger.error({ error, summary }, 'Failed to save summary to database');
    }
  }

  /**
   * Update summary in database
   */
  private async updateSummaryInDatabase(executionId: string, updates: any): Promise<void> {
    try {
      await giftExecutionSummaryRepo.update(executionId, updates);
    } catch (error) {
      logger.error({ error, executionId, updates }, 'Failed to update summary in database');
    }
  }
}

// Singleton instance
export const giftLogger = new GiftLogger();

