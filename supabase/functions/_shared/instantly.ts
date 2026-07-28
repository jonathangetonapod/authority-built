import { HttpError } from "./httpError.ts";

const INSTANTLY_API_ORIGIN = "https://api.instantly.ai";
const INSTANTLY_API_PREFIX = "/api/v2";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;
const MAX_ACCOUNT_PAGES = 10;
const MAX_DAILY_ANALYTICS_EMAILS = 200;
const MAX_WARMUP_ANALYTICS_EMAILS = 100;
// Campaign ids are repeated in the query string, so the batch is bounded by URL
// length rather than by anything the provider documents.
const MAX_CAMPAIGN_ANALYTICS_IDS = 40;

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
}

export interface InstantlyWorkspace {
  id: string;
  name: string;
}

export interface InstantlyAccountSummary {
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: number;
  status_message: InstantlyAccountStatusMessage | null;
  warmup_status: number | null;
  daily_limit: number | null;
  warmup_limit: number | null;
  stat_warmup_score: number | null;
  tags: InstantlyAccountTag[];
}

export interface InstantlyAccountTag {
  id: string;
  label: string;
  description: string | null;
}

export interface InstantlyAccountStatusMessage {
  code: string | null;
  command: string | null;
  response: string | null;
  e_message: string | null;
  response_code: number | null;
}

export interface InstantlyWarmupAccountAnalytics {
  sent: number | null;
  health_score: number | null;
}

export interface InstantlyAnalyticsSummary {
  emails_sent_count: number;
  contacted_count: number;
  open_count_unique: number;
  reply_count_unique: number;
  bounced_count: number;
  unsubscribed_count: number;
  total_interested: number;
  total_meeting_booked: number;
}

export class InstantlyApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "InstantlyApiError";
    this.status = status;
    this.code = code;
  }
}

function requiredEncryptionSecret(): string {
  const value = Deno.env.get("INSTANTLY_CREDENTIAL_ENCRYPTION_KEY");
  if (!value || value.length < 32) {
    throw new HttpError(
      503,
      "INSTANTLY_ENCRYPTION_NOT_CONFIGURED",
      "Instantly credential storage has not been configured",
    );
  }
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new HttpError(
      500,
      "INSTANTLY_CREDENTIAL_INVALID",
      "The stored Instantly credential is invalid",
    );
  }
}

async function credentialKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new HttpError(
      500,
      "INSTANTLY_ENCRYPTION_NOT_CONFIGURED",
      "Instantly credential storage has not been configured",
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptInstantlyApiKey(
  apiKey: string,
  encryptionSecret = requiredEncryptionSecret(),
): Promise<EncryptedCredential> {
  const key = await credentialKey(encryptionSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(apiKey),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptInstantlyApiKey(
  encrypted: EncryptedCredential,
  encryptionSecret = requiredEncryptionSecret(),
): Promise<string> {
  try {
    const key = await credentialKey(encryptionSecret);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
      key,
      base64ToBytes(encrypted.ciphertext),
    );
    const apiKey = new TextDecoder().decode(decrypted);
    if (!apiKey) throw new Error("empty credential");
    return apiKey;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      500,
      "INSTANTLY_CREDENTIAL_INVALID",
      "The stored Instantly credential could not be decrypted",
    );
  }
}

function providerFailure(status: number): InstantlyApiError {
  if (status === 401) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_KEY_REJECTED",
      "Instantly rejected this API key",
    );
  }
  if (status === 402) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_PLAN_REQUIRED",
      "The connected Instantly workspace needs an active API plan",
    );
  }
  if (status === 403) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_SCOPE_REQUIRED",
      "The Instantly API key is missing a required permission",
    );
  }
  if (status === 404) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_RESOURCE_NOT_FOUND",
      "The mapped Instantly resource no longer exists",
    );
  }
  if (status === 429) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_RATE_LIMITED",
      "Instantly is temporarily rate limiting this workspace",
    );
  }
  return new InstantlyApiError(
    status,
    "INSTANTLY_REQUEST_FAILED",
    "Instantly could not complete the request",
  );
}

