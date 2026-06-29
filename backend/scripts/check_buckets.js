
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://qgziszozkdskdstexsvw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnemlzem96a2Rza2RzdGV4c3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDU2ODksImV4cCI6MjA4NTMyMTY4OX0.3Oa7lo0BaC53MqIIjsGUjg2joKKvuSwhcAKrNNPi_vE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkBuckets() {
  const { data, error } = await supabase.storage.listBuckets()
  if (error) {
    console.error('Error listing buckets:', error)
  } else {
    console.log('Buckets:', data)
  }
}

checkBuckets()
