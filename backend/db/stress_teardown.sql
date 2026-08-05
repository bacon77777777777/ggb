-- 壓測收尾：清掉 LT- 商品，保留其餘一切
DELETE FROM products WHERE name LIKE 'LT-%';
SELECT (SELECT count(*) FROM products) AS 殘留商品,
       (SELECT count(*) FROM users WHERE is_bot) AS 機器人,
       (SELECT count(*) FROM cron.job WHERE active) AS 啟用排程;