export async function instantlyRequest<T>(
  apiKey: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: Record<string, unknown>;
    query?: URLSearchParams;
  } = {},
): Promise<T> {
  if (!path.startsWith("/") || path.includes("://") || path.includes("\\")) {
    throw new HttpError(
      500,
      "INSTANTLY_PATH_INVALID",
      "The Instantly request path is invalid",
    );
  }
  const url = new URL(`${INSTANTLY_API_PREFIX}${path}`, INSTANTLY_API_ORIGIN);
  if (options.query) url.search = options.query.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new InstantlyApiError(
      0,
      "INSTANTLY_UNAVAILABLE",
      "Instantly could not be reached",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw providerFailure(response.status);
  if (response.status === 204) return undefined as T;

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PROVIDER_RESPONSE_BYTES
  ) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid response",
    );
  }
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid response",
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid response",
    );
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function providerUuid(value: unknown): string | null {
  return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    ? value.toLowerCase()
    : null;
}

function finiteInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function optionalFiniteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function optionalPercentage(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 &&
      value <= 100
    ? value
    : null;
}

function shortText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function normalizedAccountEmails(emails: string[]): string[] {
  return Array.from(new Set(emails.map((email) => email.trim().toLowerCase())))
    .filter((email) =>
      email.length > 3 && email.length <= 254 && email.includes("@")
    );
}

export function safeInstantlyAccount(
  value: unknown,
): InstantlyAccountSummary | null {
  const account = record(value);
  const email = typeof account?.email === "string"
    ? account.email.trim().toLowerCase()
    : "";
  const status = typeof account?.status === "number" &&
      Number.isInteger(account.status)
    ? account.status
    : null;
  if (!email || email.length > 254 || status === null) return null;

  const warmup = record(account?.warmup);
  const providerMessage = record(account?.status_message);
  const statusMessage = providerMessage
    ? {
      code: shortText(providerMessage.code, 100),
      command: shortText(providerMessage.command, 100),
      response: shortText(providerMessage.response, 1_000),
      e_message: shortText(providerMessage.e_message, 1_000),
      response_code: optionalFiniteInteger(providerMessage.responseCode),
    }
    : null;
  const tags = Array.isArray(account?.tags)
    ? account.tags.flatMap((value) => {
      const tag = record(value);
      const id = shortText(tag?.id, 100);
      const label = shortText(tag?.label, 300);
      if (!id || !label) return [];
      return [{
        id,
        label,
        description: shortText(tag?.description, 1_000),
      }];
    }).sort((left, right) => left.label.localeCompare(right.label))
    : [];

  return {
    email,
    first_name: shortText(account?.first_name, 200),
    last_name: shortText(account?.last_name, 200),
    status,
    status_message: statusMessage &&
        Object.values(statusMessage).some((item) => item !== null)
      ? statusMessage
      : null,
    warmup_status: typeof account?.warmup_status === "number" &&
        Number.isInteger(account.warmup_status)
      ? account.warmup_status
      : null,
    daily_limit: optionalFiniteInteger(account?.daily_limit),
    warmup_limit: optionalFiniteInteger(warmup?.limit),
    stat_warmup_score: optionalPercentage(account?.stat_warmup_score),
    tags,
  };
}

export async function getInstantlyWorkspace(
  apiKey: string,
): Promise<InstantlyWorkspace> {
  const response = record(
    await instantlyRequest<unknown>(apiKey, "/workspaces/current"),
  );
  const id = providerUuid(response?.id);
  const name = typeof response?.name === "string" ? response.name.trim() : "";
  if (!id || !name || name.length > 300) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid workspace",
    );
  }
  return { id, name };
}

export async function listInstantlyAccounts(
  apiKey: string,
): Promise<InstantlyAccountSummary[]> {
  const accounts = new Map<string, InstantlyAccountSummary>();
  let startingAfter = "";

  for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: "100", include_tags: "true" });
    if (startingAfter) query.set("starting_after", startingAfter);
    const response = record(
      await instantlyRequest<unknown>(apiKey, "/accounts", { query }),
    );
    const items = Array.isArray(response?.items) ? response.items : null;
    if (!items) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned an invalid account list",
      );
    }
    for (const item of items) {
      const account = safeInstantlyAccount(item);
      if (account) accounts.set(account.email, account);
    }
    const next = typeof response?.next_starting_after === "string"
      ? response.next_starting_after.trim()
      : "";
    if (!next || next === startingAfter) break;
    startingAfter = next;
  }

  return Array.from(accounts.values()).sort((left, right) =>
    left.email.localeCompare(right.email)
  );
}

export interface AccountSendDay {
  /** Calendar day, YYYY-MM-DD, as the provider labelled it. */
  date: string;
  sent: number;
}

