-- Save custom AI prompt per lead
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS custom_prompt TEXT;
