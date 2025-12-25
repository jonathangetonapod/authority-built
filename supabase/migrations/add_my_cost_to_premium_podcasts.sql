-- Add my_cost column to premium_podcasts table
-- This is an admin-only field that tracks the cost to purchase the placement

ALTER TABLE premium_podcasts
ADD COLUMN IF NOT EXISTS my_cost TEXT;

COMMENT ON COLUMN premium_podcasts.my_cost IS 'Admin-only field: the cost to purchase this podcast placement';
