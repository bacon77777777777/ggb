-- Add image_url to products if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'image_url') THEN 
    ALTER TABLE products ADD COLUMN image_url TEXT; 
  END IF; 
END $$;

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default categories if table is empty
INSERT INTO categories (name, sort_order)
SELECT '一番賞', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '一番賞');

INSERT INTO categories (name, sort_order)
SELECT '模型公仔', 2
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '模型公仔');

INSERT INTO categories (name, sort_order)
SELECT '周邊商品', 3
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '周邊商品');

INSERT INTO categories (name, sort_order)
SELECT '限定商品', 4
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '限定商品');

INSERT INTO categories (name, sort_order)
SELECT '轉蛋', 5
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '轉蛋');

INSERT INTO categories (name, sort_order)
SELECT '盒玩', 6
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '盒玩');
