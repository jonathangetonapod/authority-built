import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import {
  decryptInstantlyApiKey,
  encryptInstantlyApiKey,
  getInstantlyDailyAccountSends,
  getInstantlyWarmupAnalytics,
  getInstantlyWorkspace,
  type InstantlyAccountSummary,
  InstantlyApiError,
  instantlyCampaignStatus,
  instantlyRequest,
  type InstantlyWarmupAccountAnalytics,
  listInstantlyAccounts,
  localCampaignStatus,
  safeInstantlyAccount,
  safeInstantlyAnalytics,
  safeInstantlyError,
} from "../_shared/instantly.ts";
import {
  type AuthContext,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  type WorkspaceFeatureAccess,
  writeAudit,
} from "../_shared/workspaceAuth.ts";

const METHODS = ["POST"] as const;
const CAMPAIGN_MANAGER_ROLES = new Set(["owner", "admin", "platform_admin"]);
const MAX_PROVIDER_CAMPAIGN_PAGES = 10;
const CAMPAIGN_COLUMNS = [
  "id",
  "workspace_id",
  "client_id",
  "name",
  "status",
  "instantly_campaign_id",
  "instantly_campaign_status",
  "sender_accounts",
  "timezone",
  "daily_limit",
  "analytics",
  "provider_sync_state",
  "provider_sync_started_at",
  "last_synced_at",
  "last_error",
  "created_at",
  "updated_at",
].join(",");
const TARGET_COLUMNS = [
  "id",
  "workspace_id",
  "campaign_id",
  "client_id",
  "shortlist_podcast_id",
  "podcast_id",
  "podcast_name",
  "podcast_url",
  "host_name",
  "contact_email",
  "selection_source",
  "wave_started_on",
  "research_notes",
  "pitch_subject",
  "pitch_body",
  "follow_up_1_subject",
  "follow_up_1_body",
  "follow_up_2_subject",
  "follow_up_2_body",
  "status",
  "instantly_lead_id",
  "instantly_lead_status",
  "email_open_count",
  "email_reply_count",
  "approved_at",
  "launched_at",
  "last_activity_at",
  "last_error",
  "created_at",
  "updated_at",
].join(",");
const CONNECTION_COLUMNS = [
  "workspace_id",
  "provider_workspace_id",
  "provider_workspace_name",
  "status",
  "api_key_ciphertext",
  "api_key_iv",
  "api_key_last_four",
  "accounts_snapshot",
  "connected_at",
  "last_verified_at",
  "last_error",
  "updated_at",
].join(",");

interface WorkspaceClientRow {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  website: string | null;
  contact_person: string | null;
}

interface ConnectionRow {
  workspace_id: string;
  provider_workspace_id: string;
  provider_workspace_name: string;
  status: "connected" | "error" | "disconnected";
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  api_key_last_four: string | null;
  accounts_snapshot: unknown;
  connected_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  updated_at: string;
}

interface CampaignRow {
  id: string;
  workspace_id: string;
  client_id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed" | "attention";
  instantly_campaign_id: string | null;
  instantly_campaign_status: number | null;
  sender_accounts: string[];
  timezone: string;
  daily_limit: number;
  analytics: unknown;
  provider_sync_state: "idle" | "creating" | "syncing" | "error";
  provider_sync_started_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface TargetRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  client_id: string;
  shortlist_podcast_id: string;
  podcast_id: string;
  podcast_name: string;
  podcast_url: string | null;
  host_name: string | null;
  contact_email: string | null;
  selection_source: "client_positive" | "owner_override";
  wave_started_on: string;
  research_notes: string | null;
  pitch_subject: string | null;
  pitch_body: string | null;
  follow_up_1_subject: string | null;
  follow_up_1_body: string | null;
  follow_up_2_subject: string | null;
  follow_up_2_body: string | null;
  status:
    | "draft"
    | "ready"
    | "launching"
    | "in_outreach"
    | "replied"
    | "completed"
    | "failed";
  instantly_lead_id: string | null;
  instantly_lead_status: number | null;
  email_open_count: number;
  email_reply_count: number;
  approved_at: string | null;
  launched_at: string | null;
  last_activity_at: string | null;
  last_error: string | null;
  prior_outreach_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProviderCampaign {
  id: string;
  status: number;
  name: string;
  senderAccounts: string[];
  timezone: string;
  dailyLimit: number;
  timestampCreated: string | null;
  timestampUpdated: string | null;
}

interface ProviderLead {
  id: string;
  email: string;
  status: number | null;
  email_open_count: number;
  email_reply_count: number;
  timestamp_updated: string | null;
}

interface OutreachSequence {
  subject: string;
  body: string;
  followUpOneSubject: string;
  followUpOneBody: string;
  followUpTwoSubject: string;
  followUpTwoBody: string;
}

function requireCampaignManager(access: WorkspaceFeatureAccess): void {
  if (!CAMPAIGN_MANAGER_ROLES.has(access.role)) {
    throw new HttpError(
      403,
      "WORKSPACE_MANAGER_REQUIRED",
      "Workspace manager access is required",
    );
  }
}

function requireIntegrationOwner(access: WorkspaceFeatureAccess): void {
  if (access.role !== "owner") {
    throw new HttpError(
      403,
      "WORKSPACE_OWNER_REQUIRED",
      "Only the workspace owner can manage the Instantly API key",
    );
  }
}

async function requireWorkspaceClient(
  admin: AuthContext["admin"],
  workspaceId: string,
  clientId: string,
): Promise<WorkspaceClientRow> {
  const { data, error } = await admin
    .from("clients")
    .select("id,workspace_id,name,status,website,contact_person")
    .eq("id", clientId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    throw new HttpError(
      500,
      "CLIENT_LOOKUP_FAILED",
      "The campaign client could not be verified",
    );
  }
  if (!data) {
    throw new HttpError(404, "CLIENT_NOT_FOUND", "Workspace client not found");
  }
  return data as WorkspaceClientRow;
}

async function readConnection(
  admin: AuthContext["admin"],
  workspaceId: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await admin
    .from("workspace_instantly_integrations")
    .select(CONNECTION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    throw new HttpError(
      500,
      "INSTANTLY_CONNECTION_LOOKUP_FAILED",
      "The Instantly connection could not be loaded",
    );
  }
  return data as ConnectionRow | null;
}

async function readCampaign(
  admin: AuthContext["admin"],
  workspaceId: string,
  clientId: string,
): Promise<CampaignRow | null> {
  const { data, error } = await admin
    .from("workspace_client_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    throw new HttpError(
      500,
      "CAMPAIGN_LOOKUP_FAILED",
      "The client campaign could not be loaded",
    );
  }
  return data as CampaignRow | null;
}

async function readTargets(
  admin: AuthContext["admin"],
  workspaceId: string,
  campaignId: string,
): Promise<TargetRow[]> {
  const { data, error } = await admin
    .from("workspace_client_campaign_targets")
    .select(TARGET_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("campaign_id", campaignId)
    .order("wave_started_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2_000);
  if (error) {
    throw new HttpError(
      500,
      "CAMPAIGN_TARGET_LOOKUP_FAILED",
      "Campaign podcasts could not be loaded",
    );
  }
  const targets = (data || []) as unknown as TargetRow[];
  if (targets.length === 0) return targets;

  const clientIds = Array.from(new Set(targets.map((target) => target.client_id)));
  const podcastIds = Array.from(new Set(targets.map((target) => target.podcast_id)));
  const { data: priorOutreach, error: priorOutreachError } = await admin
    .from("podcast_outreach_actions")
    .select("client_id,podcast_id,webhook_sent_at,created_at")
    .in("client_id", clientIds)
    .in("podcast_id", podcastIds)
    .eq("action", "sent")
    .gte("webhook_response_status", 200)
    .lt("webhook_response_status", 300)
    .limit(2_000);
  if (priorOutreachError) {
    throw new HttpError(
      500,
      "CAMPAIGN_OUTREACH_HISTORY_LOOKUP_FAILED",
      "Previous podcast outreach history could not be loaded",
    );
  }
  const priorOutreachByTarget = new Map(
    (priorOutreach || []).map((outreach) => [
      `${outreach.client_id}:${outreach.podcast_id}`,
      outreach.webhook_sent_at || outreach.created_at,
    ]),
  );
  return targets.map((target) => ({
    ...target,
    prior_outreach_at: priorOutreachByTarget.get(
      `${target.client_id}:${target.podcast_id}`,
    ) || null,
  }));
}

function accountsFromSnapshot(value: unknown): InstantlyAccountSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const account = safeInstantlyAccount(item);
    return account ? [account] : [];
  });
}

function connectionDto(
  connection: ConnectionRow | null,
  access: WorkspaceFeatureAccess,
) {
  const accounts = accountsFromSnapshot(connection?.accounts_snapshot);
  return {
    connected: connection?.status === "connected",
    status: connection?.status || "disconnected",
    provider_workspace_id: connection?.provider_workspace_id || null,
    provider_workspace_name: connection?.provider_workspace_name || null,
    api_key_last_four: connection?.api_key_last_four || null,
    accounts,
    active_account_count:
      accounts.filter((account) => account.status === 1).length,
    connected_at: connection?.connected_at || null,
    last_verified_at: connection?.last_verified_at || null,
    last_error: connection?.last_error || null,
    can_manage: access.role === "owner",
    required_scopes: [
      "workspaces:read",
      "accounts:read",
      "campaigns:read",
      "campaigns:create",
      "campaigns:update",
      "leads:read",
      "leads:create",
      "leads:update",
    ],
  };
}

function targetCounts(targets: TargetRow[]) {
  return {
    total: targets.length,
    needs_contact: targets.filter((target) => !target.contact_email).length,
    needs_pitch:
      targets.filter((target) =>
        target.contact_email && target.status === "draft"
      ).length,
    ready: targets.filter((target) => target.status === "ready").length,
    in_outreach:
      targets.filter((target) => target.status === "in_outreach").length,
    replied: targets.filter((target) => target.status === "replied").length,
    failed: targets.filter((target) => target.status === "failed").length,
  };
}

function campaignDto(campaign: CampaignRow, targets: TargetRow[] = []) {
  return {
    id: campaign.id,
    workspace_id: campaign.workspace_id,
    client_id: campaign.client_id,
    name: campaign.name,
    status: campaign.status,
    instantly_campaign_id: campaign.instantly_campaign_id,
    instantly_campaign_status: campaign.instantly_campaign_status,
    sender_accounts: campaign.sender_accounts,
    timezone: campaign.timezone,
    daily_limit: campaign.daily_limit,
    analytics: safeInstantlyAnalytics(campaign.analytics),
    target_counts: targetCounts(targets),
    target_shortlist_podcast_ids: targets.map((target) =>
      target.shortlist_podcast_id
    ),
    last_synced_at: campaign.last_synced_at,
    last_error: campaign.last_error,
    created_at: campaign.created_at,
    updated_at: campaign.updated_at,
  };
}

