# Create Client Account API

API endpoint for programmatically creating client accounts with portal access and Google Sheet integration.

## Endpoint

```
POST https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account
```

## Authentication

Optional: Include `api_key` in the request body if you've set an `API_KEY` environment variable in Supabase for additional security.

## Request Body

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Client's full name |
| `email` | string | Client's email address (must be valid format) |

### Optional Client Details

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `bio` | string | null | Client biography/description |
| `linkedin_url` | string | null | LinkedIn profile URL |
| `website` | string | null | Client's website URL |
| `calendar_link` | string | null | Booking calendar link (e.g., Calendly) |
| `contact_person` | string | null | Primary contact person name |
| `first_invoice_paid_date` | string | null | ISO 8601 date string |
| `status` | string | `'active'` | One of: `'active'`, `'paused'`, `'churned'` |
| `notes` | string | null | Internal notes about the client |

### Portal Access Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enable_portal_access` | boolean | `true` | Enable client portal access |
| `password` | string | null | Set a password for login. If not provided, client will use magic link only |
| `send_invitation_email` | boolean | `true` | Send portal invitation email to client |

### Google Sheet Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `create_google_sheet` | boolean | `false` | Automatically create a Google Sheet for podcast outreach tracking |

### Security

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `api_key` | string | null | Optional API key for authentication (if configured in Supabase) |

## Response

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Client account created successfully",
  "client": {
    "client_id": "uuid-string",
    "name": "John Doe",
    "email": "john@example.com",
    "portal_access_enabled": true,
    "portal_url": "https://getonapod.com/portal/login",
    "password": "SecurePass123" // Only included if password was set
    "invitation_sent": true,
    "google_sheet_created": true,
    "google_sheet_url": "https://docs.google.com/spreadsheets/d/...", // Only if created
    "created_at": "2025-01-31T10:30:00Z"
  }
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "error": "Client name is required"
}
```

```json
{
  "error": "Invalid email format"
}
```

#### 401 Unauthorized
```json
{
  "error": "Invalid API key"
}
```

#### 409 Conflict
```json
{
  "error": "Client with this email already exists",
  "client_id": "uuid-string"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to create client: <error details>"
}
```

## Usage Examples

### Example 1: Minimal Request (Magic Link Only)

```bash
curl -X POST https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com"
  }'
```

### Example 2: Full Client with Password & Google Sheet

```bash
curl -X POST https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "bio": "Marketing expert and podcast guest",
    "linkedin_url": "https://linkedin.com/in/janesmith",
    "website": "https://janesmith.com",
    "calendar_link": "https://calendly.com/janesmith",
    "status": "active",
    "enable_portal_access": true,
    "password": "SecurePassword123!",
    "send_invitation_email": true,
    "create_google_sheet": true
  }'
```

### Example 3: With API Key Authentication

```bash
curl -X POST https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob Johnson",
    "email": "bob@example.com",
    "bio": "Entrepreneur and thought leader",
    "enable_portal_access": true,
    "send_invitation_email": true,
    "create_google_sheet": true,
    "api_key": "your-secret-api-key"
  }'
```

### Example 4: JavaScript/TypeScript

```typescript
const createClient = async (clientData: {
  name: string
  email: string
  bio?: string
  password?: string
  create_google_sheet?: boolean
}) => {
  const response = await fetch(
    'https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clientData),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error)
  }

  return await response.json()
}

// Usage
try {
  const result = await createClient({
    name: 'Sarah Williams',
    email: 'sarah@example.com',
    bio: 'Business coach specializing in scaling startups',
    password: 'MySecurePass456',
    create_google_sheet: true,
  })

  console.log('Client created:', result.client.client_id)
  console.log('Portal URL:', result.client.portal_url)

  if (result.client.google_sheet_url) {
    console.log('Google Sheet:', result.client.google_sheet_url)
  }
} catch (error) {
  console.error('Failed to create client:', error.message)
}
```

### Example 5: Python

```python
import requests

