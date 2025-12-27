-- Add Corey Jackson Framework scoring columns to sales_call_analysis table

ALTER TABLE sales_call_analysis
ADD COLUMN IF NOT EXISTS frame_control_score DECIMAL(3,1) CHECK (frame_control_score >= 0 AND frame_control_score <= 10),
ADD COLUMN IF NOT EXISTS discovery_current_state_score DECIMAL(3,1) CHECK (discovery_current_state_score >= 0 AND discovery_current_state_score <= 10),
ADD COLUMN IF NOT EXISTS discovery_desired_state_score DECIMAL(3,1) CHECK (discovery_desired_state_score >= 0 AND discovery_desired_state_score <= 10),
ADD COLUMN IF NOT EXISTS discovery_cost_of_inaction_score DECIMAL(3,1) CHECK (discovery_cost_of_inaction_score >= 0 AND discovery_cost_of_inaction_score <= 10),
ADD COLUMN IF NOT EXISTS watt_tiedowns_score DECIMAL(3,1) CHECK (watt_tiedowns_score >= 0 AND watt_tiedowns_score <= 10),
ADD COLUMN IF NOT EXISTS bridge_gap_score DECIMAL(3,1) CHECK (bridge_gap_score >= 0 AND bridge_gap_score <= 10),
ADD COLUMN IF NOT EXISTS sellback_score DECIMAL(3,1) CHECK (sellback_score >= 0 AND sellback_score <= 10),
ADD COLUMN IF NOT EXISTS price_drop_score DECIMAL(3,1) CHECK (price_drop_score >= 0 AND price_drop_score <= 10),
ADD COLUMN IF NOT EXISTS close_celebration_score DECIMAL(3,1) CHECK (close_celebration_score >= 0 AND close_celebration_score <= 10),
ADD COLUMN IF NOT EXISTS framework_adherence_score DECIMAL(3,1) CHECK (framework_adherence_score >= 0 AND framework_adherence_score <= 10);

-- Add framework-specific insights as JSONB
ALTER TABLE sales_call_analysis
ADD COLUMN IF NOT EXISTS framework_insights JSONB;

COMMENT ON COLUMN sales_call_analysis.frame_control_score IS 'Intro + Frame Control: Setting tone, authority, timing confirmation';
COMMENT ON COLUMN sales_call_analysis.discovery_current_state_score IS 'Discovery - Current State: Understanding where they are now';
COMMENT ON COLUMN sales_call_analysis.discovery_desired_state_score IS 'Discovery - Desired State: Understanding their goal';
COMMENT ON COLUMN sales_call_analysis.discovery_cost_of_inaction_score IS 'Discovery - Cost of Inaction: Uncovering the pain of staying stuck';
COMMENT ON COLUMN sales_call_analysis.watt_tiedowns_score IS 'WATT Tie-downs: Micro-commitments building YES momentum';
COMMENT ON COLUMN sales_call_analysis.bridge_gap_score IS 'Bridge the Gap: Positioning offer as solution';
COMMENT ON COLUMN sales_call_analysis.sellback_score IS 'Sellback: Having prospect sell themselves on solution';
COMMENT ON COLUMN sales_call_analysis.price_drop_score IS 'Price Drop: Minimizing and pausing after price reveal';
COMMENT ON COLUMN sales_call_analysis.close_celebration_score IS 'Close & Celebrate: Taking payment and celebrating the win';
COMMENT ON COLUMN sales_call_analysis.framework_adherence_score IS 'Overall adherence to Corey Jackson framework';
COMMENT ON COLUMN sales_call_analysis.framework_insights IS 'Detailed insights about framework execution';
