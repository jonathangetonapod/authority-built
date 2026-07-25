-- Add-on Services System (Upsells for published episodes)
-- Starting with clips package

-- ============================================================================
-- 1. ADDON SERVICES TABLE (Catalog of available services)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.addon_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  short_description TEXT, -- For card/banner display
  price_cents INTEGER NOT NULL, -- Price in cents
  stripe_product_id TEXT UNIQUE,
  stripe_price_id TEXT UNIQUE,
  active BOOLEAN DEFAULT true,
  features JSONB DEFAULT '[]'::jsonb, -- Array of feature strings
  delivery_days INTEGER DEFAULT 5, -- Expected delivery timeline
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for active services
CREATE INDEX IF NOT EXISTS addon_services_active_idx ON public.addon_services(active);

COMMENT ON TABLE public.addon_services IS 'Catalog of available add-on services (clips, transcription, etc)';
COMMENT ON COLUMN public.addon_services.price_cents IS 'Price in cents (e.g., 14900 = $149.00)';
COMMENT ON COLUMN public.addon_services.features IS 'JSON array of feature bullet points';

-- ============================================================================
-- 2. BOOKING ADDONS TABLE (Track purchases)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.booking_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.addon_services(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Payment info
  stripe_payment_intent_id TEXT UNIQUE,
  amount_paid_cents INTEGER NOT NULL,

  -- Fulfillment
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'delivered', 'cancelled')),
  google_drive_url TEXT,
  admin_notes TEXT,

  -- Timestamps
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS booking_addons_booking_id_idx ON public.booking_addons(booking_id);
CREATE INDEX IF NOT EXISTS booking_addons_client_id_idx ON public.booking_addons(client_id);
CREATE INDEX IF NOT EXISTS booking_addons_status_idx ON public.booking_addons(status);
CREATE INDEX IF NOT EXISTS booking_addons_purchased_at_idx ON public.booking_addons(purchased_at DESC);

COMMENT ON TABLE public.booking_addons IS 'Track addon service purchases per booking';
COMMENT ON COLUMN public.booking_addons.status IS 'pending = paid, awaiting fulfillment | in_progress = being worked on | delivered = completed | cancelled = refunded/cancelled';

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.addon_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_addons ENABLE ROW LEVEL SECURITY;

-- Addon Services: Public can view active services
CREATE POLICY "Anyone can view active addon services"
  ON public.addon_services
  FOR SELECT
  USING (active = true);

-- Booking Addons: Clients can view their own purchases
CREATE POLICY "Clients can view their own addon purchases"
  ON public.booking_addons
  FOR SELECT
  USING (client_id = auth.uid()::uuid);

-- Booking Addons: Clients can insert (purchase) their own addons
CREATE POLICY "Clients can purchase addons for their bookings"
  ON public.booking_addons
  FOR INSERT
  WITH CHECK (client_id = auth.uid()::uuid);

-- Admin policies (service role has full access by default)

-- ============================================================================
-- 4. SEED DATA - Short-Form Content Package
-- ============================================================================

INSERT INTO public.addon_services (
  name,
  description,
  short_description,
  price_cents,
  active,
  features,
  delivery_days
) VALUES (
  'Short-Form Content Package',
  'Get 5 professionally edited short clips (15-60 seconds) optimized for Instagram Reels, TikTok, and YouTube Shorts. Each clip is hook-first edited with captions to maximize engagement and views.',
  'Get 5 professionally edited clips optimized for social media',
  14900, -- $149.00 (sample price)
  true,
  '["5 engaging short clips (15-60s)", "Optimized for Instagram, TikTok, YouTube Shorts", "Hook-first editing for maximum retention", "Captions included", "Delivered via Google Drive"]'::jsonb,
  5
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_addon_services_updated_at
  BEFORE UPDATE ON public.addon_services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_addons_updated_at
  BEFORE UPDATE ON public.booking_addons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
