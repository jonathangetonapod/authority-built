import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import {
  type AccountSendDay,
  decryptInstantlyApiKey,
  encryptInstantlyApiKey,
  getInstantlyAccountSendHistory,
  getInstantlyWarmupAnalytics,
  getInstantlyWorkspace,
  type InstantlyAccountSummary,
  InstantlyApiError,
  instantlyCampaignStatus,
  instantlyRequest,
  type InstantlyWarmupAccountAnalytics,
  listInstantlyAccounts,
  listInstantlyCampaignAnalytics,
  localCampaignStatus,
  safeInstantlyAccount,
  safeInstantlyAnalytics,
  safeInstantlyError,
  withStoredOpportunityCounts,
} from "../_shared/instantly.ts";
import {
  detectDeterministicReply,
  deterministicClassification,
  generateReplyPackage,
} from "../_shared/inboxSdr.ts";
import { normalizeRequiredVariables } from "../_shared/promptRequirements.ts";
import { chargeCredits, logOperationCost } from "../_shared/billing.ts";
import { resolveAiKey } from "../_shared/workspaceAiKeys.ts";
import { fetchPromptModels } from "../_shared/promptModels.ts";
import {
  type AuthContext,
  createAdminClient,
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
const MAX_ANALYTICS_REFRESH_CAMPAIGNS = 200;
const SEND_HISTORY_DAYS = 7;
const RESEARCH_PROMPT_IDS = [
  "podcast_research",
  "host_info",
  "guest_info",
  "host_name_extractor",
  "find_topics",
  "write_email",
  "clean_email",
  "inbox_reply",
  "inbox_nudges",
];

// Every prompt an executor actually consumes. host_name_extractor is not
// wired to any generator today, so it is not offered as a client override.
// Stages whose model choice an executor actually honours.
//
// inbox_reply and inbox_nudges are excluded on purpose: _shared/inboxSdr.ts
// builds its own request and runs the shipped default unconditionally, so
// accepting a model for them would store a choice, report it back as saved,
// and change nothing about what runs — the worst kind of setting.
const MODEL_SELECTABLE_PROMPT_IDS = RESEARCH_PROMPT_IDS.filter(
  (id) => id !== "inbox_reply" && id !== "inbox_nudges",
);

const CLIENT_PROMPT_IDS = RESEARCH_PROMPT_IDS.filter((id) => id !== "host_name_extractor");

function requireResearchPromptId(value: unknown): string {
  if (typeof value !== "string" || !RESEARCH_PROMPT_IDS.includes(value)) {
    throw new HttpError(400, "INVALID_PROMPT", "Unknown research prompt");
  }
  return value;
}

function requireClientPromptId(value: unknown): string {
  if (typeof value !== "string" || !CLIENT_PROMPT_IDS.includes(value)) {
    throw new HttpError(400, "INVALID_PROMPT", "Unknown client AI SDR prompt");
  }
  return value;
}

/**
 * A required field must name a real registry variable. The database CHECK only
 * constrains the shape of the array, because docs/prompt-variables.json is the
 * authority and it lives here, not in SQL.
 */
function parseRequiredVariables(value: unknown): string[] {
  try {
    return normalizeRequiredVariables(value);
  } catch (error) {
    throw new HttpError(
      400,
      "INVALID_REQUIRED_VARIABLES",
      error instanceof Error ? error.message : "Invalid required_variables",
    );
  }
}

/** Absent row = nothing required, so a stage missing from the map is empty. */
function requirementsDto(rows: unknown): Record<string, string[]> {
  const requirements: Record<string, string[]> = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const record = row as Record<string, unknown>;
    const promptId = String(record.prompt_id ?? "");
    if (!RESEARCH_PROMPT_IDS.includes(promptId)) continue;
    const required = Array.isArray(record.required_variables) ? record.required_variables : [];
    requirements[promptId] = required.filter((entry): entry is string => typeof entry === "string");
  }
  return requirements;
}
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
  "provider_schedule",
  "provider_email_gap",
  "provider_not_sending_status",
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
  "pitch_chain_version",
  "status",
  "instantly_lead_id",
  "instantly_lead_status",
  "email_open_count",
  "email_reply_count",
  "approved_at",
  "launched_at",
  "lead_staged_at",
  "lead_staged_campaign_status",
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
  provider_schedule: Record<string, unknown> | null;
  provider_email_gap: number | null;
  provider_not_sending_status: number | null;
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
  lead_staged_at: string | null;
  lead_staged_campaign_status: number | null;
  last_activity_at: string | null;
  last_error: string | null;
  prior_outreach_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The sending window Instantly actually holds for a campaign.
 *
 * Day keys are '0'..'6'. Instantly's API reference does not state which day '0'
 * is, so this carries the raw booleans through untranslated and lets the UI
 * label them under one stated convention (0 = Sunday, matching JavaScript's
 * getDay). Showing the real values is the point: the page used to assert
 * "Monday–Friday" from a hardcoded string, which could not disagree with
 * reality and so could never reveal that it did.
 */
interface ProviderSchedule {
  name: string | null;
  from: string | null;
  to: string | null;
  timezone: string | null;
  /** Index 0..6 in key order, true when sending is allowed that day. */
  days: boolean[];
}

