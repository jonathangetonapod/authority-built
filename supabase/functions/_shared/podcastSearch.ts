const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1_536

export async function generatePodcastSearchEmbedding(search: string | null): Promise<number[] | null> {
  if (!search || search.length < 3) return null
  if (Deno.env.get('PODCAST_SEMANTIC_SEARCH_ENABLED')?.trim().toLowerCase() !== 'true') return null
  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!apiKey) return null

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: search,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      const errorCode = errorPayload
        && typeof errorPayload === 'object'
        && !Array.isArray(errorPayload)
        && 'error' in errorPayload
        && errorPayload.error
        && typeof errorPayload.error === 'object'
        && !Array.isArray(errorPayload.error)
        && 'code' in errorPayload.error
        && typeof errorPayload.error.code === 'string'
        ? errorPayload.error.code
        : 'unknown'
      console.warn(
        '[PodcastSearch] Embedding provider returned a non-success status',
        response.status,
        errorCode,
      )
      return null
    }
    const payload = await response.json()
    const embedding = payload?.data?.[0]?.embedding
    return Array.isArray(embedding) && embedding.length === EMBEDDING_DIMENSIONS ? embedding : null
  } catch (error) {
    console.warn(
      '[PodcastSearch] Embedding provider was unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    )
    return null
  }
}