def create_client(name, email, **kwargs):
    url = "https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account"

    data = {
        "name": name,
        "email": email,
        **kwargs
    }

    response = requests.post(url, json=data)
    response.raise_for_status()

    return response.json()

# Usage
try:
    result = create_client(
        name="Michael Chen",
        email="michael@example.com",
        bio="Tech entrepreneur and angel investor",
        linkedin_url="https://linkedin.com/in/michaelchen",
        website="https://michaelchen.com",
        password="SecurePass789",
        enable_portal_access=True,
        send_invitation_email=True,
        create_google_sheet=True
    )

    print(f"Client created: {result['client']['client_id']}")
    print(f"Portal URL: {result['client']['portal_url']}")

    if result['client'].get('google_sheet_url'):
        print(f"Google Sheet: {result['client']['google_sheet_url']}")

except requests.exceptions.HTTPError as e:
    print(f"Failed to create client: {e.response.json()['error']}")
```

## What Happens When You Create a Client

1. **Client Record Created** - New client added to database with all provided details
2. **Password Set** (optional) - If password provided, it's stored securely for portal login
3. **Google Sheet Created** (optional) - If `create_google_sheet: true`:
   - Creates a new Google Sheet with formatted headers
   - Stores sheet URL in client record
   - Sheet is ready for podcast outreach tracking
4. **Invitation Email Sent** (optional) - If `send_invitation_email: true`:
   - Sends welcome email with portal login link
   - Tracks email delivery status
   - Updates `portal_invitation_sent_at` timestamp
5. **Response Returned** - Returns client details including:
   - Client ID for future API calls
   - Portal login URL
   - Password (if set)
   - Google Sheet URL (if created)

## Portal Access Methods

After creating a client account, they can access the portal using:

1. **Magic Link** (default) - Client enters email, receives login link via email
2. **Password** (if set) - Client logs in with email + password
3. **Both** - Client can use either magic link or password

## Security Notes

- Emails are validated for proper format
- Duplicate emails are rejected with 409 Conflict
- Passwords are stored securely (consider hashing in production)
- API key authentication is optional but recommended for production
- All actions are logged for audit trail
- Email delivery is tracked and failures don't block client creation

## Setting Up API Key (Optional)

For additional security, set an API key in Supabase:

```bash
npx supabase secrets set API_KEY="your-secure-random-key"
```

Then include it in your requests:

```json
{
  "name": "Client Name",
  "email": "client@example.com",
  "api_key": "your-secure-random-key"
}
```

## Error Handling Best Practices

```typescript
const createClientSafely = async (clientData) => {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientData),
    })

    const data = await response.json()

    if (!response.ok) {
      // Handle specific error cases
      switch (response.status) {
        case 400:
          throw new Error(`Invalid input: ${data.error}`)
        case 401:
          throw new Error('Authentication failed: Invalid API key')
        case 409:
          throw new Error(`Client already exists: ${data.client_id}`)
        case 500:
          throw new Error(`Server error: ${data.error}`)
        default:
          throw new Error(`Unexpected error: ${data.error}`)
      }
    }

    return data.client
  } catch (error) {
    console.error('Failed to create client:', error)
    throw error
  }
}
```

## Integration Ideas

- **CRM Integration**: Sync clients from your CRM to Get On A Pod
- **Stripe Webhook**: Auto-create client when payment is successful
- **Zapier/Make**: Connect to hundreds of apps
- **Custom Dashboard**: Build your own admin panel
- **Bulk Import**: Script to migrate existing clients
- **White Label**: Create clients for your agency's sub-clients

## Rate Limiting

Currently no rate limiting is enforced. For production use, consider:
- Implementing rate limiting at the edge function level
- Using Supabase rate limiting features
- Monitoring usage via logs

## Support

For issues or questions:
- GitHub Issues: https://github.com/jonathangetonapod/authority-built/issues
- Email: jonathan@getonapod.com
