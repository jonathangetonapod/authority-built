import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { AccessRequestForm } from '@/components/landing/AccessRequestForm'
import PageSEO from '@/components/seo/PageSEO'
import '@/styles/agencyLanding.css'

/** The tablist, in the order it reads. Ids match the panel each one opens. */
type AudienceTab = 'agency' | 'pr' | 'solo' | 'new'
const AUDIENCE_TABS: Array<{ id: AudienceTab; label: string }> = [
  { id: 'agency', label: 'Podcast agency' },
  { id: 'pr', label: 'PR / comms agency' },
  { id: 'solo', label: 'Freelancer' },
  { id: 'new', label: 'Starting out' },
]

/**
 * Whether to hold still.
 *
 * Written as a call rather than a captured MediaQueryList so a preference
 * changed mid-visit is honoured on the next read, and defensively because a
 * browser without matchMedia should get a still page, not a broken one.
 */
const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true

/**
 * The public landing page for the agency product.
 *
 * This sells the platform to the people who run placement — agencies, PR firms,
 * freelancers, and anyone looking for an offer to sell. It is a different buyer
 * from the done-for-you booking service, which keeps its own page.
 */
const AgencyLanding = () => {
  const fieldRef = useRef<HTMLCanvasElement | null>(null)
  const [audience, setAudience] = useState<AudienceTab>('agency')
  const { hash } = useLocation()

  // Arriving on /#start from the sign-in page has to land on the form. The
  // router changes the URL without moving the page, so nothing would happen.
  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(hash.slice(1))
    if (!target) return
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [hash])

  // The signature: a field of shows with a handful chosen. Drawn rather than
  // described, because picking the few worth pitching is the product's job.
  useEffect(() => {
    const canvas = fieldRef.current
    const shell = canvas?.parentElement
    if (!canvas || !shell) return
    // Decoration only. A context that is unavailable, or refused outright by a
    // privacy setting that treats canvas as fingerprinting, leaves the page as
    // it is rather than taking it down.
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext('2d')
    } catch {
      return
    }
    if (!ctx) return
    const surface = ctx

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let points: Array<{ x: number; y: number; r: number; base: number }> = []
    let chosen: number[] = []
    let frame = 0
    let resizeTimer: number | undefined

    const build = () => {
      const w = shell.clientWidth
      const h = shell.clientHeight
      if (!w || !h) return false
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      surface.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Density follows area, so a phone is not a snowstorm.
      const count = Math.round(Math.min(340, Math.max(90, (w * h) / 2600)))
      points = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.15,
        base: 0.05 + Math.random() * 0.13,
      }))
      chosen = []
      const picks = Math.min(7, Math.max(4, Math.round(count / 42)))
      while (chosen.length < picks && points.length) {
        const idx = Math.floor(Math.random() * points.length)
        if (!chosen.includes(idx)) chosen.push(idx)
      }
      return true
    }

    const paint = (time: number | null) => {
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      surface.clearRect(0, 0, w, h)
      for (const pt of points) {
        surface.beginPath()
        surface.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2)
        surface.fillStyle = `rgba(147,165,172,${pt.base})`
        surface.fill()
      }
      chosen.forEach((index, order) => {
        const sel = points[index]
        if (!sel) return
        // Each chosen point breathes on its own offset, so the set reads as
        // several separate decisions rather than one pulsing group.
        const phase = time === null ? 1 : (Math.sin(time / 1400 + order * 1.7) + 1) / 2
        surface.beginPath()
        surface.arc(sel.x, sel.y, sel.r + 1.1, 0, Math.PI * 2)
        surface.fillStyle = `rgba(224,163,62,${0.28 + phase * 0.5})`
        surface.fill()
        surface.beginPath()
        surface.arc(sel.x, sel.y, sel.r + 7 + phase * 4, 0, Math.PI * 2)
        surface.fillStyle = `rgba(224,163,62,${0.05 + phase * 0.05})`
        surface.fill()
      })
    }

    if (build()) {
      if (prefersReducedMotion()) {
        paint(null)
      } else {
        const loop = (time: number) => {
          paint(time)
          frame = window.requestAnimationFrame(loop)
        }
        frame = window.requestAnimationFrame(loop)
      }
    }

    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (build() && prefersReducedMotion()) paint(null)
      }, 180)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // The status strip, and sections arriving as a sequence rather than a pile.
  // Layout effect, not effect: setting data-reveal after the browser has painted
  // makes every section flash in, blank out, and fade back.
  useLayoutEffect(() => {
    const stages = Array.from(document.querySelectorAll<HTMLElement>('[data-stage]'))
    let timer: number | undefined
    if (stages.length) {
      if (prefersReducedMotion()) {
        stages.forEach((el) => el.classList.add('gp-on'))
      } else {
        let i = 0
        const paint = (n: number) => stages.forEach((el, k) => el.classList.toggle('gp-on', k === n))
        paint(0)
        timer = window.setInterval(() => {
          i = (i + 1) % stages.length
          paint(i)
        }, 1900)
      }
    }

    const revealables = Array.from(document.querySelectorAll<HTMLElement>(
      '.gp-sec-head, .gp-bento, .gp-pipe, .gp-record, .gp-split, .gp-tabs, .gp-faq',
    ))
    let observer: IntersectionObserver | undefined
    // Content must never need an effect to become readable.
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      revealables.forEach((el) => el.classList.add('gp-shown'))
    } else {
      revealables.forEach((el) => el.setAttribute('data-reveal', ''))
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('gp-shown')
          observer?.unobserve(entry.target)
        })
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 })
      revealables.forEach((el) => observer?.observe(el))
    }

    return () => {
      window.clearInterval(timer)
      observer?.disconnect()
    }
  }, [])

  // Arrow keys move between tabs and open as they go, which is what a tablist
  // is expected to do; focus follows so the keyboard never gets left behind.
  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const index = AUDIENCE_TABS.findIndex((tab) => tab.id === audience)
    const next = AUDIENCE_TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + AUDIENCE_TABS.length) % AUDIENCE_TABS.length]
    setAudience(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <div className="gp-page">
      <PageSEO
        title="Podcast booking software for agencies | Get On A Pod"
        description="Run podcast placement for clients without the spreadsheets: discovery, client approval, research, pitching, replies and a white-label client portal on your own domain."
      />
      <a className="gp-skip" href="#what">Skip to content</a>
      <header className="gp-band">
        <div className="gp-wrap gp-masthead">
          <div className="gp-mark">GET ON A <b>POD</b></div>
          <div className="gp-masthead-actions">
            <Link className="gp-quiet" to="/login">Sign in</Link>
          </div>
        </div>
      </header>

      <div className="gp-band gp-hero-shell">
        <canvas className="gp-field-canvas" ref={fieldRef} aria-hidden="true" />
        <div className="gp-wrap gp-hero">
          <h1>Book podcast guests for clients, without the <em>spreadsheets</em>.</h1>
          <p className="gp-deck">
            Find the shows, get the client's approval, research the host, write the pitch, send it,
            and handle the replies — in one place that remembers everyone you have ever contacted.
            Under your own brand, on your own domain.
          </p>
          <div className="gp-cta-row">
            <a className="gp-btn gp-btn-primary" href="#start">Request access</a>
            <a className="gp-quiet" href="#what">or see everything it does</a>
          </div>
          <p className="gp-trust">
            <b>Invite only.</b> We set up each agency ourselves — workspace, sending tool, domain,
            and your existing clients moved across — so we take a small number at a time.
          </p>
        </div>

        <div className="gp-strip">
          <div className="gp-wrap">
            <div className="gp-strip-inner">
              <div className="gp-stage" data-stage>
                <span className="k"><span className="gp-dot"></span>Shortlist</span>
                <span className="v">Approved by the client</span>
              </div>
              <div className="gp-stage" data-stage>
                <span className="k"><span className="gp-dot"></span>In outreach</span>
                <span className="v">Sequence live, 3 touches</span>
              </div>
              <div className="gp-stage" data-stage>
                <span className="k"><span className="gp-dot"></span>Replied</span>
                <span className="v">Draft staged for review</span>
              </div>
              <div className="gp-stage" data-stage>
                <span className="k"><span className="gp-dot"></span>Booked</span>
                <span className="v">On the client calendar</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section>
        <div className="gp-wrap">
          <div className="gp-sec-head">
            <span className="gp-label">Who it is for</span>
            <h2>Same machine. Different reason for wanting it.</h2>
            <p>Pick the one that sounds like you.</p>
          </div>

          <div className="gp-tabs" role="tablist" aria-label="Who you are">
            {AUDIENCE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="gp-tab"
                role="tab"
                id={`tab-${tab.id}`}
                aria-controls={`p-${tab.id}`}
                aria-selected={audience === tab.id}
                tabIndex={audience === tab.id ? 0 : -1}
                onClick={() => setAudience(tab.id)}
                onKeyDown={onTabKey}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="gp-panel-out" role="tabpanel" id="p-agency" tabIndex={0} aria-labelledby="tab-agency" hidden={audience !== 'agency'}>
            <div>
              <h3>You are booking for six clients and the system is four browser tabs.</h3>
              <p className="gp-said">
                The work is good. The overhead is what stops you taking a seventh client — someone has to
                remember which host was pitched for whom, which sheet is current, and who said no last spring.
              </p>
            </div>
            <div className="gp-outcome">
              <span className="gp-label">What changes</span>
              <ul>
                <li>Take on more clients without hiring an account manager to hold it together</li>
                <li>Never pitch a host twice, across every client you run</li>
                <li>Hand each client a portal instead of a spreadsheet link</li>
              </ul>
            </div>
          </div>

          <div className="gp-panel-out" role="tabpanel" id="p-pr" tabIndex={0} aria-labelledby="tab-pr" hidden={audience !== 'pr'}>
            <div>
              <h3>You already sell earned media. Podcasts are the line item you keep outsourcing.</h3>
              <p className="gp-said">
                Shows are harder to work than press: no database of editors, no wire, and every pitch has to
                prove the guest fits that specific audience. So it gets subcontracted, at someone else's margin.
              </p>
            </div>
            <div className="gp-outcome">
              <span className="gp-label">What changes</span>
              <ul>
                <li>Bring podcast placement in house and keep the margin</li>
                <li>Report on it like any other channel — pitched, replied, booked</li>
                <li>Run it beside your existing retainers, under your own name</li>
              </ul>
            </div>
          </div>

          <div className="gp-panel-out" role="tabpanel" id="p-solo" tabIndex={0} aria-labelledby="tab-solo" hidden={audience !== 'solo'}>
            <div>
              <h3>It is you. The admin is the job you did not sign up for.</h3>
              <p className="gp-said">
                Research, contact hunting, follow-ups and inbox triage eat the hours you meant to spend
                on the pitch itself. There is nobody to delegate the boring half to.
              </p>
            </div>
            <div className="gp-outcome">
              <span className="gp-label">What changes</span>
              <ul>
                <li>The research and the first draft are done before you sit down</li>
                <li>Replies arrive sorted, with the answer already written for you to edit</li>
                <li>Look like a firm, not a freelancer, from the first email</li>
              </ul>
            </div>
          </div>

          <div className="gp-panel-out" role="tabpanel" id="p-new" tabIndex={0} aria-labelledby="tab-new" hidden={audience !== 'new'}>
            <div>
              <h3>You want something to sell, and this is a service people already buy.</h3>
              <p className="gp-said">
                Podcast placement is a clear offer with an obvious deliverable: your client gets booked on
                shows their buyers listen to. The hard part was never the selling — it was having a way to
                deliver it on day one.
              </p>
            </div>
            <div className="gp-outcome">
              <span className="gp-label">What changes</span>
              <ul>
                <li>A delivery system before your first client, not after</li>
                <li>An offer you can describe in one sentence and show in a portal</li>
                <li>Charge for outcomes while the system does the operations</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="what" className="gp-raised">
        <div className="gp-wrap">
          <div className="gp-sec-head">
            <span className="gp-label">What it does</span>
            <h2>Every part of the job, in the order you do it.</h2>
            <p>Nine things you are currently doing across four tools, a document, and your memory.</p>
          </div>

          <div className="gp-bento">
            <div className="gp-box gp-wide">
              <span className="gp-label">Discovery</span>
              <h3>Find shows worth pitching</h3>
              <p>Search a growing catalogue of podcasts by audience, activity, category and whether a usable contact exists. Every show any agency shortlists makes the catalogue better for the next search.</p>
              <span className="gp-gain">→ Stop starting each client from a blank sheet</span>
            </div>
            <div className="gp-box gp-wide">
              <span className="gp-label">Client approval</span>
              <h3>Let the client pick, on their own page</h3>
              <p>Send a shortlist they open in a browser, with your branding, and mark what they want. No login, no attachment, no version confusion.</p>
              <span className="gp-gain">→ Approval in a day, not a thread</span>
            </div>

            <div className="gp-box">
              <span className="gp-label">Research</span>
              <h3>Know the show before writing</h3>
              <p>Recent episodes, host name, format and why this guest fits — gathered and written up in one pass.</p>
              <span className="gp-gain">→ A pitch about their show, not a template</span>
            </div>
            <div className="gp-box">
              <span className="gp-label">Contacts</span>
              <h3>Find who to write to</h3>
              <p>Public addresses where they exist, a direct lookup where they do not, marked clearly by how confident we are.</p>
              <span className="gp-gain">→ Fewer pitches into a void</span>
            </div>
            <div className="gp-box">
              <span className="gp-label">Pitching</span>
              <h3>Three touches, written for one show</h3>
              <p>An opening and two follow-ups drafted from the research and the client's profile. You edit before anything sends.</p>
              <span className="gp-gain">→ A morning's writing in a few minutes</span>
            </div>

            <div className="gp-box">
              <span className="gp-label">Sending</span>
              <h3>Your mailboxes, your campaigns</h3>
              <p>Connects to the sending tool you already pay for. Sequences run from your own accounts, with warmup and health visible.</p>
              <span className="gp-gain">→ Your sending reputation, not a shared one</span>
            </div>
            <div className="gp-box">
              <span className="gp-label">Replies</span>
              <h3>Sorted, drafted, never auto-sent</h3>
              <p>Interested replies rise to the top with a response already prepared. A person always presses send.</p>
              <span className="gp-gain">→ Nothing embarrassing leaves on its own</span>
            </div>
            <div className="gp-box">
              <span className="gp-label">Client portal</span>
              <h3>Somewhere for the client to look</h3>
              <p>Bookings, calendar, what was sent and what came back — on your domain, in your colours.</p>
              <span className="gp-gain">→ Fewer "any update?" emails</span>
            </div>

            <div className="gp-box gp-full">
              <span className="gp-label">Relationships</span>
              <h3>The memory a spreadsheet cannot keep</h3>
              <p>Every host, every touch, every outcome, across all of your clients — including the ones who asked never to be contacted again. It is the part that gets more valuable the longer you run.</p>
              <span className="gp-gain">→ A second pitch that lands because the first one was remembered</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="gp-wrap">
          <div className="gp-sec-head">
            <span className="gp-label">The part that compounds</span>
            <h2>It remembers the hosts you would otherwise burn.</h2>
            <p>
              A host is not a row in one client's sheet. They are a relationship your business owns, and it is
              the reason a second pitch gets read at all. Open any show and the history is already there.
            </p>
          </div>

          <div className="gp-record">
            <div className="gp-record-head">
              <span className="gp-record-title">The Operators Room</span>
              <span className="gp-chip gp-chip-alert">Do not contact</span>
              <span className="gp-chip gp-chip-soft">3 touches</span>
            </div>
            <div className="gp-record-body">
              <dl style={{'display': 'grid', 'gap': '0.85rem', 'margin': '0'}}>
                <div className="gp-rl"><dt>Last contact</dt><dd className="gp-num">14 Jun 2026 · for a different client</dd></div>
                <div className="gp-rl"><dt>Outcome</dt><dd>Host replied asking to be removed from all future outreach.</dd></div>
                <div className="gp-rl"><dt>Applies to</dt><dd>Every client you run, and the sending tool itself.</dd></div>
                <div className="gp-rl"><dt>Booked before</dt><dd className="gp-num">1 placement · Feb 2026</dd></div>
              </dl>
              <p style={{ fontSize: '0.89rem', color: 'var(--fg-faint)', maxWidth: 'none' }}>
                A pitch to this address is refused at the point of sending — not caught in a review afterwards.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="gp-raised">
        <div className="gp-wrap">
          <div className="gp-sec-head">
            <span className="gp-label">White label</span>
            <h2>Your clients never find out what you run on.</h2>
            <p>
              Dashboards, the onboarding form, the portal and every emailed link arrive on your own hostname,
              under your own name — including the preview card when a client pastes the link into a message.
            </p>
          </div>

          <div className="gp-split">
            <div className="gp-panel">
              <span className="gp-label">Without it</span>
              <div className="gp-browser">
                <div className="gp-bar">https://<span className="gp-strike">someone-elses-tool.com</span>/portal/acme</div>
                <div className="gp-screen">
                  <strong className="gp-strike">Some Platform</strong>
                  <span>Sent to your client, wearing somebody else's name</span>
                </div>
              </div>
            </div>
            <div className="gp-panel">
              <span className="gp-label">With it</span>
              <div className="gp-browser">
                <div className="gp-bar">https://podcasts.<b style={{'color': 'var(--signal)'}}>yourbrand</b>.com/portal</div>
                <div className="gp-screen">
                  <strong>Your Brand</strong>
                  <span>Your colours, your logo, your address — and the link preview to match</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="gp-wrap">
          <div className="gp-sec-head">
            <span className="gp-label">How the work moves</span>
            <h2>From a name on a list to a booking on a calendar.</h2>
          </div>
          <div className="gp-pipe">
            <div className="gp-pipe-step"><span className="n gp-num">01</span><div><h3>Onboard the client</h3><p>One link. They answer, save halfway, come back. You approve the profile every pitch is written from.</p></div></div>
            <div className="gp-pipe-step"><span className="n gp-num">02</span><div><h3>Build the shortlist</h3><p>Search the catalogue or run discovery. Shows this client has already seen are filtered out.</p></div></div>
            <div className="gp-pipe-step"><span className="n gp-num">03</span><div><h3>Get it approved</h3><p>They review on their own page and mark what they want. You watch the decisions land.</p></div></div>
            <div className="gp-pipe-step"><span className="n gp-num">04</span><div><h3>Research and write</h3><p>Study the show, find the contact, draft the sequence — then edit it as a person.</p></div></div>
            <div className="gp-pipe-step"><span className="n gp-num">05</span><div><h3>Send and watch</h3><p>Into your own campaign, from your own mailboxes. Replies come back sorted, with a draft waiting.</p></div></div>
            <div className="gp-pipe-step"><span className="n gp-num">06</span><div><h3>Book it, keep the record</h3><p>The booking lands on the client's calendar and the host joins your relationship book for good.</p></div></div>
          </div>
        </div>
      </section>

      <section className="gp-raised">
        <div className="gp-wrap">
          <div className="gp-sec-head">
            <span className="gp-label">What it costs to run</span>
            <h2>You pay for the work that actually runs.</h2>
            <p>
              Research runs, contact lookups and dashboard builds are metered in credits, with an allowance
              included every month. Nothing is charged for a screen you opened or a page you read.
            </p>
          </div>
          <div className="gp-bento">
            <div className="gp-box gp-wide">
              <span className="gp-label">Included</span>
              <h3>An allowance that renews monthly</h3>
              <p>Granted at the start of every month automatically, whether or not anyone remembers to ask for it.</p>
            </div>
            <div className="gp-box gp-wide">
              <span className="gp-label">Attributable</span>
              <h3>Spend you can put against a client</h3>
              <p>Every charge is recorded against the client and the operation that caused it, so a retainer can be priced on what it really costs to deliver.</p>
            </div>
            <div className="gp-box gp-full">
              <span className="gp-label">Optional</span>
              <h3>Top up on its own, or never</h3>
              <p>Set a floor and a pack size and it buys more before you run dry — at most once a day, and only if you switch it on. Leave it off and nothing is ever charged without you clicking buy.</p>
            </div>
          </div>
        </div>
      </section>


      <section>
        <div className="gp-wrap">
          <div className="gp-sec-head">
            <span className="gp-label">Before you ask</span>
            <h2>The five questions everyone asks.</h2>
          </div>
          <div className="gp-faq">
            <details open>
              <summary>Do I need my own sending tool?</summary>
              <p>Yes, and you probably already have one. Sequences run from your own mailboxes through your own Instantly account, so your sending reputation stays yours and nothing is shared with another agency.</p>
            </details>
            <details>
              <summary>Does it send emails on its own?</summary>
              <p>No. It drafts, sorts and stages — a person always presses send. Replies arrive classified with a response prepared, but nothing leaves without someone reading it first.</p>
            </details>
            <details>
              <summary>What happens to a host who asks to stop?</summary>
              <p>They are silenced for every client you run, and the block is pushed to your sending tool as well — so a campaign already in flight stops too, not just the next one you create.</p>
            </details>
            <details>
              <summary>Can my clients tell they are using someone else's software?</summary>
              <p>No. Dashboards, onboarding, the portal and every emailed link sit on your own hostname with your logo and colours, including the preview card when a link is pasted into a message.</p>
            </details>
            <details>
              <summary>I am starting from nothing. Is this too early for me?</summary>
              <p>It is the opposite problem to the one you might expect. The offer is easy to describe and easy to sell; delivering it consistently is what stops people. That is the part this handles.</p>
            </details>
          </div>
        </div>
      </section>

      <div className="gp-band" id="start">
        <div className="gp-wrap gp-close-in">
          <h2>Tell us what you run today.</h2>
          <p>
            How many clients, what you are using now, and whether you are adding podcasts to an existing
            service or starting from scratch. We will show you the system against your own client list.
          </p>
          <AccessRequestForm />
        </div>
        <div className="gp-wrap">
          <div className="gp-foot-grid">
            <div>
              <h4>Get On A Pod</h4>
              <p>Podcast placement, run properly. A product of Authority Built.</p>
            </div>
            <div>
              <h4>Talk to us</h4>
              <a href="mailto:jonathan@getonapod.com">jonathan@getonapod.com</a>
            </div>
            <div>
              <h4>Legal</h4>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </div>
          </div>
          <div className="gp-foot">
            <span>© 2026 AUTHORITY BUILT</span>
            <span>FOR PEOPLE WHO PLACE GUESTS ON PODCASTS</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgencyLanding
