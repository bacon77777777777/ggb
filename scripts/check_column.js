
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProductSchema() {
  console.log('Checking products table schema...');
  
  // Try to select category_id
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category_id')
    .limit(1);

  if (error) {
    console.error('Error selecting category_id:', error);
  } else {
    console.log('Successfully selected category_id:', data);
  }
}

checkProductSchema();