interface ProviderCampaign {
  id: string;
  status: number;
  name: string;
  senderAccounts: string[];
  timezone: string;
  dailyLimit: number;
  /** Minutes between sends, as configured at the provider. */
  emailGap: number | null;
  /** Why the provider is not sending right now, when it says. */
  notSendingStatus: number | null;
  schedule: ProviderSchedule | null;
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

const INTEGRATION_MANAGER_ROLES = new Set(["owner", "platform_admin"]);

function requireIntegrationOwner(access: WorkspaceFeatureAccess): void {
  if (!INTEGRATION_MANAGER_ROLES.has(access.role)) {
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

async function readClientNames(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  clientIds: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(clientIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data } = await admin
    .from("clients")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .in("id", unique)
    .limit(unique.length);
  return new Map(
    ((data || []) as Array<{ id: string; name: string }>).map((client) => [
      client.id,
      client.name,
    ]),
  );
}

/**
 * The zone a workspace's sending day is measured in.
 *
 * Campaigns carry their own timezone and a workspace is normally run out of
 * one. The most common wins; a tie falls back to UTC rather than picking an
 * arbitrary client's zone and quietly labelling every number with it.
 */
function commonCampaignTimeZone(zones: Array<string | null>): string {
  const counts = new Map<string, number>();
  for (const zone of zones) {
    if (typeof zone !== "string" || !zone.trim()) continue;
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  let winner = "UTC";
  let best = 0;
  let tied = false;
  for (const [zone, count] of counts) {
    if (count > best) {
      winner = zone;
      best = count;
      tied = false;
    } else if (count === best) {
      tied = true;
    }
  }
  return tied && best > 0 ? "UTC" : winner;
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
    can_manage: INTEGRATION_MANAGER_ROLES.has(access.role),
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
    // In the provider campaign but not launched from here. Without this a
    // podcast waiting in Instantly is indistinguishable from one that was only
    // ever drafted, and the difference is whether a host can receive it.
    staged: targets.filter((target) =>
      target.lead_staged_at && !target.launched_at
    ).length,
    // Of those, the ones whose campaign was live when they were staged, so the
    // sequence is already running.
    staged_sending: targets.filter((target) =>
      target.lead_staged_at && !target.launched_at &&
      target.lead_staged_campaign_status === 1
    ).length,
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
    provider_schedule: campaign.provider_schedule ?? null,
    provider_email_gap: campaign.provider_email_gap ?? null,
    provider_not_sending_status: campaign.provider_not_sending_status ?? null,
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
    // A staged lead exists in Instantly but outreach was not launched from
    // here. Distinct from launched_at because staging into an active campaign
    // sends and staging into a paused one does not.
    lead_staged_at: target.lead_staged_at || null,
    lead_staged_campaign_status: target.lead_staged_campaign_status ?? null,
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
  const emailGap = typeof item.email_gap === "number" &&
      Number.isFinite(item.email_gap) && item.email_gap >= 0 &&
      item.email_gap <= 1_440
    ? Math.round(item.email_gap)
    : null;
  const scheduleDays = firstSchedule?.days &&
      typeof firstSchedule.days === "object" && !Array.isArray(firstSchedule.days)
    ? firstSchedule.days as Record<string, unknown>
    : null;
  const timeOfDay = (candidate: unknown): string | null => (
    typeof candidate === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(candidate)
      ? candidate
      : null
  );
  const timing = firstSchedule?.timing &&
      typeof firstSchedule.timing === "object" && !Array.isArray(firstSchedule.timing)
    ? firstSchedule.timing as Record<string, unknown>
    : null;
  const providerSchedule: ProviderSchedule | null = firstSchedule
    ? {
      name: typeof firstSchedule.name === "string"
        ? firstSchedule.name.slice(0, 120)
        : null,
      from: timeOfDay(timing?.from),
      to: timeOfDay(timing?.to),
      timezone: typeof firstSchedule.timezone === "string"
        ? firstSchedule.timezone.slice(0, 100)
        : null,
      days: scheduleDays
        ? Array.from({ length: 7 }, (_value, index) => scheduleDays[String(index)] === true)
        : [],
    }
    : null;
  const timestamp = (candidate: unknown): string | null => (
      typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))
        ? candidate
        : null
    );
  // Answers "active, but why is nothing going out". Kept as the provider's own
  // integer rather than a phrase, so a code this build does not recognise
  // still arrives instead of being dropped in translation.
  const notSendingStatus = typeof item.not_sending_status === "number" &&
      Number.isInteger(item.not_sending_status)
    ? item.not_sending_status
    : null;
  return {
    id,
    status,
    name: name.slice(0, 500),
    senderAccounts,
    timezone,
    dailyLimit,
    emailGap,
    notSendingStatus,
    schedule: providerSchedule,
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
  // Same approval gate the add-podcasts and prepare-podcast paths enforce:
  // a show the client has not approved is never pitched by accident.
  const targets = await addCampaignTargets(context, campaign, [
    shortlistPodcastId,
  ], { requireApproved: true });
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
          // Research-backed cadence: first follow-up ~day 6, second ~day 13.
          // Under 3 days reads desperate; each follow-up must add new value.
          delay: 6,
          delay_unit: "days",
          variants: [{
            subject: "{{goapPitchSubject}}",
            body: "{{goapPitchBody}}",
            v_disabled: false,
          }],
        },
        {
          type: "email",
          delay: 7,
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

/** The variables the Instantly sequence renders. One shape, two callers. */
function outreachCustomVariables(
  client: WorkspaceClientRow,
  target: TargetRow,
  sequence: OutreachSequence,
): Record<string, unknown> {
  return {
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
}

export interface StagedLeadResult {
  leadId: string;
  leadStatus: number | null;
  /** Provider campaign status when the lead landed. 1 means it began sending. */
  campaignStatus: number | null;
  /** True when the lead entered a live sequence, so the host will be emailed. */
  willSend: boolean;
}

/**
 * Create the Instantly lead at "Send to Client Campaign" time.
 *
 * Jonathan chose this on 2026-07-27 over staging into a list, with the
 * consequence stated: a lead added to an ACTIVE campaign is emailed on the next
 * send window with no further approval. Preparing is therefore a contacting
 * action whenever the campaign is live, and everything below exists because of
 * that — this runs the same relationship gate the launch path runs, refuses to
 * rewrite copy a host has already received, and reports back whether the host
 * is now in a sending sequence so the operator is never told "saved" when the
 * truth is "sent".
 *
 * It deliberately does NOT activate the campaign. Activation stays with the
 * explicit launch action.
 */
async function stageCampaignLead(
  context: AuthContext,
  // Nullable on purpose: integrationApiKey turns a missing or disconnected
  // integration into INSTANTLY_NOT_CONNECTED, which is the honest error here.
  connection: ConnectionRow | null,
  client: WorkspaceClientRow,
  campaign: CampaignRow,
  target: TargetRow,
  sequence: OutreachSequence,
): Promise<StagedLeadResult> {
  if (!target.contact_email) {
    throw new HttpError(
      409,
      "CAMPAIGN_CONTACT_REQUIRED",
      "Add a podcast contact email before sending this to the client campaign",
    );
  }

  // Same gate as launch. A staged lead in a live campaign reaches the host, so
  // an opt-out or a live conversation has to stop it here too — checking only
  // at launch would leave the faster path unguarded.
  const { data: relationshipRows, error: relationshipError } = await context.admin.rpc(
    "workspace_podcast_relationships_v1",
    { p_workspace_id: campaign.workspace_id, p_podcast_ids: [target.podcast_id] },
  );
  if (relationshipError) {
    throw new HttpError(
      503,
      "CAMPAIGN_RELATIONSHIP_CHECK_FAILED",
      "The outreach history for this podcast could not be checked. Try again shortly",
    );
  }
  const relationship = (relationshipRows ?? [])[0] as
    | { state?: string; last_client_name?: string | null }
    | undefined;
  if (relationship?.state === "suppressed") {
    throw new HttpError(
      409,
      "CAMPAIGN_CONTACT_SUPPRESSED",
      "This host asked to stop being contacted by this workspace. The pitch cannot be added to the campaign for any client.",
    );
  }
  if (relationship?.state === "in_conversation") {
    throw new HttpError(
      409,
      "CAMPAIGN_CONTACT_IN_CONVERSATION",
      `A conversation with this host is already live${
        relationship.last_client_name ? ` for ${relationship.last_client_name}` : ""
      }. Continue that thread instead of adding cold outreach to the campaign.`,
    );
  }

  const apiKey = await integrationApiKey(connection);
  const providerCampaignValue = await ensureProviderCampaign(
    context,
    campaign,
    apiKey,
  );

  // One contact cannot be in the campaign twice under two shows: the host
  // experiences both, whatever we call them locally.
  const { data: matchingContacts, error: matchingContactError } = await context.admin
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

  const customVariables = outreachCustomVariables(client, target, sequence);
  const existingLeads = await listProviderLeads(
    apiKey,
    providerCampaignValue.id,
    target.contact_email,
  );
  const existing = existingLeads.find((candidate) =>
    candidate.email === target.contact_email
  ) || null;

  let lead: ProviderLead | null = existing;
  if (existing) {
    // Re-sending an edited sequence updates the lead in place. But if the host
    // has already had a step, the copy they read cannot be unsent, and quietly
    // swapping it underneath them would leave our record disagreeing with their
    // inbox.
    if (existing.status !== null && existing.status !== 1) {
      throw new HttpError(
        409,
        "CAMPAIGN_PITCH_LOCKED",
        "This contact has already moved through the sequence in Instantly. The pitch can no longer be edited from here.",
      );
    }
    if (existing.email_reply_count > 0) {
      throw new HttpError(
        409,
        "CAMPAIGN_PITCH_LOCKED",
        "This host has already replied. Continue the conversation in the Master Inbox instead of editing the pitch.",
      );
    }
    const patched = await instantlyRequest<unknown>(
      apiKey,
      `/leads/${encodeURIComponent(existing.id)}`,
      { method: "PATCH", body: { custom_variables: customVariables } },
    );
    lead = providerLead(patched) || existing;
  } else {
    const created = await instantlyRequest<unknown>(apiKey, "/leads", {
      method: "POST",
      body: {
        campaign: providerCampaignValue.id,
        email: target.contact_email,
        first_name: target.host_name?.split(/\s+/)[0] || undefined,
        last_name: target.host_name?.split(/\s+/).slice(1).join(" ") || undefined,
        company_name: target.podcast_name,
        website: target.podcast_url || undefined,
        personalization: sequence.body,
        custom_variables: customVariables,
        // The workspace pitches one show for many clients over time, so a
        // contact known elsewhere is not a reason to skip this one. Duplicates
        // within THIS campaign are already refused above, on our own records.
        skip_if_in_workspace: false,
        skip_if_in_campaign: true,
        skip_if_in_list: false,
        verify_leads_on_import: false,
      },
    });
    lead = providerLead(created);
    if (!lead) {
      // skip_if_in_campaign returns no lead when one already existed; recover it
      // rather than reporting a failure that did not happen.
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

  return {
    leadId: lead.id,
    leadStatus: lead.status,
    campaignStatus: providerCampaignValue.status,
    willSend: providerCampaignValue.status === 1,
  };
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
  // The last gate before a host actually hears from us. The same show gets
  // pitched for many clients over time, and the two states below are the ones
  // that damage the agency's standing rather than merely repeat it: emailing
  // someone who opted out, and opening cold on a live conversation.
  const { data: relationshipRows, error: relationshipError } = await context.admin.rpc(
    "workspace_podcast_relationships_v1",
    { p_workspace_id: campaign.workspace_id, p_podcast_ids: [target.podcast_id] },
  );
  if (relationshipError) {
    throw new HttpError(
      503,
      "CAMPAIGN_RELATIONSHIP_CHECK_FAILED",
      "The outreach history for this podcast could not be checked. Try again shortly",
    );
  }
  const relationship = (relationshipRows ?? [])[0] as { state?: string; last_client_name?: string | null } | undefined;
  if (relationship?.state === "suppressed") {
    throw new HttpError(
      409,
      "CAMPAIGN_CONTACT_SUPPRESSED",
      "This host asked to stop being contacted by this workspace. Outreach cannot start for any client.",
    );
  }
  if (relationship?.state === "in_conversation") {
    throw new HttpError(
      409,
      "CAMPAIGN_CONTACT_IN_CONVERSATION",
      `A conversation with this host is already live${relationship.last_client_name ? ` for ${relationship.last_client_name}` : ""}. Continue that thread instead of starting cold outreach.`,
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
    const customVariables = outreachCustomVariables(client, target, sequence);
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
      // Observed from the provider, never authored here. Cached so the page can
      // state the real window without a round trip on every open.
      provider_schedule: provider.schedule,
      provider_email_gap: provider.emailGap,
      provider_not_sending_status: provider.notSendingStatus,
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
    // Scheduled provider sync. pg_cron posts here with the project anon key
    // (so the gateway's JWT check passes) plus a shared secret only the
    // scheduler knows. No user session is involved and no user input is read.
    const syncSecret = Deno.env.get("CAMPAIGN_SYNC_SECRET")?.trim();
    if (syncSecret && req.headers.get("x-campaign-sync-secret") === syncSecret) {
      const admin = createAdminClient();
      const { data: connections } = await admin
        .from("workspace_instantly_integrations")
        .select(CONNECTION_COLUMNS)
        .eq("status", "connected")
        .order("last_verified_at", { ascending: true, nullsFirst: true })
        .limit(5);
      let synced = 0;
      let failed = 0;
      for (const connection of (connections ?? []) as unknown as ConnectionRow[]) {
        try {
          const { data: owner } = await admin
            .from("workspace_memberships")
            .select("user_id")
            .eq("workspace_id", connection.workspace_id)
            .eq("role", "owner")
            .eq("status", "active")
            .limit(1)
            .maybeSingle();
          const { data: campaigns } = await admin
            .from("workspace_client_campaigns")
            .select(CAMPAIGN_COLUMNS)
            .eq("workspace_id", connection.workspace_id)
            .not("instantly_campaign_id", "is", null)
            .in("provider_sync_state", ["idle", "error"])
            .order("last_synced_at", { ascending: true, nullsFirst: true })
            .limit(10);
          // syncProviderCampaign only needs the admin client and an actor id
          // for the updated_by stamp.
          const cronContext = {
            admin,
            user: { id: owner?.user_id ?? null },
          } as unknown as AuthContext;
          for (const campaign of (campaigns ?? []) as unknown as CampaignRow[]) {
            try {
              await syncProviderCampaign(cronContext, connection, campaign);
              synced += 1;
            } catch (_error) {
              failed += 1;
            }
          }
        } catch (_error) {
          failed += 1;
        }
      }
      return jsonResponse(req, METHODS, 200, { synced, failed });
    }

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
      ).catch((error) => {
        if (error instanceof InstantlyApiError) {
          // A rejected or under-scoped key is a connection state, not a
          // request failure — the page renders it as "reconnect Instantly".
          if (error.status === 401) {
            return { auth_failure: "key_rejected" as const };
          }
          if (error.status === 403) {
            return { auth_failure: "scope_missing" as const };
          }
        }
        throw error;
      });
      if (!Array.isArray(accounts)) {
        return jsonResponse(req, METHODS, 200, {
          connected: false,
          reason: accounts.auth_failure,
          provider_workspace_name: connection.provider_workspace_name,
          accounts: [],
          last_synced_at: connection.last_verified_at,
          analytics_errors: [],
        });
      }
      const emails = accounts.map((account) => account.email);
      // Which client each mailbox actually sends for, and the timezone its day
      // is measured in. Both come from campaign rows this workspace already
      // owns, so neither costs a provider call.
      const { data: senderRows } = await context.admin
        .from("workspace_client_campaigns")
        .select("id, client_id, name, status, sender_accounts, timezone, daily_limit")
        .eq("workspace_id", workspaceId)
        .limit(MAX_ANALYTICS_REFRESH_CAMPAIGNS);
      const campaignRows = (senderRows || []) as unknown as Array<{
        id: string;
        client_id: string;
        name: string;
        status: string;
        sender_accounts: string[] | null;
        timezone: string | null;
        daily_limit: number | null;
      }>;
      const clientNames = await readClientNames(
        context.admin,
        workspaceId,
        campaignRows.map((campaign) => campaign.client_id),
      );
      const linksByEmail = new Map<string, Array<Record<string, unknown>>>();
      for (const campaign of campaignRows) {
        for (const sender of campaign.sender_accounts || []) {
          const email = typeof sender === "string"
            ? sender.trim().toLowerCase()
            : "";
          if (!email) continue;
          linksByEmail.set(email, [
            ...(linksByEmail.get(email) || []),
            {
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              campaign_status: campaign.status,
              client_id: campaign.client_id,
              client_name: clientNames.get(campaign.client_id) ?? null,
            },
          ]);
        }
      }
      const workspaceTimeZone = commonCampaignTimeZone(
        campaignRows.map((campaign) => campaign.timezone),
      );
      const [dailyResult, warmupResult] = await Promise.allSettled([
        getInstantlyAccountSendHistory(apiKey, emails, {
          days: SEND_HISTORY_DAYS,
          timeZone: workspaceTimeZone,
        }),
        getInstantlyWarmupAnalytics(apiKey, emails),
      ]);
      const sendHistory = dailyResult.status === "fulfilled"
        ? dailyResult.value
        : new Map<string, AccountSendDay[]>();
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
        // The zone the sending day is measured in, so the page can say whose
        // "today" the numbers describe rather than implying the viewer's.
        send_day_timezone: workspaceTimeZone,
        accounts: accounts.map((account) => {
          const warmup = warmupAnalytics.get(account.email);
          const history = sendHistory.get(account.email) ?? [];
          return {
            email: account.email,
            first_name: account.first_name,
            last_name: account.last_name,
            status: account.status,
            status_message: account.status_message?.e_message ||
              account.status_message?.response || null,
            warmup_status: account.warmup_status,
            daily_limit: account.daily_limit,
            sent_today: history.length
              ? history[history.length - 1].sent
              : null,
            send_history: history,
            warmup_emails: warmup?.sent ?? null,
            warmup_limit: account.warmup_limit,
            health_score: warmup?.health_score ?? account.stat_warmup_score,
            tags: account.tags,
            campaigns: linksByEmail.get(account.email) ?? [],
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

    if (action === "prompts-get") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      requireCampaignManager(access);
      const { data, error } = await context.admin
        .from("workspace_research_prompts")
        .select("prompt_id, content, model, updated_at")
        .eq("workspace_id", workspaceId);
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "Workspace prompts are temporarily unavailable");
      }
      const overrides: Record<string, { content: string | null; model: string | null; updated_at: string | null }> = {};
      for (const row of data ?? []) {
        if (!RESEARCH_PROMPT_IDS.includes(String(row.prompt_id))) continue;
        {
          overrides[String(row.prompt_id)] = {
            // A row can exist for a model choice alone; null content means the
            // stage still runs the shipped instructions.
            content: typeof row.content === "string" && row.content ? row.content : null,
            // null means the stage runs on its shipped default, which is not
            // the same as storing that default's id — see the migration.
            model: typeof row.model === "string" && row.model ? row.model : null,
            updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
          };
        }
      }
      return jsonResponse(req, METHODS, 200, { overrides });
    }

    if (action === "prompts-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "prompt_id", "content"]);
      requireIntegrationOwner(access);
      const promptId = requireResearchPromptId(body.prompt_id);
      const content = requireString(body.content, "content", { max: 20_000 });
      const { error } = await context.admin
        .from("workspace_research_prompts")
        .upsert({
          workspace_id: workspaceId,
          prompt_id: promptId,
          content,
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,prompt_id" });
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The prompt could not be saved");
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.research_prompts.updated",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { prompt_id: promptId },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }

    if (action === "prompts-models") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      requireCampaignManager(access);
      // Read from Anthropic rather than from a list in this repo: the usable
      // set changes as models ship and retire, and it differs by key — a
      // workspace on its own Anthropic credential may reach models the
      // platform key cannot, or fewer.
      const modelsKey = await resolveAiKey(context.admin, workspaceId, "anthropic");
      if (!modelsKey) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "No Anthropic credential is configured, so the model list cannot be read");
      }
      try {
        return jsonResponse(req, METHODS, 200, { models: await fetchPromptModels(modelsKey.apiKey) });
      } catch (error) {
        throw new HttpError(
          503,
          "PROMPTS_UNAVAILABLE",
          error instanceof Error ? error.message : "The model list could not be read",
        );
      }
    }

    if (action === "prompt-model-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "prompt_id", "model"]);
      requireIntegrationOwner(access);
      const promptId = requireResearchPromptId(body.prompt_id);
      if (!MODEL_SELECTABLE_PROMPT_IDS.includes(promptId)) {
        throw new HttpError(
          400,
          "INVALID_FIELD",
          `${promptId} always runs on its shipped model, so a model cannot be chosen for it`,
        );
      }
      // null clears the choice and returns the stage to its shipped default.
      let model: string | null = null;
      if (body.model !== null && body.model !== undefined && body.model !== "") {
        const requested = requireString(body.model, "model", { max: 128 });
        const modelKey = await resolveAiKey(context.admin, workspaceId, "anthropic");
        if (!modelKey) {
          throw new HttpError(503, "PROMPTS_UNAVAILABLE", "No Anthropic credential is configured, so the model cannot be verified");
        }
        // Checked against the live list, not a list in this repo. The value
        // reaches Anthropic as the `model` parameter, so an unverified string
        // here is a tenant choosing what we send upstream — and a model that
        // does not exist would fail every run of this stage with a 404 the
        // operator cannot act on.
        let available: Awaited<ReturnType<typeof fetchPromptModels>>;
        try {
          available = await fetchPromptModels(modelKey.apiKey);
        } catch (error) {
          throw new HttpError(
            503,
            "PROMPTS_UNAVAILABLE",
            error instanceof Error ? error.message : "The model could not be verified",
          );
        }
        if (!available.some((entry) => entry.id === requested)) {
          throw new HttpError(400, "INVALID_FIELD", `"${requested}" is not a model this workspace can use`);
        }
        model = requested;
      }
      // Upsert, because a stage whose instructions were never customized has
      // no row yet and choosing a model must not require inventing one.
      const { error } = await context.admin
        .from("workspace_research_prompts")
        .upsert({
          workspace_id: workspaceId,
          prompt_id: promptId,
          model,
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,prompt_id" });
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The model could not be saved");
      }
      // Returning a stage to its default leaves a row carrying nothing. An
      // empty row still reads as an override everywhere that asks "is there a
      // row for this stage", so it goes rather than lingering as a stage that
      // claims to be customized and is not.
      if (model === null) {
        const { error: pruneError } = await context.admin
          .from("workspace_research_prompts")
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("prompt_id", promptId)
          .is("content", null)
          .is("model", null);
        if (pruneError) {
          throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The model could not be saved");
        }
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.research_prompts.model_updated",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { prompt_id: promptId, model },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }

    if (action === "prompts-reset") {
      requireOnlyKeys(body, ["action", "workspace_id", "prompt_id"]);
      requireIntegrationOwner(access);
      const promptId = requireResearchPromptId(body.prompt_id);
      // Clears the instructions, not the model. Resetting the wording someone
      // wrote should not silently move the stage back onto a different model —
      // those are two separate choices and the button only names one of them.
      // The row goes only when nothing is left on it.
      const { error } = await context.admin
        .from("workspace_research_prompts")
        .update({
          content: null,
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("prompt_id", promptId);
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The prompt could not be reset");
      }
      const { error: pruneError } = await context.admin
        .from("workspace_research_prompts")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("prompt_id", promptId)
        .is("content", null)
        .is("model", null);
      if (pruneError) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The prompt could not be reset");
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.research_prompts.reset",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { prompt_id: promptId },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }

    if (action === "prompt-requirements-get") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      requireCampaignManager(access);
      const { data, error } = await context.admin
        .from("workspace_prompt_requirements")
        .select("prompt_id, required_variables")
        .eq("workspace_id", workspaceId);
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "Field requirements are temporarily unavailable");
      }
      return jsonResponse(req, METHODS, 200, { requirements: requirementsDto(data) });
    }

    if (action === "prompt-requirements-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "prompt_id", "required_variables"]);
      requireIntegrationOwner(access);
      const promptId = requireResearchPromptId(body.prompt_id);
      const requiredVariables = parseRequiredVariables(body.required_variables);
      const { error } = await context.admin
        .from("workspace_prompt_requirements")
        .upsert({
          workspace_id: workspaceId,
          prompt_id: promptId,
          required_variables: requiredVariables,
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,prompt_id" });
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The field requirements could not be saved");
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.prompt_requirements.updated",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { prompt_id: promptId, required_variables: requiredVariables },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }
    if (action === "inbox-list") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const connection = await readConnection(context.admin, workspaceId);
      if (
        !connection || connection.status === "disconnected" ||
        !connection.api_key_ciphertext || !connection.api_key_iv
      ) {
        return jsonResponse(req, METHODS, 200, { connected: false, threads: [] });
      }
      const apiKey = await integrationApiKey(connection, false);

      const [{ data: campaignRows }, linksResult, targetsRows, stateRows, savedRelationshipThreads, leadInterestRows, suppressionRows] = await Promise.all([
        context.admin
          .from("workspace_client_campaigns")
          .select("id, client_id, instantly_campaign_id, name, client:clients(id, name)")
          .eq("workspace_id", workspaceId)
          .not("instantly_campaign_id", "is", null)
          .limit(1_000),
        context.admin
          .from("client_instantly_campaign_links")
          .select("instantly_campaign_id, campaign_name, client:clients!client_instantly_campaign_links_client_fk(id, name)")
          .eq("workspace_id", workspaceId)
          .limit(1_000),
        context.admin
          .from("workspace_client_campaign_targets")
          .select("client_id, podcast_id, contact_email, podcast_name, host_name, status, launched_at, email_open_count, email_reply_count")
          .eq("workspace_id", workspaceId)
          .not("contact_email", "is", null)
          .or("launched_at.not.is.null,instantly_lead_id.not.is.null")
          .limit(5_000),
        context.admin
          .from("workspace_inbox_thread_state")
          .select("thread_key, client_id, lead_email, podcast_id, status, classification, draft, nudges_sent, nudges_paused, last_nudge_at, last_nudge_error, suppressed_at, auto_send_eligible_at, auto_sent_at, auto_send_error")
          .eq("workspace_id", workspaceId)
          .limit(5_000),
        context.admin
          .from("workspace_host_relationship_threads")
          .select("thread_key, podcast_id")
          .eq("workspace_id", workspaceId)
          .limit(5_000),
        context.admin
          .from("workspace_inbox_lead_interest")
          .select("contact_email, interest_value")
          .eq("workspace_id", workspaceId)
          .limit(5_000),
        context.admin
          .from("workspace_outreach_suppressions")
          .select("contact_email")
          .eq("workspace_id", workspaceId)
          .limit(5_000),
      ]);
      // Persisted SDR state per thread — tolerate the pre-migration table.
      const stateByThreadKey = new Map<string, Record<string, unknown>>();
      for (const row of ((stateRows.error ? [] : stateRows.data ?? []) as Array<Record<string, unknown>>)) {
        if (typeof row.thread_key === "string") stateByThreadKey.set(row.thread_key, row);
      }
      // What an operator decided about this person, which outranks the i_status
      // carried by provider email rows: updating a lead does not rewrite the
      // emails already sitting in the list.
      const interestByLeadEmail = new Map<string, number | null>();
      for (
        const row of ((leadInterestRows.error ? [] : leadInterestRows.data ?? []) as Array<
          Record<string, unknown>
        >)
      ) {
        if (typeof row.contact_email !== "string") continue;
        interestByLeadEmail.set(
          row.contact_email,
          typeof row.interest_value === "number" ? row.interest_value : null,
        );
      }
      // Who this workspace may not contact. Surfaced on the thread so the
      // inbox can say an address is already silenced instead of offering to
      // silence it again.
      const suppressedEmails = new Set<string>();
      for (
        const row of ((suppressionRows.error ? [] : suppressionRows.data ?? []) as Array<
          Record<string, unknown>
        >)
      ) {
        if (typeof row.contact_email === "string") suppressedEmails.add(row.contact_email);
      }
      const relationshipByThreadKey = new Map<string, string>();
      for (const row of ((savedRelationshipThreads.error ? [] : savedRelationshipThreads.data ?? []) as Array<Record<string, unknown>>)) {
        if (typeof row.thread_key === "string" && typeof row.podcast_id === "string") {
          relationshipByThreadKey.set(row.thread_key, row.podcast_id);
        }
      }
      // Lead context: which podcast/host a reply address belongs to, keyed by
      // client so one address never leaks another client's outreach.
      const targetByClientEmail = new Map<string, Record<string, unknown> | null>();
      for (const row of ((targetsRows.error ? [] : targetsRows.data ?? []) as Array<Record<string, unknown>>)) {
        if (typeof row.contact_email !== "string" || typeof row.client_id !== "string") continue;
        const key = `${row.client_id}:${row.contact_email.trim().toLowerCase()}`;
        if (!targetByClientEmail.has(key)) {
          targetByClientEmail.set(key, row);
          continue;
        }
        const current = targetByClientEmail.get(key);
        if (current?.podcast_id !== row.podcast_id) targetByClientEmail.set(key, null);
      }
      const campaignByProviderId = new Map(
        ((campaignRows ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
          const providerId = row.instantly_campaign_id;
          if (typeof providerId !== "string" || !providerId) return [];
          const clientRecord = Array.isArray(row.client) ? row.client[0] : row.client;
          return [[providerId, {
            campaign_id: String(row.id),
            campaign_name: typeof row.name === "string" ? row.name : null,
            client: clientRecord && typeof clientRecord === "object"
              ? {
                id: String((clientRecord as Record<string, unknown>).id ?? ""),
                name: String((clientRecord as Record<string, unknown>).name ?? ""),
              }
              : null,
          }] as const];
        }),
      );
      // Manually linked Instantly campaigns attribute their replies to the
      // linked client as well; a managed campaign mapping wins on conflict.
      // Tolerate a missing links table so deploys ahead of the migration
      // keep the inbox working.
      const linkRows = linksResult.error ? [] : linksResult.data ?? [];
      for (const raw of linkRows as Array<Record<string, unknown>>) {
        const providerId = raw.instantly_campaign_id;
        if (typeof providerId !== "string" || !providerId) continue;
        if (campaignByProviderId.has(providerId)) continue;
        const clientRecord = Array.isArray(raw.client) ? raw.client[0] : raw.client;
        campaignByProviderId.set(providerId, {
          campaign_id: providerId,
          campaign_name: typeof raw.campaign_name === "string" ? raw.campaign_name : null,
          client: clientRecord && typeof clientRecord === "object"
            ? {
              id: String((clientRecord as Record<string, unknown>).id ?? ""),
              name: String((clientRecord as Record<string, unknown>).name ?? ""),
            }
            : null,
        });
      }
      if (campaignByProviderId.size === 0) {
        // Nothing is attributed to a client yet — skip the provider call.
        return jsonResponse(req, METHODS, 200, { connected: true, threads: [] });
      }

      // Replies for attributed campaigns can sit deeper than the newest
      // page when other campaigns are busier, so paginate the unibox.
      // Three pages of 100 stay well inside the endpoint's 20 req/min
      // budget while widening the window sixfold over a single page.
      const items: Array<Record<string, unknown>> = [];
      let startingAfter: string | null = null;
      let authFailure: "key_rejected" | "scope_missing" | null = null;
      // Whether older replies exist beyond what we read. Silence here would
      // make a truncated inbox look like a complete one, and a reply that fell
      // off the end is indistinguishable from a reply that never arrived.
      let truncated = false;
      for (let page = 0; page < 3; page += 1) {
        const query = new URLSearchParams({ limit: "100", email_type: "received" });
        if (startingAfter) query.set("starting_after", startingAfter);
        let payload: { items?: Array<Record<string, unknown>>; next_starting_after?: unknown };
        try {
          payload = await instantlyRequest<{
            items?: Array<Record<string, unknown>>;
            next_starting_after?: unknown;
          }>(apiKey, "/emails", { query });
        } catch (error) {
          if (error instanceof InstantlyApiError) {
            // A rejected or under-scoped key is a connection state, not a
            // request failure — the inbox renders it as "reconnect Instantly".
            if (error.status === 401) {
              authFailure = "key_rejected";
              break;
            }
            if (error.status === 403) {
              authFailure = "scope_missing";
              break;
            }
            // Rate-limited mid-pagination: keep the pages we already have,
            // but say that the window is short rather than implying it is all.
            if (page > 0 && error.status === 429) {
              truncated = true;
              break;
            }
            throw providerHttpError(error);
          }
          throw error;
        }
        const pageItems = payload.items ?? [];
        items.push(...pageItems);
        const next = typeof payload.next_starting_after === "string" ? payload.next_starting_after : null;
        if (!next || pageItems.length === 0) break;
        startingAfter = next;
        // A cursor still outstanding on the final page means there is more.
        if (page === 2) truncated = true;
      }
      if (authFailure) {
        return jsonResponse(req, METHODS, 200, {
          connected: false,
          reason: authFailure,
          threads: [],
        });
      }

      const text = (value: unknown, max: number): string =>
        typeof value === "string" ? value.slice(0, max) : "";
      const threads = items.flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const email = raw as Record<string, unknown>;
        const providerCampaignId = typeof email.campaign_id === "string" ? email.campaign_id : null;
        const mapped = providerCampaignId ? campaignByProviderId.get(providerCampaignId) ?? null : null;
        // Only replies attributable to a client belong in the Master Inbox —
        // manual emails and campaigns nobody has claimed stay in Instantly.
        if (!mapped) return [];
        const bodyRecord = (email.body ?? {}) as Record<string, unknown>;
        const bodyText = text(bodyRecord.text, 2_000)
          || text(bodyRecord.html, 4_000).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 2_000);
        const interestValue = typeof email.i_status === "number" ? email.i_status : null;
        const leadEmail = (text(email.lead, 320) || text(email.from_address_email, 320)).trim().toLowerCase();
        const target = mapped.client && leadEmail
          ? targetByClientEmail.get(`${mapped.client.id}:${leadEmail}`) ?? null
          : null;
        const threadKey = typeof email.thread_id === "string" && email.thread_id
          ? email.thread_id
          : String(email.id ?? "");
        const stateRow = stateByThreadKey.get(threadKey) ?? null;
        const draftRecord = stateRow && stateRow.draft && typeof stateRow.draft === "object" && !Array.isArray(stateRow.draft)
          ? stateRow.draft as Record<string, unknown>
          : null;
        return [{
          id: String(email.id ?? crypto.randomUUID()),
          thread_id: typeof email.thread_id === "string" ? email.thread_id : null,
          message_id: typeof email.message_id === "string" ? email.message_id : null,
          eaccount: typeof email.eaccount === "string" ? email.eaccount : null,
          subject: text(email.subject, 300),
          from_email: text(email.from_address_email, 320) || text(email.from_address, 320),
          to_email: text(email.to_address_email_list, 320),
          body_text: bodyText,
          received_at: typeof email.timestamp_email === "string"
            ? email.timestamp_email
            : typeof email.timestamp_created === "string"
              ? email.timestamp_created
              : null,
          is_unread: email.is_unread === true || email.is_unread === 1,
          interested: interestByLeadEmail.has(leadEmail)
            ? interestByLeadEmail.get(leadEmail) === 1
            : interestValue === 1,
          // The status the controls should show as selected. An operator's own
          // decision wins; otherwise fall back to what the provider says.
          interest_status: interestByLeadEmail.has(leadEmail)
            ? interestByLeadEmail.get(leadEmail) ?? null
            : interestValue,
          suppressed: suppressedEmails.has(leadEmail),
          // Run the same deterministic detector the enroll tick uses, on every
          // thread rather than only the ones that tick reaches. It processes
          // nothing while a client's SDR profile is incomplete, which is how a
          // plain request to stop sat in this list contactable.
          opt_out_detected: detectDeterministicReply(bodyText || "") === "opt_out",
          lead_email: text(email.lead, 320) || text(email.from_address_email, 320),
          lead_id: typeof email.lead_id === "string" ? email.lead_id : null,
          campaign: mapped,
          thread_key: threadKey,
          relationship: relationshipByThreadKey.has(threadKey)
            ? { podcast_id: relationshipByThreadKey.get(threadKey) }
            : null,
          state: stateRow
            ? {
              status: typeof stateRow.status === "string" ? stateRow.status : "needs_reply",
              classification: stateRow.classification ?? null,
              nudges_sent: typeof stateRow.nudges_sent === "number" ? stateRow.nudges_sent : 0,
              nudges_paused: stateRow.nudges_paused === true,
              last_nudge_at: typeof stateRow.last_nudge_at === "string" ? stateRow.last_nudge_at : null,
              last_nudge_error: typeof stateRow.last_nudge_error === "string" ? stateRow.last_nudge_error : null,
              suppressed_at: typeof stateRow.suppressed_at === "string" ? stateRow.suppressed_at : null,
              // A draft queued to send itself must say so, and say when — an
              // operator cannot intervene in a countdown they cannot see.
              auto_send_eligible_at: typeof stateRow.auto_send_eligible_at === "string" ? stateRow.auto_send_eligible_at : null,
              auto_sent_at: typeof stateRow.auto_sent_at === "string" ? stateRow.auto_sent_at : null,
              auto_send_error: typeof stateRow.auto_send_error === "string" ? stateRow.auto_send_error : null,
              draft: draftRecord
                ? {
                  subject: typeof draftRecord.subject === "string" ? draftRecord.subject : "",
                  body: typeof draftRecord.body === "string" ? draftRecord.body : "",
                  nudges: Array.isArray(draftRecord.nudges) ? draftRecord.nudges : [],
                  based_on_email_id: typeof draftRecord.based_on_email_id === "string" ? draftRecord.based_on_email_id : null,
                  generated_at: typeof draftRecord.generated_at === "string" ? draftRecord.generated_at : null,
                }
                : null,
              // Reply-inspired stale-draft gate: the staged draft only stays
              // sendable while it answers the latest inbound message.
              draft_stale: Boolean(
                draftRecord
                && typeof draftRecord.based_on_email_id === "string"
                && draftRecord.based_on_email_id !== String(email.id ?? ""),
              ),
            }
            : null,
          lead_context: target
            ? {
              podcast_id: typeof target.podcast_id === "string" ? target.podcast_id : null,
              podcast_name: typeof target.podcast_name === "string" ? target.podcast_name.slice(0, 300) : null,
              host_name: typeof target.host_name === "string" ? target.host_name.slice(0, 300) : null,
              stage: target.status === "in_outreach" || target.status === "launching"
                ? "contacted"
                : target.status === "replied"
                  ? "replied"
                  : target.status === "completed"
                    ? "completed"
                    : "preparing",
              first_message_at: typeof target.launched_at === "string" ? target.launched_at : null,
              opens: typeof target.email_open_count === "number" ? target.email_open_count : 0,
              replies: typeof target.email_reply_count === "number" ? target.email_reply_count : 0,
            }
            : null,
        }];
      });

      // One row per conversation: multiple received emails in a thread must
      // not surface as separate entries (an older item would carry a wrong
      // staleness verdict and a sendable stale draft).
      const newestByThread = new Map<string, (typeof threads)[number]>()
      for (const thread of threads) {
        const key = thread.thread_key || thread.id;
        const existing = newestByThread.get(key);
        if (
          !existing
          || String(thread.received_at ?? "").localeCompare(String(existing.received_at ?? "")) > 0
        ) {
          newestByThread.set(key, thread);
        }
      }
      const dedupedThreads = [...newestByThread.values()].sort((left, right) =>
        String(right.received_at ?? "").localeCompare(String(left.received_at ?? "")));
      // Reading the provider inbox is also ingestion: persist the identity of
      // every attributable host reply so manual-mode clients enter the shared
      // relationship book too. Only unambiguous client + address mappings have
      // lead_context, so this can never guess between two shows for one host.
      const relationshipRows = dedupedThreads.flatMap((thread) => {
        const clientId = thread.campaign?.client?.id;
        const leadEmail = thread.lead_email.trim().toLowerCase();
        const key = `${clientId}:${leadEmail}`;
        if (!thread.thread_key || !clientId || !leadEmail || !targetByClientEmail.has(key)) return [];
        const target = targetByClientEmail.get(key);
        return [{
          workspace_id: workspaceId,
          thread_key: thread.thread_key,
          client_id: clientId,
          lead_email: leadEmail,
          // Null is deliberate: clear any stale guess when this client has
          // contacted the same address for more than one show.
          podcast_id: typeof target?.podcast_id === "string" ? target.podcast_id : null,
        }];
      });
      // Only write rows that would actually change. Re-upserting every thread
      // on every page load is churn against a table the nudge tick reads, and
      // buys nothing once the identity is recorded.
      const changedRelationshipRows = relationshipRows.filter((row) => {
        const existing = stateByThreadKey.get(row.thread_key);
        if (!existing) return true;
        return existing.lead_email !== row.lead_email
          || existing.client_id !== row.client_id
          || (existing.podcast_id ?? null) !== row.podcast_id;
      });
      if (changedRelationshipRows.length > 0) {
        const { error: relationshipStateError } = await context.admin
          .from("workspace_inbox_thread_state")
          .upsert(changedRelationshipRows, { onConflict: "workspace_id,thread_key" });
        if (relationshipStateError) {
          // Reading the inbox is the product; recording reply identity is a
          // side effect of it. Failing the whole list because the side effect
          // failed takes away the operator's only view of their replies, and
          // the next load retries it anyway.
          console.error("[Client Campaigns] Reply relationship capture failed", relationshipStateError.message);
        }
      }
      return jsonResponse(req, METHODS, 200, {
        connected: true,
        threads: dedupedThreads,
        truncated,
      });
    }

    if (action === "inbox-thread-messages") {
      requireOnlyKeys(body, ["action", "workspace_id", "thread_key"]);
      const threadKey = requireString(body.thread_key, "thread_key", { max: 120 });
      const connection = await readConnection(context.admin, workspaceId);
      if (
        !connection || connection.status === "disconnected" ||
        !connection.api_key_ciphertext || !connection.api_key_iv
      ) {
        return jsonResponse(req, METHODS, 200, { messages: [] });
      }
      const apiKey = await integrationApiKey(connection, false);

      // Only threads on a campaign this workspace has claimed may be read, so
      // a guessed thread id cannot pull mail belonging to nobody here.
      const [managedRows, linkedRows] = await Promise.all([
        context.admin
          .from("workspace_client_campaigns")
          .select("instantly_campaign_id")
          .eq("workspace_id", workspaceId)
          .not("instantly_campaign_id", "is", null)
          .limit(1_000),
        context.admin
          .from("client_instantly_campaign_links")
          .select("instantly_campaign_id")
          .eq("workspace_id", workspaceId)
          .limit(1_000),
      ]);
      const claimed = new Set<string>();
      for (
        const row of [
          ...((managedRows.error ? [] : managedRows.data ?? []) as Array<Record<string, unknown>>),
          ...((linkedRows.error ? [] : linkedRows.data ?? []) as Array<Record<string, unknown>>),
        ]
      ) {
        if (typeof row.instantly_campaign_id === "string") claimed.add(row.instantly_campaign_id);
      }

      let payload: { items?: Array<Record<string, unknown>> };
      try {
        payload = await instantlyRequest<{ items?: Array<Record<string, unknown>> }>(
          apiKey,
          "/emails",
          { query: new URLSearchParams({ search: `thread:${threadKey}`, limit: "50" }) },
        );
      } catch (error) {
        if (error instanceof InstantlyApiError) throw providerHttpError(error);
        throw error;
      }

      const text = (value: unknown, max: number): string =>
        typeof value === "string" ? value.slice(0, max) : "";
      const messages = (payload.items ?? []).flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const email = raw as Record<string, unknown>;
        const campaignId = typeof email.campaign_id === "string" ? email.campaign_id : null;
        if (!campaignId || !claimed.has(campaignId)) return [];
        const bodyRecord = (email.body ?? {}) as Record<string, unknown>;
        const bodyText = text(bodyRecord.text, 6_000)
          || text(bodyRecord.html, 12_000).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 6_000);
        return [{
          id: String(email.id ?? crypto.randomUUID()),
          // ue_type 2 is inbound. Anything else is ours, which is the half of
          // the conversation the reading pane could never show.
          direction: email.ue_type === 2 ? "inbound" : "outbound",
          subject: text(email.subject, 300),
          from_email: text(email.from_address_email, 320),
          to_email: text(email.to_address_email_list, 320),
          body_text: bodyText,
          sent_at: typeof email.timestamp_email === "string"
            ? email.timestamp_email
            : typeof email.timestamp_created === "string"
              ? email.timestamp_created
              : null,
        }];
      }).sort((left, right) =>
        String(left.sent_at ?? "").localeCompare(String(right.sent_at ?? "")));

      return jsonResponse(req, METHODS, 200, { messages });
    }

    if (action === "inbox-draft") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id", "subject", "message", "thread_key", "email_id", "force", "lead_email"]);
      const clientId = requireUuid(body.client_id, "client_id");
      const subject = requireString(body.subject ?? "(no subject)", "subject", { max: 300 });
      const message = requireString(body.message, "message", { max: 8_000 });
      const threadKey = body.thread_key === undefined
        ? null
        : requireString(body.thread_key, "thread_key", { max: 120 });
      const emailId = body.email_id === undefined
        ? null
        : requireString(body.email_id, "email_id", { max: 120 });
      const force = body.force === true;
      const draftLeadEmail = body.lead_email === undefined
        ? null
        : requireString(body.lead_email, "lead_email", { max: 320 });

      // Idempotency: a fresh persisted package for this exact message is
      // returned free — Redraft passes force to spend a new model call.
      if (threadKey && emailId && !force) {
        const { data: existing } = await context.admin
          .from("workspace_inbox_thread_state")
          .select("classification, draft")
          .eq("workspace_id", workspaceId)
          .eq("thread_key", threadKey)
          .maybeSingle();
        const existingDraft = existing?.draft && typeof existing.draft === "object" && !Array.isArray(existing.draft)
          ? existing.draft as Record<string, unknown>
          : null;
        if (existingDraft && existingDraft.based_on_email_id === emailId && typeof existingDraft.body === "string" && existingDraft.body) {
          return jsonResponse(req, METHODS, 200, {
            classification: existing?.classification ?? null,
            nudges: Array.isArray(existingDraft.nudges) ? existingDraft.nudges : [],
            draft: {
              subject: typeof existingDraft.subject === "string" ? existingDraft.subject : `Re: ${subject}`,
              body: existingDraft.body,
            },
            reused: true,
          });
        }
      }

      // Deterministic pre-filter: opt-outs and autoresponders never reach the
      // model or the credit meter.
      const deterministic = detectDeterministicReply(message);
      if (deterministic) {
        const classification = deterministicClassification(deterministic);
        if (threadKey) {
          await context.admin
            .from("workspace_inbox_thread_state")
            .upsert({
              workspace_id: workspaceId,
              thread_key: threadKey,
              client_id: clientId,
              classification,
              ...(deterministic === "opt_out" ? { suppressed_at: new Date().toISOString() } : {}),
              updated_by: context.user.id,
              updated_at: new Date().toISOString(),
            }, { onConflict: "workspace_id,thread_key" });
        }
        return jsonResponse(req, METHODS, 200, {
          classification,
          nudges: [],
          draft: { subject: "", body: "" },
          suppressed: deterministic === "opt_out",
        });
      }

      const pkg = await generateReplyPackage({
        admin: context.admin,
        workspaceId,
        clientId,
        subject,
        message,
        actorUserId: context.user.id,
        referenceKind: "inbox_draft",
        leadEmail: draftLeadEmail,
      });
      let persisted = true;
      if (threadKey) {
        // Persist the review package so it survives navigation; a missing
        // pre-migration table degrades but the caller learns about it.
        const { error: persistError } = await context.admin
          .from("workspace_inbox_thread_state")
          .upsert({
            workspace_id: workspaceId,
            thread_key: threadKey,
            client_id: clientId,
            status: "review",
            classification: pkg.classification,
            draft: {
              subject: pkg.subject,
              body: pkg.body,
              nudges: pkg.nudges,
              based_on_email_id: emailId,
              generated_at: new Date().toISOString(),
            },
            updated_by: context.user.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: "workspace_id,thread_key" });
        if (persistError) persisted = false;
      } else {
        persisted = false;
      }
      return jsonResponse(req, METHODS, 200, {
        classification: pkg.classification,
        nudges: pkg.nudges,
        draft: { subject: pkg.subject, body: pkg.body },
        persisted,
      });
    }

    if (action === "inbox-reply") {
      requireOnlyKeys(body, ["action", "workspace_id", "reply_to_id", "eaccount", "subject", "message", "thread_key", "client_id", "lead_email"]);
      if (!["owner", "admin", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }
      const replyThreadKey = body.thread_key === undefined
        ? null
        : requireString(body.thread_key, "thread_key", { max: 120 });
      const replyClientId = body.client_id === undefined
        ? null
        : requireUuid(body.client_id, "client_id");
      const replyToId = requireString(body.reply_to_id, "reply_to_id", { max: 120 });
      const eaccount = requireString(body.eaccount, "eaccount", { max: 320 });
      const subject = requireString(body.subject, "subject", { max: 300 });
      const message = requireString(body.message, "message", { max: 8_000 });
      const connection = await readConnection(context.admin, workspaceId);
      if (
        !connection || connection.status !== "connected" ||
        !connection.api_key_ciphertext || !connection.api_key_iv
      ) {
        throw new HttpError(409, "INSTANTLY_NOT_CONNECTED", "Connect Instantly before replying from the inbox");
      }
      const apiKey = await integrationApiKey(connection, false);

      // The sending mailbox arrives from the browser. Bound it to the accounts
      // this workspace has actually connected, so a crafted request cannot send
      // from a mailbox the workspace does not own. The snapshot is the same
      // allowlist campaign launches verify against.
      const connectedAccounts = new Set(
        accountsFromSnapshot(connection.accounts_snapshot).map((account) => account.email.toLowerCase()),
      );
      if (connectedAccounts.size > 0 && !connectedAccounts.has(eaccount.toLowerCase())) {
        throw new HttpError(
          403,
          "INBOX_SENDER_NOT_CONNECTED",
          "That sending mailbox is not connected to this workspace",
        );
      }

      // Do-not-contact is checked on the way out, not only where a pitch is
      // written. The inbox is the one place someone can email a suppressed
      // address by hand — often the very reply that asked us to stop.
      const replyLeadEmail = (typeof body.lead_email === "string" ? body.lead_email : "")
        .trim()
        .toLowerCase();
      if (replyLeadEmail) {
        const { data: replySuppression } = await context.admin
          .from("workspace_outreach_suppressions")
          .select("reason")
          .eq("workspace_id", workspaceId)
          .eq("contact_email", replyLeadEmail)
          .maybeSingle();
        if (replySuppression) {
          throw new HttpError(
            409,
            "INBOX_CONTACT_SUPPRESSED",
            "This address is on the workspace do-not-contact list. Remove it in Relationships before replying.",
          );
        }
      }

      // The message being answered also arrives from the browser. Confirm it
      // belongs to a campaign this workspace has claimed before replying to it,
      // so the inbox cannot be used to answer arbitrary mail in the connected
      // Instantly workspace.
      const [managedCampaignRows, linkedCampaignRows] = await Promise.all([
        context.admin
          .from("workspace_client_campaigns")
          .select("instantly_campaign_id")
          .eq("workspace_id", workspaceId)
          .not("instantly_campaign_id", "is", null)
          .limit(1_000),
        context.admin
          .from("client_instantly_campaign_links")
          .select("instantly_campaign_id")
          .eq("workspace_id", workspaceId)
          .limit(1_000),
      ]);
      const claimedCampaignIds = new Set<string>();
      for (
        const row of [
          ...((managedCampaignRows.error ? [] : managedCampaignRows.data ?? []) as Array<Record<string, unknown>>),
          ...((linkedCampaignRows.error ? [] : linkedCampaignRows.data ?? []) as Array<Record<string, unknown>>),
        ]
      ) {
        if (typeof row.instantly_campaign_id === "string" && row.instantly_campaign_id) {
          claimedCampaignIds.add(row.instantly_campaign_id);
        }
      }
      try {
        const answering = await instantlyRequest<Record<string, unknown>>(
          apiKey,
          `/emails/${encodeURIComponent(replyToId)}`,
        );
        const answeringCampaignId = typeof answering?.campaign_id === "string"
          ? answering.campaign_id
          : null;
        if (!answeringCampaignId || !claimedCampaignIds.has(answeringCampaignId)) {
          throw new HttpError(
            403,
            "INBOX_MESSAGE_NOT_ATTRIBUTED",
            "That message does not belong to a campaign this workspace manages",
          );
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        // A provider hiccup reading one email must not strand an operator who
        // is answering a reply the inbox already showed them. The mailbox
        // allowlist above still bounds what can be sent from.
        if (!(error instanceof InstantlyApiError)) throw error;
      }

      // Send-time gate (server-owned): if the host has said something newer
      // than the message this reply answers, refuse instead of replying to a
      // stale turn. The UI gate is UX; this is the invariant.
      if (replyThreadKey) {
        try {
          const head = await instantlyRequest<{ items?: Array<Record<string, unknown>> }>(
            apiKey,
            "/emails",
            { query: new URLSearchParams({ search: `thread:${replyThreadKey}`, limit: "20" }) },
          );
          const inbound = (head.items ?? [])
            .filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).ue_type === 2)
            .map((item) => item as Record<string, unknown>)
            .sort((left, right) =>
              String(right.timestamp_email ?? right.timestamp_created ?? "")
                .localeCompare(String(left.timestamp_email ?? left.timestamp_created ?? "")));
          const newestInbound = inbound[0];
          if (newestInbound && typeof newestInbound.id === "string" && newestInbound.id !== replyToId) {
            throw new HttpError(
              409,
              "THREAD_ADVANCED",
              "The host sent a newer message — refresh the conversation before replying",
            );
          }
        } catch (error) {
          if (error instanceof HttpError) throw error;
          // The live check is best-effort: an unreadable thread (fallback
          // key, provider hiccup) never blocks an operator-authorized send.
        }
      }
      try {
        await instantlyRequest(apiKey, "/emails/reply", {
          method: "POST",
          body: {
            reply_to_uuid: replyToId,
            eaccount,
            subject,
            body: { text: message },
          },
        });
      } catch (error) {
        if (error instanceof InstantlyApiError) throw providerHttpError(error);
        throw error;
      }
      let stateRecorded = false;
      if (replyThreadKey) {
        // The status write is part of the send contract: replied state is
        // what schedules staged nudges. Booked/archived threads keep their
        // status, and a thread with no row (manual reply, never drafted)
        // gets one when the client is known.
        const stamp = { updated_by: context.user.id, updated_at: new Date().toISOString() };
        const { data: transitioned } = await context.admin
          .from("workspace_inbox_thread_state")
          .update({ status: "replied", ...stamp })
          .eq("workspace_id", workspaceId)
          .eq("thread_key", replyThreadKey)
          .in("status", ["needs_reply", "review", "replied"])
          .select("thread_key");
        stateRecorded = (transitioned ?? []).length > 0;
        if (!stateRecorded && replyClientId) {
          const { data: existingRow } = await context.admin
            .from("workspace_inbox_thread_state")
            .select("thread_key")
            .eq("workspace_id", workspaceId)
            .eq("thread_key", replyThreadKey)
            .maybeSingle();
          if (!existingRow) {
            const { error: insertError } = await context.admin
              .from("workspace_inbox_thread_state")
              .insert({
                workspace_id: workspaceId,
                thread_key: replyThreadKey,
                client_id: replyClientId,
                status: "replied",
                // A manual reply has no staged plan; pause nudging so the
                // tick never scans an empty plan forever.
                nudges_paused: true,
                ...stamp,
              });
            stateRecorded = !insertError;
          }
        }
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.inbox.reply_sent",
        entityType: "campaign",
        entityId: null,
        metadata: { eaccount, reply_to_id: replyToId },
      });
      return jsonResponse(req, METHODS, 200, { success: true, state_recorded: stateRecorded });
    }


    if (action === "inbox-lead-detail") {
      requireOnlyKeys(body, ["action", "workspace_id", "lead_id"]);
      if (!["owner", "admin", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }
      const leadId = requireUuid(body.lead_id, "lead_id");
      const connection = await readConnection(context.admin, workspaceId);
      if (
        !connection || connection.status !== "connected" ||
        !connection.api_key_ciphertext || !connection.api_key_iv
      ) {
        return jsonResponse(req, METHODS, 200, { lead: null });
      }
      const apiKey = await integrationApiKey(connection, false);
      let lead: Record<string, unknown> | null = null;
      try {
        lead = await instantlyRequest<Record<string, unknown>>(apiKey, `/leads/${leadId}`);
      } catch (error) {
        // A missing or unreadable lead is an empty panel, never an error page.
        if (error instanceof InstantlyApiError) {
          return jsonResponse(req, METHODS, 200, { lead: null });
        }
        throw error;
      }
      const leadText = (value: unknown, max: number): string | null =>
        typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
      const leadCount = (value: unknown): number =>
        typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      return jsonResponse(req, METHODS, 200, {
        lead: lead
          ? {
            first_name: leadText(lead.first_name, 120),
            last_name: leadText(lead.last_name, 120),
            company_name: leadText(lead.company_name, 200),
            job_title: leadText(lead.job_title, 200),
            website: leadText(lead.website, 500),
            phone: leadText(lead.phone, 60),
            email: leadText(lead.email, 320),
            opens: leadCount(lead.email_open_count),
            replies: leadCount(lead.email_reply_count),
            clicks: leadCount(lead.email_click_count),
            first_contacted_at: leadText(lead.timestamp_created, 40),
            last_contacted_at: leadText(lead.timestamp_last_contact, 40),
            last_reply_at: leadText(lead.timestamp_last_reply, 40),
            interest_status: typeof lead.lt_interest_status === "number" ? lead.lt_interest_status : null,
          }
          : null,
      });
    }

    if (action === "inbox-interest-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "lead_email", "interest_value", "campaign_id"]);
      if (!["owner", "admin", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }
      const leadEmail = requireString(body.lead_email, "lead_email", { max: 320 });
      const interestCampaignId = body.campaign_id === undefined
        ? null
        : requireUuid(body.campaign_id, "campaign_id");
      // null resets the lead to plain "Lead" in Instantly.
      const INTEREST_VALUES = [1, 2, 3, 4, 0, -1, -2, -3, -4];
      const interestValue = body.interest_value === null
        ? null
        : typeof body.interest_value === "number" && INTEREST_VALUES.includes(body.interest_value)
          ? body.interest_value
          : (() => {
            throw new HttpError(400, "INVALID_FIELD", "interest_value must be null or a known Instantly status");
          })();
      const connection = await readConnection(context.admin, workspaceId);
      if (
        !connection || connection.status !== "connected" ||
        !connection.api_key_ciphertext || !connection.api_key_iv
      ) {
        throw new HttpError(409, "INSTANTLY_NOT_CONNECTED", "Connect Instantly before updating lead status");
      }
      const apiKey = await integrationApiKey(connection, false);
      try {
        await instantlyRequest(apiKey, "/leads/update-interest-status", {
          method: "POST",
          body: {
            lead_email: leadEmail,
            interest_value: interestValue,
            ...(interestCampaignId ? { campaign_id: interestCampaignId } : {}),
          },
        });
      } catch (error) {
        if (error instanceof InstantlyApiError) throw providerHttpError(error);
        throw error;
      }
      // Instantly applies this to the lead, but the email rows the inbox reads
      // keep their old i_status, so without recording it here the conversation
      // never moves out of "Other replies" and the operator's decision looks
      // like it did nothing.
      const { error: interestStoreError } = await context.admin
        .from("workspace_inbox_lead_interest")
        .upsert({
          workspace_id: workspaceId,
          contact_email: leadEmail.trim().toLowerCase(),
          interest_value: interestValue,
          set_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,contact_email" });
      if (interestStoreError) {
        throw new HttpError(
          500,
          "INBOX_INTEREST_SAVE_FAILED",
          "Instantly was updated but the inbox could not record the change. Reload to see the current status.",
        );
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.inbox.interest_set",
        entityType: "campaign",
        entityId: null,
        metadata: { lead_email: leadEmail, interest_value: interestValue },
      });
      return jsonResponse(req, METHODS, 200, { success: true, interest_value: interestValue });
    }

    if (action === "inbox-thread-state") {
      requireOnlyKeys(body, ["action", "workspace_id", "thread_key", "client_id", "status", "nudges_paused", "lead_email", "cancel_auto_send"]);
      if (!["owner", "admin", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }
      const threadKey = requireString(body.thread_key, "thread_key", { max: 120 });
      const stateClientId = requireUuid(body.client_id, "client_id");
      const status = body.status === undefined ? null : requireString(body.status, "status", { max: 20 });
      if (status !== null && !["needs_reply", "booked", "archived"].includes(status)) {
        throw new HttpError(400, "INVALID_FIELD", "status must be needs_reply, booked, or archived");
      }
      const leadEmail = body.lead_email === undefined
        ? null
        : requireString(body.lead_email, "lead_email", { max: 320 });
      const nudgesPaused = body.nudges_paused === undefined ? null : body.nudges_paused === true;
      // Clearing the eligibility stamp is how a human takes a queued reply
      // back: the dispatch sweep only considers rows that still carry one.
      const cancelAutoSend = body.cancel_auto_send === true;
      if (status === null && nudgesPaused === null && !cancelAutoSend) {
        throw new HttpError(400, "INVALID_FIELD", "Provide status, nudges_paused, or cancel_auto_send");
      }
      await requireWorkspaceClient(context.admin, workspaceId, stateClientId);
      const { error: stateError } = await context.admin
        .from("workspace_inbox_thread_state")
        .upsert({
          workspace_id: workspaceId,
          thread_key: threadKey,
          client_id: stateClientId,
          ...(status !== null ? { status } : {}),
          ...(nudgesPaused !== null ? { nudges_paused: nudgesPaused } : {}),
          ...(cancelAutoSend
            ? { auto_send_eligible_at: null, auto_send_error: "cancelled by an operator before sending" }
            : {}),
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,thread_key" });
      if (stateError) {
        throw new HttpError(503, "THREAD_STATE_UNAVAILABLE", "The conversation state could not be saved");
      }
      // Marking a conversation booked is the moment a show becomes a real
      // placement — create the booking so the client's calendar fills in
      // without anyone retyping the podcast on another page.
      let bookingId: string | null = null;
      if (status === "booked" && leadEmail) {
        const { data: target } = await context.admin
          .from("workspace_client_campaign_targets")
          .select("id, shortlist_podcast_id, podcast_id, podcast_name, podcast_url, host_name")
          .eq("workspace_id", workspaceId)
          .eq("client_id", stateClientId)
          .ilike("contact_email", leadEmail)
          .limit(1)
          .maybeSingle();
        if (target?.id) {
          // The unique index on campaign_target_id makes this idempotent:
          // a second click can never create a duplicate placement.
          const { data: existing } = await context.admin
            .from("bookings")
            .select("id")
            .eq("campaign_target_id", target.id)
            .maybeSingle();
          if (existing?.id) {
            bookingId = existing.id;
          } else {
            const { data: created } = await context.admin
              .from("bookings")
              .insert({
                client_id: stateClientId,
                workspace_id: workspaceId,
                campaign_target_id: target.id,
                shortlist_podcast_id: target.shortlist_podcast_id ?? null,
                podcast_id: target.podcast_id ?? null,
                podcast_name: target.podcast_name,
                podcast_url: target.podcast_url ?? null,
                host_name: target.host_name ?? null,
                status: "conversation_started",
                notes: "Created from the Master Inbox when the conversation was marked booked.",
              })
              .select("id")
              .maybeSingle();
            bookingId = created?.id ?? null;
          }
          // The outreach that earned the booking is finished.
          await context.admin
            .from("workspace_client_campaign_targets")
            .update({ status: "completed", last_activity_at: new Date().toISOString() })
            .eq("id", target.id)
            .in("status", ["in_outreach", "replied"]);
        }
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.inbox.thread_status_set",
        entityType: "client",
        entityId: stateClientId,
        metadata: { thread_key: threadKey, status, booking_id: bookingId },
      });
      return jsonResponse(req, METHODS, 200, { success: true, booking_id: bookingId });
    }

    // Workspace-wide: this refreshes totals for every campaign on the key and
    // takes no client. It sat below the client_id gate, so it answered every
    // call with a complaint about a field it does not accept.
    if (action === "refresh-analytics") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      requireCampaignManager(access);
      const connection = await readConnection(context.admin, workspaceId);
      if (!connection) {
        throw new HttpError(
          409,
          "INSTANTLY_NOT_CONNECTED",
          "Connect Instantly before refreshing campaign totals",
        );
      }
      const { data, error } = await context.admin
        .from("workspace_client_campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("workspace_id", workspaceId)
        .not("instantly_campaign_id", "is", null)
        // A campaign the provider is mid-write on is left alone: its own sync
        // is the authority until it finishes.
        .in("provider_sync_state", ["idle", "error"])
        .limit(MAX_ANALYTICS_REFRESH_CAMPAIGNS);
      if (error) {
        throw new HttpError(
          500,
          "CAMPAIGN_ANALYTICS_REFRESH_FAILED",
          "Client campaigns could not be loaded",
        );
      }
      const campaigns = (data || []) as unknown as CampaignRow[];
      if (campaigns.length === 0) {
        return jsonResponse(req, METHODS, 200, {
          requested: 0,
          refreshed: 0,
          missing: 0,
        });
      }
      // One request for the whole workspace, where the per-campaign sync costs
      // a round trip each.
      const analyticsById = await listInstantlyCampaignAnalytics(
        await integrationApiKey(connection),
        campaigns.flatMap((campaign) =>
          campaign.instantly_campaign_id ? [campaign.instantly_campaign_id] : []
        ),
      );
      let refreshed = 0;
      let missing = 0;
      for (let offset = 0; offset < campaigns.length; offset += 25) {
        await Promise.all(
          campaigns.slice(offset, offset + 25).map(async (campaign) => {
            const fresh = campaign.instantly_campaign_id
              ? analyticsById.get(campaign.instantly_campaign_id)
              : undefined;
            if (!fresh) {
              missing += 1;
              return;
            }
            const { error: updateError } = await context.admin
              .from("workspace_client_campaigns")
              .update({
                analytics: withStoredOpportunityCounts(
                  fresh.analytics,
                  campaign.analytics,
                ),
                ...(fresh.status === null ? {} : {
                  instantly_campaign_status: fresh.status,
                  status: localCampaignStatus(fresh.status),
                }),
                // last_synced_at and last_error are deliberately untouched.
                // This refreshes totals, not the per-recipient state a full
                // sync reads, and stamping it would claim work not done.
                updated_by: context.user.id,
              })
              .eq("id", campaign.id)
              .eq("workspace_id", workspaceId);
            if (updateError) {
              throw new HttpError(
                500,
                "CAMPAIGN_ANALYTICS_REFRESH_FAILED",
                "Campaign totals could not be saved",
              );
            }
            refreshed += 1;
          }),
        );
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.client_campaign.analytics_refreshed",
        entityType: "workspace_client_campaign",
        entityId: null,
        metadata: { requested: campaigns.length, refreshed, missing },
      });
      return jsonResponse(req, METHODS, 200, {
        requested: campaigns.length,
        refreshed,
        missing,
      });
    }

    const clientId = requireUuid(body.client_id, "client_id");
    const client = await requireWorkspaceClient(
      context.admin,
      workspaceId,
      clientId,
    );

    if (action === "client-prompts-get") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id"]);
      const { data: rows, error: promptsError } = await context.admin
        .from("client_ai_sdr_prompts")
        .select("prompt_id, content, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId);
      if (promptsError) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "Client prompts are temporarily unavailable");
      }
      const overrides: Record<string, { content: string; updated_at: string | null }> = {};
      for (const row of rows ?? []) {
        if (CLIENT_PROMPT_IDS.includes(String(row.prompt_id)) && typeof row.content === "string") {
          overrides[String(row.prompt_id)] = {
            content: row.content,
            updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
          };
        }
      }
      return jsonResponse(req, METHODS, 200, { overrides });
    }

    if (action === "client-prompts-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id", "prompt_id", "content"]);
      requireIntegrationOwner(access);
      const promptId = requireString(body.prompt_id, "prompt_id", { max: 32 });
      if (!CLIENT_PROMPT_IDS.includes(promptId)) {
        throw new HttpError(400, "INVALID_PROMPT", "Unknown client AI SDR prompt");
      }
      const content = requireString(body.content, "content", { max: 20_000 });
      const { error: saveError } = await context.admin
        .from("client_ai_sdr_prompts")
        .upsert({
          workspace_id: workspaceId,
          client_id: clientId,
          prompt_id: promptId,
          content,
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,client_id,prompt_id" });
      if (saveError) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The client prompt could not be saved");
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "client.ai_sdr_prompts.updated",
        entityType: "client",
        entityId: clientId,
        metadata: { prompt_id: promptId },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }

    if (action === "client-prompts-reset") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id", "prompt_id"]);
      requireIntegrationOwner(access);
      const promptId = requireString(body.prompt_id, "prompt_id", { max: 32 });
      if (!CLIENT_PROMPT_IDS.includes(promptId)) {
        throw new HttpError(400, "INVALID_PROMPT", "Unknown client AI SDR prompt");
      }
      const { error: resetError } = await context.admin
        .from("client_ai_sdr_prompts")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .eq("prompt_id", promptId);
      if (resetError) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The client prompt could not be reset");
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "client.ai_sdr_prompts.reset",
        entityType: "client",
        entityId: clientId,
        metadata: { prompt_id: promptId },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }

    if (action === "client-prompt-requirements-get") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id"]);
      const { data, error } = await context.admin
        .from("client_prompt_requirements")
        .select("prompt_id, required_variables")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId);
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "Field requirements are temporarily unavailable");
      }
      return jsonResponse(req, METHODS, 200, { requirements: requirementsDto(data) });
    }

    if (action === "client-prompt-requirements-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id", "prompt_id", "required_variables"]);
      requireIntegrationOwner(access);
      const promptId = requireClientPromptId(body.prompt_id);
      const requiredVariables = parseRequiredVariables(body.required_variables);
      const { error } = await context.admin
        .from("client_prompt_requirements")
        .upsert({
          workspace_id: workspaceId,
          client_id: clientId,
          prompt_id: promptId,
          required_variables: requiredVariables,
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,client_id,prompt_id" });
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The field requirements could not be saved");
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "client.prompt_requirements.updated",
        entityType: "client",
        entityId: clientId,
        metadata: { prompt_id: promptId, required_variables: requiredVariables },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }

    if (action === "client-prompt-requirements-reset") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id", "prompt_id"]);
      requireIntegrationOwner(access);
      const promptId = requireClientPromptId(body.prompt_id);
      // Deleting the row is not the same as storing an empty one: this client
      // goes back to inheriting the workspace set, rather than requiring
      // nothing in spite of it.
      const { error } = await context.admin
        .from("client_prompt_requirements")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .eq("prompt_id", promptId);
      if (error) {
        throw new HttpError(503, "PROMPTS_UNAVAILABLE", "The field requirements could not be reset");
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "client.prompt_requirements.reset",
        entityType: "client",
        entityId: clientId,
        metadata: { prompt_id: promptId },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }
    if (action === "client-links-list") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id"]);
      const [linksResult, campaignsResult] = await Promise.all([
        context.admin
          .from("client_instantly_campaign_links")
          .select("client_id, instantly_campaign_id, campaign_name, created_at, client:clients!client_instantly_campaign_links_client_fk(id, name)")
          .eq("workspace_id", workspaceId)
          .limit(1_000),
        context.admin
          .from("workspace_client_campaigns")
          .select("client_id, instantly_campaign_id")
          .eq("workspace_id", workspaceId)
          .not("instantly_campaign_id", "is", null)
          .limit(1_000),
      ]);
      if (linksResult.error) {
        throw new HttpError(503, "CAMPAIGN_LINKS_UNAVAILABLE", "Linked campaigns could not be loaded");
      }
      const allLinks = (linksResult.data ?? []) as Array<Record<string, unknown>>;
      const links = allLinks
        .filter((row) => row.client_id === clientId)
        .map((row) => ({
          instantly_campaign_id: String(row.instantly_campaign_id ?? ""),
          campaign_name: typeof row.campaign_name === "string" ? row.campaign_name : null,
          created_at: typeof row.created_at === "string" ? row.created_at : null,
        }));
      const linkedClientByCampaign = new Map(allLinks.flatMap((row) => {
        const providerId = row.instantly_campaign_id;
        if (typeof providerId !== "string") return [];
        const clientRecord = Array.isArray(row.client) ? row.client[0] : row.client;
        return [[providerId, {
          id: String(row.client_id ?? ""),
          name: clientRecord && typeof clientRecord === "object"
            ? String((clientRecord as Record<string, unknown>).name ?? "")
            : "",
        }] as const];
      }));
      const managedClientByCampaign = new Map(
        ((campaignsResult.error ? [] : campaignsResult.data ?? []) as Array<Record<string, unknown>>)
          .flatMap((row) => (
            typeof row.instantly_campaign_id === "string"
              ? [[row.instantly_campaign_id, String(row.client_id ?? "")] as const]
              : []
          )),
      );

      const connection = await readConnection(context.admin, workspaceId);
      let providerCampaigns: ProviderCampaign[] = [];
      let connected = false;
      if (
        connection && connection.status === "connected" &&
        connection.api_key_ciphertext && connection.api_key_iv
      ) {
        try {
          providerCampaigns = await listProviderCampaigns(
            await integrationApiKey(connection, false),
          );
          connected = true;
        } catch (_error) {
          connected = false;
        }
      }
      return jsonResponse(req, METHODS, 200, {
        connected,
        links,
        provider_campaigns: providerCampaigns.map((campaign) => {
          const linkedClient = linkedClientByCampaign.get(campaign.id) ?? null;
          return {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            linked_client_id: linkedClient?.id ?? null,
            linked_client_name: linkedClient?.name ?? null,
            managed_client_id: managedClientByCampaign.get(campaign.id) ?? null,
          };
        }),
      });
    }

