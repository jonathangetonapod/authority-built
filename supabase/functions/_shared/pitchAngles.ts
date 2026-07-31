export interface StructuredAngle {
  title: string
  description: string
  /** The moment, quote or fact the angle is built on. Never client-facing. */
  grounding: string
}

/**
 * The angles find_topics proposed, read off the end of its own answer.
 *
 * The angles are the only thing that differs between the three sequence
 * options — everything else the pitch is written from is identical — so
 * whoever writes them decides what every pitch says. They were being written
 * twice: find_topics proposes three titled angles under detailed rules, and a
 * cheaper structuring pass then re-derived three of its own from a truncated
 * copy, and it was that second set the pitch was written from. This reads the
 * first set instead.
 *
 * Returns the answer with the block removed, so the prose the later stages
 * read is the report rather than the report plus its own JSON appendix.
 */
/**
 * How much may follow the angles block before it stops being "the last thing".
 *
 * Room for a closing line, not for another section of the proposal.
 */
const TRAILING_ALLOWANCE = 240

export function splitStructuredAngles(
  raw: string,
): { prose: string; angles: StructuredAngle[] } {
  // The last fence, not the first: a topic proposal may quote a fenced example
  // of its own, and the block asked for is always the final thing on the page.
  const matches = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gu)]
  const last = matches.at(-1)
  if (!last || last.index === undefined) return { prose: raw.trim(), angles: [] }

  // ...and it has to actually BE at the end. "Last fence" alone is not enough:
  // a proposal that ignored the instruction, but demonstrated the format
  // earlier with realistic content, leaves exactly one fence that parses — and
  // taking it would publish an illustration as the angles the pitches are
  // written from, while deleting whatever surrounded it. A short sign-off after
  // the block is allowed; a whole section is not.
  const trailing = raw.slice(last.index + last[0].length).trim()
  if (trailing.length > TRAILING_ALLOWANCE) return { prose: raw.trim(), angles: [] }

  const body = last[1]
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  let parsed: unknown = null
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(body.slice(start, end + 1))
    } catch {
      parsed = null
    }
  }
  const entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>).angles
    : null
  const angles = (Array.isArray(entries) ? entries : []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const record = entry as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    const description = typeof record.description === 'string' ? record.description.trim() : ''
    if (!title || !description) return []
    return [{
      title: title.slice(0, 160),
      description: description.slice(0, 800),
      grounding: typeof record.grounding === 'string' ? record.grounding.trim().slice(0, 800) : '',
    }]
  }).slice(0, 3)

  // Stripped only when the block actually parsed as the shape asked for. A
  // report may legitimately end on a fenced example, and cutting the last fence
  // off unconditionally would delete it whenever the model skipped the block.
  if (angles.length === 0) return { prose: raw.trim(), angles: [] }
  const prose = (raw.slice(0, last.index) + raw.slice(last.index + last[0].length)).trim()
  return { prose: prose || raw.trim(), angles }
}

