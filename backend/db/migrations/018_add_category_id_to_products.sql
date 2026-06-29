-- Add category_id column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

-- Populate category_id based on existing category name
UPDATE products
SET category_id = categories.id
FROM categories
WHERE products.category = categories.name;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
