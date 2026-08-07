import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import PortalDashboardMvp from '@/pages/portal/DashboardMvp'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { getPortalExperience, removePortalCalendarEvent, setPortalNotifications, type PortalExperienceOverview } from '@/services/clientPortal'

vi.mock('@/components/portal/PortalLayout', () => ({ PortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/contexts/ClientPortalContext', () => ({ useClientPortal: vi.fn() }))
vi.mock('@/services/clientPortal', () => ({ getPortalExperience: vi.fn(), removePortalCalendarEvent: vi.fn(), setPortalNotifications: vi.fn() }))
// Only `toast` is imported from sonner anywhere in this tree (DashboardMvp,
// BookingDetailDialog), so mocking it lets the copy-failure path be asserted.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedUseClientPortal = vi.mocked(useClientPortal)
const mockedGetExperience = vi.mocked(getPortalExperience)

const clientId = '11111111-1111-4111-8111-111111111111'

function overview(): PortalExperienceOverview {
  return {
    profile: {
      name: 'Taylor Client',
      photo_url: null,
      bio: null,
      media_kit_url: 'https://example.com/media-kit.pdf',
      calendar_link: null,
      dashboard_tagline: 'Your podcast tour at a glance.',
    },
    review: {
      dashboard_slug: 'taylor-ab12cd34ef',
      total_visible: 6,
      awaiting_count: 4,
      approved_count: 2,
      rejected_count: 0,
    },
    outreach: {
      emails_sent: 42,
      podcasts_contacted: 18,
      replies: 5,
      meetings_booked: 2,
      in_outreach_count: 7,
      replied_count: 3,
      completed_count: 1,
    },
    pitch_profile: {
      professional_bio: 'Taylor helps founders scale operations.',
      positioning_summary: 'Operations expert',
      key_messages: ['Scale without chaos'],
      story_angles: ['From startup to exit'],
      talking_points: ['Hiring your first ops lead'],
      ideal_audience: 'Founders',
    },
    bookings: [
      {
        id: 'b1',
        podcast_name: 'Founder Stories',
        podcast_url: 'https://founderstories.example.com',
        host_name: 'Jamie Rivera',
        scheduled_date: '2099-03-01',
        recording_date: '2099-03-05',
        publish_date: null,
        status: 'booked',
        episode_url: null,
        podcast_image_url: null,
        podcast_description: null,
        audience_size: 12400,
        itunes_rating: 4.8,
        episode_count: 210,
      },
      {
        id: 'b2',
        podcast_name: 'Operator Weekly',
        podcast_url: null,
        host_name: null,
        scheduled_date: '2026-01-10',
        recording_date: '2026-01-12',
        publish_date: '2026-02-01',
        status: 'published',
        episode_url: 'https://podcasts.example.com/operator-weekly/42',
        podcast_image_url: 'https://images.example.com/operator.jpg',
        podcast_description: null,
        audience_size: null,
        itunes_rating: null,
        episode_count: null,
      },
    ],
  }
}

// Local calendar date N days from now — the component parses dates as local
// midnight, so building test dates from toISOString (UTC) can drift a day.
function localDay(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PortalDashboardMvp />
    </QueryClientProvider>,
  )
}

describe('PortalDashboardMvp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseClientPortal.mockReturnValue({
      client: { id: clientId, name: 'Taylor Client', dashboard_slug: 'taylor-ab12cd34ef' },
    } as never)
    mockedGetExperience.mockResolvedValue(overview())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /*
   * The dialog component never unmounts, and its armed "Confirm remove" used
   * to survive a dismissal — so opening a different event and tapping once
   * deleted it with no confirmation. Armed state must die with the booking it
   * was armed for.
   */
  it('disarms a pending remove when a different booking is opened', async () => {
    const withOwnEvents = overview()
    withOwnEvents.bookings.push(
      { ...withOwnEvents.bookings[0], id: 'own-a', podcast_name: 'My Event A', status: 'booked', created_by_client: true },
      { ...withOwnEvents.bookings[0], id: 'own-b', podcast_name: 'My Event B', status: 'booked', created_by_client: true },
    )
    mockedGetExperience.mockResolvedValue(withOwnEvents)

    renderPage()
    fireEvent.click((await screen.findAllByText('My Event A'))[0].closest('button') as HTMLElement)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeInTheDocument()

    // Dismiss without confirming, then open the other event.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    fireEvent.click((await screen.findAllByText('My Event B'))[0].closest('button') as HTMLElement)

    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm remove' })).not.toBeInTheDocument()
  })

  // Removal must leave the page telling the truth: the row disappears because
  // the overview is re-read, exactly as the Calendar page already does.
  it('re-reads the overview after removing a self-added event', async () => {
    const withOwnEvent = overview()
    withOwnEvent.bookings.push(
      { ...withOwnEvent.bookings[0], id: 'own-a', podcast_name: 'My Event A', status: 'booked', created_by_client: true },
    )
    mockedGetExperience.mockResolvedValue(withOwnEvent)
    vi.mocked(removePortalCalendarEvent).mockResolvedValue(undefined as never)

    renderPage()
    fireEvent.click((await screen.findAllByText('My Event A'))[0].closest('button') as HTMLElement)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))

    await waitFor(() => expect(mockedGetExperience).toHaveBeenCalledTimes(2))
  })

  /*
   * Nothing to summarize means no summary. Rendered unconditionally, the stat
   * tiles asserted "0" of everything above the error card that said the
   * numbers could not be loaded — a confidently wrong dashboard.
   */
  it('shows no zero-count tiles while the overview is unavailable', async () => {
    mockedGetExperience.mockRejectedValue(new Error('Session expired'))

    renderPage()

    // The shared hook retries once with backoff before erroring.
    expect(await screen.findByText(/couldn.t load your placements/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('Total placements')).not.toBeInTheDocument()
    expect(screen.queryByText('Combined audience')).not.toBeInTheDocument()
  })

  // Entered ahead of its air date, an episode is awaiting release — not "Live"
  // beside a date that has not happened.
  it('treats a future-dated published episode as awaiting release', async () => {
    const scheduled = overview()
    scheduled.bookings[1] = { ...scheduled.bookings[1], publish_date: localDay(10) }
    mockedGetExperience.mockResolvedValue(scheduled)

    renderPage()

    expect(await screen.findAllByText('Operator Weekly')).toHaveLength(2)
    expect(screen.getByText('Upcoming episode releases')).toBeInTheDocument()
    expect(screen.getByText('Goes live soon')).toBeInTheDocument()
    expect(screen.queryByText('New episode live')).not.toBeInTheDocument()
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })

  /*
   * In-app browsers open portal links without a clipboard API even over https,
   * and the bare property access threw before any .then could catch it — a
   * dead button with no feedback at all.
   */
  it('says copying is blocked instead of throwing where the clipboard API is missing', async () => {
    const fresh = overview()
    fresh.bookings[1] = { ...fresh.bookings[1], publish_date: localDay(-3) }
    mockedGetExperience.mockResolvedValue(fresh)
    Object.assign(navigator, { clipboard: undefined })

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Copying is blocked'))
  })

  /*
   * A refresh failing over data already on screen is one state with one owner:
   * the banner. It used to be two contradictory ones — live-looking panels
   * above a card claiming the session may have expired.
   */
  it('says the page could not refresh instead of contradicting itself over stale data', async () => {
    vi.mocked(setPortalNotifications).mockResolvedValue(true as never)
    renderPage()
    expect(await screen.findByText('Combined audience')).toBeInTheDocument()

    // The next read fails — a revoked session mid-view — and the notifications
    // toggle invalidates the overview, which is a real path to a background
    // refetch over data already on screen.
    mockedGetExperience.mockRejectedValue(new Error('revoked'))
    fireEvent.click(screen.getByRole('switch', { name: 'Email updates' }))

    expect(await screen.findByText(/could not refresh — you are looking at earlier data/i, {}, { timeout: 5000 }))
      .toBeInTheDocument()
    // The stale data stays on screen, owned by the banner — not by a
    // session-expired card contradicting it below.
    expect(screen.getByText('Combined audience')).toBeInTheDocument()
    expect(screen.queryByText(/could not load your placements/i)).not.toBeInTheDocument()
  })

  it('renders the review call-to-action with live counts and the journey stats', async () => {
    renderPage()

    expect(await screen.findByText('4 podcasts are waiting for your review')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review shortlist/i }))
      .toHaveAttribute('href', '/client/taylor-ab12cd34ef')
    expect(screen.getByText('Podcasts contacted').nextElementSibling).toHaveTextContent('18')
    expect(screen.getByText('Replies').nextElementSibling).toHaveTextContent('5')
    expect(screen.getByText('Your podcast tour at a glance.')).toBeInTheDocument()
    expect(mockedGetExperience).toHaveBeenCalledWith(clientId)
  })

  it('shows rich placements with episode links and the approved guest profile', async () => {
    renderPage()

    // Appears in both the upcoming recordings list and the placement list.
    expect(await screen.findAllByText('Founder Stories')).toHaveLength(2)
    expect(screen.getByText(/Hosted by Jamie Rivera/)).toBeInTheDocument()
    expect(screen.getByText(/12.4K listeners/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /listen/i }))
      .toHaveAttribute('href', 'https://podcasts.example.com/operator-weekly/42')
    expect(screen.getByRole('link', { name: /your media kit/i }))
      .toHaveAttribute('href', 'https://example.com/media-kit.pdf')
    expect(screen.getByText('Your guest profile')).toBeInTheDocument()
    expect(screen.getByText('Scale without chaos')).toBeInTheDocument()
    expect(screen.getByText('Hiring your first ops lead')).toBeInTheDocument()
  })

  /*
   * The value story: the combined audience of confirmed shows is the number a
   * client repeats to other people, and the raw counts never said it.
   * Confirmed shows only — b1 (booked, 12,400) counts, and a conversation
   * would not.
   */
  it('sums the combined audience of secured shows into the stats row', async () => {
    renderPage()

    expect(await screen.findByText('Combined audience')).toBeInTheDocument()
    expect(screen.getByText('Combined audience').nextElementSibling).toHaveTextContent('12.4K')
  })

  it('celebrates an episode that went live this week, with a link to send on', async () => {
    const fresh = overview()
    const liveDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    fresh.bookings[1] = { ...fresh.bookings[1], publish_date: liveDate }
    mockedGetExperience.mockResolvedValue(fresh)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderPage()

    expect(await screen.findByText('New episode live')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://podcasts.example.com/operator-weekly/42'))
  })

  // A month-old episode is a row, not news: the hero stands down.
  it('does not celebrate an episode past the news window', async () => {
    renderPage()

    expect(await screen.findAllByText('Operator Weekly')).toBeTruthy()
    expect(screen.queryByText('New episode live')).not.toBeInTheDocument()
  })

  /*
   * A confirmed booking without a date yet is the most reassuring thing the
   * upcoming panel can show, and requiring an upcoming date dropped exactly
   * those rows from it.
   */
  it('keeps a confirmed but undated booking in the upcoming panel as "Date coming"', async () => {
    const withUndated = overview()
    withUndated.bookings.push({
      ...withUndated.bookings[0],
      id: 'b3',
      podcast_name: 'Undated Confirmed Show',
      scheduled_date: null,
      recording_date: null,
      publish_date: null,
      status: 'booked',
    })
    mockedGetExperience.mockResolvedValue(withUndated)

    renderPage()

    // Once in upcoming, once in placements.
    expect(await screen.findAllByText('Undated Confirmed Show')).toHaveLength(2)
    expect(screen.getByText('Date coming')).toBeInTheDocument()
  })

  it('opens the placement details from an upcoming row, where prep lives', async () => {
    renderPage()

    // The upcoming row is a button; the placements list renders plain rows.
    fireEvent.click(await screen.findByRole('button', { name: /Founder Stories/ }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Founder Stories')
  })

  // Live first: the server orders by scheduled date, which buried a published
  // episode under whatever conversation started most recently.
  it('lists the live episode above the booked show', async () => {
    renderPage()

    const placements = (await screen.findAllByText(/Founder Stories|Operator Weekly/))
      .map((node) => node.textContent)
    expect(placements.indexOf('Operator Weekly')).toBeLessThan(placements.lastIndexOf('Founder Stories'))
  })

  /*
   * A conversation is not yet reach: when the only positive audience belongs
   * to an unconfirmed show, the stat must disappear entirely — a "Combined
   * audience: 0" tile would undersell the work, not report it.
   */
  it('omits the combined audience stat when no secured show carries an audience', async () => {
    const data = overview()
    data.bookings[0] = { ...data.bookings[0], audience_size: null }
    data.bookings.push({
      ...data.bookings[0],
      id: 'b-convo',
      podcast_name: 'Convo Only',
      status: 'conversation_started',
      scheduled_date: localDay(-5),
      recording_date: null,
      audience_size: 50_000,
    })
    mockedGetExperience.mockResolvedValue(data)

    renderPage()

    expect(await screen.findByText('Podcasts contacted')).toBeInTheDocument()
    expect(screen.queryByText('Combined audience')).not.toBeInTheDocument()
  })

  // Some hosts announce before the episode link exists: the card still
  // celebrates, but only Details is on offer — no Listen, no Copy link.
  it('celebrates a fresh episode without a link yet, offering details only', async () => {
    const data = overview()
    data.bookings[1] = { ...data.bookings[1], publish_date: localDay(-2), episode_url: null }
    mockedGetExperience.mockResolvedValue(data)

    renderPage()

    expect(await screen.findByText('New episode live')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /listen/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Details' }).length).toBeGreaterThan(0)
  })

  it('heroes the newest of two recently live episodes', async () => {
    const data = overview()
    data.bookings[1] = { ...data.bookings[1], publish_date: localDay(-10) }
    data.bookings.push({
      ...data.bookings[1],
      id: 'b-newest',
      podcast_name: 'Fresher Feed',
      publish_date: localDay(-2),
    })
    mockedGetExperience.mockResolvedValue(data)

    renderPage()

    const heroLabel = await screen.findByText('New episode live')
    expect(heroLabel.nextElementSibling).toHaveTextContent('Fresher Feed')
  })

  /*
   * The news window, pinned at both edges. Publish dates parse as local
   * midnight, so the window covers exactly 14 calendar dates: today and the
   * previous 13 days. A date exactly 14 days back is out (its age is 14 days
   * plus the time since midnight), and a future date is never news.
   */
  it('treats today as news, but not fourteen days ago or tomorrow', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-06T12:00:00'))

    const renderWithPublishDate = (publishDate: string) => {
      const data = overview()
      data.bookings[1] = { ...data.bookings[1], publish_date: publishDate }
      mockedGetExperience.mockResolvedValue(data)
      return renderPage()
    }

    const today = renderWithPublishDate('2026-08-06')
    expect(await screen.findByText('New episode live')).toBeInTheDocument()
    today.unmount()

    const fortnight = renderWithPublishDate('2026-07-23')
    expect((await screen.findAllByText('Operator Weekly')).length).toBeGreaterThan(0)
    expect(screen.queryByText('New episode live')).not.toBeInTheDocument()
    fortnight.unmount()

    const tomorrow = renderWithPublishDate('2026-08-07')
    expect((await screen.findAllByText('Operator Weekly')).length).toBeGreaterThan(0)
    expect(screen.queryByText('New episode live')).not.toBeInTheDocument()
    tomorrow.unmount()
  })

  // The client hit Copy and nothing landed on the clipboard: say so. The
  // rejection must be handled — an unhandled rejection here fails the run.
  it('reports a copy failure as an error toast', async () => {
    const data = overview()
    data.bookings[1] = { ...data.bookings[1], publish_date: localDay(-3) }
    mockedGetExperience.mockResolvedValue(data)
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The link could not be copied.'))
    expect(toast.success).not.toHaveBeenCalled()
  })

  /*
   * The full sort contract: live first and newest within a stage, a status
   * this code has never heard of lands mid-list with the conversations (not
   * on top), and cancelled sinks below everything.
   */
  it('sorts placements live-newest-first, unknown statuses mid-list, cancelled last', async () => {
    const data = overview()
    const base = data.bookings[0]
    data.bookings = [
      { ...base, id: 's1', podcast_name: 'Placement Cancelled', status: 'cancelled', scheduled_date: localDay(-60), recording_date: null, publish_date: null },
      { ...base, id: 's2', podcast_name: 'Placement Mystery', status: 'shadow_banned', scheduled_date: localDay(-120), recording_date: null, publish_date: null },
      { ...base, id: 's3', podcast_name: 'Placement Pub Old', status: 'published', scheduled_date: null, recording_date: null, publish_date: localDay(-200) },
      { ...base, id: 's4', podcast_name: 'Placement Convo', status: 'conversation_started', scheduled_date: localDay(-90), recording_date: null, publish_date: null },
      { ...base, id: 's5', podcast_name: 'Placement Pub New', status: 'published', scheduled_date: null, recording_date: null, publish_date: localDay(-100) },
    ]
    mockedGetExperience.mockResolvedValue(data)

    renderPage()

    await screen.findByText('Placement Pub New')
    const names = screen.getAllByText(/^Placement /).map((node) => node.textContent)
    expect(names).toEqual([
      'Placement Pub New',
      'Placement Pub Old',
      'Placement Convo',
      'Placement Mystery',
      'Placement Cancelled',
    ])
  })

  /*
   * A booked show whose only date has slipped into the past: it fails the
   * upcoming check and is not undated, so it leaves the upcoming panel and
   * lives on in placements only. Pinned as intended — advertising a past
   * date as "upcoming" or an existing date as "Date coming" would both lie.
   */
  it('drops a booked show whose only date has passed from the upcoming panel', async () => {
    const data = overview()
    data.bookings[0] = {
      ...data.bookings[0],
      podcast_name: 'Missed Date Show',
      scheduled_date: localDay(-30),
      recording_date: null,
    }
    mockedGetExperience.mockResolvedValue(data)

    renderPage()

    expect(await screen.findAllByText('Missed Date Show')).toHaveLength(1)
    expect(screen.queryByText('Date coming')).not.toBeInTheDocument()
  })

  it('celebrates a fully reviewed shortlist instead of nagging', async () => {
    const reviewed = overview()
    reviewed.review = { ...reviewed.review, awaiting_count: 0, approved_count: 6 }
    mockedGetExperience.mockResolvedValue(reviewed)

    renderPage()

    expect(await screen.findByText(/Shortlist reviewed — 6 approved/)).toBeInTheDocument()
    expect(screen.queryByText(/waiting for your review/)).not.toBeInTheDocument()
  })
})
