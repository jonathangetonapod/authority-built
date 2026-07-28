-- An agency's clients should never see our name.
--
-- Branding already covers the logo, the colours, and the name on the page, but
-- every one of those pages is served from getonapod.com, and the address bar
-- is the one piece of chrome a client cannot help reading. This table is what
-- lets a workspace answer on its own hostname.
--
-- A hostname belongs to exactly one workspace, globally. That is not a
-- convenience — it is the whole security model. The public pages authenticate
-- by unguessable slug alone, so once two workspaces can answer on the same
-- host, one agency's client can open another agency's prospect dashboard on a
-- domain that looks like their own. The unique index below is what makes that
-- unrepresentable; the resolved workspace is what the public functions check a
-- slug against.
--
-- Rows are written by service-role edge functions only, driven by a platform
-- administrator. No tenant policy is granted because nothing in the tenant app
-- reads this table directly — the same arrangement as client_notifications.

BEGIN;

CREATE TABLE public.workspace_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Always stored lowercase and trimmed. A mixed-case row would compare unequal
  -- to the Host header it is supposed to match and would silently resolve to
  -- nothing, so the shape is a constraint rather than a convention.
  hostname TEXT NOT NULL,
  -- 'awaiting_dns'  the provider has the domain, DNS does not point at it yet
  -- 'provisioning'  DNS resolves, the certificate is still being issued
  -- 'active'        serving
  -- 'failed'        the provider refused it; last_error says why
  -- 'disabled'      kept for history, never resolved
  status TEXT NOT NULL DEFAULT 'awaiting_dns',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  provider TEXT NOT NULL DEFAULT 'railway',
  provider_domain_id TEXT,
  -- What the agency must create at their DNS host, echoed back verbatim so
  -- support never has to reconstruct it.
  dns_record_type TEXT NOT NULL DEFAULT 'CNAME',
  dns_record_name TEXT,
  dns_record_value TEXT,
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT workspace_domains_hostname_normalized
    CHECK (hostname = lower(btrim(hostname))),
  CONSTRAINT workspace_domains_hostname_shape
    CHECK (
      char_length(hostname) BETWEEN 4 AND 253
      AND hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
      AND hostname !~ '\.\.'
    ),
  -- The platform's own origins are not claimable. A workspace holding
  -- getonapod.com would inherit its CORS entry and its branding.
  CONSTRAINT workspace_domains_not_platform_origin
    CHECK (hostname NOT IN ('getonapod.com', 'www.getonapod.com')),
  CONSTRAINT workspace_domains_status_vocabulary
    CHECK (status IN ('awaiting_dns', 'provisioning', 'active', 'failed', 'disabled')),
  -- Only a serving domain carries an activation date, and only a failed one
  -- carries a reason. Anything else is a status that disagrees with itself.
  CONSTRAINT workspace_domains_activation_matches_status
    CHECK ((status = 'active') = (activated_at IS NOT NULL)),
  CONSTRAINT workspace_domains_primary_is_active
    CHECK (NOT is_primary OR status = 'active')
);

ALTER TABLE public.workspace_domains ENABLE ROW LEVEL SECURITY;

-- One workspace per hostname, across the whole platform. This is the index the
-- white-label isolation rests on.
CREATE UNIQUE INDEX workspace_domains_hostname_idx
  ON public.workspace_domains (hostname);

-- The domain that client-facing links are built from. At most one per
-- workspace, so link generation never has to pick.
CREATE UNIQUE INDEX workspace_domains_primary_idx
  ON public.workspace_domains (workspace_id)
  WHERE is_primary;

CREATE INDEX workspace_domains_workspace_idx
  ON public.workspace_domains (workspace_id, created_at DESC);

COMMENT ON TABLE public.workspace_domains IS
  'Custom hostnames a workspace answers on. A hostname resolves to exactly one workspace; public slug-authenticated pages check their slug against the workspace resolved from the Host header.';

CREATE TRIGGER workspace_domains_touch_updated_at
  BEFORE UPDATE ON public.workspace_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Resolution. Called by the public resolver with the Host header, and by link
-- generation with a workspace id. Both answer only for a serving domain: a
-- half-provisioned hostname must not brand anything or authorize anything.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_workspace_domain_v1(
  p_hostname TEXT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'workspace_id', workspace.id,
    'hostname', domain.hostname,
    'workspace_name', workspace.name,
    'client_brand_name', COALESCE(
      NULLIF(btrim(workspace.client_brand_name), ''),
      workspace.name
    ),
    'client_brand_primary_color', COALESCE(workspace.client_brand_primary_color, '#0D1B2A'),
    'client_brand_accent_color', COALESCE(workspace.client_brand_accent_color, '#C7794F'),
    'logo_path', workspace.logo_path,
    'logo_updated_at', workspace.logo_updated_at,
    'booking_embed_url', workspace.booking_embed_url
  )
  FROM public.workspace_domains AS domain
  JOIN public.workspaces AS workspace
    ON workspace.id = domain.workspace_id
    AND workspace.status = 'active'
  WHERE domain.hostname = lower(btrim(p_hostname))
    AND domain.status = 'active';
$$;

COMMENT ON FUNCTION public.resolve_workspace_domain_v1(TEXT) IS
  'Resolves a Host header to the workspace serving it, with the brand a client should see. Returns null for an unknown, inactive, or half-provisioned hostname.';

REVOKE ALL ON FUNCTION public.resolve_workspace_domain_v1(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_workspace_domain_v1(TEXT)
  TO service_role;

-- The origin client-facing links should be built from. Null means the
-- workspace has no serving domain and the caller falls back to APP_URL.
CREATE OR REPLACE FUNCTION public.workspace_primary_domain_v1(
  p_workspace_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT domain.hostname
  FROM public.workspace_domains AS domain
  JOIN public.workspaces AS workspace
    ON workspace.id = domain.workspace_id
    AND workspace.status = 'active'
  WHERE domain.workspace_id = p_workspace_id
    AND domain.is_primary
    AND domain.status = 'active';
$$;

COMMENT ON FUNCTION public.workspace_primary_domain_v1(UUID) IS
  'The hostname a workspace''s client-facing links should use, or null to fall back to the platform origin.';

REVOKE ALL ON FUNCTION public.workspace_primary_domain_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_primary_domain_v1(UUID)
  TO service_role;

-- Every hostname currently allowed to call an edge function from a browser.
-- The CORS allowlist reads this instead of widening to a wildcard.
CREATE OR REPLACE FUNCTION public.active_workspace_domain_origins_v1()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg('https://' || domain.hostname ORDER BY domain.hostname), '{}')
  FROM public.workspace_domains AS domain
  JOIN public.workspaces AS workspace
    ON workspace.id = domain.workspace_id
    AND workspace.status = 'active'
  WHERE domain.status = 'active';
$$;

COMMENT ON FUNCTION public.active_workspace_domain_origins_v1() IS
  'https origins of every serving workspace domain, for the edge CORS allowlist.';

REVOKE ALL ON FUNCTION public.active_workspace_domain_origins_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.active_workspace_domain_origins_v1()
  TO service_role;

COMMIT;
