import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  CheckCircle2,
  Calendar,
  FileText,
  Mic,
  BarChart3,
  ArrowRight,
  MessageSquare,
  Send,
  Headphones,
  LayoutDashboard,
  ThumbsUp,
  Bell,
  PlayCircle,
  BookOpen
} from 'lucide-react';
import PageSEO from '@/components/seo/PageSEO';

const steps = [
  {
    number: "01",
    title: "Shortlist Strategy Call",
    duration: "Day 1",
    icon: Calendar,
    description: "We start with a short call to align on your expertise, buyer, goals, and the kinds of shows worth targeting.",
    details: [
      "Clarify your expertise and strongest angles",
      "Define the buyer you want to reach",
      "Set goals for guest appearances",
      "Pressure-test fit before anything starts"
    ]
  },
  {
    number: "02",
    title: "Portal Access",
    duration: "Day 1",
    icon: LayoutDashboard,
    description: "You get access to your client portal right away so you can review approvals, statuses, resources, and campaign updates in one place.",
    details: [
      "Review targets and campaign status live",
      "Track every podcast opportunity in one place",
      "Access guest resources and guides",
      "See updates without asking for them"
    ]
  },
  {
    number: "03",
    title: "Guest Profile Creation",
    duration: "Day 2-3",
    icon: FileText,
    description: "We build a clear guest profile with the background, topics, and positioning a host needs to quickly understand why you are worth booking.",
    details: [
      "Your background and credentials",
      "Core talking points and topics",
      "Clear reasons you are a strong guest",
      "A simple format hosts can scan fast"
    ]
  },
  {
    number: "04",
    title: "Target Show Shortlist",
    duration: "Week 1",
    icon: ThumbsUp,
    description: "We research a shortlist of podcasts that fit your expertise and buyer. You approve or reject each show before any outreach starts.",
    details: [
      "Hand-picked shows based on fit, not vanity",
      "You approve every podcast target",
      "Reject anything that feels off-brand",
      "Nothing gets pitched without your OK"
    ]
  },
  {
    number: "05",
    title: "Outreach Approval",
    duration: "Week 1-2",
    icon: MessageSquare,
    description: "We write outreach around your angle and the show, then you review it before anything is sent on your behalf.",
    details: [
      "Custom pitch direction for each show",
      "You review the messaging before we send",
      "Adjust tone and talking points if needed",
      "Keep control over your voice"
    ]
  },
  {
    number: "06",
    title: "Host Outreach Starts",
    duration: "After Approvals",
    icon: Send,
    description: "Once targets and messaging are approved, we start outreach and follow-up. Your portal updates as conversations move forward.",
    details: [
      "Personalized outreach to each host",
      "Follow-up sequences included",
      "Portal updates as replies come in",
      "Clear visibility when a show is in motion"
    ]
  },
  {
    number: "07",
    title: "Booking Confirmed",
    duration: "As They Come In",
    icon: Mic,
    description: "As soon as a host confirms, you are notified. We handle the scheduling details and keep the booking moving.",
    details: [
      "Notification as soon as a booking lands",
      "Calendar coordination handled for you",
      "All details stored in your portal",
      "Less inbox back-and-forth on your side"
    ]
  },
  {
    number: "08",
    title: "Guest Prep Kit",
    duration: "Before Recording",
    icon: Headphones,
    description: "Pro clients receive a prep kit before each recording so you can show up informed, sharp, and ready to lead a strong conversation.",
    details: [
      "Podcast background research",
      "Notes on the host's interview style",
      "Suggested talking points",
      "Common questions to expect"
    ],
    proBadge: true
  },
  {
    number: "09",
    title: "Recording Reminders",
    duration: "Recording Day",
    icon: Bell,
    description: "We remind you when a recording is coming up so you are prepared and not scrambling at the last minute.",
    details: [
      "Reminder before recording",
      "Technical setup checklist",
      "Last-minute prep tips",
      "You can focus on the conversation"
    ]
  },
  {
    number: "10",
    title: "Episode Goes Live",
    duration: "When Published",
    icon: PlayCircle,
    description: "When your episode publishes, we notify you and share the links so you can amplify the appearance quickly.",
    details: [
      "Notified when the episode publishes",
      "Episode links delivered in one place",
      "Easy to share across channels",
      "Portal updated with the live appearance"
    ]
  },
  {
    number: "11",
    title: "Ongoing Reporting",
    duration: "Always Available",
    icon: BarChart3,
    description: "Your portal keeps the full record of what was approved, pitched, booked, recorded, and published so you can see campaign momentum over time.",
    details: [
      "Track every live appearance",
      "See the campaign by stage",
      "Review publish history over time",
      "Keep one source of truth for the work"
    ]
  }
];

const heroSignals = [
  {
    icon: ThumbsUp,
    title: 'Approval first',
    description: 'You review podcasts and messaging before outreach starts.',
  },
  {
    icon: LayoutDashboard,
    title: 'Portal visibility',
    description: 'Approvals, replies, bookings, and publish dates live in one place.',
  },
  {
    icon: Bell,
    title: 'Clear updates',
    description: 'You hear when something needs approval or when a booking lands.',
  },
];

