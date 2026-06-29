UPDATE public.products
SET image_url = regexp_replace(btrim(image_url), '\\)+$', '')
WHERE image_url IS NOT NULL
  AND image_url <> regexp_replace(btrim(image_url), '\\)+$', '');

UPDATE public.product_prizes
SET image_url = regexp_replace(btrim(image_url), '\\)+$', '')
WHERE image_url IS NOT NULL
  AND image_url <> regexp_replace(btrim(image_url), '\\)+$', '');
