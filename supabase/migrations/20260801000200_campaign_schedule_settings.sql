-- When a campaign sends, and how long it waits between steps.
--
-- Both were hardcoded, and one of them was wrong. The schedule was built with
-- days 0 through 4 set and labelled "Weekdays", but Instantly indexes from
-- Sunday, so every campaign this app created sent Sunday through Thursday and
-- never on Friday. The default below is the intended Monday-to-Friday.
--
-- Existing rows take that default. Their Instantly schedules are not touched
-- here: the campaign is the provider's record, and a migration silently moving
-- when a live campaign emails people is not something a schema change should
-- do. The next settings save pushes the corrected schedule, because that path
-- already sends the whole configuration.

ALTER TABLE public.workspace_client_campaigns
  ADD COLUMN IF NOT EXISTS send_days SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::SMALLINT[];

ALTER TABLE public.workspace_client_campaigns
  ADD COLUMN IF NOT EXISTS send_window_start TEXT NOT NULL DEFAULT '09:00';

ALTER TABLE public.workspace_client_campaigns
  ADD COLUMN IF NOT EXISTS send_window_end TEXT NOT NULL DEFAULT '17:00';

-- Days measured from the previous email, which is how Instantly reads them and
-- how an operator thinks about a follow-up: "chase six days later".
ALTER TABLE public.workspace_client_campaigns
  ADD COLUMN IF NOT EXISTS follow_up_one_delay_days SMALLINT NOT NULL DEFAULT 6;

ALTER TABLE public.workspace_client_campaigns
  ADD COLUMN IF NOT EXISTS follow_up_two_delay_days SMALLINT NOT NULL DEFAULT 7;

DO $$
BEGIN
  -- A campaign with no sending day never sends, and would sit looking healthy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_client_campaigns_send_days_valid'
  ) THEN
    ALTER TABLE public.workspace_client_campaigns
      ADD CONSTRAINT workspace_client_campaigns_send_days_valid
      CHECK (
        array_length(send_days, 1) BETWEEN 1 AND 7
        AND send_days <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_client_campaigns_send_window_valid'
  ) THEN
    ALTER TABLE public.workspace_client_campaigns
      ADD CONSTRAINT workspace_client_campaigns_send_window_valid
      CHECK (
        send_window_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND send_window_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND send_window_start < send_window_end
      );
  END IF;

  -- Under three days reads as pestering; the upper bound stops a typo parking a
  -- follow-up a year out where nobody would notice it never arrived.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_client_campaigns_follow_up_delays_valid'
  ) THEN
    ALTER TABLE public.workspace_client_campaigns
      ADD CONSTRAINT workspace_client_campaigns_follow_up_delays_valid
      CHECK (
        follow_up_one_delay_days BETWEEN 1 AND 60
        AND follow_up_two_delay_days BETWEEN 1 AND 60
      );
  END IF;
END $$;

COMMENT ON COLUMN public.workspace_client_campaigns.send_days IS
  'Days the campaign may send, indexed as Instantly does: 0 is Sunday through 6 is Saturday.';
COMMENT ON COLUMN public.workspace_client_campaigns.follow_up_one_delay_days IS
  'Days after the opening email before the first follow-up.';
COMMENT ON COLUMN public.workspace_client_campaigns.follow_up_two_delay_days IS
  'Days after the first follow-up before the second.';
