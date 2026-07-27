import { describe, expect, it } from 'vitest'
import { sortRelationships } from '@/lib/relationshipSort'

const row = (podcastName: string | null, hostName: string | null = null) => ({
  podcast_name: podcastName,
  host_name: hostName,
})

describe('sortRelationships', () => {
  it('leaves the server order alone for recent contact', () => {
    const rows = [row('Zebra Show'), row('Apple Show')]
    // The book already arrives most-recently-contacted first; re-sorting it
    // here would silently override that.
    expect(sortRelationships(rows, 'recent')).toBe(rows)
  })

  it('orders by show name without mutating the input', () => {
    const rows = [row('Zebra Show'), row('apple show'), row('Middle Show')]
    const sorted = sortRelationships(rows, 'show')
    expect(sorted.map((entry) => entry.podcast_name)).toEqual(['apple show', 'Middle Show', 'Zebra Show'])
    expect(rows[0].podcast_name).toBe('Zebra Show')
  })

  it('orders by host name independently of the show name', () => {
    const rows = [row('Apple Show', 'Zoe Host'), row('Zebra Show', 'Adam Host')]
    expect(sortRelationships(rows, 'host').map((entry) => entry.host_name))
      .toEqual(['Adam Host', 'Zoe Host'])
  })

  it('sinks unnamed rows instead of heading the list with them', () => {
    // "Show not identified" is not a name anyone searches under, and a run of
    // them at the top is what makes an alphabetical list useless.
    const rows = [row(null), row('Apple Show'), row(null), row('Zebra Show')]
    expect(sortRelationships(rows, 'show').map((entry) => entry.podcast_name))
      .toEqual(['Apple Show', 'Zebra Show', null, null])
  })

  it('decodes entities so an escaped name sorts where it reads', () => {
    const rows = [row('Bravo Show'), row('&amp;lpha Show')]
    const sorted = sortRelationships(rows, 'show')
    // Sorting the raw string would file this under "&", not "A".
    expect(sorted[0].podcast_name).toBe('&amp;lpha Show')
  })
})
