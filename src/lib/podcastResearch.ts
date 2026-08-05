import type { PodcastData } from '@/services/podscan'

export type ResearchTier = 'a' | 'b' | 'c' | 'review' | 'excluded'

/*
 * Discovery asks one question — how many do you want? — and keeps searching
 * until it has them or the keywords run dry. Three named strategies were three
 * ways of saying "some", and the operator still had to guess which one produced
 * the number they actually needed.
 */
export const DISCOVERY_TARGETS = [25, 50, 100, 250, 500] as const
export const DEFAULT_DISCOVERY_TARGET = 100

/** Pages of one keyword before it is considered spent, whatever the target. */
export const MAX_PAGES_PER_QUERY = 10

/**
 * Keywords to search for a target. Breadth beats depth — a further keyword
 * reaches new shows where a further page of the same one returns the tail of a
 * set already collected — so this grows with the target and then stops.
 */
export function queryCountForTarget(target: number): number {
  return Math.min(20, Math.max(4, Math.ceil(target / 12)))
}

export interface ResearchResult {
  podcast: PodcastData
  sources: string[]
  matchedQueries: string[]
  relevanceScore: number | null
  relevanceReasoning?: string
}

export interface OutreachPriority {
  score: number
  factors: Array<{ label: string; points: number; detail: string }>
}

export interface NormalizedChartCategory {
  id: string
  name: string
}

export function normalizeChartCategories(value: unknown): NormalizedChartCategory[] {
  const categories = new Map<string, NormalizedChartCategory>()

  const visit = (entry: unknown, fallbackId?: string) => {
    if (typeof entry === 'string' && fallbackId) {
      categories.set(fallbackId, { id: fallbackId, name: entry })
      return
    }
    if (Array.isArray(entry)) {
      entry.forEach((item) => visit(item))
      return
    }
    if (!entry || typeof entry !== 'object') return

    const record = entry as Record<string, unknown>
    const idValue = record.id || record.category_id || record.slug || fallbackId
    const nameValue = record.name || record.title || record.label
    const id = typeof idValue === 'string' || typeof idValue === 'number' ? String(idValue) : ''
    const name = typeof nameValue === 'string' || typeof nameValue === 'number' ? String(nameValue) : ''

    if (id && name) categories.set(id, { id, name })
    if (record.subcategories) visit(record.subcategories)

    if (!id || !name) {
      for (const [key, nested] of Object.entries(record)) {
        if (!['id', 'category_id', 'slug', 'name', 'title', 'label', 'subcategories'].includes(key)) {
          visit(nested, key)
        }
      }
    }
  }

  visit(value)
  return Array.from(categories.values())
}

function mergeDefined<T extends Record<string, unknown>>(base: T | undefined, incoming: T | undefined): T | undefined {
  if (!base && !incoming) return undefined
  const merged = { ...(base || {}) } as T
  if (!incoming) return merged

  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key as keyof T] = value as T[keyof T]
    }
  }
  return merged
}

export function mergePodcastData(base: PodcastData, incoming: PodcastData): PodcastData {
  const merged = mergeDefined(
    base as unknown as Record<string, unknown>,
    incoming as unknown as Record<string, unknown>,
  ) as unknown as PodcastData

  merged.reach = mergeDefined(base.reach, incoming.reach)
  if (base.reach?.itunes || incoming.reach?.itunes) {
    merged.reach = merged.reach || {}
    merged.reach.itunes = mergeDefined(base.reach?.itunes, incoming.reach?.itunes)
  }
  if (base.reach?.spotify || incoming.reach?.spotify) {
    merged.reach = merged.reach || {}
    merged.reach.spotify = mergeDefined(base.reach?.spotify, incoming.reach?.spotify)
  }

  const categoryMap = new Map<string, { category_id: string; category_name: string }>()
  for (const category of [...(base.podcast_categories || []), ...(incoming.podcast_categories || [])]) {
    categoryMap.set(category.category_id || category.category_name, category)
  }
  if (categoryMap.size > 0) merged.podcast_categories = Array.from(categoryMap.values())

  return merged
}

export function mergeResearchResults(
  existing: ResearchResult[],
  podcasts: PodcastData[],
  source: string,
  matchedQuery?: string,
): ResearchResult[] {
  /*
   * Keyed case-insensitively, like every podcast_id comparison in the finder.
   * A run now merges two indexes — the shared catalog and Podscan — and the
   * same show arriving with different casing counted twice, which both showed a
   * duplicate row and let the run stop early believing it had hit its target.
   */
  const key = (podcastId: string) => podcastId.toLowerCase()
  const byId = new Map(existing.map((result) => [key(result.podcast.podcast_id), result]))

  for (const podcast of podcasts) {
    if (!podcast.podcast_id) continue
    const current = byId.get(key(podcast.podcast_id))
    if (!current) {
      byId.set(key(podcast.podcast_id), {
        podcast,
        sources: [source],
        matchedQueries: matchedQuery ? [matchedQuery] : [],
        relevanceScore: null,
      })
      continue
    }

    byId.set(key(podcast.podcast_id), {
      ...current,
      /*
       * The stored podcast_id keeps the casing it was first seen with.
       * mergePodcastData overwrites every defined field, so without this the
       * exact-case id changes to whichever source merged last — and selection,
       * tier overrides, exclusions and the open detail panel are all keyed on
       * the raw id, so they silently detached from the row they belonged to.
       */
      podcast: { ...mergePodcastData(current.podcast, podcast), podcast_id: current.podcast.podcast_id },
      sources: Array.from(new Set([...current.sources, source])),
      matchedQueries: matchedQuery
        ? Array.from(new Set([...current.matchedQueries, matchedQuery]))
        : current.matchedQueries,
    })
  }

  return Array.from(byId.values())
}

export function normalizePodscanQuery(query: string): string {
  return query
    .trim()
    .replace(/'([^']+)'/g, '"$1"')
    .replace(/\s+/g, ' ')
}

function daysSince(dateValue: string | undefined, now: Date): number | null {
  if (!dateValue) return null
  const timestamp = Date.parse(dateValue)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000))
}

export function calculateOutreachPriority(podcast: PodcastData, now = new Date()): OutreachPriority {
  const factors: OutreachPriority['factors'] = []
  let score = 0

  if (podcast.reach?.email) {
    score += 30
    factors.push({ label: 'Contactability', points: 30, detail: 'Direct email available' })
  } else if (podcast.reach?.website || podcast.reach?.social_links?.length) {
    score += 14
    factors.push({ label: 'Contactability', points: 14, detail: 'Website or social route available' })
  } else {
    factors.push({ label: 'Contactability', points: 0, detail: 'No contact route in Podscan' })
  }

  const ageInDays = daysSince(podcast.last_posted_at, now)
  if (ageInDays !== null && ageInDays <= 30) {
    score += 25
    factors.push({ label: 'Activity', points: 25, detail: `Published ${ageInDays} day${ageInDays === 1 ? '' : 's'} ago` })
  } else if (ageInDays !== null && ageInDays <= 90) {
    score += 21
    factors.push({ label: 'Activity', points: 21, detail: `Published ${ageInDays} days ago` })
  } else if (ageInDays !== null && ageInDays <= 180) {
    score += 14
    factors.push({ label: 'Activity', points: 14, detail: `Published ${ageInDays} days ago` })
  } else {
    factors.push({ label: 'Activity', points: 0, detail: ageInDays === null ? 'Recent activity unknown' : 'No recent episode' })
  }

  if (podcast.podcast_has_guests === true) {
    score += 20
    factors.push({ label: 'Guest format', points: 20, detail: 'Guest interviews confirmed' })
  } else if (podcast.podcast_has_guests === undefined) {
    score += 8
    factors.push({ label: 'Guest format', points: 8, detail: 'Guest format not yet confirmed' })
  } else {
    factors.push({ label: 'Guest format', points: 0, detail: 'No guest format detected' })
  }

  const audience = podcast.reach?.audience_size
  if (audience !== undefined && audience >= 1_000 && audience <= 100_000) {
    score += 15
    factors.push({ label: 'Attainability', points: 15, detail: 'Strong boutique-outreach audience range' })
  } else if (audience !== undefined && audience > 100_000 && audience <= 500_000) {
    score += 10
    factors.push({ label: 'Attainability', points: 10, detail: 'Larger, more competitive show' })
  } else if (audience !== undefined && audience > 500_000) {
    score += 5
    factors.push({ label: 'Attainability', points: 5, detail: 'Very competitive audience size' })
  } else if (audience !== undefined) {
    score += 8
    factors.push({ label: 'Attainability', points: 8, detail: 'Smaller but potentially accessible show' })
  } else {
    score += 5
    factors.push({ label: 'Attainability', points: 5, detail: 'Audience estimate unavailable' })
  }

  const episodes = podcast.episode_count || 0
  if (episodes >= 50) {
    score += 10
    factors.push({ label: 'Consistency', points: 10, detail: `${episodes} published episodes` })
  } else if (episodes >= 15) {
    score += 7
    factors.push({ label: 'Consistency', points: 7, detail: `${episodes} published episodes` })
  } else if (episodes > 0) {
    score += 3
    factors.push({ label: 'Consistency', points: 3, detail: `${episodes} published episodes` })
  } else {
    factors.push({ label: 'Consistency', points: 0, detail: 'Episode count unavailable' })
  }

  return { score: Math.min(100, score), factors }
}

export function getResearchTier(
  relevanceScore: number | null,
  outreachPriority: number,
  override?: Exclude<ResearchTier, 'excluded'>,
  excluded = false,
): ResearchTier {
  if (excluded) return 'excluded'
  if (override) return override
  if (relevanceScore === null) return 'review'
  if (relevanceScore >= 80 && outreachPriority >= 65) return 'a'
  if (relevanceScore >= 65 && outreachPriority >= 50) return 'b'
  if (relevanceScore >= 45) return 'c'
  return 'review'
}

export function tierLabel(tier: ResearchTier): string {
  if (tier === 'a') return 'Tier A'
  if (tier === 'b') return 'Tier B'
  if (tier === 'c') return 'Tier C'
  if (tier === 'excluded') return 'Excluded'
  return 'Needs review'
}

export function compositeResearchScore(relevanceScore: number | null, outreachPriority: number): number {
  if (relevanceScore === null) return Math.round(outreachPriority * 0.45)
  return Math.round((relevanceScore * 0.65) + (outreachPriority * 0.35))
}
