
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials')
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function migrate() {
  console.log('Starting migration...')
  
  // Fetch prizes
  const { data: prizes, error: fetchError } = await supabase
    .from('prizes')
    .select('*')
  
  if (fetchError) {
    console.error('Error fetching prizes:', fetchError)
    return
  }

  console.log(`Found ${prizes.length} prizes to migrate.`)

  // 1. Restore missing products
  const productIds = [...new Set(prizes.map(p => p.product_id))]
  console.log(`Checking ${productIds.length} unique product IDs...`)

  const { data: existingProducts, error: prodCheckError } = await supabase
    .from('products')
    .select('id')
    .in('id', productIds)
  
  if (prodCheckError) {
    console.error('Error checking products:', prodCheckError)
    return
  }

  const existingIds = existingProducts?.map(p => p.id) || []
  const missingIds = productIds.filter(id => !existingIds.includes(id))

  if (missingIds.length > 0) {
    console.log(`Restoring ${missingIds.length} missing products:`, missingIds)
    
    for (const pid of missingIds) {
      const { error: insertProdError } = await supabase
        .from('products')
        .insert({
          id: pid,
          product_code: `RESTORED-${pid}`,
          name: `Restored Product ${pid}`,
          category: '一番賞', // Default category
          price: 300, // Default price
          remaining: 0, // Will be updated later or stays 0
          status: 'active',
          total_count: 0
        })
      
      if (insertProdError) {
        console.error(`Error restoring product ${pid}:`, insertProdError)
      } else {
        console.log(`Restored product ${pid}`)
      }
    }
  } else {
    console.log('All products exist.')
  }

  // 2. Migrate prizes
  for (const prize of prizes) {
    // Check if exists
    const { data: existing, error: checkError } = await supabase
      .from('product_prizes')
      .select('id')
      .eq('product_id', prize.product_id)
      .eq('level', prize.grade)
      .maybeSingle()
    
    if (checkError) {
      console.error('Error checking existence:', checkError)
      continue
    }

    if (existing) {
      console.log(`Prize ${prize.grade} for product ${prize.product_id} already exists.`)
      continue
    }

    // Insert
    const { error: insertError } = await supabase
      .from('product_prizes')
      .insert({
        product_id: prize.product_id,
        level: prize.grade,
        name: prize.name,
        image_url: prize.image_url,
        total: prize.quantity,
        remaining: prize.quantity,
        probability: prize.probability
      })
      
    if (insertError) {
      console.error(`Error inserting prize ${prize.grade}:`, insertError)
    } else {
      console.log(`Migrated prize ${prize.grade} for product ${prize.product_id}`)
    }
  }
  
  console.log('Migration complete.')
}

migrate()
