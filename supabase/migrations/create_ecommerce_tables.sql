-- E-commerce Database Schema Migration
-- Creates tables for customers, orders, and order items

-- =============================================================================
-- CUSTOMERS TABLE
-- =============================================================================
-- Stores customer information and aggregate purchase data
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers(email);
CREATE INDEX IF NOT EXISTS customers_stripe_id_idx ON public.customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS customers_created_at_idx ON public.customers(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.customers IS 'Stores customer information and purchase statistics';
COMMENT ON COLUMN public.customers.stripe_customer_id IS 'Stripe customer ID for linking to Stripe dashboard';
COMMENT ON COLUMN public.customers.total_orders IS 'Cached count of paid orders';
COMMENT ON COLUMN public.customers.total_spent IS 'Cached sum of all paid order amounts';

-- =============================================================================
-- ORDERS TABLE
-- =============================================================================
-- Stores order header information and payment status
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- Stripe payment data
  stripe_checkout_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,

  -- Order details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',

  -- Customer snapshot (preserved even if customer record changes)
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  paid_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_stripe_session_idx ON public.orders(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_paid_at_idx ON public.orders(paid_at DESC);

-- Add comments
COMMENT ON TABLE public.orders IS 'Stores order information and payment status';
COMMENT ON COLUMN public.orders.status IS 'Order status: pending (created but not paid), paid (payment successful), failed (payment failed), refunded (payment refunded)';
COMMENT ON COLUMN public.orders.stripe_checkout_session_id IS 'Unique Stripe Checkout Session ID';
COMMENT ON COLUMN public.orders.customer_email IS 'Snapshot of customer email at time of order';
COMMENT ON COLUMN public.orders.customer_name IS 'Snapshot of customer name at time of order';

-- =============================================================================
-- ORDER_ITEMS TABLE
-- =============================================================================
-- Stores individual items within each order
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  premium_podcast_id UUID NOT NULL REFERENCES public.premium_podcasts(id),

  -- Item snapshot (prices and details at time of purchase)
  podcast_name TEXT NOT NULL,
  podcast_image_url TEXT,
  price_at_purchase DECIMAL(10, 2) NOT NULL CHECK (price_at_purchase >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_podcast_id_idx ON public.order_items(premium_podcast_id);

-- Add comments
COMMENT ON TABLE public.order_items IS 'Stores line items for each order with pricing snapshot';
COMMENT ON COLUMN public.order_items.podcast_name IS 'Snapshot of podcast name at time of purchase';
COMMENT ON COLUMN public.order_items.price_at_purchase IS 'Price charged for this item (preserved even if podcast price changes later)';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for re-running migration)
DROP POLICY IF EXISTS "Admin full access to customers" ON public.customers;
DROP POLICY IF EXISTS "Admin full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Admin full access to order_items" ON public.order_items;

-- CUSTOMERS: Admin-only access
CREATE POLICY "Admin full access to customers"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ORDERS: Admin-only access
CREATE POLICY "Admin full access to orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ORDER_ITEMS: Admin-only access
CREATE POLICY "Admin full access to order_items"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for customers table
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for orders table
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant permissions to authenticated users (admins)
GRANT ALL ON public.customers TO authenticated;
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.order_items TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================================================
-- VERIFICATION QUERIES (commented out - for manual testing)
-- =============================================================================

-- Uncomment to verify tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('customers', 'orders', 'order_items');

-- Uncomment to verify indexes were created:
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('customers', 'orders', 'order_items');

-- Uncomment to verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('customers', 'orders', 'order_items');