function targetDto(target: TargetRow) {
  return {
    id: target.id,
    shortlist_podcast_id: target.shortlist_podcast_id,
    podcast_id: target.podcast_id,
    podcast_name: target.podcast_name,
    podcast_url: target.podcast_url,
    host_name: target.host_name,
    contact_email: target.contact_email,
    selection_source: target.selection_source,
    wave_started_on: target.wave_started_on,
    research_notes: target.research_notes,
    pitch_subject: target.pitch_subject,
    pitch_body: target.pitch_body,
    follow_up_1_subject: target.follow_up_1_subject,
    follow_up_1_body: target.follow_up_1_body,
    follow_up_2_subject: target.follow_up_2_subject,
    follow_up_2_body: target.follow_up_2_body,
    status: target.status,
    instantly_lead_id: target.instantly_lead_id,
    instantly_lead_status: target.instantly_lead_status,
    email_open_count: target.email_open_count,
    email_reply_count: target.email_reply_count,
    approved_at: target.approved_at,
    launched_at: target.launched_at,
    last_activity_at: target.last_activity_at,
    last_error: target.last_error,
    prior_outreach_at: target.prior_outreach_at || null,
    created_at: target.created_at,
    updated_at: target.updated_at,
  };
}

function uuidList(value: unknown, field: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      `${field} must contain no more than ${max} items`,
    );
  }
  const values = value.map((item, index) =>
    requireUuid(item, `${field}[${index}]`)
  );
  if (new Set(values).size !== values.length) {
    throw new HttpError(400, "INVALID_FIELD", `${field} contains duplicates`);
  }
  return values;
}

function emailList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1_000) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "sender_accounts must contain no more than 1000 items",
    );
  }
  const emails = value.map((item, index) => {
    if (typeof item !== "string") {
      throw new HttpError(
        400,
        "INVALID_FIELD",
        `sender_accounts[${index}] must be an email`,
      );
    }
    const email = item.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(
        400,
        "INVALID_FIELD",
        `sender_accounts[${index}] must be an email`,
      );
    }
    return email;
  });
  if (new Set(emails).size !== emails.length) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "sender_accounts contains duplicates",
    );
  }
  return emails;
}

function campaignTimezone(value: unknown): string {
  const timezone = requireString(value, "timezone", { max: 100 });
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "timezone must be a valid IANA timezone",
    );
  }
  return timezone;
}

function dailyLimit(value: unknown): number {
  if (
    typeof value !== "number" || !Number.isInteger(value) || value < 1 ||
    value > 1000
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "daily_limit must be an integer between 1 and 1000",
    );
  }
  return value;
}

function draftText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_FIELD", `${field} must be a string`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new HttpError(400, "INVALID_FIELD", `${field} is too long`);
  }
  return text || null;
}

function completeTargetSequence(target: Pick<
  TargetRow,
  | "pitch_subject"
  | "pitch_body"
  | "follow_up_1_subject"
  | "follow_up_1_body"
  | "follow_up_2_subject"
  | "follow_up_2_body"
>): boolean {
  return Boolean(
    target.pitch_subject &&
      target.pitch_body &&
      target.follow_up_1_subject &&
      target.follow_up_1_body &&
      target.follow_up_2_subject &&
      target.follow_up_2_body,
  );
}

function providerUuid(value: unknown): string | null {
  return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    ? value.toLowerCase()
    : null;
}

function providerCampaign(value: unknown): ProviderCampaign {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid campaign",
    );
  }
  const item = value as Record<string, unknown>;
  const id = providerUuid(item.id);
  const status = instantlyCampaignStatus(item.status);
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!id || status === null || !name) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid campaign",
    );
  }
  const senderAccounts = Array.isArray(item.email_list)
    ? Array.from(new Set(item.email_list.flatMap((candidate) => {
      if (typeof candidate !== "string") return [];
      const email = candidate.trim().toLowerCase();
      return email && email.length <= 254 ? [email] : [];
    })))
    : [];
  const schedule = item.campaign_schedule &&
      typeof item.campaign_schedule === "object" &&
      !Array.isArray(item.campaign_schedule)
    ? item.campaign_schedule as Record<string, unknown>
    : null;
  const firstSchedule = Array.isArray(schedule?.schedules) &&
      schedule.schedules[0] &&
      typeof schedule.schedules[0] === "object" &&
      !Array.isArray(schedule.schedules[0])
    ? schedule.schedules[0] as Record<string, unknown>
    : null;
  const timezone = typeof firstSchedule?.timezone === "string" &&
      firstSchedule.timezone.trim() && firstSchedule.timezone.length <= 100
    ? firstSchedule.timezone.trim()
    : "America/New_York";
  const dailyLimit = typeof item.daily_limit === "number" &&
      Number.isInteger(item.daily_limit) && item.daily_limit >= 1 &&
      item.daily_limit <= 1_000
    ? item.daily_limit
    : 30;
  const timestamp = (candidate: unknown): string | null => (
      typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))
        ? candidate
        : null
    );
  return {
    id,
    status,
    name: name.slice(0, 500),
    senderAccounts,
    timezone,
    dailyLimit,
    timestampCreated: timestamp(item.timestamp_created),
    timestampUpdated: timestamp(item.timestamp_updated),
  };
}

async function listProviderCampaigns(apiKey: string): Promise<ProviderCampaign[]> {
  const campaigns = new Map<string, ProviderCampaign>();
  let startingAfter = "";
  for (let page = 0; page < MAX_PROVIDER_CAMPAIGN_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (startingAfter) query.set("starting_after", startingAfter);
    const value = await instantlyRequest<unknown>(apiKey, "/campaigns", {
      query,
    });
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned an invalid campaign list",
      );
    }
    const response = value as Record<string, unknown>;
    if (!Array.isArray(response.items)) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned an invalid campaign list",
      );
    }
    for (const item of response.items) {
      const campaign = providerCampaign(item);
      campaigns.set(campaign.id, campaign);
    }
    const next = typeof response.next_starting_after === "string"
      ? response.next_starting_after.trim()
      : "";
    if (!next || next === startingAfter) break;
    startingAfter = next;
  }
  return Array.from(campaigns.values()).sort((left, right) => (
    (right.timestampUpdated || right.timestampCreated || "").localeCompare(
      left.timestampUpdated || left.timestampCreated || "",
    ) || left.name.localeCompare(right.name)
  ));
}

async function verifyProviderReadAccess(apiKey: string): Promise<void> {
  const [campaigns, leads] = await Promise.all([
    instantlyRequest<unknown>(apiKey, "/campaigns", {
      query: new URLSearchParams({ limit: "1" }),
    }),
    instantlyRequest<unknown>(apiKey, "/leads/list", {
      method: "POST",
      body: { limit: 1 },
    }),
  ]);
  for (const value of [campaigns, leads]) {
    if (
      !value || typeof value !== "object" || Array.isArray(value) ||
      !Array.isArray((value as Record<string, unknown>).items)
    ) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned an invalid list response",
      );
    }
  }
}

function cleanContactEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.toLowerCase().match(
    /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/,
  );
  return match?.[0]?.slice(0, 254) || null;
}

function contactEmailInput(value: unknown): string | null {
  const email = draftText(value, "contact_email", 254);
  if (!email) return null;
  const normalized = cleanContactEmail(email);
  if (!normalized || normalized !== email.toLowerCase()) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "contact_email must be a valid email address",
    );
  }
  return normalized;
}

function cleanHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function currentWaveStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  now.setUTCDate(now.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return now.toISOString().slice(0, 10);
}

async function integrationApiKey(
  connection: ConnectionRow | null,
  requireConnected = true,
): Promise<string> {
  if (
    !connection ||
    (requireConnected && connection.status !== "connected") ||
    !connection.api_key_ciphertext ||
    !connection.api_key_iv
  ) {
    throw new HttpError(
      409,
      "INSTANTLY_NOT_CONNECTED",
      "Connect Instantly before using this campaign action",
    );
  }
  return await decryptInstantlyApiKey({
    ciphertext: connection.api_key_ciphertext,
    iv: connection.api_key_iv,
  });
}

function verifySelectedAccounts(
  senderAccounts: string[],
  accounts: InstantlyAccountSummary[],
): void {
  if (senderAccounts.length === 0) return;
  const byEmail = new Map(accounts.map((account) => [account.email, account]));
  const unavailable = senderAccounts.filter((email) =>
    byEmail.get(email)?.status !== 1
  );
  if (unavailable.length > 0) {
    throw new HttpError(
      409,
      "INSTANTLY_SENDER_UNAVAILABLE",
      "Choose active Instantly sending accounts for this campaign",
    );
  }
}

async function refreshProviderAccounts(
  admin: AuthContext["admin"],
  connection: ConnectionRow,
  apiKey: string,
): Promise<InstantlyAccountSummary[]> {
  const accounts = await listInstantlyAccounts(apiKey);
  const now = new Date().toISOString();
  const { error } = await admin
    .from("workspace_instantly_integrations")
    .update({
      status: "connected",
      accounts_snapshot: accounts,
      last_verified_at: now,
      last_error: null,
    })
    .eq("workspace_id", connection.workspace_id)
    .eq("provider_workspace_id", connection.provider_workspace_id);
  if (error) {
    throw new HttpError(
      500,
      "INSTANTLY_CONNECTION_UPDATE_FAILED",
      "The Instantly connection could not be updated",
    );
  }
  return accounts;
}

async function ensureLocalCampaign(
  context: AuthContext,
  workspaceId: string,
  client: WorkspaceClientRow,
  input?: {
    name?: string;
    timezone?: string;
    dailyLimit?: number;
    senderAccounts?: string[];
  },
): Promise<CampaignRow> {
  const existing = await readCampaign(context.admin, workspaceId, client.id);
  if (existing) return existing;
  if (client.status !== "active") {
    throw new HttpError(
      409,
      "CLIENT_NOT_ACTIVE",
      "Only active clients can start a new campaign",
    );
  }
  const { data, error } = await context.admin
    .from("workspace_client_campaigns")
    .insert({
      workspace_id: workspaceId,
      client_id: client.id,
      name: input?.name || `${client.name} Podcast Outreach`,
      timezone: input?.timezone || "America/New_York",
      daily_limit: input?.dailyLimit || 30,
      sender_accounts: input?.senderAccounts || [],
      created_by: context.user.id,
      updated_by: context.user.id,
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error || !data) {
    const concurrent = await readCampaign(
      context.admin,
      workspaceId,
      client.id,
    );
    if (concurrent) return concurrent;
    throw new HttpError(
      500,
      "CAMPAIGN_CREATE_FAILED",
      "The client campaign could not be created",
    );
  }
  return data as unknown as CampaignRow;
}

async function addCampaignTargets(
  context: AuthContext,
  campaign: CampaignRow,
  shortlistIds: string[],
  options: { requireApproved?: boolean } = {},
): Promise<TargetRow[]> {
  if (shortlistIds.length === 0) {
    return await readTargets(context.admin, campaign.workspace_id, campaign.id);
  }

  const { data: shortlistData, error: shortlistError } = await context.admin
    .from("client_dashboard_podcasts")
    .select(
      "id,client_id,podcast_id,podcast_name,podcast_url,publisher_name,visibility",
    )
    .eq("client_id", campaign.client_id)
    .eq("visibility", "visible")
    .in("id", shortlistIds);
  if (shortlistError) {
    throw new HttpError(
      500,
      "CAMPAIGN_TARGET_LOOKUP_FAILED",
      "Selected podcasts could not be verified",
    );
  }
  if (!shortlistData || shortlistData.length !== shortlistIds.length) {
    throw new HttpError(
      400,
      "CAMPAIGN_TARGET_INVALID",
      "Every selected podcast must be visible on this client shortlist",
    );
  }

  const podcastIds = shortlistData.map((podcast) => String(podcast.podcast_id));
  const [feedbackResult, catalogResult] = await Promise.all([
    context.admin
      .from("client_podcast_feedback")
      .select("podcast_id,status")
      .eq("client_id", campaign.client_id)
      .in("podcast_id", podcastIds),
    context.admin
      .from("podcasts")
      .select("id,podscan_id,podscan_email,podcast_url,publisher_name")
      .in("podscan_id", podcastIds),
  ]);
  if (feedbackResult.error || catalogResult.error) {
    throw new HttpError(
      500,
      "CAMPAIGN_TARGET_LOOKUP_FAILED",
      "Selected podcast details could not be loaded",
    );
  }
  const feedbackByPodcast = new Map(
    (feedbackResult.data || []).map((
      row,
    ) => [String(row.podcast_id), row.status]),
  );
  if (
    options.requireApproved && shortlistData.some((podcast) =>
      feedbackByPodcast.get(String(podcast.podcast_id)) !== "approved"
    )
  ) {
    throw new HttpError(
      409,
      "CAMPAIGN_TARGET_NOT_APPROVED",
      "Only approved podcasts can be added to a client campaign",
    );
  }
  const catalogByPodcast = new Map(
    (catalogResult.data || []).map((row) => [String(row.podscan_id), row]),
  );
  const catalogIds = (catalogResult.data || []).map((row) => String(row.id));
  const directContactResult = catalogIds.length > 0
    ? await context.admin
      .from("podcast_direct_contacts")
      .select("podcast_id,email,host_name")
      .in("podcast_id", catalogIds)
      .eq("verification_status", "verified")
    : { data: [], error: null };
  if (directContactResult.error) {
    throw new HttpError(
      500,
      "CAMPAIGN_TARGET_LOOKUP_FAILED",
      "Verified podcast contacts could not be loaded",
    );
  }
  const directContactByPodcast = new Map(
    (directContactResult.data || []).map((row) => [String(row.podcast_id), row]),
  );
  const waveStartedOn = currentWaveStart();
  const inserts = shortlistData.map((podcast) => {
    const catalog = catalogByPodcast.get(String(podcast.podcast_id));
    const directContact = catalog
      ? directContactByPodcast.get(String(catalog.id))
      : null;
    return {
      workspace_id: campaign.workspace_id,
      campaign_id: campaign.id,
      client_id: campaign.client_id,
      shortlist_podcast_id: podcast.id,
      podcast_id: podcast.podcast_id,
      podcast_name: podcast.podcast_name || "Untitled podcast",
      podcast_url: cleanHttpUrl(podcast.podcast_url) ||
        cleanHttpUrl(catalog?.podcast_url),
      host_name: typeof directContact?.host_name === "string" &&
          directContact.host_name.trim()
        ? directContact.host_name.trim().slice(0, 500)
        : typeof podcast.publisher_name === "string" &&
          podcast.publisher_name.trim()
        ? podcast.publisher_name.trim().slice(0, 500)
        : typeof catalog?.publisher_name === "string"
        ? catalog.publisher_name.trim().slice(0, 500) || null
        : null,
      contact_email: cleanContactEmail(directContact?.email) ||
        cleanContactEmail(catalog?.podscan_email),
      selection_source:
        feedbackByPodcast.get(String(podcast.podcast_id)) === "approved"
          ? "client_positive"
          : "owner_override",
      wave_started_on: waveStartedOn,
      created_by: context.user.id,
      updated_by: context.user.id,
    };
  });
  const verifiedDirectByShortlistId = new Map(
    shortlistData.flatMap((podcast) => {
      const catalog = catalogByPodcast.get(String(podcast.podcast_id));
      const directContact = catalog
        ? directContactByPodcast.get(String(catalog.id))
        : null;
      const directEmail = cleanContactEmail(directContact?.email);
      if (!directEmail) return [];
      return [[String(podcast.id), {
        email: directEmail,
        hostName: typeof directContact?.host_name === "string" &&
            directContact.host_name.trim()
          ? directContact.host_name.trim().slice(0, 500)
          : null,
      }] as const];
    }),
  );
  const { error: insertError } = await context.admin
    .from("workspace_client_campaign_targets")
    .upsert(inserts, {
      onConflict: "campaign_id,shortlist_podcast_id",
      ignoreDuplicates: true,
    });
  if (insertError) {
    throw new HttpError(
      500,
      "CAMPAIGN_TARGET_ADD_FAILED",
      "Podcasts could not be added to the campaign",
    );
  }

  // Podcast Finder can discover a contact after this target is first added.
  // Refresh only pre-launch snapshots so newly enriched data becomes usable
  // without touching reviewed copy, wave history, or provider state.
  let targets = await readTargets(
    context.admin,
    campaign.workspace_id,
    campaign.id,
  );
  const incomingByShortlistId = new Map(
    inserts.map((item) => [String(item.shortlist_podcast_id), item]),
  );
  const refreshes = targets.flatMap((target) => {
    const incoming = incomingByShortlistId.get(target.shortlist_podcast_id);
    if (!incoming || target.instantly_lead_id) return [];
    const verifiedDirect = verifiedDirectByShortlistId.get(
      target.shortlist_podcast_id,
    );
    const update: Record<string, unknown> = { updated_by: context.user.id };
    if (
      verifiedDirect?.email &&
      target.contact_email?.toLowerCase() !== verifiedDirect.email.toLowerCase()
    ) {
      update.contact_email = verifiedDirect.email;
    } else if (!target.contact_email && incoming.contact_email) {
      update.contact_email = incoming.contact_email;
    }
    if (!target.podcast_url && incoming.podcast_url) {
      update.podcast_url = incoming.podcast_url;
    }
    if (
      verifiedDirect?.hostName && target.host_name !== verifiedDirect.hostName
    ) {
      update.host_name = verifiedDirect.hostName;
    } else if (!target.host_name && incoming.host_name) {
      update.host_name = incoming.host_name;
    }
    if (
      target.podcast_name === "Untitled podcast" &&
      incoming.podcast_name !== "Untitled podcast"
    ) {
      update.podcast_name = incoming.podcast_name;
    }
    if (target.selection_source !== incoming.selection_source) {
      update.selection_source = incoming.selection_source;
    }
    return Object.keys(update).length > 1 ? [{ target, update }] : [];
  });
  for (let offset = 0; offset < refreshes.length; offset += 25) {
    const results = await Promise.all(
      refreshes.slice(offset, offset + 25).map(({ target, update }) =>
        context.admin
          .from("workspace_client_campaign_targets")
          .update(update)
          .eq("id", target.id)
          .eq("workspace_id", campaign.workspace_id)
          .is("instantly_lead_id", null)
      ),
    );
    if (results.some((result) => result.error)) {
      throw new HttpError(
        500,
        "CAMPAIGN_TARGET_REFRESH_FAILED",
        "Updated podcast contact details could not be saved",
      );
    }
  }
  if (refreshes.length > 0) {
    targets = await readTargets(
      context.admin,
      campaign.workspace_id,
      campaign.id,
    );
  }
  return targets;
}

async function replaceDraftCampaignTargets(
  context: AuthContext,
  campaign: CampaignRow,
  selectedIds: string[],
): Promise<TargetRow[]> {
  const existing = await readTargets(
    context.admin,
    campaign.workspace_id,
    campaign.id,
  );
  const selected = new Set(selectedIds);
  const removableIds = existing
    .filter((target) => (
      !selected.has(target.shortlist_podcast_id) &&
      !target.instantly_lead_id &&
      ["draft", "ready", "failed"].includes(target.status)
    ))
    .map((target) => target.id);
  if (removableIds.length > 0) {
    const { error } = await context.admin
      .from("workspace_client_campaign_targets")
      .delete()
      .eq("workspace_id", campaign.workspace_id)
      .eq("campaign_id", campaign.id)
      .in("id", removableIds);
    if (error) {
      throw new HttpError(
        500,
        "CAMPAIGN_TARGET_UPDATE_FAILED",
        "The campaign podcast selection could not be updated",
      );
    }
  }
  return await addCampaignTargets(context, campaign, selectedIds);
}

async function requireCampaignTarget(
  context: AuthContext,
  campaign: CampaignRow,
  shortlistPodcastId: string,
): Promise<TargetRow> {
  const targets = await addCampaignTargets(context, campaign, [
    shortlistPodcastId,
  ]);
  const target = targets.find((item) =>
    item.shortlist_podcast_id === shortlistPodcastId
  );
  if (!target) {
    throw new HttpError(
      404,
      "CAMPAIGN_TARGET_NOT_FOUND",
      "Campaign podcast not found",
    );
  }
  return target;
}

function providerCampaignName(campaign: CampaignRow): string {
  return `${campaign.name.slice(0, 150)} · GOAP-${campaign.id}`;
}

function campaignConfiguration(campaign: CampaignRow): Record<string, unknown> {
  return {
    name: providerCampaignName(campaign),
    is_evergreen: true,
    campaign_schedule: {
      schedules: [{
        name: "Weekdays",
        timing: { from: "09:00", to: "17:00" },
        days: {
          "0": true,
          "1": true,
          "2": true,
          "3": true,
          "4": true,
          "5": false,
          "6": false,
        },
        timezone: campaign.timezone,
      }],
    },
    sequences: [{
      steps: [
        {
          type: "email",
          delay: 3,
          delay_unit: "days",
          variants: [{
            subject: "{{goapPitchSubject}}",
            body: "{{goapPitchBody}}",
            v_disabled: false,
          }],
        },
        {
          type: "email",
          delay: 5,
          delay_unit: "days",
          variants: [{
            subject: "{{goapFollowUpOneSubject}}",
            body: "{{goapFollowUpOneBody}}",
            v_disabled: false,
          }],
        },
        {
          type: "email",
          delay: 0,
          delay_unit: "days",
          variants: [{
            subject: "{{goapFollowUpTwoSubject}}",
            body: "{{goapFollowUpTwoBody}}",
            v_disabled: false,
          }],
        },
      ],
    }],
    email_list: campaign.sender_accounts,
    daily_limit: campaign.daily_limit,
    daily_max_leads: campaign.daily_limit,
    email_gap: 15,
    random_wait_max: 10,
    text_only: true,
    first_email_text_only: true,
    stop_on_reply: true,
    stop_on_auto_reply: false,
    open_tracking: true,
    link_tracking: false,
    prioritize_new_leads: true,
    insert_unsubscribe_header: true,
    allow_risky_contacts: false,
    disable_bounce_protect: false,
  };
}

async function ensureProviderCampaign(
  context: AuthContext,
  campaign: CampaignRow,
  apiKey: string,
): Promise<ProviderCampaign> {
  if (campaign.instantly_campaign_id) {
    return providerCampaign(
      await instantlyRequest<unknown>(
        apiKey,
        `/campaigns/${encodeURIComponent(campaign.instantly_campaign_id)}`,
      ),
    );
  }

  // A timed-out Edge invocation must not strand the campaign in `creating`.
  // The deterministic provider-name marker below recovers any remote campaign
  // that may have been created before the local write was interrupted.
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const { error: staleClaimError } = await context.admin
    .from("workspace_client_campaigns")
    .update({
      provider_sync_state: "error",
      provider_sync_started_at: null,
      last_error: "A previous provider setup did not finish; retrying now.",
      updated_by: context.user.id,
    })
    .eq("id", campaign.id)
    .eq("workspace_id", campaign.workspace_id)
    .eq("provider_sync_state", "creating")
    .lt("provider_sync_started_at", staleBefore)
    .is("instantly_campaign_id", null);
  if (staleClaimError) {
    throw new HttpError(
      500,
      "CAMPAIGN_PROVIDER_SETUP_FAILED",
      "Campaign setup could not be recovered",
    );
  }

  const { data: claimed, error: claimError } = await context.admin
    .from("workspace_client_campaigns")
    .update({
      provider_sync_state: "creating",
      provider_sync_started_at: new Date().toISOString(),
      last_error: null,
      updated_by: context.user.id,
    })
    .eq("id", campaign.id)
    .eq("workspace_id", campaign.workspace_id)
    .in("provider_sync_state", ["idle", "error"])
    .is("instantly_campaign_id", null)
    .select("id")
    .maybeSingle();
  if (claimError) {
    throw new HttpError(
      500,
      "CAMPAIGN_PROVIDER_SETUP_FAILED",
      "Campaign setup could not be started",
    );
  }
  if (!claimed) {
    const current = await readCampaign(
      context.admin,
      campaign.workspace_id,
      campaign.client_id,
    );
    if (current?.instantly_campaign_id) {
      return providerCampaign(
        await instantlyRequest<unknown>(
          apiKey,
          `/campaigns/${encodeURIComponent(current.instantly_campaign_id)}`,
        ),
      );
    }
    throw new HttpError(
      409,
      "CAMPAIGN_SETUP_IN_PROGRESS",
      "This campaign is already being prepared. Try again in a moment.",
    );
  }

  try {
    const marker = `GOAP-${campaign.id}`;
    const query = new URLSearchParams({ limit: "10", search: marker });
    const searchResponse = await instantlyRequest<unknown>(
      apiKey,
      "/campaigns",
      { query },
    );
    const searchRecord = searchResponse && typeof searchResponse === "object" &&
        !Array.isArray(searchResponse)
      ? searchResponse as Record<string, unknown>
      : null;
    const matches = Array.isArray(searchRecord?.items)
      ? searchRecord.items.flatMap((item) => {
        try {
          const parsed = providerCampaign(item);
          return parsed.name.includes(marker) ? [parsed] : [];
        } catch {
          return [];
        }
      })
      : [];
    let provider = matches[0];
    if (!provider) {
      provider = providerCampaign(
        await instantlyRequest<unknown>(apiKey, "/campaigns", {
          method: "POST",
          body: campaignConfiguration(campaign),
        }),
      );
    }
    if (provider.status === 1) {
      provider = providerCampaign(
        await instantlyRequest<unknown>(
          apiKey,
          `/campaigns/${encodeURIComponent(provider.id)}/pause`,
          { method: "POST" },
        ),
      );
    }
    await instantlyRequest<unknown>(
      apiKey,
      `/campaigns/${encodeURIComponent(provider.id)}/variables`,
      {
        method: "POST",
        body: {
          variables: [
            "goapPitchSubject",
            "goapPitchBody",
            "goapFollowUpOneSubject",
            "goapFollowUpOneBody",
            "goapFollowUpTwoSubject",
            "goapFollowUpTwoBody",
            "clientName",
            "podcastName",
            "goapTargetId",
          ],
        },
      },
    );
    const { error: updateError } = await context.admin
      .from("workspace_client_campaigns")
      .update({
        instantly_campaign_id: provider.id,
        instantly_campaign_status: provider.status,
        status: localCampaignStatus(provider.status),
        provider_sync_state: "idle",
        provider_sync_started_at: null,
        last_synced_at: new Date().toISOString(),
        last_error: null,
        updated_by: context.user.id,
      })
      .eq("id", campaign.id)
      .eq("workspace_id", campaign.workspace_id);
    if (updateError) {
      throw new HttpError(
        500,
        "CAMPAIGN_PROVIDER_MAPPING_FAILED",
        "The Instantly campaign mapping could not be saved",
      );
    }
    return provider;
  } catch (error) {
    const safe = safeInstantlyError(error);
    await context.admin
      .from("workspace_client_campaigns")
      .update({
        provider_sync_state: "error",
        provider_sync_started_at: null,
        status: "attention",
        last_error: safe.message,
        updated_by: context.user.id,
      })
      .eq("id", campaign.id)
      .eq("workspace_id", campaign.workspace_id);
    throw error;
  }
}

function providerLead(value: unknown): ProviderLead | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lead = value as Record<string, unknown>;
  const id = providerUuid(lead.id);
  const email = typeof lead.email === "string"
    ? lead.email.trim().toLowerCase()
    : "";
  if (!id || !email) return null;
  return {
    id,
    email,
    status: typeof lead.status === "number" && Number.isInteger(lead.status)
      ? lead.status
      : null,
    email_open_count: typeof lead.email_open_count === "number" &&
        Number.isInteger(lead.email_open_count)
      ? Math.max(0, lead.email_open_count)
      : 0,
    email_reply_count: typeof lead.email_reply_count === "number" &&
        Number.isInteger(lead.email_reply_count)
      ? Math.max(0, lead.email_reply_count)
      : 0,
    timestamp_updated: typeof lead.timestamp_updated === "string"
      ? lead.timestamp_updated
      : null,
  };
}

async function listProviderLeads(
  apiKey: string,
  campaignId: string,
  search?: string,
): Promise<ProviderLead[]> {
  const leads: ProviderLead[] = [];
  let startingAfter = "";
  for (let page = 0; page < 10; page += 1) {
    const response = await instantlyRequest<unknown>(apiKey, "/leads/list", {
      method: "POST",
      body: {
        campaign: campaignId,
        limit: 100,
        ...(search ? { search } : {}),
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
    });
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned an invalid lead list",
      );
    }
    const record = response as Record<string, unknown>;
    if (!Array.isArray(record.items)) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned an invalid lead list",
      );
    }
    leads.push(...record.items.flatMap((item) => {
      const parsed = providerLead(item);
      return parsed ? [parsed] : [];
    }));
    const next = typeof record.next_starting_after === "string"
      ? record.next_starting_after
      : "";
    if (!next || next === startingAfter || search) break;
    startingAfter = next;
  }
  return leads;
}

async function launchTarget(
  context: AuthContext,
  connection: ConnectionRow,
  client: WorkspaceClientRow,
  campaign: CampaignRow,
  target: TargetRow,
  sequence: OutreachSequence,
): Promise<void> {
  if (!target.contact_email) {
    throw new HttpError(
      409,
      "CAMPAIGN_CONTACT_REQUIRED",
      "Add a podcast contact email before starting outreach",
    );
  }
  if (campaign.sender_accounts.length === 0) {
    throw new HttpError(
      409,
      "CAMPAIGN_SENDER_REQUIRED",
      "Choose at least one active Instantly sending account",
    );
  }
  if (["in_outreach", "replied", "completed"].includes(target.status)) {
    throw new HttpError(
      409,
      "CAMPAIGN_TARGET_ALREADY_LAUNCHED",
      "Outreach has already started for this podcast",
    );
  }
  if (target.prior_outreach_at) {
    throw new HttpError(
      409,
      "CAMPAIGN_PREVIOUS_OUTREACH_EXISTS",
      "This podcast was already contacted for this client in the earlier outreach workflow",
    );
  }

  const { data: claimed, error: claimError } = await context.admin
    .from("workspace_client_campaign_targets")
    .update({
      pitch_subject: sequence.subject,
      pitch_body: sequence.body,
      follow_up_1_subject: sequence.followUpOneSubject,
      follow_up_1_body: sequence.followUpOneBody,
      follow_up_2_subject: sequence.followUpTwoSubject,
      follow_up_2_body: sequence.followUpTwoBody,
      status: "launching",
      last_error: null,
      updated_by: context.user.id,
    })
    .eq("id", target.id)
    .eq("workspace_id", campaign.workspace_id)
    .in("status", ["draft", "ready", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) {
    throw new HttpError(
      500,
      "CAMPAIGN_LAUNCH_FAILED",
      "The outreach launch could not be started",
    );
  }
  if (!claimed) {
    throw new HttpError(
      409,
      "CAMPAIGN_LAUNCH_IN_PROGRESS",
      "This podcast is already being launched",
    );
  }

  try {
    const { data: matchingContacts, error: matchingContactError } = await context
      .admin
      .from("workspace_client_campaign_targets")
      .select("id,podcast_name,status,instantly_lead_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("campaign_id", campaign.id)
      .eq("contact_email", target.contact_email)
      .neq("id", target.id)
      .limit(25);
    if (matchingContactError) {
      throw new HttpError(
        500,
        "CAMPAIGN_CONTACT_DEDUPE_FAILED",
        "The podcast contact could not be checked for duplicate outreach",
      );
    }
    const duplicateContact = (matchingContacts || []).find((candidate) =>
      candidate.instantly_lead_id ||
      ["launching", "in_outreach", "replied", "completed"].includes(
        String(candidate.status),
      )
    );
    if (duplicateContact) {
      throw new HttpError(
        409,
        "CAMPAIGN_CONTACT_ALREADY_IN_OUTREACH",
        `This contact is already in outreach for ${
          String(duplicateContact.podcast_name || "another podcast")
        }`,
      );
    }

    const apiKey = await integrationApiKey(connection);
    const accounts = await refreshProviderAccounts(
      context.admin,
      connection,
      apiKey,
    );
    verifySelectedAccounts(campaign.sender_accounts, accounts);
    const providerCampaignValue = await ensureProviderCampaign(
      context,
      campaign,
      apiKey,
    );
    const existingLeads = await listProviderLeads(
      apiKey,
      providerCampaignValue.id,
      target.contact_email,
    );
    let lead = existingLeads.find((candidate) =>
      candidate.email === target.contact_email
    ) || null;
    if (lead) {
      const { data: mappedTarget, error: mappedTargetError } = await context
        .admin
        .from("workspace_client_campaign_targets")
        .select("id,podcast_name")
        .eq("workspace_id", campaign.workspace_id)
        .eq("campaign_id", campaign.id)
        .eq("instantly_lead_id", lead.id)
        .neq("id", target.id)
        .maybeSingle();
      if (mappedTargetError) {
        throw new HttpError(
          500,
          "CAMPAIGN_CONTACT_DEDUPE_FAILED",
          "The Instantly lead mapping could not be verified",
        );
      }
      if (mappedTarget) {
        throw new HttpError(
          409,
          "CAMPAIGN_CONTACT_ALREADY_IN_OUTREACH",
          `This contact is already in outreach for ${
            String(mappedTarget.podcast_name || "another podcast")
          }`,
        );
      }
    }
    const customVariables = {
      goapPitchSubject: sequence.subject,
      goapPitchBody: sequence.body,
      goapFollowUpOneSubject: sequence.followUpOneSubject,
      goapFollowUpOneBody: sequence.followUpOneBody,
      goapFollowUpTwoSubject: sequence.followUpTwoSubject,
      goapFollowUpTwoBody: sequence.followUpTwoBody,
      clientName: client.name,
      podcastName: target.podcast_name,
      goapTargetId: target.id,
    };
    if (lead) {
      const patched = await instantlyRequest<unknown>(
        apiKey,
        `/leads/${encodeURIComponent(lead.id)}`,
        {
          method: "PATCH",
          body: { custom_variables: customVariables },
        },
      );
      lead = providerLead(patched) || lead;
    } else {
      const importResponse = await instantlyRequest<unknown>(
        apiKey,
        "/leads/add",
        {
          method: "POST",
          body: {
            campaign_id: providerCampaignValue.id,
            leads: [{
              email: target.contact_email,
              first_name: target.host_name?.split(/\s+/)[0] || undefined,
              company_name: target.podcast_name,
              website: target.podcast_url || undefined,
              personalization: sequence.body,
              custom_variables: customVariables,
            }],
            verify_leads_on_import: false,
            skip_if_in_workspace: false,
            skip_if_in_campaign: false,
            skip_if_in_list: false,
          },
        },
      );
      if (
        !importResponse || typeof importResponse !== "object" ||
        Array.isArray(importResponse)
      ) {
        throw new InstantlyApiError(
          502,
          "INSTANTLY_RESPONSE_INVALID",
          "Instantly returned an invalid lead result",
        );
      }
      const imported = importResponse as Record<string, unknown>;
      const created = Array.isArray(imported.created_leads)
        ? imported.created_leads.map(providerLead).find(Boolean) || null
        : null;
      lead = created;
      if (!lead) {
        const recovered = await listProviderLeads(
          apiKey,
          providerCampaignValue.id,
          target.contact_email,
        );
        lead = recovered.find((candidate) =>
          candidate.email === target.contact_email
        ) || null;
      }
      if (!lead) {
        throw new InstantlyApiError(
          409,
          "INSTANTLY_LEAD_NOT_CREATED",
          "Instantly did not add this podcast contact",
        );
      }
    }

    let activeCampaign = providerCampaignValue;
    if (activeCampaign.status !== 1) {
      activeCampaign = providerCampaign(
        await instantlyRequest<unknown>(
          apiKey,
          `/campaigns/${encodeURIComponent(activeCampaign.id)}/activate`,
          { method: "POST" },
        ),
      );
    }
    const now = new Date().toISOString();
    const [targetUpdate, campaignUpdate] = await Promise.all([
      context.admin
        .from("workspace_client_campaign_targets")
        .update({
          pitch_subject: sequence.subject,
          pitch_body: sequence.body,
          follow_up_1_subject: sequence.followUpOneSubject,
          follow_up_1_body: sequence.followUpOneBody,
          follow_up_2_subject: sequence.followUpTwoSubject,
          follow_up_2_body: sequence.followUpTwoBody,
          status: lead.email_reply_count > 0 ? "replied" : "in_outreach",
          instantly_lead_id: lead.id,
          instantly_lead_status: lead.status,
          email_open_count: lead.email_open_count,
          email_reply_count: lead.email_reply_count,
          approved_by: context.user.id,
          approved_at: now,
          launched_at: now,
          last_activity_at: lead.timestamp_updated || now,
          last_error: null,
          updated_by: context.user.id,
        })
        .eq("id", target.id)
        .eq("workspace_id", campaign.workspace_id),
      context.admin
        .from("workspace_client_campaigns")
        .update({
          instantly_campaign_id: activeCampaign.id,
          instantly_campaign_status: activeCampaign.status,
          status: localCampaignStatus(activeCampaign.status),
          provider_sync_state: "idle",
          provider_sync_started_at: null,
          last_synced_at: now,
          last_error: null,
          updated_by: context.user.id,
        })
        .eq("id", campaign.id)
        .eq("workspace_id", campaign.workspace_id),
    ]);
    if (targetUpdate.error || campaignUpdate.error) {
      throw new HttpError(
        500,
        "CAMPAIGN_LAUNCH_MAPPING_FAILED",
        "The provider launch mapping could not be saved",
      );
    }
  } catch (error) {
    const safe = safeInstantlyError(error);
    await context.admin
      .from("workspace_client_campaign_targets")
      .update({
        status: "failed",
        last_error: safe.message,
        updated_by: context.user.id,
      })
      .eq("id", target.id)
      .eq("workspace_id", campaign.workspace_id);
    throw error;
  }
}

async function syncProviderCampaign(
  context: AuthContext,
  connection: ConnectionRow,
  campaign: CampaignRow,
): Promise<void> {
  if (!campaign.instantly_campaign_id) {
    throw new HttpError(
      409,
      "CAMPAIGN_NOT_LAUNCHED",
      "Start outreach before syncing this campaign",
    );
  }
  const apiKey = await integrationApiKey(connection);
  const campaignPathId = encodeURIComponent(campaign.instantly_campaign_id);
  const [providerValue, analyticsValue, leads] = await Promise.all([
    instantlyRequest<unknown>(apiKey, `/campaigns/${campaignPathId}`),
    instantlyRequest<unknown>(apiKey, "/campaigns/analytics/overview", {
      query: new URLSearchParams({ id: campaign.instantly_campaign_id }),
    }),
    listProviderLeads(apiKey, campaign.instantly_campaign_id),
  ]);
  const provider = providerCampaign(providerValue);
  const analytics = safeInstantlyAnalytics(analyticsValue);
  const targets = await readTargets(
    context.admin,
    campaign.workspace_id,
    campaign.id,
  );
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const leadsByEmail = new Map(leads.map((lead) => [lead.email, lead]));

  for (let offset = 0; offset < targets.length; offset += 25) {
    await Promise.all(
      targets.slice(offset, offset + 25).map(async (target) => {
        const lead = target.instantly_lead_id
          ? leadsById.get(target.instantly_lead_id)
          : target.contact_email
          ? leadsByEmail.get(target.contact_email)
          : undefined;
        if (!lead) return;
        const { error } = await context.admin
          .from("workspace_client_campaign_targets")
          .update({
            instantly_lead_id: lead.id,
            instantly_lead_status: lead.status,
            email_open_count: lead.email_open_count,
            email_reply_count: lead.email_reply_count,
            status: lead.email_reply_count > 0
              ? "replied"
              : target.status === "completed"
              ? "completed"
              : "in_outreach",
            last_activity_at: lead.timestamp_updated || target.last_activity_at,
            last_error: null,
            updated_by: context.user.id,
          })
          .eq("id", target.id)
          .eq("workspace_id", campaign.workspace_id);
        if (error) {
          throw new HttpError(
            500,
            "CAMPAIGN_SYNC_FAILED",
            "Campaign lead activity could not be saved",
          );
        }
      }),
    );
  }
  const now = new Date().toISOString();
  const { error } = await context.admin
    .from("workspace_client_campaigns")
    .update({
      instantly_campaign_status: provider.status,
      status: localCampaignStatus(provider.status),
      analytics,
      provider_sync_state: "idle",
      provider_sync_started_at: null,
      last_synced_at: now,
      last_error: null,
      updated_by: context.user.id,
    })
    .eq("id", campaign.id)
    .eq("workspace_id", campaign.workspace_id);
  if (error) {
    throw new HttpError(
      500,
      "CAMPAIGN_SYNC_FAILED",
      "Campaign analytics could not be saved",
    );
  }
  await context.admin
    .from("workspace_instantly_integrations")
    .update({ status: "connected", last_verified_at: now, last_error: null })
    .eq("workspace_id", campaign.workspace_id);
}

function providerHttpError(error: InstantlyApiError): HttpError {
  const status = error.status === 429
    ? 429
    : error.status === 401
    ? 400
    : error.status === 402 || error.status === 403 || error.status === 404 ||
        error.status === 409
    ? 409
    : 502;
  return new HttpError(status, error.code, error.message);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req, METHODS);

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Only POST is allowed");
    }
    const body = await parseJsonObject(req, 500_000);
    const action = typeof body.action === "string" ? body.action : "";
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    const context = await requireAuthenticatedUser(req);
    const access = await requireWorkspaceFeatureAccess(context, workspaceId);

    if (action === "mailboxes") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const connection = await readConnection(context.admin, workspaceId);
      if (
        !connection || connection.status === "disconnected" ||
        !connection.api_key_ciphertext || !connection.api_key_iv
      ) {
        return jsonResponse(req, METHODS, 200, {
          connected: false,
          provider_workspace_name: connection?.provider_workspace_name || null,
          accounts: [],
          last_synced_at: connection?.last_verified_at || null,
          analytics_errors: [],
        });
      }

      const apiKey = await integrationApiKey(connection, false);
      const accounts = await refreshProviderAccounts(
        context.admin,
        connection,
        apiKey,
      );
      const emails = accounts.map((account) => account.email);
      const [dailyResult, warmupResult] = await Promise.allSettled([
        getInstantlyDailyAccountSends(apiKey, emails),
        getInstantlyWarmupAnalytics(apiKey, emails),
      ]);
      const dailySends = dailyResult.status === "fulfilled"
        ? dailyResult.value
        : new Map<string, number>();
      const warmupAnalytics = warmupResult.status === "fulfilled"
        ? warmupResult.value
        : new Map<string, InstantlyWarmupAccountAnalytics>();
      const analyticsErrors = [
        dailyResult.status === "rejected"
          ? safeInstantlyError(dailyResult.reason).message
          : null,
        warmupResult.status === "rejected"
          ? safeInstantlyError(warmupResult.reason).message
          : null,
      ].filter((message): message is string => Boolean(message));
      const lastSyncedAt = new Date().toISOString();

      return jsonResponse(req, METHODS, 200, {
        connected: true,
        provider_workspace_name: connection.provider_workspace_name,
        accounts: accounts.map((account) => {
          const warmup = warmupAnalytics.get(account.email);
          return {
            email: account.email,
            first_name: account.first_name,
            last_name: account.last_name,
            status: account.status,
            status_message: account.status_message?.e_message ||
              account.status_message?.response || null,
            warmup_status: account.warmup_status,
            daily_limit: account.daily_limit,
            sent_today: dailySends.get(account.email) ?? null,
            warmup_emails: warmup?.sent ?? null,
            warmup_limit: account.warmup_limit,
            health_score: warmup?.health_score ?? account.stat_warmup_score,
            tags: account.tags,
          };
        }),
        last_synced_at: lastSyncedAt,
        analytics_errors: analyticsErrors,
      });
    }

    if (action === "overview") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const [connection, campaignsResult, targetsResult] = await Promise.all([
        readConnection(context.admin, workspaceId),
        context.admin
          .from("workspace_client_campaigns")
          .select(CAMPAIGN_COLUMNS)
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(1_000),
        context.admin
          .from("workspace_client_campaign_targets")
          .select(TARGET_COLUMNS)
          .eq("workspace_id", workspaceId)
          .limit(5_000),
      ]);
      if (campaignsResult.error || targetsResult.error) {
        throw new HttpError(
          500,
          "CAMPAIGN_OVERVIEW_FAILED",
          "Client campaigns could not be loaded",
        );
      }
      const targets = (targetsResult.data || []) as unknown as TargetRow[];
      const campaigns = (campaignsResult.data || []) as unknown as CampaignRow[];
      const targetsByCampaign = new Map<string, TargetRow[]>();
      for (const target of targets) {
        targetsByCampaign.set(target.campaign_id, [
          ...(targetsByCampaign.get(target.campaign_id) || []),
          target,
        ]);
      }
      const mappedByProviderId = new Map(
        campaigns.flatMap((campaign) => campaign.instantly_campaign_id
          ? [[campaign.instantly_campaign_id, campaign] as const]
          : []),
      );
      let providerCampaigns: ProviderCampaign[] = [];
      let providerCampaignsError: string | null = null;
      if (connection?.status === "connected") {
        try {
          providerCampaigns = await listProviderCampaigns(
            await integrationApiKey(connection),
          );
        } catch (error) {
          providerCampaignsError = safeInstantlyError(error).message;
        }
      }
      return jsonResponse(req, METHODS, 200, {
        integration: connectionDto(connection, access),
        can_manage_campaigns: CAMPAIGN_MANAGER_ROLES.has(access.role),
        campaigns: campaigns.map((campaign) => (
            campaignDto(campaign, targetsByCampaign.get(campaign.id) || [])
          )),
        provider_campaigns: providerCampaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          sender_accounts: campaign.senderAccounts,
          timezone: campaign.timezone,
          daily_limit: campaign.dailyLimit,
          timestamp_created: campaign.timestampCreated,
          timestamp_updated: campaign.timestampUpdated,
          mapped_client_id: mappedByProviderId.get(campaign.id)?.client_id ||
            null,
        })),
        provider_campaigns_error: providerCampaignsError,
      });
    }

    if (action === "connect-instantly") {
      requireOnlyKeys(body, ["action", "workspace_id", "api_key"]);
      requireIntegrationOwner(access);
      const apiKey = requireString(body.api_key, "api_key", {
        min: 20,
        max: 1_000,
      });
      const [providerWorkspace, accounts] = await Promise.all([
        getInstantlyWorkspace(apiKey),
        listInstantlyAccounts(apiKey),
        verifyProviderReadAccess(apiKey),
      ]);
      const existing = await readConnection(context.admin, workspaceId);
      if (existing && existing.provider_workspace_id !== providerWorkspace.id) {
        const { count, error } = await context.admin
          .from("workspace_client_campaigns")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .not("instantly_campaign_id", "is", null);
        if (error) {
          throw new HttpError(
            500,
            "CAMPAIGN_LOOKUP_FAILED",
            "Existing campaign mappings could not be checked",
          );
        }
        if ((count || 0) > 0) {
          throw new HttpError(
            409,
            "INSTANTLY_WORKSPACE_MISMATCH",
            "This workspace already has campaigns mapped to a different Instantly workspace",
          );
        }
      }
      const { data: providerOwner, error: providerOwnerError } = await context
        .admin
        .from("workspace_instantly_integrations")
        .select("workspace_id")
        .eq("provider_workspace_id", providerWorkspace.id)
        .neq("workspace_id", workspaceId)
        .maybeSingle();
      if (providerOwnerError) {
        throw new HttpError(
          500,
          "INSTANTLY_CONNECTION_LOOKUP_FAILED",
          "The Instantly workspace mapping could not be checked",
        );
      }
      if (providerOwner) {
        throw new HttpError(
          409,
          "INSTANTLY_WORKSPACE_ALREADY_CONNECTED",
          "This Instantly workspace is already connected to another GOAP workspace",
        );
      }
      const encrypted = await encryptInstantlyApiKey(apiKey);
      const now = new Date().toISOString();
      const { error } = await context.admin
        .from("workspace_instantly_integrations")
        .upsert({
          workspace_id: workspaceId,
          provider_workspace_id: providerWorkspace.id,
          provider_workspace_name: providerWorkspace.name,
          status: "connected",
          api_key_ciphertext: encrypted.ciphertext,
          api_key_iv: encrypted.iv,
          api_key_last_four: apiKey.slice(-4),
          accounts_snapshot: accounts,
          connected_by: context.user.id,
          connected_at: now,
          last_verified_at: now,
          last_error: null,
        }, { onConflict: "workspace_id" });
      if (error) {
        throw new HttpError(
          500,
          "INSTANTLY_CONNECTION_SAVE_FAILED",
          "The Instantly connection could not be saved",
        );
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.instantly.connected",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: {
          provider_workspace_id: providerWorkspace.id,
          active_account_count: accounts.filter((account) =>
            account.status === 1
          ).length,
        },
      });
      const saved = await readConnection(context.admin, workspaceId);
      return jsonResponse(req, METHODS, 200, {
        integration: connectionDto(saved, access),
      });
    }

    if (action === "refresh-instantly") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      requireCampaignManager(access);
      const connection = await readConnection(context.admin, workspaceId);
      const apiKey = await integrationApiKey(connection, false);
      if (!connection) {
        throw new HttpError(
          409,
          "INSTANTLY_NOT_CONNECTED",
          "Connect Instantly first",
        );
      }
      try {
        const [providerWorkspace, accounts] = await Promise.all([
          getInstantlyWorkspace(apiKey),
          listInstantlyAccounts(apiKey),
          verifyProviderReadAccess(apiKey),
        ]);
        if (providerWorkspace.id !== connection.provider_workspace_id) {
          throw new HttpError(
            409,
            "INSTANTLY_WORKSPACE_MISMATCH",
            "This API key belongs to a different Instantly workspace",
          );
        }
        const now = new Date().toISOString();
        const { error } = await context.admin
          .from("workspace_instantly_integrations")
          .update({
            provider_workspace_name: providerWorkspace.name,
            status: "connected",
            accounts_snapshot: accounts,
            last_verified_at: now,
            last_error: null,
          })
          .eq("workspace_id", workspaceId);
        if (error) {
          throw new HttpError(
            500,
            "INSTANTLY_CONNECTION_UPDATE_FAILED",
            "The Instantly connection could not be refreshed",
          );
        }
      } catch (error) {
        const safe = safeInstantlyError(error);
        await context.admin
          .from("workspace_instantly_integrations")
          .update({ status: "error", last_error: safe.message })
          .eq("workspace_id", workspaceId);
        throw error;
      }
      const refreshed = await readConnection(context.admin, workspaceId);
      return jsonResponse(req, METHODS, 200, {
        integration: connectionDto(refreshed, access),
      });
    }

    if (action === "disconnect-instantly") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      requireIntegrationOwner(access);
      const { error } = await context.admin
        .from("workspace_instantly_integrations")
        .update({
          status: "disconnected",
          api_key_ciphertext: null,
          api_key_iv: null,
          accounts_snapshot: [],
          last_error: null,
        })
        .eq("workspace_id", workspaceId);
      if (error) {
        throw new HttpError(
          500,
          "INSTANTLY_DISCONNECT_FAILED",
          "The Instantly connection could not be removed",
        );
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.instantly.disconnected",
        entityType: "workspace",
        entityId: workspaceId,
      });
      const disconnected = await readConnection(context.admin, workspaceId);
      return jsonResponse(req, METHODS, 200, {
        integration: connectionDto(disconnected, access),
      });
    }

    const clientId = requireUuid(body.client_id, "client_id");
    const client = await requireWorkspaceClient(
      context.admin,
      workspaceId,
      clientId,
    );

    if (action === "get") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id"]);
      const [connection, campaign] = await Promise.all([
        readConnection(context.admin, workspaceId),
        readCampaign(context.admin, workspaceId, clientId),
      ]);
      const targets = campaign
        ? await readTargets(context.admin, workspaceId, campaign.id)
        : [];
      return jsonResponse(req, METHODS, 200, {
        integration: connectionDto(connection, access),
        can_manage_campaigns: CAMPAIGN_MANAGER_ROLES.has(access.role),
        campaign: campaign ? campaignDto(campaign, targets) : null,
        targets: targets.map(targetDto),
      });
    }

    if (action === "add-podcasts") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "shortlist_podcast_ids",
      ]);
      requireCampaignManager(access);
      const shortlistIds = uuidList(
        body.shortlist_podcast_ids,
        "shortlist_podcast_ids",
        500,
      );
      if (shortlistIds.length === 0) {
        throw new HttpError(
          400,
          "CAMPAIGN_PODCAST_REQUIRED",
          "Choose at least one podcast to add",
        );
      }
      const campaign = await readCampaign(context.admin, workspaceId, clientId);
      if (!campaign?.instantly_campaign_id) {
        throw new HttpError(
          409,
          "CAMPAIGN_NOT_ASSIGNED",
          "Create or assign an Instantly campaign to this client first",
        );
      }
      const existingTargets = await readTargets(
        context.admin,
        workspaceId,
        campaign.id,
      );
      const existingShortlistIds = new Set(
        existingTargets.map((target) => target.shortlist_podcast_id),
      );
      const targets = await addCampaignTargets(
        context,
        campaign,
        shortlistIds,
        { requireApproved: true },
      );
      const added = shortlistIds.filter((id) => !existingShortlistIds.has(id))
        .length;
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.client_campaign.podcasts_added",
        entityType: "workspace_client_campaign",
        entityId: campaign.id,
        metadata: {
          client_id: clientId,
          requested_count: shortlistIds.length,
          added_count: added,
        },
      });
      return jsonResponse(req, METHODS, 200, {
        added,
        campaign: campaignDto(campaign, targets),
        targets: targets.map(targetDto),
      });
    }

    if (action === "prepare-podcast") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "shortlist_podcast_id",
        "research_notes",
        "host_name",
        "contact_email",
        "subject",
        "pitch_body",
        "follow_up_1_subject",
        "follow_up_1_body",
        "follow_up_2_subject",
        "follow_up_2_body",
      ]);
      requireCampaignManager(access);
      const shortlistPodcastId = requireUuid(
        body.shortlist_podcast_id,
        "shortlist_podcast_id",
      );
      const researchNotes = draftText(
        body.research_notes,
        "research_notes",
        10_000,
      );
      const hostName = draftText(body.host_name, "host_name", 500);
      const contactEmail = contactEmailInput(body.contact_email);
      const sequence: OutreachSequence = {
        subject: requireString(body.subject, "subject", { max: 300 }),
        body: requireString(body.pitch_body, "pitch_body", { max: 20_000 }),
        followUpOneSubject: requireString(
          body.follow_up_1_subject,
          "follow_up_1_subject",
          { max: 300 },
        ),
        followUpOneBody: requireString(
          body.follow_up_1_body,
          "follow_up_1_body",
          { max: 20_000 },
        ),
        followUpTwoSubject: requireString(
          body.follow_up_2_subject,
          "follow_up_2_subject",
          { max: 300 },
        ),
        followUpTwoBody: requireString(
          body.follow_up_2_body,
          "follow_up_2_body",
          { max: 20_000 },
        ),
      };
      const campaign = await readCampaign(context.admin, workspaceId, clientId);
      if (!campaign?.instantly_campaign_id) {
        throw new HttpError(
          409,
          "CAMPAIGN_NOT_ASSIGNED",
          "Create or assign an Instantly campaign to this client first",
        );
      }
      const existingTargets = await readTargets(
        context.admin,
        workspaceId,
        campaign.id,
      );
      const added = !existingTargets.some((target) =>
        target.shortlist_podcast_id === shortlistPodcastId
      );
      const targets = await addCampaignTargets(
        context,
        campaign,
        [shortlistPodcastId],
        { requireApproved: true },
      );
      const target = targets.find((item) =>
        item.shortlist_podcast_id === shortlistPodcastId
      );
      if (!target) {
        throw new HttpError(
          404,
          "CAMPAIGN_TARGET_NOT_FOUND",
          "Campaign podcast not found",
        );
      }
      if (
        target.instantly_lead_id ||
        ["launching", "in_outreach", "replied", "completed"].includes(
          target.status,
        )
      ) {
        throw new HttpError(
          409,
          "CAMPAIGN_PITCH_LOCKED",
          "The outreach sequence cannot be edited after outreach starts",
        );
      }
      const { data, error } = await context.admin
        .from("workspace_client_campaign_targets")
        .update({
          research_notes: researchNotes,
          host_name: hostName,
          contact_email: contactEmail,
          pitch_subject: sequence.subject,
          pitch_body: sequence.body,
          follow_up_1_subject: sequence.followUpOneSubject,
          follow_up_1_body: sequence.followUpOneBody,
          follow_up_2_subject: sequence.followUpTwoSubject,
          follow_up_2_body: sequence.followUpTwoBody,
          status: contactEmail ? "ready" : "draft",
          last_error: null,
          updated_by: context.user.id,
        })
        .eq("id", target.id)
        .eq("workspace_id", workspaceId)
        .select(TARGET_COLUMNS)
        .single();
      if (error || !data) {
        throw new HttpError(
          500,
          "CAMPAIGN_PREPARATION_SAVE_FAILED",
          "The prepared outreach could not be saved",
        );
      }
      const prepared = data as unknown as TargetRow;
      const refreshedTargets = targets.map((item) =>
        item.id === prepared.id ? prepared : item
      );
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.client_campaign.podcast_prepared",
        entityType: "workspace_client_campaign_target",
        entityId: target.id,
        metadata: {
          client_id: clientId,
          podcast_id: target.podcast_id,
          added,
          contact_present: Boolean(contactEmail),
        },
      });
      return jsonResponse(req, METHODS, 200, {
        added,
        campaign: campaignDto(campaign, refreshedTargets),
        target: targetDto(prepared),
      });
    }

    if (action === "upsert") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "name",
        "timezone",
        "daily_limit",
        "sender_accounts",
        "shortlist_podcast_ids",
        "provider_campaign_id",
      ]);
      requireCampaignManager(access);
      const name = requireString(body.name, "name", { max: 180 });
      const timezone = campaignTimezone(body.timezone);
      const limit = dailyLimit(body.daily_limit);
      const senderAccounts = emailList(body.sender_accounts);
      const requestedProviderCampaignId = body.provider_campaign_id == null
        ? null
        : providerUuid(body.provider_campaign_id);
      if (
        body.provider_campaign_id != null && !requestedProviderCampaignId
      ) {
        throw new HttpError(
          400,
          "INVALID_FIELD",
          "provider_campaign_id must be a valid Instantly campaign ID or null",
        );
      }
      const shortlistIds = uuidList(
        body.shortlist_podcast_ids,
        "shortlist_podcast_ids",
        500,
      );
      const connection = await readConnection(context.admin, workspaceId);
      const apiKey = await integrationApiKey(connection);
      let selectedProviderCampaign: ProviderCampaign | null = null;
      if (requestedProviderCampaignId) {
        selectedProviderCampaign = providerCampaign(
          await instantlyRequest<unknown>(
            apiKey,
            `/campaigns/${encodeURIComponent(requestedProviderCampaignId)}`,
          ),
        );
      } else {
        if (senderAccounts.length === 0) {
          throw new HttpError(
            400,
            "CAMPAIGN_SENDER_REQUIRED",
            "Select at least one active Instantly account",
          );
        }
        verifySelectedAccounts(
          senderAccounts,
          accountsFromSnapshot(connection?.accounts_snapshot),
        );
      }
      let campaign = await ensureLocalCampaign(context, workspaceId, client, {
        name: selectedProviderCampaign?.name.slice(0, 180) || name,
        timezone: selectedProviderCampaign?.timezone || timezone,
        dailyLimit: selectedProviderCampaign?.dailyLimit || limit,
        senderAccounts: selectedProviderCampaign?.senderAccounts ||
          senderAccounts,
      });
      if (
        campaign.instantly_campaign_id && requestedProviderCampaignId &&
        campaign.instantly_campaign_id !== requestedProviderCampaignId
      ) {
        throw new HttpError(
          409,
          "CAMPAIGN_ALREADY_MAPPED",
          "This client already has a different Instantly campaign",
        );
      }
      if (requestedProviderCampaignId) {
        const { data: existingMapping, error: mappingError } = await context
          .admin
          .from("workspace_client_campaigns")
          .select("id,client_id")
          .eq("instantly_campaign_id", requestedProviderCampaignId)
          .neq("id", campaign.id)
          .maybeSingle();
        if (mappingError) {
          throw new HttpError(
            500,
            "CAMPAIGN_MAPPING_LOOKUP_FAILED",
            "The Instantly campaign mapping could not be checked",
          );
        }
        if (existingMapping) {
          throw new HttpError(
            409,
            "CAMPAIGN_ALREADY_MAPPED",
            "That Instantly campaign is already assigned to another client",
          );
        }
      }
      const campaignUpdate = selectedProviderCampaign
        ? {
          name: selectedProviderCampaign.name.slice(0, 180),
          timezone: selectedProviderCampaign.timezone,
          daily_limit: selectedProviderCampaign.dailyLimit,
          sender_accounts: selectedProviderCampaign.senderAccounts,
          instantly_campaign_id: selectedProviderCampaign.id,
          instantly_campaign_status: selectedProviderCampaign.status,
          status: localCampaignStatus(selectedProviderCampaign.status),
          provider_sync_state: "idle",
          provider_sync_started_at: null,
          last_synced_at: new Date().toISOString(),
          last_error: null,
          updated_by: context.user.id,
        }
        : {
          name,
          timezone,
          daily_limit: limit,
          sender_accounts: senderAccounts,
          updated_by: context.user.id,
        };
      if (!campaign.instantly_campaign_id || selectedProviderCampaign) {
        const { data, error } = await context.admin
          .from("workspace_client_campaigns")
          .update(campaignUpdate)
          .eq("id", campaign.id)
          .eq("workspace_id", workspaceId)
          .select(CAMPAIGN_COLUMNS)
          .single();
        if (error || !data) {
          throw new HttpError(
            500,
            "CAMPAIGN_UPDATE_FAILED",
            "The Instantly campaign could not be assigned to this client",
          );
        }
        campaign = data as unknown as CampaignRow;
      }
      const targets = await replaceDraftCampaignTargets(
        context,
        campaign,
        shortlistIds,
      );
      if (!campaign.instantly_campaign_id) {
        await ensureProviderCampaign(context, campaign, apiKey);
        const mappedCampaign = await readCampaign(
          context.admin,
          workspaceId,
          clientId,
        );
        if (!mappedCampaign?.instantly_campaign_id) {
          throw new HttpError(
            500,
            "CAMPAIGN_PROVIDER_MAPPING_FAILED",
            "Instantly created the campaign but its client mapping could not be confirmed",
          );
        }
        campaign = mappedCampaign;
      } else if (selectedProviderCampaign && connection) {
        try {
          await syncProviderCampaign(context, connection, campaign);
          campaign = await readCampaign(context.admin, workspaceId, clientId) ||
            campaign;
        } catch (error) {
          const safe = safeInstantlyError(error);
          await context.admin
            .from("workspace_client_campaigns")
            .update({ last_error: safe.message, updated_by: context.user.id })
            .eq("id", campaign.id)
            .eq("workspace_id", workspaceId);
        }
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.client_campaign.saved",
        entityType: "workspace_client_campaign",
        entityId: campaign.id,
        metadata: {
          client_id: clientId,
          target_count: targets.length,
          instantly_campaign_id: campaign.instantly_campaign_id,
          provider_campaign_source: selectedProviderCampaign
            ? "existing"
            : "created",
        },
      });
      return jsonResponse(req, METHODS, 200, {
        campaign: campaignDto(campaign, targets),
        targets: targets.map(targetDto),
      });
    }

    if (action === "update-contact") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "shortlist_podcast_id",
        "contact_email",
        "host_name",
      ]);
      requireCampaignManager(access);
      const shortlistPodcastId = requireUuid(
        body.shortlist_podcast_id,
        "shortlist_podcast_id",
      );
      const contactEmail = contactEmailInput(body.contact_email);
      const hostName = draftText(body.host_name, "host_name", 500);
      const campaign = await ensureLocalCampaign(context, workspaceId, client);
      const target = await requireCampaignTarget(
        context,
        campaign,
        shortlistPodcastId,
      );
      if (
        target.instantly_lead_id ||
        ["launching", "in_outreach", "replied", "completed"].includes(
          target.status,
        )
      ) {
        throw new HttpError(
          409,
          "CAMPAIGN_CONTACT_LOCKED",
          "The contact cannot be changed after outreach starts",
        );
      }
      const status = contactEmail && completeTargetSequence(target)
        ? "ready"
        : "draft";
      const { data, error } = await context.admin
        .from("workspace_client_campaign_targets")
        .update({
          contact_email: contactEmail,
          host_name: hostName,
          status,
          last_error: null,
          updated_by: context.user.id,
        })
        .eq("id", target.id)
        .eq("workspace_id", workspaceId)
        .select(TARGET_COLUMNS)
        .single();
      if (error || !data) {
        throw new HttpError(
          500,
          "CAMPAIGN_CONTACT_SAVE_FAILED",
          "The podcast contact could not be saved",
        );
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.client_campaign.contact_updated",
        entityType: "workspace_client_campaign_target",
        entityId: target.id,
        metadata: {
          client_id: clientId,
          podcast_id: target.podcast_id,
          contact_present: Boolean(contactEmail),
        },
      });
      return jsonResponse(req, METHODS, 200, {
        target: targetDto(data as unknown as TargetRow),
      });
    }

    if (action === "save-pitch") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "shortlist_podcast_id",
        "subject",
        "pitch_body",
        "follow_up_1_subject",
        "follow_up_1_body",
        "follow_up_2_subject",
        "follow_up_2_body",
      ]);
      requireCampaignManager(access);
      const shortlistPodcastId = requireUuid(
        body.shortlist_podcast_id,
        "shortlist_podcast_id",
      );
      const subject = draftText(body.subject, "subject", 300);
      const pitchBody = draftText(body.pitch_body, "pitch_body", 20_000);
      const followUpOneSubject = draftText(
        body.follow_up_1_subject,
        "follow_up_1_subject",
        300,
      );
      const followUpOneBody = draftText(
        body.follow_up_1_body,
        "follow_up_1_body",
        20_000,
      );
      const followUpTwoSubject = draftText(
        body.follow_up_2_subject,
        "follow_up_2_subject",
        300,
      );
      const followUpTwoBody = draftText(
        body.follow_up_2_body,
        "follow_up_2_body",
        20_000,
      );
      const campaign = await ensureLocalCampaign(context, workspaceId, client);
      const target = await requireCampaignTarget(
        context,
        campaign,
        shortlistPodcastId,
      );
      if (
        ["launching", "in_outreach", "replied", "completed"].includes(
          target.status,
        )
      ) {
        throw new HttpError(
          409,
          "CAMPAIGN_PITCH_LOCKED",
          "The pitch cannot be edited after outreach starts",
        );
      }
      const status = target.contact_email && completeTargetSequence({
          pitch_subject: subject,
          pitch_body: pitchBody,
          follow_up_1_subject: followUpOneSubject,
          follow_up_1_body: followUpOneBody,
          follow_up_2_subject: followUpTwoSubject,
          follow_up_2_body: followUpTwoBody,
        })
        ? "ready"
        : "draft";
      const { data, error } = await context.admin
        .from("workspace_client_campaign_targets")
        .update({
          pitch_subject: subject,
          pitch_body: pitchBody,
          follow_up_1_subject: followUpOneSubject,
          follow_up_1_body: followUpOneBody,
          follow_up_2_subject: followUpTwoSubject,
          follow_up_2_body: followUpTwoBody,
          status,
          last_error: null,
          updated_by: context.user.id,
        })
        .eq("id", target.id)
        .eq("workspace_id", workspaceId)
        .select(TARGET_COLUMNS)
        .single();
      if (error || !data) {
        throw new HttpError(
          500,
          "CAMPAIGN_PITCH_SAVE_FAILED",
          "The custom pitch could not be saved",
        );
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.client_campaign.pitch_saved",
        entityType: "workspace_client_campaign_target",
        entityId: target.id,
        metadata: {
          client_id: clientId,
          podcast_id: target.podcast_id,
          status,
        },
      });
      return jsonResponse(req, METHODS, 200, {
        target: targetDto(data as unknown as TargetRow),
      });
    }

    if (action === "launch-pitch") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "shortlist_podcast_id",
        "subject",
        "pitch_body",
        "follow_up_1_subject",
        "follow_up_1_body",
        "follow_up_2_subject",
        "follow_up_2_body",
      ]);
      requireCampaignManager(access);
      const shortlistPodcastId = requireUuid(
        body.shortlist_podcast_id,
        "shortlist_podcast_id",
      );
      const sequence: OutreachSequence = {
        subject: requireString(body.subject, "subject", { max: 300 }),
        body: requireString(body.pitch_body, "pitch_body", { max: 20_000 }),
        followUpOneSubject: requireString(
          body.follow_up_1_subject,
          "follow_up_1_subject",
          { max: 300 },
        ),
        followUpOneBody: requireString(
          body.follow_up_1_body,
          "follow_up_1_body",
          { max: 20_000 },
        ),
        followUpTwoSubject: requireString(
          body.follow_up_2_subject,
          "follow_up_2_subject",
          { max: 300 },
        ),
        followUpTwoBody: requireString(
          body.follow_up_2_body,
          "follow_up_2_body",
          { max: 20_000 },
        ),
      };
      const connection = await readConnection(context.admin, workspaceId);
      if (!connection || connection.status !== "connected") {
        throw new HttpError(
          409,
          "INSTANTLY_NOT_CONNECTED",
          "Connect Instantly before starting outreach",
        );
      }
      const campaign = await ensureLocalCampaign(context, workspaceId, client);
      const target = await requireCampaignTarget(
        context,
        campaign,
        shortlistPodcastId,
      );
      await launchTarget(
        context,
        connection,
        client,
        campaign,
        target,
        sequence,
      );
      const updatedCampaign = await readCampaign(
        context.admin,
        workspaceId,
        clientId,
      );
      const updatedTargets = updatedCampaign
        ? await readTargets(context.admin, workspaceId, updatedCampaign.id)
        : [];
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.client_campaign.pitch_launched",
        entityType: "workspace_client_campaign_target",
        entityId: target.id,
        metadata: { client_id: clientId, podcast_id: target.podcast_id },
      });
      return jsonResponse(req, METHODS, 200, {
        campaign: updatedCampaign
          ? campaignDto(updatedCampaign, updatedTargets)
          : null,
        targets: updatedTargets.map(targetDto),
      });
    }

    if (action === "update-settings") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "name",
        "timezone",
        "daily_limit",
        "sender_accounts",
      ]);
      requireCampaignManager(access);
      const name = requireString(body.name, "name", { max: 180 });
      const timezone = campaignTimezone(body.timezone);
      const limit = dailyLimit(body.daily_limit);
      const senderAccounts = emailList(body.sender_accounts);
      const campaign = await readCampaign(context.admin, workspaceId, clientId);
      if (!campaign) {
        throw new HttpError(
          404,
          "CAMPAIGN_NOT_FOUND",
          "Create the client campaign first",
        );
      }
      const connection = await readConnection(context.admin, workspaceId);
      verifySelectedAccounts(
        senderAccounts,
        accountsFromSnapshot(connection?.accounts_snapshot),
      );
      const nextCampaign: CampaignRow = {
        ...campaign,
        name,
        timezone,
        daily_limit: limit,
        sender_accounts: senderAccounts,
      };
      let providerStatus = campaign.instantly_campaign_status;
      if (campaign.instantly_campaign_id) {
        const apiKey = await integrationApiKey(connection);
        const updated = providerCampaign(
          await instantlyRequest<unknown>(
            apiKey,
            `/campaigns/${encodeURIComponent(campaign.instantly_campaign_id)}`,
            { method: "PATCH", body: campaignConfiguration(nextCampaign) },
          ),
        );
        providerStatus = updated.status;
      }
      const { data, error } = await context.admin
        .from("workspace_client_campaigns")
        .update({
          name,
          timezone,
          daily_limit: limit,
          sender_accounts: senderAccounts,
          instantly_campaign_status: providerStatus,
          status: localCampaignStatus(providerStatus),
          last_error: null,
          updated_by: context.user.id,
        })
        .eq("id", campaign.id)
        .eq("workspace_id", workspaceId)
        .select(CAMPAIGN_COLUMNS)
        .single();
      if (error || !data) {
        throw new HttpError(
          500,
          "CAMPAIGN_SETTINGS_SAVE_FAILED",
          "Campaign settings could not be saved",
        );
      }
      const targets = await readTargets(
        context.admin,
        workspaceId,
        campaign.id,
      );
      return jsonResponse(req, METHODS, 200, {
        campaign: campaignDto(data as unknown as CampaignRow, targets),
      });
    }

    if (action === "sync") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id"]);
      requireCampaignManager(access);
      const [connection, campaign] = await Promise.all([
        readConnection(context.admin, workspaceId),
        readCampaign(context.admin, workspaceId, clientId),
      ]);
      if (!connection) {
        throw new HttpError(
          409,
          "INSTANTLY_NOT_CONNECTED",
          "Connect Instantly before syncing",
        );
      }
      if (!campaign) {
        throw new HttpError(
          404,
          "CAMPAIGN_NOT_FOUND",
          "Create the client campaign first",
        );
      }
      await syncProviderCampaign(context, connection, campaign);
      const updated = await readCampaign(context.admin, workspaceId, clientId);
      const targets = updated
        ? await readTargets(context.admin, workspaceId, updated.id)
        : [];
      return jsonResponse(req, METHODS, 200, {
        campaign: updated ? campaignDto(updated, targets) : null,
        targets: targets.map(targetDto),
      });
    }

    if (action === "pause" || action === "resume") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id"]);
      requireCampaignManager(access);
      const [connection, campaign] = await Promise.all([
        readConnection(context.admin, workspaceId),
        readCampaign(context.admin, workspaceId, clientId),
      ]);
      if (!campaign?.instantly_campaign_id) {
        throw new HttpError(
          409,
          "CAMPAIGN_NOT_LAUNCHED",
          "Start outreach before changing campaign status",
        );
      }
      const apiKey = await integrationApiKey(connection);
      const provider = providerCampaign(
        await instantlyRequest<unknown>(
          apiKey,
          `/campaigns/${encodeURIComponent(campaign.instantly_campaign_id)}/${
            action === "pause" ? "pause" : "activate"
          }`,
          { method: "POST" },
        ),
      );
      const { data, error } = await context.admin
        .from("workspace_client_campaigns")
        .update({
          instantly_campaign_status: provider.status,
          status: localCampaignStatus(provider.status),
          last_synced_at: new Date().toISOString(),
          last_error: null,
          updated_by: context.user.id,
        })
        .eq("id", campaign.id)
        .eq("workspace_id", workspaceId)
        .select(CAMPAIGN_COLUMNS)
        .single();
      if (error || !data) {
        throw new HttpError(
          500,
          "CAMPAIGN_STATUS_SAVE_FAILED",
          "Campaign status could not be saved",
        );
      }
      const targets = await readTargets(
        context.admin,
        workspaceId,
        campaign.id,
      );
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: `workspace.client_campaign.${
          action === "pause" ? "paused" : "resumed"
        }`,
        entityType: "workspace_client_campaign",
        entityId: campaign.id,
        metadata: { client_id: clientId },
      });
      return jsonResponse(req, METHODS, 200, {
        campaign: campaignDto(data as unknown as CampaignRow, targets),
      });
    }

    throw new HttpError(
      400,
      "INVALID_ACTION",
      "Unknown client campaign action",
    );
  } catch (error) {
    return errorResponse(
      req,
      METHODS,
      error instanceof InstantlyApiError ? providerHttpError(error) : error,
    );
  }
});
