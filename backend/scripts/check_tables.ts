
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qgziszozkdskdstexsvw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnemlzem96a2Rza2RzdGV4c3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDU2ODksImV4cCI6MjA4NTMyMTY4OX0.3Oa7lo0BaC53MqIIjsGUjg2joKKvuSwhcAKrNNPi_vE'
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
