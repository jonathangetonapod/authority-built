-- Add DELETE policy for client_podcast_feedback table
-- This table uses public access (no authentication) for the client approval dashboard
-- Matching the existing INSERT and UPDATE policies that also use USING (true)

CREATE POLICY "Public delete access for client_podcast_feedback"
  ON client_podcast_feedback
  FOR DELETE
  USING (true);
