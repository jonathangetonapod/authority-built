-- Client-added calendar events.
--
-- A client can add a recording or an episode-going-live date they arranged
-- themselves. These are ordinary bookings so they flow through the same
-- portal calendar, dashboard, and workspace Podcast activity views — the
-- flag records who put them there, so the workspace can tell a self-booked
-- appearance from one the agency placed, and so the portal only lets a
-- client edit or remove their own entries.

ALTER TABLE public.bookings
  ADD COLUMN created_by_client BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX bookings_client_added_idx
  ON public.bookings (client_id)
  WHERE created_by_client;