/**
 * The calendar day in a given zone.
 *
 * A UTC day is the wrong basis for "today": campaigns send 09:00-17:00 in the
 * campaign's own timezone, and for every American zone the UTC day rolls over
 * during or just after that window. Deriving today from UTC made an afternoon
 * of sending read as zero from late afternoon onwards — the exact moment an
 * operator checks whether the day went out.
 */
export function localCalendarDay(timeZone: string, now = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is the shape the provider uses.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // An unknown zone must not take the page down with it.
    return now.toISOString().slice(0, 10);
  }
}

function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Daily campaign sends per account over a window ending today.
 *
 * A window rather than a single day, because one number cannot be read: zero
 * sends is normal on a Sunday, alarming on a Tuesday, and meaningless at 09:00.
 * The series makes the difference visible, and it costs the same request.
 */
export async function getInstantlyAccountSendHistory(
  apiKey: string,
  accountEmails: string[],
  options: { days?: number; timeZone?: string; now?: Date } = {},
): Promise<Map<string, AccountSendDay[]>> {
  const emails = normalizedAccountEmails(accountEmails);
  const days = Math.min(Math.max(options.days ?? 7, 1), 30);
  const endDate = localCalendarDay(options.timeZone ?? "UTC", options.now);
  const window: string[] = [endDate];
  while (window.length < days) window.unshift(previousDay(window[0]));

  const historyByEmail = new Map<string, AccountSendDay[]>(
    emails.map((email) => [email, window.map((date) => ({ date, sent: 0 }))]),
  );
  if (emails.length === 0) return historyByEmail;

  const responses = await Promise.all(
    batches(emails, MAX_DAILY_ANALYTICS_EMAILS).map(async (batch) => {
      const query = new URLSearchParams({
        start_date: window[0],
        end_date: endDate,
      });
      for (const email of batch) query.append("emails", email);
      const response = await instantlyRequest<unknown>(
        apiKey,
        "/accounts/analytics/daily",
        { query },
      );
      if (!Array.isArray(response)) {
        throw new InstantlyApiError(
          502,
          "INSTANTLY_RESPONSE_INVALID",
          "Instantly returned invalid daily account analytics",
        );
      }
      return response;
    }),
  );

  const dayIndex = new Map(window.map((date, index) => [date, index]));
  for (const response of responses) {
    for (const item of response) {
      const analytics = record(item);
      const email = typeof analytics?.email_account === "string"
        ? analytics.email_account.trim().toLowerCase()
        : "";
      const history = historyByEmail.get(email);
      const index = typeof analytics?.date === "string"
        ? dayIndex.get(analytics.date)
        : undefined;
      if (
        !history || index === undefined ||
        optionalFiniteInteger(analytics?.sent) === null
      ) continue;
      history[index].sent += finiteInteger(analytics?.sent);
    }
  }
  return historyByEmail;
}

export async function getInstantlyWarmupAnalytics(
  apiKey: string,
  accountEmails: string[],
): Promise<Map<string, InstantlyWarmupAccountAnalytics>> {
  const emails = normalizedAccountEmails(accountEmails);
  const requested = new Set(emails);
  const analyticsByEmail = new Map<string, InstantlyWarmupAccountAnalytics>();
  if (emails.length === 0) return analyticsByEmail;

  const responses = await Promise.all(
    batches(emails, MAX_WARMUP_ANALYTICS_EMAILS).map((batch) =>
      instantlyRequest<unknown>(apiKey, "/accounts/warmup-analytics", {
        method: "POST",
        body: { emails: batch },
      })
    ),
  );
  for (const response of responses) {
    const aggregate = record(record(response)?.aggregate_data);
    if (!aggregate) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned invalid warmup analytics",
      );
    }
    for (const [providerEmail, value] of Object.entries(aggregate)) {
      const email = providerEmail.trim().toLowerCase();
      if (!requested.has(email)) continue;
      const item = record(value);
      analyticsByEmail.set(email, {
        sent: optionalFiniteInteger(item?.sent),
        health_score: optionalPercentage(item?.health_score),
      });
    }
  }
  return analyticsByEmail;
}

