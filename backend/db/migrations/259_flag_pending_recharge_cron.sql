-- W2-5: flag-pending-recharge every 15 minutes
SELECT cron.schedule(
  'flag-pending-recharge',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.base_url') || '/api/cron/flag-pending-recharge',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-cron-secret',  current_setting('app.cron_secret')
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
