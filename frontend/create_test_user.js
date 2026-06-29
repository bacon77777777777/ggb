
const { createClient } = require('@supabase/supabase-js');

// Load env vars manually since we are running a standalone script
// We need SERVICE_ROLE key to bypass email verification if possible, 
// or just standard key but we might hit rate limits or need verification.
// However, the prompt provided ANON key. Let's try ANON key first.
// If we need to set specific user data (like id) or bypass checks, we might need service role.
// But usually for "create a test user", standard signup is fine if email confirmation is off.
// If email confirmation is ON, we can't easily verify it without access to the inbox or DB.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qgziszozkdskdstexsvw.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnemlzem96a2Rza2RzdGV4c3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDU2ODksImV4cCI6MjA4NTMyMTY4OX0.3Oa7lo0BaC53MqIIjsGUjg2joKKvuSwhcAKrNNPi_vE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUser() {
  const email = 'test001@gmail.com';
  const password = '111111';
  const fullName = '測試員001';

  console.log(`Creating user: ${email}...`);

  // 1. Sign Up
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName, // This goes to raw_user_meta_data
      },
    },
  });

  if (error) {
    console.error('Error creating user:', error.message);
    return;
  }

  console.log('User created successfully:', data.user?.id);

  // 2. Ensure profile exists and update nickname (username)
  // Our profiles table trigger should have created the profile, but let's update it to be sure
  if (data.user) {
    // Wait a bit for trigger
    await new Promise(r => setTimeout(r, 2000));

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        username: fullName,
        role: 'user',
        status: 'active'
      })
      .eq('id', data.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError.message);
      // If error is permission denied (RLS), it's expected if we are using anon key and not logged in as that user.
      // But signUp returns a session usually if email confirm is off.
      // If we have a session, we can update.
    } else {
      console.log('Profile updated successfully.');
    }
  }
}

createTestUser();
