import { decodeFeedText } from '@/lib/feedText'

export type RelationshipSort = 'recent' | 'show' | 'host'

/**
 * Ordering for the host relationship book.
 *
 * The server returns most-recently-contacted first, which is the right default
 * but the wrong order for finding one host among a hundred — and folding the
 * legacy outreach ledger in took one workspace from 1 row to 106 in a day.
 *
 * Unnamed rows sink rather than heading an alphabetical list: "Show not
 * identified" is not a name anyone looks under, and a run of them at the top is
 * what makes sorting useless.
 */
export function sortRelationships<
  T extends { podcast_name: string | null; host_name: string | null },
>(rows: T[], sort: RelationshipSort): T[] {
  if (sort === 'recent') return rows
  return [...rows].sort((left, right) => {
    // Decoded before comparing, so an escaped "&amp;lpha" files under A rather
    // than under the ampersand it is stored as.
    const leftName = decodeFeedText((sort === 'host' ? left.host_name : left.podcast_name) ?? '').toLowerCase()
    const rightName = decodeFeedText((sort === 'host' ? right.host_name : right.podcast_name) ?? '').toLowerCase()
    if (!leftName) return rightName ? 1 : 0
    if (!rightName) return -1
    return leftName.localeCompare(rightName)
  })
}
