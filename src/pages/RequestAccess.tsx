import { Link } from 'react-router-dom'

import { AccessRequestForm } from '@/components/landing/AccessRequestForm'
import { AuthShell } from '@/components/landing/AuthShell'

/**
 * The register page.
 *
 * It is called "Request access" everywhere it appears, because that is what it
 * does — the platform is invite-only and this creates no account. Calling the
 * link "Sign up" and then not signing anyone up is the one thing this page must
 * not do.
 *
 * The same form is on the landing page at #start. This exists so the sign-in
 * page has somewhere to send people, and so the link survives being shared.
 */
const RequestAccess = () => (
  <AuthShell
    title="Request access | Get On A Pod"
    description="Ask for a workspace on Get On A Pod. Access is by invite; tell us what you run and we will reply with a time to talk."
    path="/register"
    heading="Request access."
    standfirst="Tell us what you run today — how many clients, what you are using now, and whether you are adding podcasts to an existing service or starting from scratch."
    footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
  >
    <AccessRequestForm />
  </AuthShell>
)

export default RequestAccess
