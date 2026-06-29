
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTables() {
  console.log('Checking for search_logs table...')
  const { data: searchLogs, error: searchError } = await supabase
    .from('search_logs')
    .select('*')
    .limit(1)
  
  if (searchError) {
    console.log('search_logs table check failed:', searchError.message)
  } else {
    console.log('search_logs table exists.')
  }

  console.log('Checking for visit_logs table...')
  const { data: visitLogs, error: visitError } = await supabase
    .from('visit_logs')
    .select('*')
    .limit(1)

  if (visitError) {
    console.log('visit_logs table check failed:', visitError.message)
  } else {
    console.log('visit_logs table exists.')
  }
  
  console.log('Checking for visits table...')
  const { data: visits, error: visitsError } = await supabase
    .from('visits')
    .select('*')
    .limit(1)

  if (visitsError) {
    console.log('visits table check failed:', visitsError.message)
  } else {
    console.log('visits table exists.')
  }
}

checkTables()
