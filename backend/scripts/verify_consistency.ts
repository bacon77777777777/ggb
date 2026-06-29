
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

// --- Helper Functions ---
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

async function main() {
  const productId = 836;
  const ticketNumber = 22;

  console.log(`--- Verifying Consistency for Product ${productId} / Ticket ${ticketNumber} ---`);

  // 1. Get Draw Record
  const { data: draw, error: drawError } = await supabase
    .from('draw_records')
    .select('*')
    .eq('product_id', productId)
    .eq('ticket_number', ticketNumber)
    .single();

  if (drawError) {
    console.error('Error fetching draw record:', drawError);
    return;
  }

  // 2. Verify Internal Consistency of Draw Record
  const txid = generateTXID(draw.txid_seed, draw.ticket_number);
  const calculatedHash = calculateTXIDHash(txid);

  console.log('Draw Record Internal Check:');
  console.log(`  Seed: ${draw.txid_seed}`);
  console.log(`  Nonce: ${draw.ticket_number}`);
  console.log(`  Stored Hash:     ${draw.txid_hash}`);
  console.log(`  Calculated Hash: ${calculatedHash}`);

  if (calculatedHash === draw.txid_hash) {
    console.log('  [OK] Draw Record is internally consistent.');
  } else {
    console.error('  [FAIL] Draw Record is internally INCONSISTENT!');
  }

  // 3. Check Product Seed
  const { data: product } = await supabase.from('products').select('seed').eq('id', productId).single();
  console.log('Product Seed Check:');
  console.log(`  Product Seed: ${product?.seed}`);
  
  if (product?.seed === draw.txid_seed) {
    console.log('  [OK] Product seed matches draw seed.');
  } else {
    console.warn('  [MISMATCH] Product seed does NOT match draw seed.');
    console.log('  This causes verification failure on frontend if frontend uses Product Seed.');
  }
}

main();
