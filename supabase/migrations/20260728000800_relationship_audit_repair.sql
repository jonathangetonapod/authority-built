-- Relationship records use Podscan or manual text identifiers, while the
-- shared audit log's entity_id column is UUID-only. Early relationship writes
-- persisted their operational rows and then failed while trying to place the
-- text podcast id in entity_id. Restore the two durable activity types that
-- can be reconstructed exactly and keep the text id in JSON metadata.

INSERT INTO public.workspace_audit_log (
  workspace_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  metadata,
  created_at
)
SELECT
  relationship_client.workspace_id,
  relationship_client.created_by,
  'workspace.host_relationship.client_linked',
  'podcast',
  NULL,
  jsonb_build_object(
    'podcast_id', relationship_client.podcast_id,
    'client_id', relationship_client.client_id,
    'intent', relationship_client.intent,
    'source', 'relationship_audit_repair'
  ),
  relationship_client.created_at
FROM public.workspace_host_relationship_clients relationship_client
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workspace_audit_log audit
  WHERE audit.workspace_id = relationship_client.workspace_id
    AND audit.action = 'workspace.host_relationship.client_linked'
    AND audit.metadata ->> 'podcast_id' = relationship_client.podcast_id
    AND audit.metadata ->> 'client_id' = relationship_client.client_id::TEXT
);

INSERT INTO public.workspace_audit_log (
  workspace_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  metadata,
  created_at
)
SELECT
  relationship_thread.workspace_id,
  relationship_thread.captured_by,
  'workspace.host_relationship.thread_captured',
  'podcast',
  NULL,
  jsonb_strip_nulls(jsonb_build_object(
    'podcast_id', relationship_thread.podcast_id,
    'thread_key', relationship_thread.thread_key,
    'client_id', relationship_thread.client_id,
    'provider', relationship_thread.provider,
    'source', 'relationship_audit_repair'
  )),
  relationship_thread.created_at
FROM public.workspace_host_relationship_threads relationship_thread
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workspace_audit_log audit
  WHERE audit.workspace_id = relationship_thread.workspace_id
    AND audit.action = 'workspace.host_relationship.thread_captured'
    AND audit.metadata ->> 'thread_key' = relationship_thread.thread_key
);
