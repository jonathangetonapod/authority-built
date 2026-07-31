import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { fetchPromptModels, thinkingForModel } from './promptModels.ts'

const page = (data: unknown[], hasMore = false, lastId?: string) =>
  new Response(JSON.stringify({ data, has_more: hasMore, last_id: lastId }), { status: 200 })

const withFetch = async (impl: typeof fetch, run: () => Promise<void>) => {
  const original = globalThis.fetch
  globalThis.fetch = impl
  try {
    await run()
  } finally {
    globalThis.fetch = original
  }
}

// The trap the disabled-thinking config exists for: max_tokens is one budget
// covering thinking AND the answer, so a stage capped at 4,096 on a model that
// thinks unprompted can return a truncated report that still reads like one.
Deno.test('disables thinking only for the models that would otherwise think', () => {
  assertEquals(thinkingForModel('claude-opus-5'), { type: 'disabled' })
  assertEquals(thinkingForModel('claude-sonnet-5'), { type: 'disabled' })
  // Sending a thinking parameter to a model that will not accept one fails the
  // stage outright, so silence is the safe default for everything else.
  assertEquals(thinkingForModel('claude-sonnet-4-6'), null)
  assertEquals(thinkingForModel('claude-haiku-4-5-20251001'), null)
  assertEquals(thinkingForModel('a-model-that-ships-next-year'), null)
})

Deno.test('reads the live list, newest first, with the fields the picker needs', async () => {
  await withFetch(
    () => Promise.resolve(page([
      { id: 'claude-opus-5', display_name: 'Claude Opus 5', max_input_tokens: 1_000_000, max_tokens: 128_000 },
      { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', max_input_tokens: 200_000, max_tokens: 64_000 },
    ])),
    async () => {
      const models = await fetchPromptModels('key')
      assertEquals(models.length, 2)
      assertEquals(models[0], {
        id: 'claude-opus-5',
        label: 'Claude Opus 5',
        contextTokens: 1_000_000,
        maxOutputTokens: 128_000,
        thinksByDefault: true,
      })
      assertEquals(models[1].thinksByDefault, false)
    },
  )
})

// A truncated first page presented as the whole list would hide models the
// workspace can actually use.
Deno.test('follows the cursor to the end of the list', async () => {
  let calls = 0
  await withFetch(
    () => {
      calls += 1
      return Promise.resolve(calls === 1
        ? page([{ id: 'model-a' }], true, 'model-a')
        : page([{ id: 'model-b' }]))
    },
    async () => {
      assertEquals((await fetchPromptModels('key')).map((m) => m.id), ['model-a', 'model-b'])
      assertEquals(calls, 2)
    },
  )
})

// A cursor that never terminates must not spin the invocation into the
// platform's two-minute ceiling.
Deno.test('stops following the cursor rather than looping forever', async () => {
  let calls = 0
  await withFetch(
    () => {
      calls += 1
      return Promise.resolve(page([{ id: `model-${calls}` }], true, `model-${calls}`))
    },
    async () => {
      await fetchPromptModels('key')
      assertEquals(calls, 10)
    },
  )
})

Deno.test('drops entries with no usable id and falls back to the id as a label', async () => {
  await withFetch(
    () => Promise.resolve(page([
      { id: 'claude-sonnet-5' },
      { display_name: 'No id at all' },
      { id: '   ' },
      null,
      'not an object',
    ])),
    async () => {
      const models = await fetchPromptModels('key')
      assertEquals(models.length, 1)
      assertEquals(models[0].id, 'claude-sonnet-5')
      assertEquals(models[0].label, 'claude-sonnet-5')
      assertEquals(models[0].contextTokens, null)
    },
  )
})

// A failure has to surface as "the list could not be read", never as an empty
// list — an empty picker looks like a workspace with no models available.
Deno.test('raises rather than returning an empty list when the API fails', async () => {
  await withFetch(
    () => Promise.resolve(new Response('nope', { status: 401 })),
    async () => {
      await assertRejects(() => fetchPromptModels('key'), Error, '401')
    },
  )
})
