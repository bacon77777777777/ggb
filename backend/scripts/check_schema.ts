import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qgziszozkdskdstexsvw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnemlzem96a2Rza2RzdGV4c3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDU2ODksImV4cCI6MjA4NTMyMTY4OX0.3Oa7lo0BaC53MqIIjsGUjg2joKKvuSwhcAKrNNPi_vE';
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