    if (action === "client-links-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "client_id", "campaign_ids"]);
      requireCampaignManager(access);
      const rawIds = body.campaign_ids;
      if (!Array.isArray(rawIds) || rawIds.length > 100) {
        throw new HttpError(
          400,
          "INVALID_FIELD",
          "campaign_ids must be a list of at most 100 campaign ids",
        );
      }
      const campaignIds = [
        ...new Set(rawIds.map((value, index) => requireUuid(value, `campaign_ids[${index}]`))),
      ];

      const connection = await readConnection(context.admin, workspaceId);
      if (
        !connection || connection.status !== "connected" ||
        !connection.api_key_ciphertext || !connection.api_key_iv
      ) {
        throw new HttpError(
          409,
          "INSTANTLY_NOT_CONNECTED",
          "Connect Instantly before linking campaigns",
        );
      }
      const providerCampaigns = await listProviderCampaigns(
        await integrationApiKey(connection, false),
      );
      const providerById = new Map(providerCampaigns.map((campaign) => [campaign.id, campaign]));
      // Only newly-added ids must exist in Instantly. Ids already linked to
      // this client stay valid even when the campaign was deleted upstream
      // (or sits past the provider pagination cap) — otherwise one deleted
      // campaign would block every future save for the client.
      const { data: existingRows, error: existingError } = await context.admin
        .from("client_instantly_campaign_links")
        .select("instantly_campaign_id, campaign_name")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId);
      if (existingError) {
        throw new HttpError(503, "CAMPAIGN_LINKS_UNAVAILABLE", "Linked campaigns could not be loaded");
      }
      const existingNameById = new Map(
        ((existingRows ?? []) as Array<Record<string, unknown>>).flatMap((row) => (
          typeof row.instantly_campaign_id === "string"
            ? [[row.instantly_campaign_id, typeof row.campaign_name === "string" ? row.campaign_name : null] as const]
            : []
        )),
      );
      for (const campaignId of campaignIds) {
        if (!providerById.has(campaignId) && !existingNameById.has(campaignId)) {
          throw new HttpError(
            404,
            "CAMPAIGN_NOT_FOUND",
            "A selected campaign no longer exists in Instantly",
          );
        }
      }

