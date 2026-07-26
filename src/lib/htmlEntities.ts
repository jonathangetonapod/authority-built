// Podscan data carries HTML entities ("&amp;", "&#39;") in names and
// descriptions. Decode once at the service boundary so every surface —
// lists, dialogs, and generated pitch copy — renders plain text.
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#0?39;/gu, "'")
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCharCode(Number(code)))
}
