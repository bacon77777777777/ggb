
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Types
interface Prize {
  id: string;
  level: string;
  name: string;
  probability: number; // 0-100
  total: number;
}

interface Product {
  id: number;
  totalCount: number;
  majorPrizes: string[];
}

// Helper to calculate SHA256 hash
function calculateHash(seed: string, nonce: number): string {
  const input = `${seed}:${nonce}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Helper to generate deterministic random value (0-1) from Seed + Nonce
function generateRandomValue(seed: string, nonce: number): number {
  const hmac = crypto.createHmac('sha256', seed);
  hmac.update(nonce.toString());
  const hashHex = hmac.digest('hex');
  
  // Use first 16 chars (64 bits)
  const hexSubset = hashHex.substring(0, 16);
  const decimalValue = BigInt('0x' + hexSubset);
  const maxDecimal = BigInt('0xffffffffffffffff');
  
  // Convert to 0-1 double
  // We need high precision, so we use Number but be careful about precision loss
  // For comparison purposes, standard floating point is sufficient
  return Number(decimalValue) / Number(maxDecimal);
}

// Function to determine prize based on CDF
function determinePrize(randomValue: number, cdf: { prize: Prize, cumulative: number }[]): Prize | null {
  for (const item of cdf) {
    if (randomValue <= item.cumulative) {
      return item.prize;
    }
  }
  return cdf[cdf.length - 1]?.prize || null;
}

// Build CDF for a given profit rate
function buildCDF(prizes: Prize[], majorPrizes: string[], profitRate: number): { prize: Prize, cumulative: number }[] {
  // 1. Calculate adjusted weights
  let majorTotal = 0;
  let minorTotal = 0;

  const weights = prizes.map(p => {
    const isMajor = majorPrizes.includes(p.level);
    const weight = p.probability;
    if (isMajor) majorTotal += weight;
    else minorTotal += weight;
    return { ...p, isMajor, originalWeight: weight };
  });

  const majorAdjustedTotal = majorTotal * profitRate;
  const minorAdjustedTotal = Math.max(0, 100 - majorAdjustedTotal);
  
  const minorFactor = minorTotal > 0 ? minorAdjustedTotal / minorTotal : 1.0;

  // 2. Build final weights
  const adjustedPrizes = weights.map(p => {
    let adjustedWeight = 0;
    if (p.isMajor) {
      adjustedWeight = p.originalWeight * profitRate;
    } else {
      adjustedWeight = p.originalWeight * minorFactor;
    }
    return { ...p, adjustedWeight };
  });

  // 3. Build CDF
  // Sort by level asc, id asc (to match DB logic)
  adjustedPrizes.sort((a, b) => {
    if (a.level !== b.level) return a.level.localeCompare(b.level);
    return a.id.localeCompare(b.id);
  });

  let cumulative = 0;
  const totalWeight = adjustedPrizes.reduce((sum, p) => sum + p.adjustedWeight, 0);

  return adjustedPrizes.map(p => {
    // Normalize to 0-1 range based on totalWeight (which should be ~100)
    cumulative += p.adjustedWeight;
    return {
      prize: p,
      cumulative: cumulative / totalWeight
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const productId = Number(args[0]);
  const targetProfitRate = Number(args[1]);

  if (!productId || isNaN(targetProfitRate)) {
    console.error('Usage: npx tsx scripts/optimize_seed_for_profit.ts <product_id> <profit_rate>');
    process.exit(1);
  }

  console.log(`Optimizing seed for Product ${productId} with Profit Rate ${targetProfitRate}...`);

  // 1. Fetch Product and Prizes
  const { data: product, error: prodError } = await supabase
    .from('products')
    .select('id, total_count, major_prizes')
    .eq('id', productId)
    .single();

  if (prodError || !product) {
    console.error('Error fetching product:', prodError);
    process.exit(1);
  }

  const { data: prizes, error: prizeError } = await supabase
    .from('product_prizes')
    .select('id, level, name, probability, total')
    .eq('product_id', productId)
    .gt('remaining', 0) // Only consider remaining prizes? No, for initial verification we should consider ALL prizes usually. 
                        // But verification is usually against "Current State" if dynamic?
                        // Let's assume verification uses ALL prizes defined in the system.
                        // Actually, play_ichiban uses "remaining > 0".
                        // If we want to simulate the "Next Draw", we should use remaining > 0.
                        // But for "General Fairness", we usually look at the whole set.
                        // Let's assume we want to optimize for the CURRENT available prizes.
    .order('level', { ascending: true })
    .order('id', { ascending: true });

  if (prizeError || !prizes) {
    console.error('Error fetching prizes:', prizeError);
    process.exit(1);
  }
  
  if (prizes.length === 0) {
    console.error('No prizes found for product', productId);
    process.exit(1);
  }

  console.log(`Found ${prizes.length} prizes.`);
  console.log('Sample prize:', prizes[0]);

  // 2. Build CDFs
  // "Ideal" CDF (Frontend Verification) - usually assumes Profit Rate 1.0
  const idealCDF = buildCDF(prizes, product.major_prizes || ['A', 'B', 'Last One'], 1.0);
  
  // "Real" CDF (Backend Execution) - uses Target Profit Rate
  const realCDF = buildCDF(prizes, product.major_prizes || ['A', 'B', 'Last One'], targetProfitRate);

  console.log('Ideal CDF (First 3):', idealCDF.slice(0, 3).map(x => `${x.prize.level}: ${x.cumulative.toFixed(4)}`));
  console.log('Real CDF (First 3):', realCDF.slice(0, 3).map(x => `${x.prize.level}: ${x.cumulative.toFixed(4)}`));

  // 3. Search for Seed
  const totalTickets = 80; // Default check range if total_count is null
  const checkRange = product.total_count || totalTickets;
  
  console.log(`Checking first ${checkRange} tickets for mismatches...`);

  let bestSeed = '';
  let minMismatches = Infinity;
  let minMajorMismatches = Infinity;

  const iterations = 10000;
  
  for (let i = 0; i < iterations; i++) {
    const seed = crypto.randomBytes(16).toString('hex');
    let mismatches = 0;
    let majorMismatches = 0;

    for (let nonce = 1; nonce <= checkRange; nonce++) {
      const randomValue = generateRandomValue(seed, nonce);
      const idealPrize = determinePrize(randomValue, idealCDF);
      const realPrize = determinePrize(randomValue, realCDF);

      if (idealPrize?.id !== realPrize?.id) {
        mismatches++;
        // Check if the mismatch involves a Major Prize (in either Ideal or Real)
        const isIdealMajor = product.major_prizes?.includes(idealPrize?.level || '');
        const isRealMajor = product.major_prizes?.includes(realPrize?.level || '');
        
        if (isIdealMajor || isRealMajor) {
          majorMismatches++;
        }
      }
    }

    if (majorMismatches === 0 && mismatches < minMismatches) {
      minMismatches = mismatches;
      minMajorMismatches = majorMismatches;
      bestSeed = seed;
      
      // Early exit if perfect
      if (mismatches === 0) {
        console.log(`Found PERFECT seed at iteration ${i}!`);
        break;
      }
    } else if (majorMismatches < minMajorMismatches) {
        // Prioritize minimizing major mismatches
        minMajorMismatches = majorMismatches;
        minMismatches = mismatches;
        bestSeed = seed;
    }
  }

  console.log('--- Optimization Result ---');
  console.log(`Best Seed: ${bestSeed}`);
  console.log(`Major Mismatches: ${minMajorMismatches}`);
  console.log(`Total Mismatches: ${minMismatches} / ${checkRange}`);

  if (bestSeed) {
    // Update Product
    const { error: updateError } = await supabase
      .from('products')
      .update({ 
        seed: bestSeed,
        profit_rate: targetProfitRate
      })
      .eq('id', productId);

    if (updateError) {
      console.error('Error updating product:', updateError);
    } else {
      console.log('Product updated successfully with new Seed and Profit Rate.');
    }
  } else {
    console.log('No suitable seed found.');
  }
}

main();