const summaryCards = [
  {
    label: 'Day 1',
    title: 'Strategy call and portal access',
    description: 'We align on your angle, then open the portal so visibility starts immediately.',
  },
  {
    label: 'Week 1',
    title: 'Shortlist and approvals',
    description: 'Shows are researched and reviewed before anything gets pitched.',
  },
  {
    label: 'Week 1-2',
    title: 'Outreach goes live',
    description: 'Once approvals are in, pitching and follow-up begin.',
  },
  {
    label: 'Ongoing',
    title: 'Bookings, prep, and publish tracking',
    description: 'The campaign keeps moving through recording and live episode delivery.',
  },
];

const protectionPrinciples = [
  {
    icon: ThumbsUp,
    title: 'Approval before outreach',
    description: 'Podcasts and messaging are reviewed before anything gets sent on your behalf.',
  },
  {
    icon: LayoutDashboard,
    title: 'Live visibility',
    description: 'Your portal shows approvals, outreach, replies, bookings, and publish status in one place.',
  },
  {
    icon: BookOpen,
    title: 'Prep resources included',
    description: 'You get practical guidance on prep, equipment, and how to show up well when the recording date arrives.',
  },
];

const WhatToExpect = () => {
  return (
    <div className="homepage-shell min-h-screen bg-transparent">
      <PageSEO
        title="What to Expect After You Sign Up | Get On A Pod"
        description="See exactly how Get On A Pod runs a podcast booking campaign, from shortlist call to published episode."
        path="/what-to-expect"
      />
      <Navbar />

      <section className="paper-noise relative overflow-hidden px-4 pb-12 pt-24 sm:pt-32 md:pb-16 md:pt-36">
        <div className="absolute inset-x-0 top-0 h-px bg-[#0d1b2a]/8" />
        <div className="absolute left-0 top-20 h-[260px] w-[260px] rounded-full bg-[#b46a3c]/10 blur-3xl sm:h-[380px] sm:w-[380px]" />
        <div className="absolute right-0 top-14 h-[220px] w-[220px] rounded-full bg-[#d9c6b3]/45 blur-3xl sm:h-[360px] sm:w-[360px]" />

        <div className="container relative mx-auto">
          <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr] xl:gap-12">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <p className="section-kicker">What to expect</p>
                <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f6efe7] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7a6554]">
                  From kickoff to published episode
                </span>
              </div>

              <h1 className="mt-6 max-w-4xl font-editorial text-[clamp(3rem,10vw,6rem)] leading-[0.92] tracking-[-0.045em] text-[#0d1b2a] text-balance">
                What happens after you sign up.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-[#54473d] sm:text-lg md:text-xl">
                You approve targets and messaging before outreach starts, and you can see the campaign live in your portal from day one.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button variant="hero" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="heroOutline" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                  <a href="/#pricing">View Pricing</a>
                </Button>
              </div>

              <p className="mt-4 text-sm leading-6 text-[#76665a]">
                The call is where we pressure-test fit and show the kinds of podcasts worth targeting.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {heroSignals.map((signal) => (
                  <div
                    key={signal.title}
                    className="rounded-[24px] border border-[#0d1b2a]/8 bg-[#fffdf9]/94 px-5 py-5 shadow-[0_18px_40px_rgba(13,27,42,0.08)]"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#fff3e8] text-[#b46a3c]">
                      <signal.icon className="h-5 w-5" strokeWidth={1.8} />
                    </div>
                    <p className="mt-4 font-display text-xl font-semibold tracking-[-0.03em] text-[#0d1b2a]">
                      {signal.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#6a5a4d]">
                      {signal.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5 xl:pt-2">
              <div className="rounded-[34px] border border-[#0d1b2a]/10 bg-[#fffdf9]/94 p-6 shadow-[0_26px_58px_rgba(13,27,42,0.12)] sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-xl">
                    <p className="section-kicker">Campaign cadence</p>
                    <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-[#0d1b2a] sm:text-4xl">
                      The process is visible from day one.
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-[#54473d] sm:text-base">
                      Nothing disappears into a black box. The work moves through clear approval points, active outreach, bookings, and publish tracking.
                    </p>
                  </div>
                  <div className="rounded-full border border-[#0d1b2a]/10 bg-[#f6efe7] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#7a6554]">
                    11 delivery checkpoints
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {summaryCards.map((card) => (
                    <div
                      key={card.title}
                      className="rounded-[22px] border border-[#0d1b2a]/8 bg-white px-4 py-4"
                    >
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#b46a3c]">
                        {card.label}
                      </p>
                      <p className="mt-3 font-display text-xl font-semibold tracking-[-0.03em] text-[#0d1b2a]">
                        {card.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#6a5a4d]">
                        {card.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[34px] border border-[#0d1b2a]/10 bg-[#081a2b] p-6 text-[#f7fafc] shadow-[0_28px_64px_rgba(13,27,42,0.18)] sm:p-7">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="section-kicker text-[#d4b08f]">What the workflow protects</p>
                  <span className="rounded-full border border-[#d4b08f]/25 bg-[#d4b08f]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0ddc8]">
                    Approval-led process
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {protectionPrinciples.map((principle) => (
                    <div
                      key={principle.title}
                      className="flex items-start gap-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#d4b08f]/12 text-[#eed6bf]">
                        <principle.icon className="h-5 w-5" strokeWidth={1.8} />
                      </div>
                      <div>
                        <p className="font-display text-lg font-semibold tracking-[-0.03em] text-[#f7fafc]">
                          {principle.title}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-[#d8c8b5]">
                          {principle.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:py-20">
        <div className="container mx-auto">
          <div className="grid gap-10 xl:grid-cols-[0.34fr_0.66fr] xl:gap-12">
            <div className="max-w-xl xl:sticky xl:top-28 xl:self-start">
              <p className="section-kicker">Delivery timeline</p>
              <h2 className="mt-4 font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                A visible process from shortlist to published episode.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-[#54473d] sm:text-lg">
                The core point of this page is simple: you can see what stage the campaign is in, what needs approval, and what is already moving.
              </p>

              <div className="mt-8 rounded-[28px] border border-[#0d1b2a]/8 bg-[#fffaf4]/92 p-5 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
                <p className="section-kicker">What stays true throughout</p>
                <div className="mt-4 space-y-3">
                  {[
                    'No outreach starts until targets and direction are approved.',
                    'The portal stays current as replies, bookings, and publish dates come in.',
                    'Prep and reminder support kick in before each recording.',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-[18px] border border-[#0d1b2a]/8 bg-white px-4 py-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b46a3c]" />
                      <p className="text-sm leading-7 text-[#3f342c]">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {steps.map((step) => (
                <article
                  key={step.number}
                  className="rounded-[30px] border border-[#0d1b2a]/8 bg-[#fffdf9]/94 p-5 shadow-[0_18px_40px_rgba(13,27,42,0.08)] sm:p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#b46a3c]/16 bg-[#fff3e8] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[#b46a3c]">
                      Step {step.number}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7a6554]">
                      {step.duration}
                    </span>
                    {step.proBadge && (
                      <span className="rounded-full border border-[#d4b08f]/30 bg-[#0d1b2a] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[#f0ddc8]">
                        Pro
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#f6efe7] text-[#b46a3c] sm:h-14 sm:w-14">
                      <step.icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a] sm:text-[1.9rem]">
                        {step.title}
                      </h3>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-[#54473d] sm:text-base">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {step.details.map((detail) => (
                      <div
                        key={detail}
                        className="flex items-start gap-3 rounded-[18px] border border-[#0d1b2a]/8 bg-white px-4 py-4"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b46a3c]" />
                        <span className="text-sm leading-7 text-[#3f342c]">{detail}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:py-20">
        <div className="container mx-auto">
          <div className="rounded-[34px] border border-[#0d1b2a]/8 bg-[#fffaf4]/92 p-6 shadow-[0_20px_42px_rgba(13,27,42,0.08)] sm:p-8 lg:p-10">
            <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
              <div className="max-w-2xl">
                <p className="section-kicker">Built to protect</p>
                <h2 className="mt-4 font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                  The process is built to keep control, visibility, and prep intact.
                </h2>
              </div>
              <p className="max-w-xl text-base leading-8 text-[#54473d] sm:text-lg">
                This is why the campaign is organized around approvals, portal visibility, and prep support instead of vague agency updates.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {protectionPrinciples.map((principle) => (
                <div
                  key={principle.title}
                  className="rounded-[24px] border border-[#0d1b2a]/8 bg-white px-5 py-5 shadow-[0_14px_32px_rgba(13,27,42,0.06)]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#fff3e8] text-[#b46a3c]">
                    <principle.icon className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[#0d1b2a]">
                    {principle.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-[#54473d]">
                    {principle.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 pt-2 md:pb-24">
        <div className="container mx-auto">
          <div className="overflow-hidden rounded-[36px] border border-[#0d1b2a]/10 bg-[#081a2b] px-6 py-8 text-[#f7fafc] shadow-[0_30px_70px_rgba(13,27,42,0.2)] sm:px-8 sm:py-10 md:px-10">
            <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="section-kicker text-[#d4b08f]">Next step</p>
                  <span className="rounded-full border border-[#d4b08f]/25 bg-[#d4b08f]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0ddc8]">
                    Pressure-test fit first
                  </span>
                </div>
                <h2 className="mt-4 font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#f7fafc] sm:text-5xl md:text-6xl">
                  Want to see what this would look like for your market?
                </h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-[#d8c8b5] sm:text-lg">
                  Book a shortlist call. We will pressure-test fit and show you the kinds of podcasts worth targeting.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button variant="hero" size="xl" className="w-full rounded-full px-8 sm:w-auto" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="heroOutline"
                  size="xl"
                  className="w-full rounded-full border-white/15 bg-white/5 px-8 text-[#f7fafc] shadow-none hover:border-[#d4b08f]/35 hover:bg-white/10 sm:w-auto"
                  asChild
                >
                  <a href="/#pricing">View Pricing</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default WhatToExpect;
