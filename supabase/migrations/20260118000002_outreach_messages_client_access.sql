-- Add RLS policy for clients to view their own outreach messages
CREATE POLICY "Clients can view their own outreach messages"
  ON outreach_messages FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients
      WHERE clients.email = auth.jwt() ->> 'email'
    )
  );

COMMENT ON POLICY "Clients can view their own outreach messages" ON outreach_messages IS 'Allows clients to view outreach messages that were sent on their behalf';
