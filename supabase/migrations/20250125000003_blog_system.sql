-- AI-Powered Blog System Migration
-- Creates 3 tables: blog_posts, blog_categories, blog_indexing_log
-- Created: 2025-01-25

-- =====================================================
-- Table 1: blog_categories
-- =====================================================

CREATE TABLE public.blog_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blog_categories_slug ON blog_categories(slug);

COMMENT ON TABLE blog_categories IS 'Categories for organizing blog posts';
COMMENT ON COLUMN blog_categories.slug IS 'URL-friendly identifier for category';

-- =====================================================
-- Table 2: blog_posts
-- =====================================================

CREATE TABLE public.blog_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image_url TEXT,
  featured_image_alt TEXT,

  -- SEO fields
  focus_keyword TEXT,
  schema_markup JSONB,

  -- Taxonomy
  category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',

  -- Publishing
  status TEXT CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  published_at TIMESTAMPTZ,

  -- Analytics
  view_count INTEGER DEFAULT 0,
  read_time_minutes INTEGER DEFAULT 5,

  -- Indexing tracking
  submitted_to_google_at TIMESTAMPTZ,
  indexed_by_google_at TIMESTAMPTZ,
  google_indexing_status TEXT,

  -- Metadata
  author_name TEXT DEFAULT 'Get On A Pod Team',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX idx_blog_posts_category ON blog_posts(category_id);
CREATE INDEX idx_blog_posts_created_at ON blog_posts(created_at DESC);

COMMENT ON TABLE blog_posts IS 'Main blog posts table with SEO and analytics fields';
COMMENT ON COLUMN blog_posts.content IS 'Rich HTML content from TipTap editor';
COMMENT ON COLUMN blog_posts.schema_markup IS 'JSON-LD structured data for Google rich results';

-- =====================================================
-- Table 3: blog_indexing_log
-- =====================================================

CREATE TABLE public.blog_indexing_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  service TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_blog_indexing_post ON blog_indexing_log(post_id);
CREATE INDEX idx_blog_indexing_created ON blog_indexing_log(created_at DESC);
CREATE INDEX idx_blog_indexing_service ON blog_indexing_log(service);
CREATE INDEX idx_blog_indexing_status ON blog_indexing_log(status);

COMMENT ON TABLE blog_indexing_log IS 'Tracks Google Indexing API submission attempts';
COMMENT ON COLUMN blog_indexing_log.service IS 'Service used: google';
COMMENT ON COLUMN blog_indexing_log.action IS 'Action performed: submit, update, check_status';
COMMENT ON COLUMN blog_indexing_log.status IS 'Result: success, failed, pending';

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- blog_categories: Public read, admin write
ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are publicly readable"
ON blog_categories FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage categories"
ON blog_categories FOR ALL
USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- blog_posts: Published posts public, admin full access
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published posts are publicly readable"
ON blog_posts FOR SELECT
USING (status = 'published');

CREATE POLICY "Only admins can manage posts"
ON blog_posts FOR ALL
USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- blog_indexing_log: Admin only
ALTER TABLE blog_indexing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view indexing logs"
ON blog_indexing_log FOR SELECT
USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

CREATE POLICY "Only admins can insert indexing logs"
ON blog_indexing_log FOR INSERT
WITH CHECK (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- =====================================================
-- Seed Data: Blog Categories
-- =====================================================

INSERT INTO blog_categories (name, slug, description, display_order) VALUES
  ('Podcast Strategy', 'podcast-strategy', 'Tips and strategies for podcast guesting success', 1),
  ('Content Marketing', 'content-marketing', 'Content marketing and thought leadership insights', 2),
  ('Authority Building', 'authority-building', 'Building credibility and authority in your industry', 3),
  ('SEO & Growth', 'seo-growth', 'SEO strategies and growth tactics', 4),
  ('Case Studies', 'case-studies', 'Real success stories and examples', 5);

-- =====================================================
-- Trigger: Update updated_at timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_blog_posts_updated_at
    BEFORE UPDATE ON blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Migration Complete
-- =====================================================

-- Verify tables were created
DO $$
BEGIN
    RAISE NOTICE 'Blog system migration completed successfully!';
    RAISE NOTICE 'Tables created: blog_categories, blog_posts, blog_indexing_log';
    RAISE NOTICE 'RLS policies enabled for all tables';
    RAISE NOTICE 'Seeded % categories', (SELECT COUNT(*) FROM blog_categories);
END $$;
