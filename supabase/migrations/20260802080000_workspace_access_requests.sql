-- The public landing page asks people to request access. Until now the only
-- reply-to was a mailto: link, which meant a request lived in one inbox and
-- nowhere else — nothing to sort, nothing to mark handled, and no record that a
-- request had ever been made if the mail was missed.
--
-- Access stays invite-only. This records the ask; a platform admin still issues
-- the invite by hand.

create table if not exists public.workspace_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  company text,
  website text,
  audience text not null,
  clients_now text,
  notes text,
  status text not null default 'new',
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  handled_note text,
  source_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The vocabulary an admin can actually move a request through. Anything not
  -- listed here is a status nothing writes and nobody can clear.
  constraint workspace_access_requests_status_check
    check (status in ('new', 'contacted', 'invited', 'declined')),
  -- 'audience' is the self-description the landing page's tabs collect. It
  -- decides which onboarding note the admin sends, so it is not free text.
  constraint workspace_access_requests_audience_check
    check (audience in ('agency', 'pr', 'freelancer', 'starting_out', 'other')),
  constraint workspace_access_requests_email_check
    check (email = lower(email) and email like '%@%.%')
);

comment on table public.workspace_access_requests is
  'Inbound requests for a workspace invite, submitted from the public landing page. Access remains invite-only; a platform admin issues the invite.';
comment on column public.workspace_access_requests.source_ip_hash is
  'Salted hash of the submitting IP, used only to rate-limit repeat submissions. Never the address itself.';

create index if not exists workspace_access_requests_status_created_idx
  on public.workspace_access_requests (status, created_at desc);

-- Rate limiting reads this within a short window; without it the lookup is a
-- sequential scan that grows with every request ever made.
create index if not exists workspace_access_requests_ip_recent_idx
  on public.workspace_access_requests (source_ip_hash, created_at desc)
  where source_ip_hash is not null;

alter table public.workspace_access_requests enable row level security;

-- No tenant owns this row: a request arrives before there is a workspace to own
-- it. The edge function writes with the service role, and platform admins are
-- the only ones who may read. Everyone else gets nothing, including the
-- submitter, who has no session to read with.
--
-- Gated on public.is_platform_admin(), the SECURITY DEFINER helper every other
-- current-generation policy uses. Querying admin_users directly here would be
-- both a weaker check (it skips the active-membership requirement) and a broken
-- one: admin_users is keyed by email and has no user_id column.
drop policy if exists workspace_access_requests_admin_read on public.workspace_access_requests;
create policy workspace_access_requests_admin_read
  on public.workspace_access_requests
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists workspace_access_requests_admin_write on public.workspace_access_requests;
create policy workspace_access_requests_admin_write
  on public.workspace_access_requests
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- A request is personal data somebody volunteered. An admin who has dealt with
-- it, or been asked to erase it, needs a way to remove the row rather than
-- leaving it in the table forever with no path out.
drop policy if exists workspace_access_requests_admin_delete on public.workspace_access_requests;
create policy workspace_access_requests_admin_delete
  on public.workspace_access_requests
  for delete
  to authenticated
  using (public.is_platform_admin());

create or replace function public.touch_workspace_access_request()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workspace_access_requests_touch on public.workspace_access_requests;
create trigger workspace_access_requests_touch
  before update on public.workspace_access_requests
  for each row execute function public.touch_workspace_access_request();
