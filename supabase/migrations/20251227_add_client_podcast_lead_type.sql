-- Add 'client_podcast' to lead_type check constraint
-- Drop the old constraint and create a new one with the additional value

ALTER TABLE campaign_replies
DROP CONSTRAINT IF EXISTS campaign_replies_lead_type_check;

ALTER TABLE campaign_replies
ADD CONSTRAINT campaign_replies_lead_type_check
CHECK (lead_type IN ('sales', 'podcasts', 'client_podcast', 'other'));
