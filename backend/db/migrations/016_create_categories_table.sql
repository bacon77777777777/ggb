-- Create categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default categories if they don't exist
INSERT INTO categories (name, sort_order)
VALUES 
    ('一番賞', 1),
    ('線上抽', 2),
    ('盲盒', 3),
    ('3C', 4),
    ('福袋', 5)
ON CONFLICT (name) DO NOTHING;

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access" ON categories
    FOR SELECT USING (true);

CREATE POLICY "Allow admin full access" ON categories
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.id = auth.uid()
        )
    );
