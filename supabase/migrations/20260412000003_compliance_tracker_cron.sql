-- ── Q Analytics · compliance-tracker · pg_cron schedule ────────────────────
--
-- Prereqs: app.supabase_project_url and app.cron_secret already set by
-- migration 20260412000002_grant_matcher_cron.sql.
--
-- Schedule: Monday 08:00 UTC (1 hour before grant-matcher at 09:00 UTC).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Remove previous job if it exists ────────────────────────────────────────
select cron.unschedule('compliance-tracker-weekly')
where exists (
  select 1 from cron.job where jobname = 'compliance-tracker-weekly'
);

-- ── Schedule weekly run ───────────────────────────────────────────────────────
select cron.schedule(
  'compliance-tracker-weekly',
  '0 8 * * 1',
  $$
  select net.http_post(
    url     := current_setting('app.supabase_project_url') || '/functions/v1/compliance-tracker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

-- ── Verify the job was registered ────────────────────────────────────────────
-- Run after applying to confirm:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'compliance-tracker-weekly';

-- ── Manual trigger (SQL Editor) ──────────────────────────────────────────────
-- To invoke immediately for testing:
--
--   SELECT net.http_post(
--     url     := current_setting('app.supabase_project_url') || '/functions/v1/compliance-tracker',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.cron_secret')
--     ),
--     body    := '{}'::jsonb
--   );
--
-- Then check the response:
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 1;

-- ── Pause / resume ────────────────────────────────────────────────────────────
-- Pause:   UPDATE cron.job SET active = false WHERE jobname = 'compliance-tracker-weekly';
-- Resume:  UPDATE cron.job SET active = true  WHERE jobname = 'compliance-tracker-weekly';
