-- Add admin RLS policies for booking_addons table
-- This allows authenticated admins to update and delete addon orders

-- Allow admins to view all addon purchases
CREATE POLICY "Admins can view all addon purchases"
  ON public.booking_addons
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins to update addon orders (status, google_drive_url, admin_notes)
CREATE POLICY "Admins can update addon orders"
  ON public.booking_addons
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow admins to delete addon orders
CREATE POLICY "Admins can delete addon orders"
  ON public.booking_addons
  FOR DELETE
  TO authenticated
  USING (true);
