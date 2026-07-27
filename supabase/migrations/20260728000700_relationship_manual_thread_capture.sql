-- Manual relationship entry and durable Master Inbox conversation capture.
--
-- Provider inboxes are operational views, not an agency's permanent memory.
-- A relationship therefore owns a workspace-scoped snapshot of any thread an
-- operator deliberately saves. The provider thread key makes capture
-- idempotent while the snapshot keeps the useful context if the provider
-- history later moves out of the inbox window.

CREATE TABLE public.workspace_host_relationship_threads (
  workspace_id UUID NOT NULL,
  podcast_id TEXT NOT NULL,
  thread_key TEXT NOT NULL CHECK (char_length(thread_key) BETWEEN 1 AND 120),
  client_id UUID,
  provider TEXT NOT NULL DEFAULT 'instantly'
    CHECK (provider IN ('instantly')),
  latest_message_id TEXT CHECK (latest_message_id IS NULL OR char_length(latest_message_id) <= 120),
  subject TEXT CHECK (subject IS NULL OR char_length(subject) <= 300),
  lead_email TEXT CHECK (lead_email IS NULL OR char_length(lead_email) <= 320),
  from_email TEXT CHECK (from_email IS NULL OR char_length(from_email) <= 320),
  to_email TEXT CHECK (to_email IS NULL OR char_length(to_email) <= 320),
  latest_message_body TEXT CHECK (
    latest_message_body IS NULL OR char_length(latest_message_body) <= 20000
  ),
  latest_message_at TIMESTAMPTZ,
  campaign_id TEXT CHECK (campaign_id IS NULL OR char_length(campaign_id) <= 120),
  campaign_name TEXT CHECK (campaign_name IS NULL OR char_length(campaign_name) <= 300),
  captured_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, thread_key),
  CONSTRAINT workspace_host_relationship_threads_relationship_fk
    FOREIGN KEY (workspace_id, podcast_id)
    REFERENCES public.workspace_host_relationships(workspace_id, podcast_id) ON DELETE CASCADE,
  CONSTRAINT workspace_host_relationship_threads_workspace_client_fk
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE SET NULL (client_id)
);

COMMENT ON TABLE public.workspace_host_relationship_threads IS
  'Durable snapshots of provider inbox conversations deliberately saved to a host relationship.';

CREATE INDEX workspace_host_relationship_threads_timeline_idx
  ON public.workspace_host_relationship_threads (
    workspace_id,
    podcast_id,
    latest_message_at DESC NULLS LAST,
    updated_at DESC
  );

ALTER TABLE public.workspace_host_relationship_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_host_relationship_threads FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_host_relationship_threads
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_host_relationship_threads TO service_role;
CREATE POLICY workspace_host_relationship_threads_isolation
  ON public.workspace_host_relationship_threads FOR ALL
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));
