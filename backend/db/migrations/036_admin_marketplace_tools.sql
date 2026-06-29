BEGIN;

CREATE OR REPLACE FUNCTION admin_clear_market_and_recycle_pool()
RETURNS JSONB AS $$
DECLARE
  v_reset_records INTEGER := 0;
  v_deleted_transactions INTEGER := 0;
  v_deleted_listings INTEGER := 0;
  v_deleted_recycle INTEGER := 0;
BEGIN
  UPDATE draw_records
  SET status = 'in_warehouse'
  WHERE status = 'listing'
    AND id IN (SELECT draw_record_id FROM marketplace_listings);

  GET DIAGNOSTICS v_reset_records = ROW_COUNT;

  DELETE FROM marketplace_transactions;
  GET DIAGNOSTICS v_deleted_transactions = ROW_COUNT;

  DELETE FROM marketplace_listings;
  GET DIAGNOSTICS v_deleted_listings = ROW_COUNT;

  DELETE FROM admin_recycle_pool;
  GET DIAGNOSTICS v_deleted_recycle = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'reset_records', v_reset_records,
    'deleted_transactions', v_deleted_transactions,
    'deleted_listings', v_deleted_listings,
    'deleted_recycle', v_deleted_recycle
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

