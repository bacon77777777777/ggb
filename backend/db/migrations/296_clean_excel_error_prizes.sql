-- 清除因 Excel 公式錯誤匯入的品項名（#NAME?、#REF! 等）
DELETE FROM product_prizes
WHERE name ~ '^#(NAME|REF|VALUE|N/A|DIV/0!|NULL!|NUM!|NA)[?!]?$';
