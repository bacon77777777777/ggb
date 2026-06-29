
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)')
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function createBucket() {
  const { data, error } = await supabase.storage.createBucket('products', {
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ['image/*']
  })
  if (error) {
    console.error('Error creating bucket:', error)
  } else {
    console.log('Bucket created:', data)
  }
}

createBucket()