export function safeInstantlyAnalytics(
  value: unknown,
): InstantlyAnalyticsSummary {
  const analytics = record(value);
  return {
    emails_sent_count: finiteInteger(analytics?.emails_sent_count),
    contacted_count: finiteInteger(analytics?.contacted_count),
    open_count_unique: finiteInteger(analytics?.open_count_unique),
    reply_count_unique: finiteInteger(analytics?.reply_count_unique),
    bounced_count: finiteInteger(analytics?.bounced_count),
    unsubscribed_count: finiteInteger(analytics?.unsubscribed_count),
    total_interested: finiteInteger(analytics?.total_interested),
    total_meeting_booked: finiteInteger(analytics?.total_meeting_booked),
  };
}

export interface InstantlyCampaignAnalytics {
  campaignId: string;
  status: number | null;
  analytics: InstantlyAnalyticsSummary;
}

/**
 * Analytics for many campaigns in one request.
 *
 * The per-campaign overview endpoint answers for one campaign at a time, so
 * refreshing a workspace costs one round trip per client. This is the list
 * form: every campaign asked for comes back in a single response, keyed by id.
 *
 * A campaign the provider does not return is simply absent from the map —
 * usually because it was deleted in Instantly. The caller decides what that
 * means; inventing a zeroed row here would overwrite real numbers.
 */
export async function listInstantlyCampaignAnalytics(
  apiKey: string,
  campaignIds: string[],
): Promise<Map<string, InstantlyCampaignAnalytics>> {
  const requested = new Set(
    campaignIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
  );
  const byCampaignId = new Map<string, InstantlyCampaignAnalytics>();
  if (requested.size === 0) return byCampaignId;

  const responses = await Promise.all(
    batches([...requested], MAX_CAMPAIGN_ANALYTICS_IDS).map(async (batch) => {
      const query = new URLSearchParams();
      for (const id of batch) query.append("ids", id);
      // The lead total is a count the provider itself warns is slow, and
      // nothing here reads it.
      query.set("exclude_total_leads_count", "true");
      const response = await instantlyRequest<unknown>(
        apiKey,
        "/campaigns/analytics",
        { query },
      );
      if (!Array.isArray(response)) {
        throw new InstantlyApiError(
          502,
          "INSTANTLY_RESPONSE_INVALID",
          "Instantly returned invalid campaign analytics",
        );
      }
      return response;
    }),
  );

  for (const response of responses) {
    for (const item of response) {
      const row = record(item);
      const campaignId = typeof row?.campaign_id === "string"
        ? row.campaign_id.trim()
        : "";
      // Only what was asked for: the endpoint answers for every campaign in
      // the workspace when the filter is dropped, and a mistake there would
      // write another agency's numbers onto these rows.
      if (!requested.has(campaignId)) continue;
      byCampaignId.set(campaignId, {
        campaignId,
        status: instantlyCampaignStatus(row?.campaign_status),
        analytics: safeInstantlyAnalytics(row),
      });
    }
  }
  return byCampaignId;
}

/**
 * The list endpoint does not report interested or meeting-booked counts —
 * only the per-campaign overview does. Both are zero on every row it returns,
 * so a bulk refresh has to carry forward what the last full sync established
 * rather than write those zeroes over it.
 */
export function withStoredOpportunityCounts(
  fresh: InstantlyAnalyticsSummary,
  stored: unknown,
): InstantlyAnalyticsSummary {
  const previous = safeInstantlyAnalytics(stored);
  return {
    ...fresh,
    total_interested: fresh.total_interested || previous.total_interested,
    total_meeting_booked: fresh.total_meeting_booked ||
      previous.total_meeting_booked,
  };
}

export function instantlyCampaignStatus(value: unknown): number | null {
  return typeof value === "number" &&
      Number.isInteger(value) &&
      [-99, -2, -1, 0, 1, 2, 3, 4].includes(value)
    ? value
    : null;
}

export function localCampaignStatus(
  providerStatus: number | null,
): "draft" | "active" | "paused" | "completed" | "attention" {
  if (providerStatus === 1) return "active";
  if (providerStatus === 2) return "paused";
  if (providerStatus === 3) return "completed";
  if (
    providerStatus === -99 || providerStatus === -2 || providerStatus === -1 ||
    providerStatus === 4
  ) return "attention";
  return "draft";
}

export function safeInstantlyError(
  error: unknown,
): { code: string; message: string; status: number } {
  if (error instanceof InstantlyApiError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof HttpError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return {
    code: "INSTANTLY_REQUEST_FAILED",
    message: "Instantly could not complete the request",
    status: 502,
  };
}
