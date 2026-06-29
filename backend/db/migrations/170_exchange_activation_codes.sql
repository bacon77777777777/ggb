BEGIN;

CREATE TABLE IF NOT EXISTS exchange_offer_activation_codes (
  offer_id UUID PRIMARY KEY REFERENCES exchange_offers(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[0-9]{4}$'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exchange_offer_activation_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exchange activation codes: owner can view" ON exchange_offer_activation_codes;
CREATE POLICY "Exchange activation codes: owner can view"
  ON exchange_offer_activation_codes FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM exchange_offers o
      WHERE o.id = exchange_offer_activation_codes.offer_id
        AND o.owner_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.ensure_exchange_offer_activation_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF EXISTS (SELECT 1 FROM exchange_offer_activation_codes c WHERE c.offer_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_code := lpad(((floor(random() * 10000))::int)::text, 4, '0');
  INSERT INTO exchange_offer_activation_codes (offer_id, code) VALUES (NEW.id, v_code);

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.ensure_exchange_offer_activation_code() SET row_security = off;
REVOKE ALL ON FUNCTION public.ensure_exchange_offer_activation_code() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_exchange_offer_activation_code ON exchange_offers;
CREATE TRIGGER trg_exchange_offer_activation_code
AFTER INSERT ON exchange_offers
FOR EACH ROW
EXECUTE FUNCTION public.ensure_exchange_offer_activation_code();

CREATE OR REPLACE FUNCTION public.get_exchange_offer_activation_code(p_offer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  SELECT owner_id INTO v_owner FROM exchange_offers WHERE id = p_offer_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'offer_not_found' USING errcode = 'P0002';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT code INTO v_code FROM exchange_offer_activation_codes WHERE offer_id = p_offer_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'activation_code_missing' USING errcode = 'P0002';
  END IF;

  RETURN v_code;
END;
$$;

ALTER FUNCTION public.get_exchange_offer_activation_code(uuid) SET row_security = off;
REVOKE ALL ON FUNCTION public.get_exchange_offer_activation_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exchange_offer_activation_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_exchange_order_with_code(p_offer_id uuid, p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer_owner uuid;
  v_offer_status text;
  v_existing_id uuid;
  v_existing_initiator uuid;
  v_code text;
  v_new_id uuid;
  v_clean_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  v_clean_code := regexp_replace(COALESCE(p_code, ''), '\D', '', 'g');
  IF length(v_clean_code) <> 4 THEN
    RAISE EXCEPTION 'invalid_code' USING errcode = '22023';
  END IF;

  SELECT owner_id, status INTO v_offer_owner, v_offer_status
  FROM exchange_offers
  WHERE id = p_offer_id;

  IF v_offer_owner IS NULL THEN
    RAISE EXCEPTION 'offer_not_found' USING errcode = 'P0002';
  END IF;

  IF v_offer_status <> 'active' THEN
    RAISE EXCEPTION 'offer_not_active' USING errcode = '22000';
  END IF;

  IF v_offer_owner = auth.uid() THEN
    RAISE EXCEPTION 'cannot_initiate_own_offer' USING errcode = '42501';
  END IF;

  SELECT id, initiator_id INTO v_existing_id, v_existing_initiator
  FROM exchange_orders
  WHERE offer_id = p_offer_id AND done = FALSE AND cancelled = FALSE
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_initiator = auth.uid() THEN
      RETURN v_existing_id;
    END IF;
    RAISE EXCEPTION 'offer_already_started' USING errcode = '23505';
  END IF;

  SELECT code INTO v_code FROM exchange_offer_activation_codes WHERE offer_id = p_offer_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'activation_code_missing' USING errcode = 'P0002';
  END IF;
  IF v_code <> v_clean_code THEN
    RAISE EXCEPTION 'invalid_code' USING errcode = '22023';
  END IF;

  BEGIN
    INSERT INTO exchange_orders (
      offer_id,
      owner_id,
      initiator_id,
      step,
      confirmations,
      recipient,
      tracking_numbers,
      receipt_media,
      ratings,
      done,
      cancelled,
      updated_at
    )
    VALUES (
      p_offer_id,
      v_offer_owner,
      auth.uid(),
      2,
      jsonb_build_object(
        '2', jsonb_build_object('owner', false, 'initiator', false),
        '3', jsonb_build_object('owner', false, 'initiator', false),
        '4', jsonb_build_object('owner', false, 'initiator', false)
      ),
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      FALSE,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_new_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id, initiator_id INTO v_existing_id, v_existing_initiator
      FROM exchange_orders
      WHERE offer_id = p_offer_id AND done = FALSE AND cancelled = FALSE
      LIMIT 1;
      IF v_existing_id IS NOT NULL AND v_existing_initiator = auth.uid() THEN
        RETURN v_existing_id;
      END IF;
      RAISE;
  END;

  INSERT INTO exchange_messages (offer_id, order_id, sender_id, receiver_id, kind, body)
  VALUES (p_offer_id, v_new_id, auth.uid(), v_offer_owner, 'system', '交換已啟動');

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.create_exchange_order_with_code(uuid, text) SET row_security = off;
REVOKE ALL ON FUNCTION public.create_exchange_order_with_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_exchange_order_with_code(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

