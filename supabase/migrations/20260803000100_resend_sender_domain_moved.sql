-- This application's sending domain moved to email.getonapod.com, on a Resend
-- account of its own. mail.getonapod.com stays behind on the shared account,
-- where the sibling application is still using it, so it stops being ours and
-- the gate must stop recognising it — otherwise the move would quietly readmit
-- the sibling's traffic through the door we closed this morning.

BEGIN;

CREATE OR REPLACE FUNCTION public.process_resend_webhook_event(
  p_svix_id TEXT,
  p_event_type TEXT,
  p_resend_email_id TEXT,
  p_event_created_at TIMESTAMPTZ,
  p_bounce_type TEXT,
  p_complaint_type TEXT,
  p_from_address TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  email_log public.email_logs%ROWTYPE;
  inserted_count INTEGER;
  incoming_status TEXT;
  incoming_rank INTEGER;
  current_rank INTEGER;
  normalized_address TEXT;
  normalized_bounce_type TEXT;
  normalized_complaint_type TEXT;
  sender_domain TEXT;
BEGIN
  IF p_svix_id IS NULL
    OR p_svix_id <> btrim(p_svix_id)
    OR char_length(p_svix_id) NOT BETWEEN 1 AND 256
    OR p_event_type IS NULL
    OR p_event_type <> btrim(p_event_type)
    OR char_length(p_event_type) NOT BETWEEN 1 AND 128
    OR p_event_created_at IS NULL
  THEN
    RAISE EXCEPTION 'Invalid Resend webhook event';
  END IF;

  IF p_resend_email_id IS NOT NULL
    AND (
      p_resend_email_id <> btrim(p_resend_email_id)
      OR char_length(p_resend_email_id) NOT BETWEEN 1 AND 256
    )
  THEN
    RAISE EXCEPTION 'Invalid Resend email identifier';
  END IF;

  normalized_bounce_type := CASE lower(COALESCE(p_bounce_type, ''))
    WHEN 'hard' THEN 'hard'
    WHEN 'soft' THEN 'soft'
    WHEN 'unknown' THEN 'unknown'
    ELSE NULL
  END;

  IF p_event_type = 'email.bounced' AND normalized_bounce_type IS NULL THEN
    RAISE EXCEPTION 'Invalid bounce type';
  END IF;

  normalized_complaint_type := NULLIF(left(btrim(COALESCE(p_complaint_type, 'abuse')), 64), '');

  INSERT INTO public.resend_webhook_events (
    svix_id,
    event_type,
    resend_email_id,
    event_created_at
  )
  VALUES (
    p_svix_id,
    p_event_type,
    p_resend_email_id,
    p_event_created_at
  )
  ON CONFLICT (svix_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    RETURN 'duplicate';
  END IF;

  IF p_event_type NOT IN (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.failed',
    'email.bounced',
    'email.complained',
    'email.suppressed',
    'email.opened',
    'email.clicked'
  ) THEN
    RETURN 'ignored';
  END IF;

  IF p_resend_email_id IS NULL THEN
    RAISE EXCEPTION 'Email identifier is required for this event';
  END IF;

  -- Only this application's own sending domains are ours to record; anything
  -- else is receipted and dropped. mail.getonapod.com is deliberately absent:
  -- it is the address the sibling application still sends from, so listing it
  -- would readmit exactly the traffic this gate exists to keep out.
  sender_domain := lower(btrim(COALESCE(
    substring(p_from_address FROM '@([^@>[:space:]]+)>?[[:space:]]*$'),
    ''
  ), '>'));

  IF sender_domain <> ALL (ARRAY['email.getonapod.com']) THEN
    RETURN 'ignored';
  END IF;

  SELECT email.*
  INTO email_log
  FROM public.email_logs AS email
  WHERE email.resend_email_id = p_resend_email_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Raising rolls back the receipt as well, allowing Resend's retry to find
    -- an email log that committed shortly after the send response. That race
    -- closes in milliseconds, so past the grace window a missing log is not a
    -- late one: it is an email this application sent without logging, and
    -- retrying it forever is what takes the endpoint offline.
    IF p_event_created_at < now() - INTERVAL '5 minutes' THEN
      RETURN 'ignored';
    END IF;

    RAISE EXCEPTION 'Email log is not available';
  END IF;

  incoming_status := CASE p_event_type
    WHEN 'email.sent' THEN 'sent'
    WHEN 'email.delivered' THEN 'delivered'
    WHEN 'email.failed' THEN 'failed'
    WHEN 'email.bounced' THEN 'bounced'
    WHEN 'email.complained' THEN 'complained'
    WHEN 'email.suppressed' THEN 'suppressed'
    ELSE NULL
  END;

  IF incoming_status IS NOT NULL THEN
    incoming_rank := CASE incoming_status
      WHEN 'sent' THEN 1
      WHEN 'delivered' THEN 2
      WHEN 'failed' THEN 3
      WHEN 'bounced' THEN 4
      WHEN 'complained' THEN 5
      WHEN 'suppressed' THEN 6
      ELSE 0
    END;
    current_rank := CASE email_log.status
      WHEN 'sent' THEN 1
      WHEN 'delivered' THEN 2
      WHEN 'failed' THEN 3
      WHEN 'bounced' THEN 4
      WHEN 'complained' THEN 5
      WHEN 'suppressed' THEN 6
      ELSE 0
    END;

    -- A lower-precedence retry (for example sent after delivered) cannot
    -- regress a later or terminal outcome.
    IF incoming_rank >= current_rank THEN
      UPDATE public.email_logs
      SET
        status = incoming_status,
        metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
          'resend_status_event_type', p_event_type,
          'resend_status_event_at', p_event_created_at
        )
      WHERE id = email_log.id;
      email_log.status := incoming_status;
      email_log.metadata := COALESCE(email_log.metadata, '{}'::JSONB) || jsonb_build_object(
        'resend_status_event_type', p_event_type,
        'resend_status_event_at', p_event_created_at
      );
    END IF;
  END IF;

  CASE p_event_type
    WHEN 'email.delivery_delayed' THEN
      UPDATE public.email_logs
      SET metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
        'delivery_delayed', true,
        'delayed_at', p_event_created_at
      )
      WHERE id = email_log.id;

    WHEN 'email.bounced' THEN
      UPDATE public.email_logs
      SET bounce_type = CASE
        WHEN CASE COALESCE(bounce_type, '')
          WHEN 'unknown' THEN 1
          WHEN 'soft' THEN 2
          WHEN 'hard' THEN 3
          ELSE 0
        END >= CASE normalized_bounce_type
          WHEN 'unknown' THEN 1
          WHEN 'soft' THEN 2
          WHEN 'hard' THEN 3
          ELSE 0
        END
          THEN bounce_type
        ELSE normalized_bounce_type
      END
      WHERE id = email_log.id;

    WHEN 'email.complained' THEN
      UPDATE public.email_logs
      SET complaint_type = COALESCE(normalized_complaint_type, 'abuse')
      WHERE id = email_log.id;

    WHEN 'email.opened' THEN
      UPDATE public.email_logs
      SET
        opened_at = CASE
          WHEN opened_at IS NULL OR p_event_created_at < opened_at
            THEN p_event_created_at
          ELSE opened_at
        END,
        open_count = GREATEST(COALESCE(open_count, 0), 0) + 1
      WHERE id = email_log.id;

    WHEN 'email.clicked' THEN
      UPDATE public.email_logs
      SET
        clicked_at = CASE
          WHEN clicked_at IS NULL OR p_event_created_at < clicked_at
            THEN p_event_created_at
          ELSE clicked_at
        END,
        click_count = GREATEST(COALESCE(click_count, 0), 0) + 1
      WHERE id = email_log.id;

    ELSE
      NULL;
  END CASE;

  IF p_event_type IN ('email.bounced', 'email.complained', 'email.suppressed') THEN
    normalized_address := lower(btrim(COALESCE(email_log.to_address, '')));
    IF normalized_address = '' OR char_length(normalized_address) > 320 THEN
      RAISE EXCEPTION 'Email log recipient is invalid';
    END IF;

    IF p_event_type = 'email.suppressed' THEN
      -- A provider-side suppression is not itself a new bounce. Preserve the
      -- historical bounce count while ensuring future sends are blocked.
      INSERT INTO public.email_bounces AS existing (
        email_address,
        bounce_type,
        bounce_count,
        first_bounced_at,
        last_bounced_at,
        suppressed,
        suppressed_at
      )
      VALUES (
        normalized_address,
        'suppressed',
        0,
        NULL,
        NULL,
        true,
        p_event_created_at
      )
      ON CONFLICT (email_address) DO UPDATE
      SET
        bounce_type = CASE
          WHEN CASE existing.bounce_type
            WHEN 'complaint' THEN 5
            WHEN 'spam' THEN 5
            WHEN 'hard' THEN 4
            WHEN 'suppressed' THEN 3
            WHEN 'soft' THEN 2
            WHEN 'unknown' THEN 1
            ELSE 0
          END >= 3
            THEN existing.bounce_type
          ELSE EXCLUDED.bounce_type
        END,
        suppressed = true,
        suppressed_at = CASE
          WHEN existing.suppressed_at IS NULL THEN EXCLUDED.suppressed_at
          ELSE LEAST(existing.suppressed_at, EXCLUDED.suppressed_at)
        END,
        updated_at = now();
    ELSE
      INSERT INTO public.email_bounces AS existing (
        email_address,
        bounce_type,
        bounce_count,
        first_bounced_at,
        last_bounced_at,
        suppressed,
        suppressed_at
      )
      VALUES (
        normalized_address,
        CASE
          WHEN p_event_type = 'email.complained' THEN 'complaint'
          ELSE normalized_bounce_type
        END,
        1,
        p_event_created_at,
        p_event_created_at,
        p_event_type = 'email.complained' OR normalized_bounce_type = 'hard',
        CASE
          WHEN p_event_type = 'email.complained' OR normalized_bounce_type = 'hard'
            THEN p_event_created_at
          ELSE NULL
        END
      )
      ON CONFLICT (email_address) DO UPDATE
      SET
        bounce_count = GREATEST(COALESCE(existing.bounce_count, 0), 0) + 1,
        first_bounced_at = CASE
          WHEN existing.first_bounced_at IS NULL THEN EXCLUDED.first_bounced_at
          ELSE LEAST(existing.first_bounced_at, EXCLUDED.first_bounced_at)
        END,
        last_bounced_at = CASE
          WHEN existing.last_bounced_at IS NULL THEN EXCLUDED.last_bounced_at
          ELSE GREATEST(existing.last_bounced_at, EXCLUDED.last_bounced_at)
        END,
        bounce_type = CASE
          WHEN CASE existing.bounce_type
            WHEN 'complaint' THEN 5
            WHEN 'spam' THEN 5
            WHEN 'hard' THEN 4
            WHEN 'suppressed' THEN 3
            WHEN 'soft' THEN 2
            WHEN 'unknown' THEN 1
            ELSE 0
          END >= CASE EXCLUDED.bounce_type
            WHEN 'complaint' THEN 5
            WHEN 'spam' THEN 5
            WHEN 'hard' THEN 4
            WHEN 'suppressed' THEN 3
            WHEN 'soft' THEN 2
            WHEN 'unknown' THEN 1
            ELSE 0
          END
            THEN existing.bounce_type
          ELSE EXCLUDED.bounce_type
        END,
        suppressed = COALESCE(existing.suppressed, false) OR EXCLUDED.suppressed,
        suppressed_at = CASE
          WHEN existing.suppressed_at IS NULL THEN EXCLUDED.suppressed_at
          WHEN EXCLUDED.suppressed_at IS NULL THEN existing.suppressed_at
          ELSE LEAST(existing.suppressed_at, EXCLUDED.suppressed_at)
        END,
        updated_at = now();
    END IF;
  END IF;

  RETURN 'processed';
END;
$$;

COMMIT;
