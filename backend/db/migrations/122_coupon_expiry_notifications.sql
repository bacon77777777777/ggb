ALTER TABLE user_coupons
ADD COLUMN IF NOT EXISTS expiry_reminder_sent BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.process_coupon_expiry_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT uc.id,
           uc.user_id,
           uc.expiry_date,
           c.title
    FROM user_coupons uc
    JOIN coupons c ON c.id = uc.coupon_id
    WHERE uc.status = 'unused'
      AND uc.expiry_date IS NOT NULL
      AND uc.expiry_date > v_now
      AND uc.expiry_date <= v_now + INTERVAL '3 days'
      AND COALESCE(uc.expiry_reminder_sent, FALSE) = FALSE
  LOOP
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      link,
      meta
    )
    VALUES (
      r.user_id,
      'coupon',
      '優惠券即將到期提醒',
      format('您的一張優惠券「%s」即將於 %s 到期，請儘快使用。', r.title, to_char(r.expiry_date, 'YYYY-MM-DD')),
      '/profile?tab=coupons',
      jsonb_build_object(
        'user_coupon_id', r.id,
        'title', r.title,
        'expiry_date', r.expiry_date
      )
    );

    UPDATE user_coupons
    SET expiry_reminder_sent = TRUE
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

