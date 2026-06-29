
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTable(tableName: string) {
  console.log(`--- Inspecting ${tableName} ---`);
  // Try to insert a dummy row to get error about columns, or select one
  const { data, error } = await supabase.from(tableName).select('*').limit(1);
  
  if (error) {
    console.error(`Error selecting from ${tableName}:`, error.message);
  } else {
    if (data && data.length > 0) {
      console.log('Columns:', Object.keys(data[0]).join(', '));
      console.log('Sample row:', data[0]);
    } else {
      console.log('Table is empty, cannot infer columns from data.');
      // innovative way to get columns: try to select a non-existent column
      const { error: colError } = await supabase.from(tableName).select('non_existent_column').limit(1);
      if (colError) {
         // The error message usually lists valid columns if it's a "Column not found" error, 
         // but PostgREST might just say "Could not find the 'non_existent_column' column of '...'"
         // We'll rely on reading migration files if this fails.
         console.log('Hint from error:', colError.message, colError.hint);
      }
    }
  }
}

async function main() {
  await inspectTable('users');
  await inspectTable('products');
  await inspectTable('product_prizes');
  await inspectTable('draw_records');
}

main();
