
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyLogin() {
  const email = process.env.TEST_EMAIL || 'test001@gmail.com';
  const password = process.env.TEST_PASSWORD || '111111';

  console.log(`Attempting to sign in as ${email}...`);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Login failed:', error.message);
    return;
  }

  console.log('Login successful!');
  console.log('User ID:', data.user.id);
  
  // Check profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError) {
    console.error('Error fetching profile:', profileError.message);
  } else {
    console.log('Profile found:', profile);
    if (profile.username !== '測試員001') {
      console.log('Updating nickname to 測試員001...');
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ username: '測試員001' })
        .eq('id', data.user.id);
        
      if (updateError) {
        console.error('Failed to update nickname:', updateError.message);
      } else {
        console.log('Nickname updated successfully.');
      }
    } else {
      console.log('Nickname is correct.');
    }
  }
}

verifyLogin();
