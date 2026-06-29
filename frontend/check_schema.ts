
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
  console.log('Listing all tables...')
  // Only works if we have access to information_schema or similar
  // Or we can try to guess.
  
  console.log('\nChecking Products columns...');
  const { error: remainingError } = await supabase.from('products').select('remaining').limit(1);
  if (remainingError) {
      console.log('Column "remaining" check failed:', remainingError.message);
  } else {
      console.log('Column "remaining" exists.');
  }

  const { error: remainingCountError } = await supabase.from('products').select('remaining_count').limit(1);
  if (remainingCountError) {
      console.log('Column "remaining_count" check failed:', remainingCountError.message);
  } else {
      console.log('Column "remaining_count" exists.');
  }

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name');

  if (productsError) {
    console.error('Error fetching products:', productsError);
  } else {
    console.log(`Found ${products.length} products:`, products.map(p => p.id));
  }

  const { data: prizes, error: prizesError } = await supabase
    .from('prizes')
    .select('*')
    .order('product_id');

  if (prizesError) {
      console.error('Error fetching prizes:', prizesError);
    } else {
      if (prizes.length > 0) {
        console.log('Sample prize:', prizes[0]);
      }
      const prizeProductIds = [...new Set(prizes.map(p => p.product_id))];
    console.log(`Found prizes for ${prizeProductIds.length} product IDs:`, prizeProductIds);
    
    const missingProductIds = prizeProductIds.filter(id => !products?.some(p => p.id === id));
    if (missingProductIds.length > 0) {
      console.error('WARNING: Prizes exist for missing product IDs:', missingProductIds);
    } else {
      console.log('All prizes map to existing products.');
    }
  }

  console.log('Checking draw_records count...')
  const { count: recordsCount, error: recordsError } = await supabase
    .from('draw_records')
    .select('*', { count: 'exact', head: true })

  if (recordsError) {
    console.error('Error checking draw_records:', recordsError)
  } else {
    console.log('draw_records count:', recordsCount)
  }
}

checkSchema()
