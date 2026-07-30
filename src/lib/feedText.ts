/**
 * Podcast feeds publish names and descriptions as HTML: entities in titles
 * ("The Good, Bad, &amp; the Ugly") and <p> tags in descriptions. Decode once
 * at the service boundary so no surface — a list cell, a dialog, or an email a
 * host actually reads — renders markup.
 *
 * This mirrors decodeFeedText in supabase/functions/_shared/promptVariables.ts.
 * The two runtimes cannot share a module, so they share behaviour instead and
 * a host sees the same show name whether it came from a prompt or a draft.
 */
export function decodeFeedText(value: string): string {
  const withoutTags = value
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(p|div|h[1-6])>/giu, '\n\n')
    .replace(/<\/(li|tr)>/giu, '\n')
    .replace(/<[a-zA-Z/][^>]*>/gu, ' ')
  // One pass, so an escaped entity like "&amp;lt;" decodes to "&lt;" and not
  // to "<": decoding the ampersand separately would re-read its own output.
  const decoded = withoutTags.replace(
    /&(nbsp|amp|lt|gt|quot|apos|hellip|ndash|mdash|[lr]squo|[lr]dquo|#0?39|#x27|#821[167]|#822[01]|#8230|#8212);/giu,
    (entity) => {
      const key = entity.slice(1, -1).toLowerCase()
      switch (key) {
        case 'nbsp': return ' '
        case 'amp': return '&'
        case 'lt': return '<'
        case 'gt': return '>'
        case 'quot': case 'ldquo': case 'rdquo': case '#8220': case '#8221': return '"'
        case 'apos': case '#39': case '#039': case '#x27': return "'"
        case 'lsquo': case '#8216': return '‘'
        case 'rsquo': case '#8217': return '’'
        case 'hellip': case '#8230': return '…'
        case 'ndash': case '#8211': return '–'
        case 'mdash': case '#8212': return '—'
        default: return entity
      }
    },
  )
  // The space a stripped tag leaves behind is an artefact of the markup, so it
  // does not survive next to a break it did not create.
  return decoded
    .replace(/[ \t]+/gu, ' ')
    .replace(/[ \t]*\n[ \t]*/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}
