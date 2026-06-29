DO $$
DECLARE
  v_count int := 10;
  i int;
  j int;
  v_product_id bigint;
  v_total_tickets int;
  v_levels_count int;
  v_points_left int;
  v_levels_left int;
  v_level_total int;
  v_prob numeric;
  v_prob_sum numeric;
  v_temp_total int;
  v_level_label text;
  v_level_totals int[];
  v_level_probs numeric[];
  v_names text[] := ARRAY['A賞','B賞','C賞','D賞','E賞','F賞','G賞','H賞'];
  v_code text;
BEGIN
  FOR i IN 1..v_count LOOP
    v_total_tickets := floor(random() * (43 - 28 + 1))::int + 28;
    v_levels_count  := floor(random() * (6 - 4 + 1))::int + 4;

    v_code := format('IK-%s-%02s-%s',
                     to_char(clock_timestamp(), 'YYYYMMDD'),
                     i,
                     lpad(floor(random()*100000)::int::text, 5, '0'));

    INSERT INTO public.products
      (product_code, name, category, price, status, is_hot, total_count, remaining, type, image_url)
    VALUES
      (v_code, format('一番賞 第%02s彈', i), '一番賞', 100,
       'active', (random() < 0.2), v_total_tickets, v_total_tickets, 'ichiban', NULL)
    RETURNING id INTO v_product_id;

    v_level_totals := ARRAY[]::int[];
    v_points_left := v_total_tickets;
    v_levels_left := v_levels_count;

    FOR j IN 1..v_levels_count LOOP
      IF j = v_levels_count THEN
        v_level_total := v_points_left;
      ELSE
        v_level_total := GREATEST(
          1,
          LEAST(
            floor((v_points_left::numeric / v_levels_left) * (0.7 + random()*0.6))::int,
            v_points_left - (v_levels_left - 1)
          )
        );
      END IF;
      v_level_totals := v_level_totals || v_level_total;
      v_points_left := v_points_left - v_level_total;
      v_levels_left := v_levels_left - 1;
    END LOOP;

    v_temp_total := 0;
    FOREACH v_level_total IN ARRAY v_level_totals LOOP
      v_temp_total := v_temp_total + v_level_total;
    END LOOP;

    v_level_probs := ARRAY[]::numeric[];
    v_prob_sum := 0;
    FOR j IN 1..array_length(v_level_totals, 1) LOOP
      v_prob := round((v_level_totals[j]::numeric / v_temp_total::numeric) * 100::numeric, 2);
      v_level_probs := v_level_probs || v_prob;
      v_prob_sum := v_prob_sum + v_prob;
    END LOOP;

    IF v_prob_sum <> 100 THEN
      v_level_probs[array_length(v_level_probs,1)] :=
        v_level_probs[array_length(v_level_probs,1)] + (100 - v_prob_sum);
    END IF;

    FOR j IN 1..array_length(v_level_totals, 1) LOOP
      v_level_label := COALESCE(v_names[j], format('等級%s', j));
      INSERT INTO public.product_prizes
        (product_id, level, name, image_url, total, remaining, probability)
      VALUES
        (v_product_id, v_level_label, v_level_label || ' 獎', NULL,
         v_level_totals[j], v_level_totals[j], v_level_probs[j]);
    END LOOP;

    INSERT INTO public.product_prizes
      (product_id, level, name, image_url, total, remaining, probability)
    VALUES
      (v_product_id, 'Last One', '最後賞', NULL, 1, 1, 0);
  END LOOP;
END $$;

