import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkWesley() {
  const email = 'wez.powell0@gmail.com'

  console.log('🔍 Checking Wesley\'s account...\n')

  // 1. Find client record
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('email', email)
    .single()

  if (clientError || !client) {
    console.error('❌ Client not found:', clientError)
    return
  }

  console.log('✅ Client found:')
  console.log(`   ID: ${client.id}`)
  console.log(`   Name: ${client.name}`)
  console.log(`   Email: ${client.email}`)
  console.log(`   Portal Access: ${client.portal_access_enabled}`)
  console.log(`   Last Login: ${client.portal_last_login_at || 'Never'}`)
  console.log()

  // 2. Check bookings
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .eq('client_id', client.id)
    .order('scheduled_date', { ascending: false, nullsFirst: false })

  if (bookingsError) {
    console.error('❌ Error fetching bookings:', bookingsError)
  } else {
    console.log(`✅ Found ${bookings?.length || 0} bookings`)
    if (bookings && bookings.length > 0) {
      console.log('\nBookings:')
      bookings.slice(0, 5).forEach((b: any) => {
        console.log(`   - ${b.podcast_name} (${b.status})`)
      })
      if (bookings.length > 5) {
        console.log(`   ... and ${bookings.length - 5} more`)
      }
    }
  }
  console.log()

  // 3. Check active sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from('client_portal_sessions')
    .select('*')
    .eq('client_id', client.id)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (sessionsError) {
    console.error('❌ Error fetching sessions:', sessionsError)
  } else {
    console.log(`✅ Found ${sessions?.length || 0} active sessions`)
    if (sessions && sessions.length > 0) {
      sessions.forEach((s: any) => {
        console.log(`   - Token: ${s.session_token.substring(0, 20)}...`)
        console.log(`   - Expires: ${s.expires_at}`)
        console.log(`   - Created: ${s.created_at}`)
      })
    }
  }
  console.log()

  // 4. Test the Edge Function with his session
  if (sessions && sessions.length > 0) {
    console.log('🧪 Testing Edge Function with session token...')
    const { data, error } = await supabase.functions.invoke('get-client-bookings', {
      body: {
        clientId: client.id,
        sessionToken: sessions[0].session_token
      }
    })

    if (error) {
      console.error('❌ Edge Function error:', error)
    } else if (data.error) {
      console.error('❌ Edge Function returned error:', data.error)
    } else {
      console.log(`✅ Edge Function returned ${data.bookings?.length || 0} bookings`)
    }
  }

  // 5. Test without session token (admin impersonation)
  console.log('\n🧪 Testing Edge Function WITHOUT session token (admin mode)...')
  const { data: data2, error: error2 } = await supabase.functions.invoke('get-client-bookings', {
    body: {
      clientId: client.id
    }
  })

  if (error2) {
    console.error('❌ Edge Function error:', error2)
  } else if (data2.error) {
    console.error('❌ Edge Function returned error:', data2.error)
  } else {
    console.log(`✅ Edge Function returned ${data2.bookings?.length || 0} bookings`)
  }
}

checkWesley().catch(console.error)
