-- Add hidden column to sales_calls table
ALTER TABLE sales_calls
ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

-- Create index for filtering hidden calls
CREATE INDEX IF NOT EXISTS idx_sales_calls_hidden ON sales_calls(hidden);
