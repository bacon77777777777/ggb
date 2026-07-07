-- Migration 286: Revoke public EXECUTE on sensitive token-related functions
--
-- Root cause: Several SECURITY DEFINER functions were callable by anon/authenticated,
-- allowing unauthenticated or unprivileged users to manipulate token balances.
--
-- Confirmed callers of increment_user_tokens and confirm_topup_order all use
-- getSupabaseAdmin() (service_role) and are unaffected by these revocations.
--
-- Pattern: REVOKE FROM PUBLIC first (removes the = grant), then explicitly GRANT
-- back to roles that legitimately need access.

-- CRITICAL: No internal auth check. Any caller can increment any user's tokens.
REVOKE EXECUTE ON FUNCTION public.increment_user_tokens(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- CRITICAL: Any authenticated player can self-topup free tokens indefinitely.
-- Only callable from backend service_role API routes.
REVOKE EXECUTE ON FUNCTION public.process_test_topup(numeric, numeric) FROM PUBLIC, anon, authenticated;

-- Should only be called by ECPay webhook (service_role). Three overloads exist.
REVOKE EXECUTE ON FUNCTION public.confirm_topup_order(character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_topup_order(character varying, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_topup_order(character varying, text, text, integer) FROM PUBLIC, anon, authenticated;

-- Frontend-callable functions with internal auth.uid() checks — keep authenticated access,
-- remove anon (unauthenticated users should never reach these).
REVOKE EXECUTE ON FUNCTION public.play_gacha(bigint, integer, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.play_gacha(bigint, integer, boolean, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.dismantle_prizes(bigint[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismantle_prizes(bigint[], uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_delivery_order(uuid, text, text, text, text, text, text, text, bigint[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_delivery_order(uuid, text, text, text, text, text, text, text, bigint[], integer) TO authenticated, service_role;
