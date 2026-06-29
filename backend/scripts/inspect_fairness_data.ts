
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const productId = 822;
  const ticketNumber = 27;

  console.log(`--- Inspecting Product ${productId} ---`);
  const { data: product, error: prodError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (prodError) {
    console.error('Error fetching product:', prodError);
    return;
  }
  console.log('Product:', {
    id: product.id,
    name: product.name,
    status: product.status,
    seed: product.seed,
    remaining: product.remaining
  });

  console.log(`--- Inspecting Draw Record (Ticket ${ticketNumber}) ---`);
  const { data: draw, error: drawError } = await supabase
    .from('draw_records')
    .select('*')
    .eq('product_id', productId)
    .eq('ticket_number', ticketNumber)
    .single();

  if (drawError) {
    console.error('Error fetching draw record:', drawError);
  } else {
    console.log('Draw Record:', {
      id: draw.id,
      ticket_number: draw.ticket_number,
      txid_seed: draw.txid_seed,
      txid_hash: draw.txid_hash,
      random_value: draw.random_value
    });

    if (product.seed !== draw.txid_seed) {
      console.warn('MISMATCH: Product Seed != Draw Record Seed');
      console.warn(`Product Seed: ${product.seed}`);
      console.warn(`Draw Seed:    ${draw.txid_seed}`);
    } else {
      console.log('Match: Product Seed == Draw Record Seed');
    }
  }
}

main();
