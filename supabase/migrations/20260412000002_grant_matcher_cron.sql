-- ============================================================
-- Q Analytics — Grant Matcher Cron Schedule
-- Migration: 20260412000002_grant_matcher_cron
--
-- Prerequisites (run ONCE in Supabase SQL Editor before applying
-- this migration — these SET commands require superuser):
--
--   ALTER DATABASE postgres
--     SET "app.supabase_project_url" = 'https://YOUR_PROJECT_REF.supabase.co';
--
--   ALTER DATABASE postgres
--     SET "app.cron_secret" = 'YOUR_CRON_SECRET';
--   (Use the same value you put in the edge function CRON_SECRET secret.)
--
-- Both pg_cron and pg_net are enabled by default on Supabase Pro.
-- On the Free tier, enable them in Dashboard → Database → Extensions.
-- ============================================================

-- Ensure extensions are active
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Remove any previous version of this job ──────────────────────────────────
select cron.unschedule('grant-matcher-weekly')
where exists (
  select 1 from cron.job where jobname = 'grant-matcher-weekly'
);

-- ── Schedule: every Monday at 09:00 UTC ──────────────────────────────────────
--   Cron expression: [min] [hour] [day-of-month] [month] [day-of-week]
--   '0 9 * * 1' = 09:00 UTC, Monday (1)
-- ─────────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'grant-matcher-weekly',   -- unique job name
  '0 9 * * 1',              -- Monday 09:00 UTC
  $$
  select net.http_post(
    url     := current_setting('app.supabase_project_url')
               || '/functions/v1/grant-matcher',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000   -- 2-minute HTTP timeout
  ) as request_id;
  $$
);

-- ── Verify ────────────────────────────────────────────────────────────────────
-- After applying, confirm the job was registered:
--   SELECT jobid, jobname, schedule, command, active
--   FROM cron.job
--   WHERE jobname = 'grant-matcher-weekly';
--
-- To trigger manually for testing (from Supabase SQL Editor):
--   SELECT net.http_post(
--     url     := current_setting('app.supabase_project_url')
--                || '/functions/v1/grant-matcher',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.cron_secret')
--     ),
--     body    := '{}'::jsonb
--   );
--
-- To check net.http_post results (async — give it a few seconds):
--   SELECT id, status_code, content
--   FROM net._http_response
--   ORDER BY created DESC
--   LIMIT 5;
--
-- To pause the job without deleting it:
--   UPDATE cron.job SET active = false WHERE jobname = 'grant-matcher-weekly';
--
-- To resume:
--   UPDATE cron.job SET active = true  WHERE jobname = 'grant-matcher-weekly';
--
-- To remove entirely:
--   SELECT cron.unschedule('grant-matcher-weekly');
-- ============================================================
