import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const mode = process.argv.slice(2)
if (mode.length !== 1 || !['--static', '--database'].includes(mode[0])) {
  throw new Error('Choose exactly one sitemap source: --static or --database')
}
const USE_DATABASE = mode[0] === '--database'

const SUPABASE_URL =
  process.env.PODCASTS_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''

const SUPABASE_KEY =
  process.env.PODCASTS_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
function resolveBaseUrl(): string {
  try {
    const parsed = new URL(process.env.VITE_APP_URL || 'https://getonapod.com')
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.origin
  } catch {
    // Use the production canonical origin below.
  }
  return 'https://getonapod.com'
}

const BASE_URL = resolveBaseUrl()

interface BlogPost {
  slug: string
  updated_at: string
  published_at: string
}

async function generateSitemap() {
  console.log('🗺️  Generating sitemap...')

  let posts: BlogPost[] = []
  if (USE_DATABASE && SUPABASE_URL && SUPABASE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    if (error) throw new Error('Sitemap database query failed')
    posts = (data || []).filter(
      (post): post is BlogPost => typeof post?.slug === 'string' && post.slug.length > 0,
    )
  } else if (USE_DATABASE) {
    throw new Error('Sitemap database credentials are required in strict mode')
  } else {
    console.log('Static sitemap mode: database access disabled')
  }

  console.log(`📝 Found ${posts.length} published posts`)

  // Static pages
  const staticPages = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/podcast-booking', priority: '0.9', changefreq: 'weekly' },
    { url: '/blog', priority: '0.9', changefreq: 'daily' },
    { url: '/resources', priority: '0.8', changefreq: 'weekly' },
    { url: '/course', priority: '0.8', changefreq: 'monthly' },
    { url: '/what-to-expect', priority: '0.8', changefreq: 'monthly' },
  ]

  // Generate XML
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${BASE_URL}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
${posts
  .map(
    (post: BlogPost) => `  <url>
    <loc>${BASE_URL}/blog/${encodeURIComponent(post.slug)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${safeDate(post.updated_at || post.published_at)}
  </url>`
  )
  .join('\n')}
</urlset>
`

  // Write to public directory
  const sitemapPath = resolve(process.cwd(), 'public', 'sitemap.xml')
  writeFileSync(sitemapPath, sitemap, 'utf-8')

  console.log(`✅ Sitemap generated: ${sitemapPath}`)
  console.log(`📊 Total URLs: ${staticPages.length + posts.length}`)
}

function safeDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : `\n    <lastmod>${date.toISOString().split('T')[0]}</lastmod>`
}

generateSitemap().catch((error) => {
  console.error('❌ Failed to generate sitemap:', error)
  process.exit(1)
})
