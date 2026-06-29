
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

async function fixAllProducts() {
  console.log('Fetching all products...')
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('*')
    .order('id')
  
  if (prodError) {
    console.error('Error fetching products:', prodError)
    return
  }

  console.log(`Found ${products?.length || 0} products. Starting check...`)

  for (const product of products || []) {
    // console.log(`\nChecking Product [${product.id}] ${product.name}...`)

    // 1. Get Draw Records (Sold Tickets)
    const { data: records, error: recordError } = await supabase
        .from('draw_records')
        .select('*') // Select all to filter correctly
        .eq('product_id', product.id)
    
    if (recordError) {
        console.error(`Error fetching records for product ${product.id}:`, recordError)
        continue
    }

    // Filter out invalid tickets if any (ticket_number 0 is Last One, we usually ignore it for remaining count of normal tickets)
    // Actually, product.remaining usually tracks normal tickets.
    const soldTickets = records?.filter(r => r.ticket_number > 0).map(r => r.ticket_number) || []
    const soldCount = soldTickets.length
    const calculatedRemaining = product.total_count - soldCount
    
    // 2. Get Product Prizes
    const { data: prizes, error: prizeError } = await supabase
        .from('product_prizes')
        .select('*')
        .eq('product_id', product.id)
    
    if (prizeError) {
        console.error(`Error fetching prizes for product ${product.id}:`, prizeError)
        continue
    }

    let prizeSumRemaining = 0
    let prizeSumCalculated = 0
    let prizeUpdates: any[] = []

    for (const prize of prizes || []) {
        if (['Last One', 'LAST ONE', '最後賞'].includes(prize.level)) continue

        const wonCount = records?.filter(r => r.product_prize_id === prize.id).length || 0
        const correctRemaining = prize.total - wonCount
        
        prizeSumRemaining += prize.remaining
        prizeSumCalculated += correctRemaining

        if (prize.remaining !== correctRemaining) {
            prizeUpdates.push({
                prize,
                correctRemaining
            })
        }
    }

    // Check for inconsistencies
    const productRemainingMismatch = calculatedRemaining !== product.remaining
    const prizeSumMismatch = prizeSumCalculated !== prizeSumRemaining
    const hasPrizeUpdates = prizeUpdates.length > 0

    if (productRemainingMismatch || hasPrizeUpdates) {
        console.log(`\n[FIX NEEDED] Product [${product.id}] ${product.name}`)
        console.log(`  - Total: ${product.total_count}, Sold: ${soldCount}`)
        console.log(`  - Product Remaining: DB=${product.remaining}, Calc=${calculatedRemaining}`)
        // console.log(`  - Prize Sum Remaining: DB=${prizeSumRemaining}, Calc=${prizeSumCalculated}`)
        
        if (productRemainingMismatch) {
            console.log(`  >>> Updating product.remaining to ${calculatedRemaining}`)
            const { error } = await supabase
                .from('products')
                .update({ remaining: calculatedRemaining })
                .eq('id', product.id)
            if (error) console.error('  Error updating product:', error)
        }

        if (hasPrizeUpdates) {
            for (const update of prizeUpdates) {
                console.log(`  >>> Updating prize [${update.prize.level}] ${update.prize.name} remaining: ${update.prize.remaining} -> ${update.correctRemaining}`)
                const { error } = await supabase
                    .from('product_prizes')
                    .update({ remaining: update.correctRemaining })
                    .eq('id', update.prize.id)
                if (error) console.error(`  Error updating prize ${update.prize.id}:`, error)
            }
        }
    } else {
        // console.log(`  OK.`)
    }
  }

  console.log('\nAll products checked.')
}

fixAllProducts()
