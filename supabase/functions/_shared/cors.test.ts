import { resolveAllowedOrigins } from './cors.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const PRODUCTION_ORIGINS = [
  'https://getonapod.com',
  'https://www.getonapod.com',
]

Deno.test('CORS defaults to only the Get On A Pod production origins', () => {
  const origins = resolveAllowedOrigins(undefined, [])
  assert(
    JSON.stringify(origins) === JSON.stringify(PRODUCTION_ORIGINS),
    'production defaults changed',
  )
})

Deno.test('CORS requires explicit development mode for every localhost origin', () => {
  for (const environment of [undefined, '', 'staging', 'production', 'develop']) {
    const origins = resolveAllowedOrigins(environment, [
      'http://localhost:8080,https://localhost.:8443,http://dev.localhost:3000,http://127.0.0.2:54321,https://[::1]:8443',
    ])
    assert(
      !origins.some((origin) => origin.includes('localhost')),
      'localhost escaped development mode',
    )
    assert(
      !origins.some((origin) => origin.includes('127.0.0.1')),
      'loopback escaped development mode',
    )
    assert(
      !origins.some((origin) => origin.includes('127.0.0.2')),
      'loopback range escaped development mode',
    )
    assert(!origins.some((origin) => origin.includes('[::1]')), 'IPv6 loopback escaped development mode')
  }
})

Deno.test('CORS development mode enables local origins explicitly', () => {
  const origins = resolveAllowedOrigins('development', [
    'http://127.0.0.2:54321,https://localhost:8443,http://localhost:8080,https://[::1]:8443',
  ])
  assert(
    origins.includes('http://127.0.0.2:54321'),
    'configured loopback origin is missing',
  )
  assert(
    origins.includes('https://localhost:8443'),
    'configured secure localhost origin is missing',
  )
  assert(origins.includes('https://[::1]:8443'), 'configured IPv6 loopback origin is missing')
  assert(origins.includes('http://localhost:8080'), 'standard local origin is missing')
  assert(new Set(origins).size === origins.length, 'development origins were not deduplicated')
})

Deno.test('CORS admits a non-default HTTPS domain only when configured', () => {
  const unconfigured = resolveAllowedOrigins('production', [])
  assert(
    !unconfigured.includes('https://legacy-domain.example'),
    'legacy origin is enabled by default',
  )

  const configured = resolveAllowedOrigins('production', [
    'https://legacy-domain.example,https://www.legacy-domain.example,http://example.com',
  ])
  assert(
    configured.includes('https://legacy-domain.example'),
    'configured legacy origin is missing',
  )
  assert(
    configured.includes('https://www.legacy-domain.example'),
    'configured legacy www origin is missing',
  )
  assert(!configured.includes('http://example.com'), 'insecure remote origin was accepted')
})
