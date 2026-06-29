
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qgziszozkdskdstexsvw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnemlzem96a2Rza2RzdGV4c3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDU2ODksImV4cCI6MjA4NTMyMTY4OX0.3Oa7lo0BaC53MqIIjsGUjg2joKKvuSwhcAKrNNPi_vE'
const supabase = createClient(supabaseUrl, supabaseKey)

async function fixDemonSlayer() {
  console.log('Finding Demon Slayer product...')
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%鬼滅%')
  
  if (prodError) {
    console.error('Error finding product:', prodError)
    return
  }

  if (!products || products.length === 0) {
    console.log('No Demon Slayer product found.')
    return
  }

  const product = products[0]
  console.log('Found product:', {
    id: product.id,
    name: product.name,
    remaining: product.remaining,
    total_count: product.total_count
  })

  // Check Prizes
  const { data: prizes, error: prizeError } = await supabase
    .from('product_prizes')
    .select('*')
    .eq('product_id', product.id)
  
  if (prizeError) {
    console.error('Error fetching prizes:', prizeError)
    return
  }

  const normalPrizes = prizes?.filter(p => !['Last One', 'LAST ONE', '最後賞'].includes(p.level)) || []
  const normalRemaining = normalPrizes.reduce((sum, p) => sum + p.remaining, 0)
  
  console.log('Normal Prizes Remaining:', normalRemaining)
  
  const lastOnePrize = prizes?.find(p => ['Last One', 'LAST ONE', '最後賞'].includes(p.level))
  console.log('Last One Prize:', lastOnePrize ? { id: lastOnePrize.id, remaining: lastOnePrize.remaining } : 'None')

  // Check Draw Records
  const { data: records, error: recordError } = await supabase
    .from('draw_records')
    .select('*') // Select all to see schema
    .eq('product_id', product.id)
  
  if (recordError) {
    console.error('Error fetching records:', recordError)
    return
  }

  if (records && records.length > 0) {
      console.log('Sample Record:', records[0])
  }

  const soldTickets = records?.map(r => r.ticket_number).filter(n => n !== 0 && n !== null) || []
  console.log('Sold Tickets Count:', soldTickets.length)

  const lastOneRecord = records?.find(r => r.ticket_number === 0)
  console.log('Last One Record (ticket 0) Exists:', !!lastOneRecord)
  
  const isLastOneFlagged = records?.find(r => r.is_last_one)
  console.log('Record with is_last_one=true Exists:', !!isLastOneFlagged)

  if (lastOneRecord && !lastOneRecord.is_last_one) {
      console.log('Found Last One record (ticket 0) but is_last_one is false. Updating...')
      const { error: updateError } = await supabase
          .from('draw_records')
          .update({ is_last_one: true })
          .eq('id', lastOneRecord.id)
      
      if (updateError) {
          console.error('Error updating Last One record:', updateError)
      } else {
          console.log('Successfully updated Last One record to is_last_one = true.')
      }
  }

  // ANALYSIS
  const missingCount = product.total_count - soldTickets.length
  
  if ((product.remaining > 0 && normalRemaining === 0) || (product.remaining === 0 && missingCount > 0)) {
    console.log('MISMATCH DETECTED: Inconsistent state found.')
    console.log(`Product Remaining: ${product.remaining}`)
    console.log(`Normal Prizes Remaining: ${normalRemaining}`)
    console.log(`Total Count: ${product.total_count}`)
    console.log(`Sold Tickets: ${soldTickets.length}`)
    console.log(`Missing Tickets: ${missingCount}`)
    
    // Fix Product Remaining if needed
    if (product.remaining > 0) {
        console.log('Fixing products.remaining to 0...')
        const { error: updateError } = await supabase
        .from('products')
        .update({ remaining: 0 })
        .eq('id', product.id)
        
        if (updateError) console.error('Error updating product:', updateError)
        else console.log('Product remaining updated.')
    }

    // Fill Missing Tickets
    const allTickets = Array.from({ length: product.total_count }, (_, i) => i + 1)
    const missingTickets = allTickets.filter(t => !soldTickets.includes(t))
    
    console.log(`Found ${missingTickets.length} missing tickets. Filling them...`)
    
    if (missingTickets.length > 0) {
        // Get a user ID to assign (e.g. first user found)
        const { data: users } = await supabase.from('users').select('id').limit(1)
        const userId = users?.[0]?.id

        if (!userId) {
            console.error('No user found to assign records to.')
            return
        }

        // Insert dummy records
        const dummyRecords = missingTickets.map(t => ({
            user_id: userId,
            product_id: product.id,
            ticket_number: t,
            prize_level: 'System',
            prize_name: 'Sold Out Adjustment',
            status: 'in_warehouse',
            profit_rate: 1.0,
            txid_seed: 'system_adjustment_seed',
            txid_nonce: 0,
            txid_hash: 'system_adjustment_hash',
            random_value: 0,
            image_url: '/images/item.png',
            is_last_one: false
        }))

        const { error: insertError } = await supabase
            .from('draw_records')
            .insert(dummyRecords)
        
        if (insertError) console.error('Error inserting dummy records:', insertError)
        else console.log('Dummy records inserted successfully.')
    }

  } else {
    console.log('No mismatch detected or conditions not met.')
  }
}

fixDemonSlayer()
