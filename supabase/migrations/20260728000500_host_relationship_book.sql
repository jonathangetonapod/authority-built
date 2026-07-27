-- The relationship book: what this agency knows about a host, kept by people.
--
-- The relationship function reduces campaigns, conversations, and bookings
-- into one derived state per show. That answers "what happened", but not
-- "what do we know" — who the human is, what they said on a call, which
-- clients we intend to put in front of them next. An agency's standing with a
-- host is its compounding asset, and none of it lived anywhere durable.
--
-- Derived state stays derived. These tables hold only what a person curates,
-- so a sync can never overwrite an operator's note.

CREATE TABLE public.workspace_host_relationships (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Podscan show id. The book is kept per show, while contact_email carries
  -- the human, so hosts who run several shows can be reconciled later.
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  host_name TEXT,
  contact_email TEXT,
  -- Operator's own read of the relationship, independent of derived state.
  -- Null means "trust what the pipeline derived".
  manual_stage TEXT CHECK (manual_stage IN ('nurturing', 'warm', 'do_not_contact')),
  summary TEXT,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, podcast_id)
);

COMMENT ON TABLE public.workspace_host_relationships IS
  'Operator-curated record of a workspace''s relationship with one show/host. Derived outreach state is computed separately and never written here.';

-- Which clients belong in front of this host, including ones not yet pitched.
CREATE TABLE public.workspace_host_relationship_clients (
  workspace_id UUID NOT NULL,
  podcast_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- 'considering' is the point of the table: a plan recorded before any
  -- outreach exists, so the next pitch is deliberate rather than accidental.
  intent TEXT NOT NULL DEFAULT 'considering'
    CHECK (intent IN ('considering', 'pitched', 'placed', 'declined', 'ruled_out')),
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, podcast_id, client_id),
  FOREIGN KEY (workspace_id, podcast_id)
    REFERENCES public.workspace_host_relationships(workspace_id, podcast_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.workspace_host_relationship_clients IS
  'Clients associated with a host relationship, including ones only being considered for a future pitch.';

-- Append-only history. A relationship is a sequence of interactions, and a
-- single editable notes box loses who knew what when.
CREATE TABLE public.workspace_host_relationship_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  podcast_id TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note', 'call', 'meeting', 'stage_change', 'system')),
  body TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, podcast_id)
    REFERENCES public.workspace_host_relationships(workspace_id, podcast_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.workspace_host_relationship_events IS
  'Append-only timeline of notes and interactions for a host relationship.';

CREATE INDEX workspace_host_relationship_events_timeline_idx
  ON public.workspace_host_relationship_events (workspace_id, podcast_id, occurred_at DESC);
CREATE INDEX workspace_host_relationship_clients_client_idx
  ON public.workspace_host_relationship_clients (workspace_id, client_id);
CREATE INDEX workspace_host_relationships_contact_idx
  ON public.workspace_host_relationships (workspace_id, lower(contact_email))
  WHERE contact_email IS NOT NULL;

-- Paired isolation policies, matching the tenancy pattern: reachable only
-- through SECURITY DEFINER helpers and the service role.
ALTER TABLE public.workspace_host_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_host_relationships FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_host_relationships FROM PUBLIC, anon, authenticated;
CREATE POLICY workspace_host_relationships_isolation
  ON public.workspace_host_relationships FOR ALL
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

ALTER TABLE public.workspace_host_relationship_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_host_relationship_clients FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_host_relationship_clients FROM PUBLIC, anon, authenticated;
CREATE POLICY workspace_host_relationship_clients_isolation
  ON public.workspace_host_relationship_clients FOR ALL
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

ALTER TABLE public.workspace_host_relationship_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_host_relationship_events FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_host_relationship_events FROM PUBLIC, anon, authenticated;
CREATE POLICY workspace_host_relationship_events_isolation
  ON public.workspace_host_relationship_events FOR ALL
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

-- The book, joined to what actually happened. Every show this workspace has
-- touched appears, whether or not anyone has curated it yet, so the list is a
-- true register rather than only the entries somebody remembered to create.
CREATE OR REPLACE FUNCTION public.workspace_host_relationship_book_v1(
  p_workspace_id UUID,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  podcast_id TEXT,
  podcast_name TEXT,
  host_name TEXT,
  contact_email TEXT,
  derived_state TEXT,
  manual_stage TEXT,
  summary TEXT,
  last_contacted_at TIMESTAMPTZ,
  touch_count INTEGER,
  booked_client_name TEXT,
  client_count INTEGER,
  note_count INTEGER,
  last_note_at TIMESTAMPTZ,
  curated BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH known AS (
  SELECT DISTINCT podcast_id FROM public.workspace_client_campaign_targets WHERE workspace_id = p_workspace_id
  UNION
  SELECT DISTINCT podcast_id FROM public.workspace_inbox_thread_state
    WHERE workspace_id = p_workspace_id AND podcast_id IS NOT NULL
  UNION
  SELECT DISTINCT podcast_id FROM public.workspace_host_relationships WHERE workspace_id = p_workspace_id
),
rel AS (
  SELECT * FROM public.workspace_podcast_relationships_v1(
    p_workspace_id,
    ARRAY(SELECT k.podcast_id FROM known k WHERE k.podcast_id IS NOT NULL)
  )
)
SELECT
  rel.podcast_id,
  COALESCE(book.podcast_name, cat.podcast_name, tgt.podcast_name) AS podcast_name,
  COALESCE(book.host_name, cat.host_name, tgt.host_name) AS host_name,
  COALESCE(book.contact_email, rel.contact_email) AS contact_email,
  rel.state AS derived_state,
  book.manual_stage,
  book.summary,
  rel.last_contacted_at,
  rel.touch_count,
  rel.booked_client_name,
  COALESCE((
    SELECT COUNT(*)::INTEGER FROM public.workspace_host_relationship_clients rc
    WHERE rc.workspace_id = p_workspace_id AND rc.podcast_id = rel.podcast_id
  ), 0) AS client_count,
  COALESCE((
    SELECT COUNT(*)::INTEGER FROM public.workspace_host_relationship_events ev
    WHERE ev.workspace_id = p_workspace_id AND ev.podcast_id = rel.podcast_id AND ev.kind <> 'system'
  ), 0) AS note_count,
  (
    SELECT MAX(ev.occurred_at) FROM public.workspace_host_relationship_events ev
    WHERE ev.workspace_id = p_workspace_id AND ev.podcast_id = rel.podcast_id
  ) AS last_note_at,
  (book.podcast_id IS NOT NULL) AS curated
FROM rel
LEFT JOIN public.workspace_host_relationships book
  ON book.workspace_id = p_workspace_id AND book.podcast_id = rel.podcast_id
LEFT JOIN public.podcasts cat ON cat.podscan_id = rel.podcast_id
LEFT JOIN LATERAL (
  SELECT t.podcast_name, t.host_name
  FROM public.workspace_client_campaign_targets t
  WHERE t.workspace_id = p_workspace_id AND t.podcast_id = rel.podcast_id
  ORDER BY t.updated_at DESC
  LIMIT 1
) tgt ON TRUE
ORDER BY
  -- Live and warm relationships first; they are the ones an operator acts on.
  CASE rel.state
    WHEN 'in_conversation' THEN 0
    WHEN 'booked' THEN 1
    WHEN 'replied' THEN 2
    WHEN 'declined' THEN 3
    WHEN 'suppressed' THEN 4
    ELSE 5
  END,
  rel.last_contacted_at DESC NULLS LAST
LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
$$;

COMMENT ON FUNCTION public.workspace_host_relationship_book_v1(UUID, INTEGER) IS
  'Every host this workspace has touched, with derived outreach state joined to the operator-curated record.';

REVOKE ALL ON FUNCTION public.workspace_host_relationship_book_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_host_relationship_book_v1(UUID, INTEGER) TO service_role;
