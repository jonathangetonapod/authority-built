import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { AccessRequestForm } from '@/components/landing/AccessRequestForm'
import { Chrome, Shot } from '@/components/landing/Shot'
import PageSEO from '@/components/seo/PageSEO'
import '@/styles/agencyLanding.css'

/** Whether to hold still. Read on use, and safe with no window and no matchMedia. */
const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true

interface TourShot {
  src: string
  alt: string
  /** Shown in the frame until the screenshot is dropped in. */
  placeholder: string
  ratio: string
  span: 'gp-span-3' | 'gp-span-2'
  title: string
  body: string
}

const SHOTS: TourShot[] = [
  {
    src: '/shots/discovery.png',
    alt: 'The podcast finder, listing shows with audience size and whether a contact address is known.',
    placeholder: 'shots/discovery.png — podcast finder',
    ratio: '16 / 10', span: 'gp-span-3',
    title: 'Find the right shows',
    body: 'Search by topic, size and whether there is someone to write to.',
  },
  {
    src: '/shots/shortlist.png',
    alt: 'A client shortlist, each show with an approve or decline control.',
    placeholder: 'shots/shortlist.png — client shortlist',
    ratio: '16 / 10', span: 'gp-span-3',
    title: 'Get the client to pick',
    body: 'They tick the shows they want. No login, no spreadsheet.',
  },
  {
    src: '/shots/pitch.png',
    alt: 'A drafted pitch sequence of three emails for one show, open for editing.',
    placeholder: 'shots/pitch.png — pitch drafts',
    ratio: '4 / 3', span: 'gp-span-2',
    title: 'Pitches, already written',
    body: 'Three emails for that one show. You edit and send.',
  },
  {
    src: '/shots/replies.png',
    alt: 'The replies inbox, with interested replies sorted to the top and a suggested answer.',
    placeholder: 'shots/replies.png — replies inbox',
    ratio: '4 / 3', span: 'gp-span-2',
    title: 'Replies, already sorted',
    body: 'The interested ones come first, with an answer ready.',
  },
  {
    src: '/shots/calendar.png',
    alt: 'A booking calendar showing recording days and release days across clients.',
    placeholder: 'shots/calendar.png — bookings calendar',
    ratio: '4 / 3', span: 'gp-span-2',
    title: 'Bookings on a calendar',
    body: 'Recording days and release days, every client.',
  },
]

const PORTAL_ACTIVITY = [
  { title: 'They pick the shows', body: 'Yes or no on a list you send. That is their whole job.' },
  { title: 'They watch it move', body: 'Contacted, replied, booked — updating on its own.' },
  { title: 'They see the dates', body: 'When they record, when it goes live.' },
  { title: 'They hear the result', body: 'The episode link, ready to share.' },
]

const FAQ = [
  {
    q: 'Does it send emails on its own?',
    a: 'No. It writes the drafts and sorts the replies. A person always presses send.',
  },
  {
    q: 'Do I need my own sending tool?',
    a: 'Yes — and you probably have one. Emails go from your own mailboxes, so your reputation stays yours.',
  },
  {
    q: 'Can clients tell it is not ours?',
    a: 'Not from what they see: the portal, the links and the emails are on your domain, with your logo and colours.',
  },
  {
    q: 'What if a host asks us to stop?',
    a: 'They are blocked for every client you run, straight away — including campaigns already sending.',
  },
  {
    q: 'I am just starting out. Too early?',
    a: 'Delivery is the hard part, not the pitch, and delivery is what you get on day one.',
  },
]

/**
 * The public landing page for the agency product.
 *
 * This sells the platform to the people who run placement — agencies, PR firms,
 * freelancers, and anyone looking for an offer to sell. It is a different buyer
 * from the done-for-you booking service, which keeps its own page at
 * /podcast-booking.
 */
