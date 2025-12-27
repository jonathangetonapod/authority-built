// Test script to generate a portal token manually
// This bypasses email sending for testing

const SUPABASE_URL = 'https://ysjwveqnwjysldpfqzov.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzand2ZXFud2p5c2xkcGZxem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTg5OTA4MDgsImV4cCI6MjAzNDU2NjgwOH0.qN1qDXNOLwOSohp5FArn8VqqeBQN-T7D3C80uLSPOME'

async function createTestToken(clientId) {
  const crypto = require('crypto')

  // Generate token
  const token = crypto.randomUUID() + '-' + crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  // Insert into database
  const response = await fetch(`${SUPABASE_URL}/rest/v1/client_portal_tokens`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      client_id: clientId,
      token: token,
      expires_at: expiresAt,
      ip_address: 'localhost',
      user_agent: 'test-script'
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to create token: ${response.status} ${await response.text()}`)
  }

  const magicLink = `http://localhost:5173/portal/auth?token=${encodeURIComponent(token)}`

  console.log('\n🎉 Test Magic Link Generated!\n')
  console.log('Magic Link:')
  console.log(magicLink)
  console.log('\nExpires in: 15 minutes')
  console.log('\nInstructions:')
  console.log('1. Copy the magic link above')
  console.log('2. Open it in your browser')
  console.log('3. You should be logged into the client portal!')
}

// Get client ID from command line
const clientId = process.argv[2]

if (!clientId) {
  console.error('Usage: node test-portal-token.js <client_id>')
  console.error('\nGet a client ID from your Supabase database:')
  console.error('SELECT id, name, email FROM clients WHERE email IS NOT NULL LIMIT 1;')
  process.exit(1)
}

createTestToken(clientId)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err.message)
    process.exit(1)
  })
