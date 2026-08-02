import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import PageSEO from '@/components/seo/PageSEO'
import { Chrome, Shot } from '@/components/landing/Shot'
import '@/styles/agencyLanding.css'

interface AuthShellProps {
  title: string
  description: string
  path: string
  heading: string
  standfirst?: string
  children: ReactNode
  /** The other door. Every auth page has exactly one. */
  footer: ReactNode
  /** Signed-in-but-stuck states render in a narrower column. */
  tone?: 'form' | 'notice'
}

/**
 * The frame every auth page sits in.
 *
 * Split screen: the form on the paper ground the marketing page uses, and a
 * dark panel showing the workspace you are signing in to. Signing in used to
 * drop you onto a plain card with none of the identity of the page you came
 * from — a different product, as far as the eye is concerned. The panel is
 * decorative and drops away below the breakpoint, so the form is never the
 * thing that gets squeezed.
 *
 * It carries no auth logic of its own; the pages own that.
 */
export const AuthShell = ({
  title,
  description,
  path,
  heading,
  standfirst,
  children,
  footer,
  tone = 'form',
}: AuthShellProps) => (
  <div className="gp-page gp-auth-split">
    <PageSEO
      title={title}
      description={description}
      path={path}
      // An auth page has nothing for a search engine and everything for a
      // phisher's search result. Keep it out of the index.
      noindex
    />

    <div className="gp-auth-col">
      <Link className="gp-mark" to="/">
        <span className="gp-mark-dot" aria-hidden="true"><i /></span>
        Get On A Pod
      </Link>

      <main className={tone === 'notice' ? 'gp-auth-main gp-auth-narrow' : 'gp-auth-main'}>
        <h1>{heading}</h1>
        {standfirst && <p className="gp-auth-standfirst">{standfirst}</p>}
        {children}
        <p className="gp-auth-foot">{footer}</p>
      </main>

      <p className="gp-auth-copyright">© 2026 Get On A Pod</p>
    </div>

    <aside className="gp-auth-aside">
      <div className="gp-auth-glow" aria-hidden="true" />
      <div className="gp-auth-aside-in">
        <p className="gp-eyebrow gp-eyebrow-onband">Your workspace</p>
        <h2>Everything you sent, everyone who replied, every show booked.</h2>
        <div className="gp-frame gp-frame-dark">
          <Chrome url="podcasts.yourbrand.com" />
          <Shot
            src="/shots/hero.png"
            alt="The workspace client list: five agency clients with their contact, AI SDR profile progress and status."
            placeholder="shots/hero.png — main workspace"
            ratio="16 / 10"
          />
        </div>
      </div>
    </aside>
  </div>
)