const AgencyLanding = () => {
  const { hash, key } = useLocation()

  // Arriving on /#start from the sign-in page has to land on the form. The
  // router changes the URL without moving the page, so nothing would happen.
  //
  // `key` changes on every navigation, including one to the hash already in the
  // address bar. Keying on the hash alone meant pressing "Request to join" while
  // already at #start did nothing at all, which is exactly when someone who has
  // scrolled away presses it.
  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(hash.slice(1))
    if (!target) return
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [hash, key])

  return (
    <div className="gp-page">
      <PageSEO
        title="Podcast booking software for agencies | Get On A Pod"
        description="Book your clients on more podcasts in less time: find shows, get the client's approval, pitch, and land the booking — with a client portal under your own name."
      />
      <a className="gp-skip" href="#main">Skip to content</a>

      <header className="gp-masthead">
        <div className="gp-wrap gp-masthead-in">
          <Link className="gp-mark" to="/">
            <span className="gp-mark-dot" aria-hidden="true"><i /></span>
            Get On A Pod
          </Link>
          <nav className="gp-nav" aria-label="Sections">
            <a href="#tour">How it works</a>
            <a href="#portal">Client portal</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="gp-masthead-actions">
            <Link className="gp-signin" to="/login">Sign in</Link>
            <a className="gp-btn gp-btn-ink" href="#start">Request to join</a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="gp-hero">
          <div className="gp-wrap gp-hero-in">
            <div>
              <h1>Book your clients on more podcasts, in less time.</h1>
              <p className="gp-deck">
                One place to find shows, pitch them and land the booking — with a portal your clients
                log into, under your name.
              </p>
              <div className="gp-cta-row">
                <a className="gp-btn gp-btn-primary" href="#start">Request to join</a>
                <a className="gp-btn gp-btn-quiet" href="#tour">See how it works</a>
              </div>
              <p className="gp-who">
                Built for podcast agencies, PR teams and freelancers who book guests for clients.
              </p>
            </div>

            <div className="gp-frame">
              <Chrome url="podcasts.yourbrand.com" />
              <Shot
                src="/shots/hero.png"
                alt="The workspace client list: five agency clients, each with their contact, outreach setup progress, and status."
                placeholder="shots/hero.png — main workspace"
                ratio="16 / 10"
                priority
              />
            </div>
          </div>
        </section>

        <section className="gp-cards-section">
          <div className="gp-wrap gp-cards">
            {/* The three claims sat at h3 directly under the hero's h1, so the
                outline skipped a level and they hung off nothing. They belong to
                a section, and the section needed a name — but not a visible one,
                because the cards are the design here. */}
            <h2 className="sr-only">What it changes</h2>
            <div className="gp-card">
              <h3>More bookings</h3>
              <p>Better shows, better pitches, faster follow-up.</p>
            </div>
            <div className="gp-card">
              <h3>More clients, same team</h3>
              <p>The admin is handled, so you can take on the next client without hiring.</p>
            </div>
            <div className="gp-card">
              <h3>Clients who stay</h3>
              <p>They can see what is happening, so there are fewer status emails.</p>
            </div>
          </div>
        </section>

        <section id="tour">
          <div className="gp-wrap">
            <div className="gp-sec-head">
              <span className="gp-eyebrow">How it works</span>
              <h2>Find shows. Pitch them. Get booked.</h2>
            </div>
            <div className="gp-bento">
              {SHOTS.map((shot) => (
                <article key={shot.src} className={`gp-tile ${shot.span}`}>
                  <Shot src={shot.src} alt={shot.alt} placeholder={shot.placeholder} ratio={shot.ratio} />
                  <div className="gp-tile-body">
                    <h3>{shot.title}</h3>
                    <p>{shot.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="portal">
          <div className="gp-wrap">
            <div className="gp-sec-head">
              <span className="gp-eyebrow">Client portal</span>
              <h2>Your client logs in and sees the work.</h2>
              <p>Your name, your domain. They stop emailing you for updates.</p>
            </div>

            <div className="gp-portal">
              <div className="gp-frame gp-frame-lg">
                <Chrome url="portal.yourbrand.com" />
                <Shot
                  src="/shots/portal.png"
                  alt="The client portal dashboard: upcoming recordings, outreach progress and published episodes."
                  placeholder="shots/portal.png — client portal"
                  ratio="16 / 10"
                />
              </div>

              <dl className="gp-activities">
                {PORTAL_ACTIVITY.map((item) => (
                  <div key={item.title} className="gp-activity">
                    <dt>{item.title}</dt>
                    <dd>{item.body}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section>
          <div className="gp-wrap">
            <div className="gp-band">
              <div>
                <h2>It all looks like your agency.</h2>
                <p className="gp-band-said">
                  Portal, links and emails sit on your own domain with your logo. Clients never see our name.
                </p>
              </div>
              <div className="gp-urls">
                <p className="gp-url">https://<s>someone-elses-tool.com</s>/portal/acme</p>
                <p className="gp-url gp-url-yours">https://podcasts.<b>yourbrand</b>.com/portal</p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq">
          <div className="gp-wrap gp-faq-grid">
            <h2>Questions we always get.</h2>
            <div className="gp-faq">
              {FAQ.map((entry, index) => (
                <details key={entry.q} open={index === 0}>
                  <summary>{entry.q}</summary>
                  <p>{entry.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="start">
          <div className="gp-wrap">
            <div className="gp-start">
              <div>
                <h2>See it on your own client list.</h2>
                <p className="gp-start-said">
                  Tell us what you run today and we will walk you through it. Joining is by invite, so we
                  take a few agencies at a time.
                </p>
              </div>
              <AccessRequestForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="gp-foot">
        <div className="gp-foot-in">
          <span className="gp-mark">
            <span className="gp-mark-dot" aria-hidden="true"><i /></span>
            Get On A Pod
          </span>
          <div className="gp-foot-links">
            <a href="mailto:jonathan@getonapod.com">jonathan@getonapod.com</a>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <span>© {new Date().getFullYear()} Get On A Pod</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default AgencyLanding
