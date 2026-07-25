-- Email delivery tracking for Resend
-- This tracks all emails sent, their delivery status, opens, clicks, bounces, and complaints

-- Email logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Resend identifiers
  resend_email_id TEXT UNIQUE,

  -- Email details
  email_type TEXT NOT NULL, -- 'portal_magic_link', 'portal_invitation', 'order_confirmation', etc.
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,

  -- Delivery tracking
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'bounced', 'complained', 'failed'
  bounce_type TEXT, -- 'hard', 'soft', 'spam' (if bounced)
  complaint_type TEXT, -- 'abuse', 'fraud', 'virus' (if complained)

  -- Open and click tracking
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,

  -- Related records
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_email_logs_resend_id ON email_logs(resend_email_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_to_address ON email_logs(to_address);
CREATE INDEX idx_email_logs_client_id ON email_logs(client_id);
CREATE INDEX idx_email_logs_email_type ON email_logs(email_type);
CREATE INDEX idx_email_logs_created_at ON email_logs(created_at DESC);

-- Bounce tracking table (for email suppression list)
CREATE TABLE IF NOT EXISTS email_bounces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email_address TEXT NOT NULL UNIQUE,
  bounce_type TEXT NOT NULL, -- 'hard', 'soft', 'spam', 'complaint'
  bounce_count INTEGER DEFAULT 1,

  -- First and last bounce timestamps
  first_bounced_at TIMESTAMPTZ DEFAULT NOW(),
  last_bounced_at TIMESTAMPTZ DEFAULT NOW(),

  -- Should we suppress sending to this email?
  suppressed BOOLEAN DEFAULT false,
  suppressed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups before sending
CREATE UNIQUE INDEX idx_email_bounces_address ON email_bounces(email_address);
CREATE INDEX idx_email_bounces_suppressed ON email_bounces(suppressed);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_email_logs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_email_logs_timestamp
BEFORE UPDATE ON email_logs
FOR EACH ROW
EXECUTE FUNCTION update_email_logs_timestamp();

CREATE TRIGGER update_email_bounces_timestamp
BEFORE UPDATE ON email_bounces
FOR EACH ROW
EXECUTE FUNCTION update_email_logs_timestamp();

-- RLS Policies

-- Enable RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_bounces ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins have full access to email_logs"
  ON email_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins have full access to email_bounces"
  ON email_bounces
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid()
    )
  );

-- Service role can insert/update (for webhooks)
CREATE POLICY "Service role can manage email_logs"
  ON email_logs
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage email_bounces"
  ON email_bounces
  FOR ALL
  USING (auth.role() = 'service_role');

-- Helper function to check if email is suppressed
CREATE OR REPLACE FUNCTION is_email_suppressed(email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  is_suppressed BOOLEAN;
BEGIN
  SELECT COALESCE(suppressed, false)
  INTO is_suppressed
  FROM email_bounces
  WHERE email_address = LOWER(email);

  RETURN COALESCE(is_suppressed, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to record bounce
CREATE OR REPLACE FUNCTION record_email_bounce(
  email TEXT,
  bounce_type_param TEXT,
  auto_suppress BOOLEAN DEFAULT true
)
RETURNS VOID AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Insert or update bounce record
  INSERT INTO email_bounces (
    email_address,
    bounce_type,
    bounce_count,
    first_bounced_at,
    last_bounced_at,
    suppressed,
    suppressed_at
  ) VALUES (
    LOWER(email),
    bounce_type_param,
    1,
    NOW(),
    NOW(),
    CASE
      WHEN auto_suppress AND bounce_type_param = 'hard' THEN true
      WHEN auto_suppress AND bounce_type_param = 'complaint' THEN true
      ELSE false
    END,
    CASE
      WHEN auto_suppress AND (bounce_type_param = 'hard' OR bounce_type_param = 'complaint') THEN NOW()
      ELSE NULL
    END
  )
  ON CONFLICT (email_address) DO UPDATE
  SET
    bounce_count = email_bounces.bounce_count + 1,
    last_bounced_at = NOW(),
    bounce_type = bounce_type_param,
    -- Auto-suppress on hard bounces or after 3 soft bounces
    suppressed = CASE
      WHEN auto_suppress AND bounce_type_param = 'hard' THEN true
      WHEN auto_suppress AND bounce_type_param = 'complaint' THEN true
      WHEN auto_suppress AND bounce_type_param = 'soft' AND email_bounces.bounce_count + 1 >= 3 THEN true
      ELSE email_bounces.suppressed
    END,
    suppressed_at = CASE
      WHEN auto_suppress AND (
        bounce_type_param = 'hard' OR
        bounce_type_param = 'complaint' OR
        (bounce_type_param = 'soft' AND email_bounces.bounce_count + 1 >= 3)
      ) THEN NOW()
      ELSE email_bounces.suppressed_at
    END,
    updated_at = NOW()
  RETURNING bounce_count INTO current_count;

  -- Log the action
  RAISE NOTICE 'Recorded % bounce for %. Total bounces: %', bounce_type_param, email, current_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE email_logs IS 'Tracks all emails sent via Resend with delivery status';
COMMENT ON TABLE email_bounces IS 'Suppression list for bounced and complained email addresses';
COMMENT ON FUNCTION is_email_suppressed IS 'Check if an email address should not receive emails';
COMMENT ON FUNCTION record_email_bounce IS 'Record a bounce event and auto-suppress if needed';