      // A campaign belongs to at most one client — reject links that would
      // steal another client's campaign, whether linked or app-managed.
      const [conflictLinks, conflictCampaigns] = await Promise.all([
        context.admin
          .from("client_instantly_campaign_links")
          .select("instantly_campaign_id, client_id")
          .eq("workspace_id", workspaceId)
          .in("instantly_campaign_id", campaignIds.length ? campaignIds : ["00000000-0000-0000-0000-000000000000"])
          .neq("client_id", clientId),
        context.admin
          .from("workspace_client_campaigns")
          .select("instantly_campaign_id, client_id")
          .eq("workspace_id", workspaceId)
          .in("instantly_campaign_id", campaignIds.length ? campaignIds : ["00000000-0000-0000-0000-000000000000"])
          .neq("client_id", clientId),
      ]);
      if (conflictLinks.error || conflictCampaigns.error) {
        throw new HttpError(503, "CAMPAIGN_LINKS_UNAVAILABLE", "Linked campaigns could not be saved");
      }
      if ((conflictLinks.data ?? []).length || (conflictCampaigns.data ?? []).length) {
        throw new HttpError(
          409,
          "CAMPAIGN_ALREADY_LINKED",
          "A selected campaign is already associated with another client",
        );
      }

      let deleteQuery = context.admin
        .from("client_instantly_campaign_links")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId);
      if (campaignIds.length) {
        deleteQuery = deleteQuery.not(
          "instantly_campaign_id",
          "in",
          `(${campaignIds.join(",")})`,
        );
      }
      const { error: deleteError } = await deleteQuery;
      if (deleteError) {
        throw new HttpError(503, "CAMPAIGN_LINKS_UNAVAILABLE", "Linked campaigns could not be saved");
      }
      if (campaignIds.length) {
        // ignoreDuplicates keeps this insert from ever stealing a campaign a
        // concurrent save just linked to another client — the primary key
        // resolves the race instead of a read-before-write check.
        const { error: insertError } = await context.admin
          .from("client_instantly_campaign_links")
          .upsert(campaignIds.map((campaignId) => ({
            workspace_id: workspaceId,
            client_id: clientId,
            instantly_campaign_id: campaignId,
            campaign_name: providerById.get(campaignId)?.name?.slice(0, 300)
              ?? existingNameById.get(campaignId)
              ?? null,
            created_by: context.user.id,
          })), { onConflict: "workspace_id,instantly_campaign_id", ignoreDuplicates: true });
        if (insertError) {
          throw new HttpError(503, "CAMPAIGN_LINKS_UNAVAILABLE", "Linked campaigns could not be saved");
        }
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "client.instantly_campaigns.linked",
        entityType: "client",
        entityId: clientId,
        metadata: { count: campaignIds.length, campaign_ids: campaignIds },
      });
      return jsonResponse(req, METHODS, 200, {
        links: campaignIds.map((campaignId) => ({
          instantly_campaign_id: campaignId,
          campaign_name: providerById.get(campaignId)?.name
            ?? existingNameById.get(campaignId)
            ?? null,
          created_at: null,
        })),
      });
    }

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
        "pitch_chain_version",
      ]);
      requireCampaignManager(access);
      // Which prompt-chain revision wrote this copy — the key that makes
      // reply-rate-by-version queryable once send volume exists.
      const pitchChainVersion = body.pitch_chain_version === undefined || body.pitch_chain_version === null
        ? null
        : requireString(body.pitch_chain_version, "pitch_chain_version", { max: 60 });
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
      // A staged lead no longer means outreach started — preparing creates one.
      // Editing stays open until an operator launches, and stageCampaignLead
      // refuses separately once the host has actually moved through the
      // sequence, which is the point past which copy cannot be taken back.
      if (
        target.launched_at ||
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
      // Push the lead to Instantly before recording anything locally. If the
      // provider refuses — an opt-out, a duplicate contact, a rejected key —
      // the operator gets that error instead of a row claiming a lead exists.
      let staged: StagedLeadResult | null = null;
      if (contactEmail) {
        const connection = await readConnection(context.admin, workspaceId);
        const client = await requireWorkspaceClient(
          context.admin,
          workspaceId,
          clientId,
        );
        staged = await stageCampaignLead(
          context,
          connection,
          client,
          campaign,
          { ...target, contact_email: contactEmail, host_name: hostName } as TargetRow,
          sequence,
        );
      }

      const stagedAt = staged ? new Date().toISOString() : null;
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
          pitch_chain_version: pitchChainVersion,
          status: contactEmail ? "ready" : "draft",
          ...(staged
            ? {
              instantly_lead_id: staged.leadId,
              instantly_lead_status: staged.leadStatus,
              lead_staged_at: stagedAt,
              lead_staged_campaign_status: staged.campaignStatus,
            }
            : {}),
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
          lead_staged: Boolean(staged),
          instantly_lead_id: staged?.leadId ?? null,
          // Whether this preparation put the host into a live sequence. The
          // one fact worth being able to answer later without inference.
          provider_campaign_status: staged?.campaignStatus ?? null,
          will_send: staged?.willSend ?? false,
        },
      });
      return jsonResponse(req, METHODS, 200, {
        added,
        campaign: campaignDto(campaign, refreshedTargets),
        target: targetDto(prepared),
        lead_staged: Boolean(staged),
        // The dialog must be able to say "this host will be emailed" rather
        // than "saved", so the truth travels with the response.
        will_send: staged?.willSend ?? false,
        provider_campaign_status: staged?.campaignStatus ?? null,
      });
    }

    if (action === "unstage-podcast") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "shortlist_podcast_id",
      ]);
      requireCampaignManager(access);
      const shortlistPodcastId = requireUuid(
        body.shortlist_podcast_id,
        "shortlist_podcast_id",
      );
      const campaign = await readCampaign(context.admin, workspaceId, clientId);
      if (!campaign) {
        throw new HttpError(
          404,
          "CAMPAIGN_NOT_FOUND",
          "This client has no campaign",
        );
      }
      const targets = await readTargets(context.admin, workspaceId, campaign.id);
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
      // Launched outreach is a bigger object than a staged lead: it owns
      // approval, an activated campaign, and reply tracking. Unwinding it from
      // here would leave launched_at pointing at a lead that no longer exists.
      if (target.launched_at) {
        throw new HttpError(
          409,
          "CAMPAIGN_TARGET_ALREADY_LAUNCHED",
          "Outreach was started for this podcast. Pause the campaign in Client Campaigns to stop it.",
        );
      }
      if (!target.instantly_lead_id) {
        throw new HttpError(
          409,
          "CAMPAIGN_LEAD_NOT_STAGED",
          "This podcast is not in the Instantly campaign",
        );
      }

      const connection = await readConnection(context.admin, workspaceId);
      const apiKey = await integrationApiKey(connection);
      try {
        await instantlyRequest<unknown>(
          apiKey,
          `/leads/${encodeURIComponent(target.instantly_lead_id)}`,
          { method: "DELETE" },
        );
      } catch (error) {
        // Already gone at the provider is the state we were asking for, so the
        // local record should follow rather than strand the operator with a
        // lead id that resolves to nothing.
        const missing = error instanceof InstantlyApiError && error.status === 404;
        if (!missing) throw error;
      }

      const { data, error } = await context.admin
        .from("workspace_client_campaign_targets")
        .update({
          instantly_lead_id: null,
          instantly_lead_status: null,
          lead_staged_at: null,
          lead_staged_campaign_status: null,
          status: target.contact_email ? "ready" : "draft",
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
          "CAMPAIGN_LEAD_REMOVE_FAILED",
          "The lead was removed from Instantly but the campaign record could not be updated",
        );
      }
      const updated = data as unknown as TargetRow;
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: "workspace.client_campaign.lead_removed",
        entityType: "workspace_client_campaign_target",
        entityId: target.id,
        metadata: {
          client_id: clientId,
          podcast_id: target.podcast_id,
          instantly_lead_id: target.instantly_lead_id,
          // Whether this stopped something already in flight.
          was_sending: target.lead_staged_campaign_status === 1,
        },
      });
      return jsonResponse(req, METHODS, 200, {
        removed: true,
        campaign: campaignDto(
          campaign,
          targets.map((item) => (item.id === updated.id ? updated : item)),
        ),
        target: targetDto(updated),
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

    if (action === "mailbox-assign") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "client_id",
        "email",
        "assigned",
      ]);
      requireCampaignManager(access);
      if (typeof body.assigned !== "boolean") {
        throw new HttpError(400, "INVALID_FIELD", "assigned must be a boolean");
      }
      const email = requireString(body.email, "email", { max: 254 })
        .trim()
        .toLowerCase();
      const campaign = await readCampaign(context.admin, workspaceId, clientId);
      if (!campaign) {
        throw new HttpError(
          404,
          "CAMPAIGN_NOT_FOUND",
          "Create the client campaign before assigning a mailbox to it",
        );
      }
      const connection = await readConnection(context.admin, workspaceId);
      const current = campaign.sender_accounts || [];
      const next = body.assigned
        ? emailList([...new Set([...current, email])])
        : emailList(current.filter((account) => account !== email));
      if (body.assigned) {
        // The mailbox has to be one this workspace's key can actually send
        // from, or the campaign would be pointed at an address that does not
        // exist.
        verifySelectedAccounts(
          next,
          accountsFromSnapshot(connection?.accounts_snapshot),
        );
      } else if (next.length === 0 && campaign.instantly_campaign_id) {
        // A launched campaign with no sender is a campaign that has silently
        // stopped. Removing the last one has to be a deliberate pause, not a
        // side effect of tidying mailboxes.
        throw new HttpError(
          409,
          "CAMPAIGN_NEEDS_SENDER",
          "This is the only mailbox sending for that client. Assign another before removing it.",
        );
      }
      let providerStatus = campaign.instantly_campaign_status;
      if (campaign.instantly_campaign_id) {
        const apiKey = await integrationApiKey(connection);
        const updated = providerCampaign(
          await instantlyRequest<unknown>(
            apiKey,
            `/campaigns/${encodeURIComponent(campaign.instantly_campaign_id)}`,
            {
              method: "PATCH",
              body: campaignConfiguration({
                ...campaign,
                sender_accounts: next,
              }),
            },
          ),
        );
        providerStatus = updated.status;
      }
      const { error } = await context.admin
        .from("workspace_client_campaigns")
        .update({
          sender_accounts: next,
          instantly_campaign_status: providerStatus,
          status: localCampaignStatus(providerStatus),
          updated_by: context.user.id,
        })
        .eq("id", campaign.id)
        .eq("workspace_id", workspaceId);
      if (error) {
        throw new HttpError(
          500,
          "CAMPAIGN_SETTINGS_SAVE_FAILED",
          "The mailbox assignment could not be saved",
        );
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: body.assigned
          ? "workspace.client_campaign.mailbox_assigned"
          : "workspace.client_campaign.mailbox_unassigned",
        entityType: "workspace_client_campaign",
        entityId: campaign.id,
        metadata: { client_id: clientId, email, sender_count: next.length },
      });
      return jsonResponse(req, METHODS, 200, {
        email,
        client_id: clientId,
        assigned: body.assigned,
        sender_accounts: next,
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
          provider_not_sending_status: provider.notSendingStatus,
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
