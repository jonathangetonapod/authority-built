-- Add 'conversation_started' status to bookings

-- Drop the existing constraint
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Add the new constraint with 'conversation_started'
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('conversation_started', 'in_progress', 'booked', 'recorded', 'published', 'cancelled'));
