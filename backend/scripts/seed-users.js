const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.resolve(__dirname, '../.env.local');
let envConfig = '';
try {
  envConfig = fs.readFileSync(envPath, 'utf8');
} catch (e) {
  console.error('Could not read .env.local');
  process.exit(1);
}

const env = {};
envConfig.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    env[key.trim()] = value.trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedUsers() {
  console.log('Seeding users...');
  
  const names = [
    '王小明', '李美麗', '張三', '陳小華', '周小芳', '吳志強', '鄭雅文', '許建宏', 
    '蔡淑芬', '謝文龍', '羅小婷', '林志明', '黃淑娟', '劉建國', '陳雅玲'
  ];
  
  const cities = ['台北市', '新北市', '台中市', '高雄市', '台南市', '桃園市', '新竹市'];
  
  const users = [];
  for (let i = 0; i < 50; i++) {
    const cityIndex = i % cities.length;
    users.push({
      user_id: String(i + 1).padStart(8, '0'),
      name: names[i % names.length] + (Math.floor(i / names.length) > 0 ? (Math.floor(i / names.length) + 1) : ''),
      email: `user${i+1}@example.com`,
      phone: `09${String(i).padStart(8, '0')}`,
      tokens: 1000 + i * 100,
      status: i % 5 === 0 ? 'inactive' : 'active',
      total_orders: Math.floor(Math.random() * 20),
      total_spent: Math.floor(Math.random() * 10000),
      total_draws: Math.floor(Math.random() * 50),
      address: `${cities[cityIndex]}某某路${i+1}號`,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString()
    });
  }

  // Insert in batches
  const { data, error } = await supabase.from('users').insert(users).select();
  
  if (error) {
    console.error('Error inserting users:', error);
  } else {
    console.log(`Successfully inserted ${data.length} users`);
  }
}

seedUsers();
