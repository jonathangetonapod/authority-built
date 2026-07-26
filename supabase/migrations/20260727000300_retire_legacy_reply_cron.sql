-- Retire the legacy Email Bison reply-classification cron.
--
-- fetch-and-classify-replies-hourly was scheduled outside this repo and
-- called the legacy Bison classifier every hour. It failed on all 168 runs
-- in the week before removal, nothing in the application references that
-- function, and the Master Inbox with its Instantly-based classification
-- replaced the workflow entirely.
--
-- It also embedded a service-role JWT in plaintext inside the cron command,
-- readable by anyone who can select from cron.job. Unscheduling removes that
-- copy of the key; rotate the service-role key separately.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-and-classify-replies-hourly') THEN
    PERFORM cron.unschedule('fetch-and-classify-replies-hourly');
  END IF;
END;
$$;
