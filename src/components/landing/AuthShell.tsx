import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import PageSEO from '@/components/seo/PageSEO'
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
 * The frame both auth pages sit in.
 *
 * Signing in used to drop you onto a plain card with none of the identity of
 * the page you came from — a different product, as far as the eye is concerned.
 * This is the landing page's band, mark and type, so the whole way in reads as
 * one thing. It carries no auth logic of its own; the pages own that.
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
  <div className="gp-page gp-auth-page">
    <PageSEO
      title={title}
      description={description}
      path={path}
      // An auth page has nothing for a search engine and everything for a
      // phisher's search result. Keep it out of the index.
      noindex
    />
    <header className="gp-band">
      <div className="gp-wrap gp-masthead">
        <Link className="gp-mark" to="/">GET ON A <b>POD</b></Link>
      </div>
    </header>

    <div className="gp-band gp-auth-body">
      <div className="gp-wrap">
        <div className={tone === 'notice' ? 'gp-auth-card gp-auth-narrow' : 'gp-auth-card'}>
          <h1>{heading}</h1>
          {standfirst && <p className="gp-auth-standfirst">{standfirst}</p>}
          {children}
          <div className="gp-auth-foot">{footer}</div>
        </div>
      </div>
    </div>
  </div>
)
