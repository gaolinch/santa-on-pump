-- Gift Execution Logs Table
-- Stores detailed step-by-step logs for each gift execution

CREATE TABLE IF NOT EXISTS gift_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day INTEGER NOT NULL,
  gift_type VARCHAR(100) NOT NULL,
  execution_id UUID,
  step_number INTEGER NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  step_status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
  log_level VARCHAR(20) NOT NULL, -- 'info', 'warn', 'error', 'debug'
  message TEXT NOT NULL,
  data JSONB,
  duration_ms INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_day ON gift_execution_logs(day);
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_execution_id ON gift_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_timestamp ON gift_execution_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_gift_type ON gift_execution_logs(gift_type);
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_step_status ON gift_execution_logs(step_status);

-- Gift Execution Summary Table
-- Stores high-level summary of each execution
CREATE TABLE IF NOT EXISTS gift_execution_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID UNIQUE NOT NULL,
  day INTEGER NOT NULL,
  gift_type VARCHAR(100) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_ms INTEGER,
  status VARCHAR(20) NOT NULL, -- 'started', 'success', 'failed', 'skipped'
  winner_count INTEGER,
  total_distributed BIGINT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for summary table
CREATE INDEX IF NOT EXISTS idx_gift_execution_summary_day ON gift_execution_summary(day);
CREATE INDEX IF NOT EXISTS idx_gift_execution_summary_status ON gift_execution_summary(status);
CREATE INDEX IF NOT EXISTS idx_gift_execution_summary_start_time ON gift_execution_summary(start_time DESC);

-- Comments
COMMENT ON TABLE gift_execution_logs IS 'Detailed step-by-step logs for gift executions';
COMMENT ON TABLE gift_execution_summary IS 'High-level summary of gift executions';
COMMENT ON COLUMN gift_execution_logs.execution_id IS 'Links to gift_execution_summary.execution_id';
COMMENT ON COLUMN gift_execution_logs.step_number IS 'Sequential step number in the execution';
COMMENT ON COLUMN gift_execution_logs.data IS 'Structured data for the step (winners, calculations, etc.)';

