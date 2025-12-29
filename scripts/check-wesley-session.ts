import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ysjwveqnwjysldpfqzov.supabase.co'
const supabaseAnonKey = 'sb_publishable_cH4MjtOi8FWAgaTsltLasg_pOvc4752'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkWesleySession() {
  const email = 'wez.powell0@gmail.com'
  const clientId = 'c736b28d-e91b-45c4-8841-72ed9ec25837'

  console.log('🔍 Checking Wesley\'s sessions...\n')

  // Try to call the Edge Function without a session token (like admin impersonation)
  console.log('🧪 Test 1: Calling Edge Function WITHOUT session token (admin mode)...')
  const { data: test1, error: error1 } = await supabase.functions.invoke('get-client-bookings', {
    body: {
      clientId: clientId
    }
  })

  console.log('Raw response:', { data: test1, error: error1 })

  if (error1) {
    console.error('❌ Error:', error1.message)
  } else if (test1?.error) {
    console.error('❌ Function returned error:', test1.error)
  } else {
    console.log(`✅ SUCCESS: Got ${test1?.bookings?.length || 0} bookings`)
    if (test1?.bookings?.[0]) {
      console.log('First booking:', test1.bookings[0].podcast_name)
    }
  }

  console.log('\n---\n')

  // Now test with a fake session token to see the error message
  console.log('🧪 Test 2: Calling with FAKE session token to see error...')
  const { data: test2, error: error2 } = await supabase.functions.invoke('get-client-bookings', {
    body: {
      clientId: clientId,
      sessionToken: 'fake-token-12345'
    }
  })

  if (error2) {
    console.error('❌ Error:', error2)
  } else if (test2.error) {
    console.log('📝 Function error message:', test2.error)
  } else {
    console.log('Unexpected success:', test2)
  }
}

checkWesleySession().catch(console.error)
