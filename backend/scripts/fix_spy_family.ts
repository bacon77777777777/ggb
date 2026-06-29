
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixSpyFamily() {
  console.log('Finding SPY×FAMILY product...')
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%SPY×FAMILY%')
  
  if (prodError) {
    console.error('Error finding product:', prodError)
    return
  }

  if (!products || products.length === 0) {
    console.log('No SPY×FAMILY product found.')
    return
  }

  // There might be multiple, let's pick the one with "甜蜜約會" if possible, or list them
  const product = products.find(p => p.name.includes('甜蜜約會')) || products[0]
  
  console.log('Found product:', {
    id: product.id,
    name: product.name,
    remaining: product.remaining,
    total_count: product.total_count
  })

  // 1. Get Draw Records (Sold Tickets)
  const { data: records, error: recordError } = await supabase
    .from('draw_records')
    .select('*')
    .eq('product_id', product.id)
  
  if (recordError) {
    console.error('Error fetching records:', recordError)
    return
  }

  // Filter out invalid tickets if any (ticket_number 0 is Last One, we usually ignore it for remaining count of normal tickets)
  // Actually, product.remaining usually tracks normal tickets.
  const soldTickets = records?.filter(r => r.ticket_number > 0).map(r => r.ticket_number) || []
  const soldCount = soldTickets.length
  
  console.log(`Sold Tickets Count (from draw_records): ${soldCount}`)
  
  const calculatedRemaining = product.total_count - soldCount
  console.log(`Calculated Remaining (Total - Sold): ${calculatedRemaining}`)
  console.log(`Current Product Remaining: ${product.remaining}`)

  // 2. Get Product Prizes
  const { data: prizes, error: prizeError } = await supabase
    .from('product_prizes')
    .select('*')
    .eq('product_id', product.id)
    // .order('created_at') // created_at might not exist


  if (prizeError) {
    console.error('Error fetching prizes:', prizeError)
    return
  }

  console.log('\n--- Prize Status Analysis ---')
  let prizeSumRemaining = 0
  let prizeSumCalculated = 0
  
  for (const prize of prizes || []) {
    // Skip Last One for remaining sum calculation usually? 
    // Usually remaining count displayed on UI sums up all normal prizes.
    if (['Last One', 'LAST ONE', '最後賞'].includes(prize.level)) {
        console.log(`[${prize.level}] ${prize.name}: Remaining=${prize.remaining} (Ignored for total sum)`)
        continue
    }

    // Calculate how many of THIS prize have been won
    const wonCount = records?.filter(r => r.product_prize_id === prize.id).length || 0
    const correctRemaining = prize.total - wonCount
    
    console.log(`[${prize.level}] ${prize.name}:`)
    console.log(`  - Total: ${prize.total}`)
    console.log(`  - Won: ${wonCount}`)
    console.log(`  - Current Remaining: ${prize.remaining}`)
    console.log(`  - Correct Remaining: ${correctRemaining}`)
    
    if (prize.remaining !== correctRemaining) {
        console.log(`  >>> MISMATCH DETECTED for ${prize.name}`)
    }

    prizeSumRemaining += prize.remaining
    prizeSumCalculated += correctRemaining
  }

  console.log('\n--- Summary ---')
  console.log(`Product Remaining (DB): ${product.remaining}`)
  console.log(`Sum of Prize Remaining (DB): ${prizeSumRemaining}`)
  console.log(`Actual Available Tickets (Total - Sold): ${calculatedRemaining}`)
  console.log(`Sum of Actual Prize Remaining (Calculated): ${prizeSumCalculated}`)

  // FIX LOGIC
  if (calculatedRemaining !== product.remaining || prizeSumCalculated !== prizeSumRemaining) {
    console.log('\n!!! INCONSISTENCY FOUND !!!')
    console.log('Applying fixes...')

    // 1. Update Product Remaining
    if (calculatedRemaining !== product.remaining) {
        console.log(`Updating product.remaining from ${product.remaining} to ${calculatedRemaining}...`)
        const { error: updateProdError } = await supabase
            .from('products')
            .update({ remaining: calculatedRemaining })
            .eq('id', product.id)
        
        if (updateProdError) console.error('Error updating product:', updateProdError)
        else console.log('Product updated.')
    }

    // 2. Update Prize Remaining
    for (const prize of prizes || []) {
        if (['Last One', 'LAST ONE', '最後賞'].includes(prize.level)) continue

        const wonCount = records?.filter(r => r.product_prize_id === prize.id).length || 0
        const correctRemaining = prize.total - wonCount

        if (prize.remaining !== correctRemaining) {
            console.log(`Updating prize [${prize.level}] remaining from ${prize.remaining} to ${correctRemaining}...`)
            const { error: updatePrizeError } = await supabase
                .from('product_prizes')
                .update({ remaining: correctRemaining })
                .eq('id', prize.id)
            
            if (updatePrizeError) console.error(`Error updating prize ${prize.id}:`, updatePrizeError)
            else console.log(`Prize [${prize.level}] updated.`)
        }
    }
    
    console.log('Fixes applied.')
  } else {
    console.log('\nNo inconsistency found.')
  }

}

fixSpyFamily()
