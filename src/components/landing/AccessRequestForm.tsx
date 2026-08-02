import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { requestWorkspaceAccess, type AccessRequestAudience } from '@/services/accessRequests'

/** The same four descriptions the page's audience tabs use, in the same words. */
const AUDIENCES: Array<{ value: AccessRequestAudience; label: string }> = [
  { value: 'agency', label: 'Podcast agency' },
  { value: 'pr', label: 'PR / comms agency' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'starting_out', label: 'Starting out' },
]

const CLIENT_COUNTS = ['None yet', '1–3', '4–10', '11–25', '25+']

/**
 * Ask for an invite.
 *
 * Access is invite-only, so this is the register form — it just does not create
 * an account. It says so in as many words, because a form that looks like a
 * sign-up and quietly does not sign you up is worse than no form.
 */
export const AccessRequestForm = () => {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [website, setWebsite] = useState('')
  const [audience, setAudience] = useState<AccessRequestAudience>('agency')
  const [clientsNow, setClientsNow] = useState('')
  const [notes, setNotes] = useState('')

  // `noValidate` turns off the browser's own check so the native bubble does
  // not appear over the band. Something has to replace it, or a blank form is
  // sent, refused by the edge function, and burns one of the caller's five
  // requests for the day.
  const [missing, setMissing] = useState<'fullName' | 'email' | null>(null)

  const submit = useMutation({
    mutationFn: () => requestWorkspaceAccess({ fullName, email, company, website, audience, clientsNow, notes }),
  })

  const localProblem = () => {
    if (!fullName.trim()) return { field: 'fullName' as const, message: 'Add your name so we know who is asking.' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())) {
      return { field: 'email' as const, message: 'Add a work email we can reply to.' }
    }
    return null
  }
  const problem = missing
    ? localProblem()
    : null

  if (submit.isSuccess) {
    return (
      <div className="gp-form gp-form-done" role="status">
        <h3>Request received.</h3>
        <p>
          We read these ourselves, usually within a working day. The reply comes from
          jonathan@getonapod.com with a time to walk through the system against your own client list.
        </p>
      </div>
    )
  }

  return (
    <form
      className="gp-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (submit.isPending) return
        const found = localProblem()
        setMissing(found?.field ?? null)
        if (found) {
          document.getElementById(found.field === 'email' ? 'gp-email' : 'gp-name')?.focus()
          return
        }
        submit.mutate()
      }}
    >
      <div className="gp-field-row">
        <label className="gp-field">
          <span>Your name</span>
          <input
            id="gp-name"
            required
            autoComplete="name"
            maxLength={120}
            aria-invalid={missing === 'fullName'}
            value={fullName}
            onChange={(event) => { setFullName(event.target.value); setMissing(null) }}
          />
        </label>
        <label className="gp-field">
          <span>Work email</span>
          <input
            id="gp-email"
            required
            type="email"
            autoComplete="email"
            maxLength={254}
            aria-invalid={missing === 'email'}
            value={email}
            onChange={(event) => { setEmail(event.target.value); setMissing(null) }}
          />
        </label>
      </div>

      <div className="gp-field-row">
        <label className="gp-field">
          <span>Company <i>optional</i></span>
          <input
            autoComplete="organization"
            maxLength={160}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
        <label className="gp-field">
          <span>Website <i>optional</i></span>
          <input
            autoComplete="url"
            maxLength={200}
            placeholder="agency.com"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>

      <div className="gp-field-row">
        <label className="gp-field">
          <span>What you run</span>
          <select value={audience} onChange={(event) => setAudience(event.target.value as AccessRequestAudience)}>
            {AUDIENCES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="gp-field">
          <span>Clients today</span>
          <select value={clientsNow} onChange={(event) => setClientsNow(event.target.value)}>
            <option value="">Prefer not to say</option>
            {CLIENT_COUNTS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="gp-field">
        <span>What you are using now, and what is breaking <i>optional</i></span>
        <textarea
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {(problem || submit.isError) && (
        <p className="gp-form-error" role="alert">
          {problem
            ? problem.message
            : submit.error instanceof Error ? submit.error.message : 'Your request could not be sent. Please try again.'}
        </p>
      )}

      <div className="gp-form-actions">
        <button type="submit" className="gp-btn gp-btn-primary" disabled={submit.isPending}>
          {submit.isPending ? 'Sending…' : 'Request access'}
        </button>
        {/* Said before they fill it in, not after they wait for a login that
            never arrives. */}
        <p>
          Access is by invite. This does not create an account — we read it and reply with a time to talk.
        </p>
      </div>
    </form>
  )
}
