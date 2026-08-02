import { useQuery } from '@tanstack/react-query'

import { countWaitingJoinRequests } from '@/services/accessRequests'

/** Slow enough to be free, quick enough that you learn within the hour. */
const CHECK_EVERY_MS = 120_000

/**
 * How many people are waiting to hear back, on the way into the queue.
 *
 * A request used to arrive with nothing to notice it by: you had to remember to
 * open Manage workspaces and look. This is the noticing. It counts only what is
 * still waiting, so it clears itself as requests are actioned rather than
 * needing to be dismissed.
 *
 * The number is announced, not just coloured — a red dot says nothing to a
 * screen reader, and the count is the whole message.
 */
export function JoinRequestsBadge({ enabled }: { enabled: boolean }) {
  const waitingQuery = useQuery({
    queryKey: ['join-requests-waiting'],
    queryFn: countWaitingJoinRequests,
    // Platform admins only; nobody else can read the table anyway, and asking
    // would be a request per page load that always comes back empty.
    enabled,
    retry: false,
    refetchInterval: CHECK_EVERY_MS,
    refetchOnWindowFocus: true,
  })

  const waiting = waitingQuery.data ?? 0
  if (!enabled || waiting < 1) return null

  return (
    <span
      className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-background"
      role="status"
    >
      <span aria-hidden="true">{waiting > 9 ? '9+' : waiting}</span>
      <span className="sr-only">
        {waiting === 1 ? '1 request to join is waiting' : `${waiting} requests to join are waiting`}
      </span>
    </span>
  )
}
