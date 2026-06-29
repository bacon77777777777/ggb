const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Try to load env vars
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
} catch (e) {
  console.error('Failed to load .env.local:', e);
}
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (e) {
  console.error('Failed to load .env:', e);
}

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Please check your .env files.');
    // Try to fallback to known Supabase connection string format if variables exist but DATABASE_URL doesn't
    // postgres://postgres:[password]@[host]:[port]/postgres
    if (process.env.SUPABASE_DB_PASSWORD && process.env.NEXT_PUBLIC_SUPABASE_URL) {
       // Constructing it might be tricky without host.
    }
    process.exit(1);
  }

  console.log('Connecting to database...');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Supabase requires SSL
  });

  try {
    await client.connect();
    
    // Apply 110
    const sqlPath = path.join(__dirname, '../db/migrations/110_add_play_gacha_func.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Applying migration 110_add_play_gacha_func.sql...');
    await client.query(sql);
    console.log('Migration 110 applied successfully.');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
