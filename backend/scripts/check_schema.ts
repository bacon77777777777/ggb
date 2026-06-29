import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const tables = ['products', 'categories'];
  
  for (const table of tables) {
    console.log(`Checking ${table} schema...`);
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1);

    if (error) {
      console.error(`Error fetching ${table}:`, error.message);
    } else {
      console.log(`${table} exists.`);
      if (data && data.length > 0) {
        console.log(`${table} keys:`, Object.keys(data[0]));
        console.log(`${table} sample:`, data[0]);
      } else {
        console.log(`${table} is empty.`);
      }
    }
  }
}

checkSchema();
