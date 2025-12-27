-- Add call_type column to sales_calls table
CREATE TYPE call_type AS ENUM ('sales', 'non-sales', 'unclassified');

ALTER TABLE sales_calls
ADD COLUMN IF NOT EXISTS call_type call_type DEFAULT 'unclassified';

-- Create index for filtering by call type
CREATE INDEX IF NOT EXISTS idx_sales_calls_call_type ON sales_calls(call_type);
