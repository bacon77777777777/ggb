import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qgziszozkdskdstexsvw.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnemlzem96a2Rza2RzdGV4c3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDU2ODksImV4cCI6MjA4NTMyMTY4OX0.3Oa7lo0BaC53MqIIjsGUjg2joKKvuSwhcAKrNNPi_vE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCategoryIntegrity() {
  console.log('Fetching products...');
  const { data: products, error: pError } = await supabase
    .from('products')
    .select('id, name, category');

  if (pError) {
    console.error('Error fetching products:', pError);
    return;
  }

  console.log('Fetching categories...');
  const { data: categories, error: cError } = await supabase
    .from('categories')
    .select('id, name');

  if (cError) {
    console.error('Error fetching categories:', cError);
    return;
  }

  const categoryNames = new Set(categories.map(c => c.name));
  const missingCategories = new Set();

  console.log(`Checking ${products.length} products against ${categories.length} categories...`);

  products.forEach(p => {
    if (p.category && !categoryNames.has(p.category)) {
      missingCategories.add(p.category);
      console.log(`Product "${p.name}" (ID: ${p.id}) has unknown category: "${p.category}"`);
    }
  });

  if (missingCategories.size > 0) {
    console.log('Found missing categories:', Array.from(missingCategories));
    console.log('You should create these categories before migrating.');
  } else {
    console.log('All product categories exist in the categories table. Safe to migrate.');
  }
}

checkCategoryIntegrity();
