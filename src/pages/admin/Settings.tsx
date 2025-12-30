import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { ALLOWED_ADMIN_EMAILS } from '@/lib/config'
import { Save, Shield, Bell, Globe, Code, Copy, ExternalLink, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

const Settings = () => {
  const { user } = useAuth()
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const API_ENDPOINT = 'https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account'

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const codeExamples = [
    {
      language: 'cURL',
      code: `curl -X POST ${API_ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "bio": "Marketing expert",
    "enable_portal_access": true,
    "create_google_sheet": true
  }'`
    },
    {
      language: 'JavaScript',
      code: `const response = await fetch('${API_ENDPOINT}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    bio: 'Marketing expert',
    enable_portal_access: true,
    create_google_sheet: true
  })
})
const data = await response.json()`
    }
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your admin dashboard preferences
          </p>
        </div>

        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Account Settings
            </CardTitle>
            <CardDescription>
              Your admin account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={user?.user_metadata?.full_name || ''}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-medium">Authentication Method</p>
                <p className="text-sm text-muted-foreground">Google OAuth</p>
              </div>
              <Button variant="outline" disabled>
                Connected
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Admin Access */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Admin Access Control
            </CardTitle>
            <CardDescription>
              Emails with admin dashboard access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {ALLOWED_ADMIN_EMAILS.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{email}</p>
                      <p className="text-xs text-muted-foreground">Admin</p>
                    </div>
                  </div>
                  {email === user?.email && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      You
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              To add more admin users, update the whitelist in your code configuration.
            </p>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Preferences
            </CardTitle>
            <CardDescription>
              Choose what updates you receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">New Lead Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Get notified when someone submits a form
                </p>
              </div>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Weekly Reports</p>
                <p className="text-sm text-muted-foreground">
                  Receive weekly analytics summary
                </p>
              </div>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Site Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Site Configuration
            </CardTitle>
            <CardDescription>
              General website settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">Site Name</Label>
              <Input id="site-name" value="Get On A Pod" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-url">Site URL</Label>
              <Input id="site-url" value="https://authoritylab.com" />
            </div>
            <Button>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* API Documentation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              API Documentation
            </CardTitle>
            <CardDescription>
              Programmatically create client accounts with portal access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Endpoint */}
            <div className="space-y-2">
              <Label>API Endpoint</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={API_ENDPOINT}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(API_ENDPOINT, -1)}
                >
                  {copiedIndex === -1 ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-2">
              <Label>Features</Label>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Create client accounts with all profile details</li>
                <li>Enable portal access with password or magic link</li>
                <li>Automatically create Google Sheet for outreach</li>
                <li>Send welcome invitation emails</li>
                <li>Optional API key authentication</li>
              </ul>
            </div>

            {/* Code Examples */}
            <div className="space-y-3">
              <Label>Quick Start Examples</Label>
              {codeExamples.map((example, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      {example.language}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(example.code, index)}
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                    <code className="text-sm font-mono">{example.code}</code>
                  </pre>
                </div>
              ))}
            </div>

            {/* Full Documentation Link */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div>
                <p className="font-medium">Complete API Documentation</p>
                <p className="text-sm text-muted-foreground">
                  Full reference with all parameters, examples, and integration guides
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => window.open('https://github.com/jonathangetonapod/authority-built/blob/main/CREATE_CLIENT_API.md', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Docs
              </Button>
            </div>

            {/* Response Example */}
            <div className="space-y-2">
              <Label>Example Response</Label>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                <code className="text-sm font-mono text-muted-foreground">
{`{
  "success": true,
  "message": "Client account created successfully",
  "client": {
    "client_id": "uuid-here",
    "name": "John Doe",
    "email": "john@example.com",
    "portal_access_enabled": true,
    "portal_url": "https://getonapod.com/portal/login",
    "invitation_sent": true,
    "google_sheet_created": true,
    "google_sheet_url": "https://docs.google.com/..."
  }
}`}
                </code>
              </pre>
            </div>

            {/* Use Cases */}
            <div className="space-y-2">
              <Label>Integration Ideas</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'CRM Integration',
                  'Stripe Webhooks',
                  'Zapier/Make',
                  'Bulk Import',
                  'White Label',
                  'Custom Dashboard'
                ].map((useCase) => (
                  <div
                    key={useCase}
                    className="flex items-center gap-2 p-2 border rounded-lg"
                  >
                    <Code className="h-4 w-4 text-primary" />
                    <span className="text-sm">{useCase}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default Settings
