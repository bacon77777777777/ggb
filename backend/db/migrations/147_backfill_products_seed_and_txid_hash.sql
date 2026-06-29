CREATE EXTENSION IF NOT EXISTS "pgcrypto";

UPDATE public.products
SET seed = encode(gen_random_bytes(32), 'hex')
WHERE seed IS NULL OR seed = '';

UPDATE public.products
SET txid_hash = encode(digest(seed, 'sha256'), 'hex')
WHERE (txid_hash IS NULL OR txid_hash = '')
  AND seed IS NOT NULL
  AND seed <> '';
