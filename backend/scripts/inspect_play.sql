select pg_get_functiondef(p.oid) as def
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public'
  and proname = 'play_ichiban'
  and pg_get_function_identity_arguments(p.oid) = 'p_product_id bigint, p_ticket_numbers integer[]';
