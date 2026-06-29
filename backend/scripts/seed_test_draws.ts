
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Draw Logic (Re-implemented for script to avoid path alias issues) ---

interface TXID {
  seed: string;
  nonce: number;
}

function generateTXID(seed: string, nonce: number): TXID {
  return { seed, nonce };
}

function calculateTXIDHash(txid: TXID): string {
  const txidString = `${txid.seed}:${txid.nonce}`;
  return crypto.createHash('sha256').update(txidString).digest('hex');
}

function generateRandomValue(txid: TXID): number {
  const hmac = crypto.createHmac('sha256', txid.seed);
  hmac.update(txid.nonce.toString());
  const hash = hmac.digest('hex');
  
  const hexValue = hash.substring(0, 16);
  const decimalValue = parseInt(hexValue, 16);
  const maxHexValue = parseInt('ffffffffffffffff', 16);
  
  return decimalValue / maxHexValue;
}

// --- Main Script ---

async function main() {
  console.log('--- Seeding Test Draws ---');

  // 1. Get User
  let userId = 'b44d1847-dd88-4e2f-9dee-d68955ec3cff'; // Default test user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', 'test001@gmail.com')
    .single();

  if (user) {
    console.log(`Found user: ${user.email} (${user.id})`);
    userId = user.id;
  } else {
    console.log(`User test001@gmail.com not found, using ID: ${userId} (if exists)`);
  }

  // 2. Find an Active Product (Ichiban)
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'active')
    .eq('type', 'ichiban')
    .gt('remaining', 0)
    .limit(1);

  if (prodError || !products || products.length === 0) {
    console.error('No active ichiban products found with remaining stock.');
    // Fallback: try to find ANY active product
    const { data: anyProduct } = await supabase.from('products').select('*').eq('status', 'active').limit(1);
    if (!anyProduct || anyProduct.length === 0) {
       console.error('No active products at all. Please create a product first.');
       return;
    }
    console.log('Using fallback active product:', anyProduct[0].name);
    products![0] = anyProduct[0];
  }

  const product = products![0];
  console.log(`Target Product: ${product.name} (ID: ${product.id})`);
  console.log(`Product Seed: ${product.seed}`);

  if (!product.seed) {
    console.error('Product has no seed! Cannot generate valid draws.');
    return;
  }

  // 3. Get Product Prizes
  const { data: prizes, error: prizeError } = await supabase
    .from('product_prizes')
    .select('*')
    .eq('product_id', product.id)
    .gt('remaining', 0);

  if (prizeError || !prizes || prizes.length === 0) {
    console.error('No prizes available for this product.');
    return;
  }

  // 4. Generate 3 Draws
  const drawsToGenerate = 3;
  console.log(`Generating ${drawsToGenerate} draws...`);

  for (let i = 0; i < drawsToGenerate; i++) {
    // Pick a random prize from available ones
    // In a real draw, this depends on probability/randomValue, but for testing delivery, 
    // we just need to assign a prize. 
    // HOWEVER, to support Fairness Verification, we should ideally try to match the randomValue logic 
    // OR just ensure the record has valid hash/seed/nonce, even if the prize doesn't strictly match the probability logic 
    // (since verification checks hash and randomValue generation, not necessarily the prize mapping if that's hidden).
    // Actually, verification usually checks if the prize matches the outcome? 
    // The verify function in `drawLogic.ts` returns `hashMatch` and `randomValue`. It doesn't seem to validate the prize mapping explicitly in the verification result, but the UI might.
    // Let's just pick a prize and record it.
    
    const randomPrizeIndex = Math.floor(Math.random() * prizes.length);
    const selectedPrize = prizes[randomPrizeIndex];

    // Generate a random ticket number (nonce) that hasn't been used ideally. 
    // For simplicity, we'll pick a random number between 1 and total_count.
    // In production we should check if it's used.
    const nonce = Math.floor(Math.random() * (product.total_count || 80)) + 1;

    const txid = generateTXID(product.seed, nonce);
    const txidHash = calculateTXIDHash(txid);
    const randomValue = generateRandomValue(txid);

    // Insert Draw Record
    const drawRecord = {
      user_id: userId,
      product_id: product.id,
      ticket_number: nonce,
      prize_level: selectedPrize.level,
      prize_name: selectedPrize.name,
      txid_seed: product.seed,
      txid_nonce: nonce,
      txid_hash: txidHash,
      random_value: randomValue,
      profit_rate: 1.0, // Default
      status: 'in_warehouse', // Key for delivery testing!
      product_prize_id: selectedPrize.id,
      is_tradable: true,
      image_url: selectedPrize.image_url || product.image_url
    };

    const { data: insertedDraw, error: insertError } = await supabase
      .from('draw_records')
      .insert(drawRecord)
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting draw record:', insertError);
    } else {
      console.log(`Created Draw Record: ID ${insertedDraw.id} - ${selectedPrize.level} Prize (Nonce: ${nonce})`);
      
      // Update inventories
      await supabase.rpc('decrement_prize_count', { prize_id: selectedPrize.id }); // Assuming this RPC exists or we update manually
      // Fallback manual update if RPC fails or doesn't exist
      await supabase
        .from('product_prizes')
        .update({ remaining: selectedPrize.remaining - 1 })
        .eq('id', selectedPrize.id);
        
      await supabase
        .from('products')
        .update({ remaining: product.remaining - 1 })
        .eq('id', product.id);
    }
  }

  console.log('--- Seeding Complete ---');
}

main().catch(console.error);
