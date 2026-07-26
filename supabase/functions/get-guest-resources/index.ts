import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { hashPortalSessionToken } from "../_shared/portalSecurity.ts";
import {
  guestResourceCharacterLength,
  hasMeaningfulGuestResourceContent,
  isCanonicalGuestResourceContent,
} from "../_shared/guestResourceContent.ts";
import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireString,
  requireUuid,
  workspaceCredentialIsFresh,
} from "../_shared/workspaceAuth.ts";

const METHODS = ["POST"] as const;
const RESOURCE_CATEGORIES = [
  "preparation",
  "technical_setup",
  "best_practices",
  "promotion",
  "examples",
  "templates",
] as const;
const RESOURCE_TYPES = ["article", "video", "download", "link"] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResourceCategory = typeof RESOURCE_CATEGORIES[number];
type ResourceType = typeof RESOURCE_TYPES[number];

interface PortalGuestResourceDto {
  id: string;
  title: string;
  description: string;
  content: string | null;
  category: ResourceCategory;
  type: ResourceType;
  url: string | null;
  file_url: string | null;
  featured: boolean;
  display_order: number;
  published_at: string;
  updated_at: string;
}

function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | null {
  if (value === undefined) return null;
  const result = requireString(value, field, { max: 32 });
  if (!allowed.includes(result as T)) {
    throw new HttpError(400, "INVALID_FIELD", `${field} is invalid`);
  }
  return result as T;
}

function optionalBoolean(
  value: unknown,
  field: string,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new HttpError(400, "INVALID_FIELD", `${field} must be a boolean`);
  }
  return value;
}

function paginationInteger(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      `${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function invalidCatalogResponse(): never {
  throw new HttpError(
    500,
    "INVALID_RESOURCE_RESPONSE",
    "The guest resource catalog returned an invalid response",
  );
}

function responseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidCatalogResponse();
  }
  return value as Record<string, unknown>;
}

function responseString(
  value: unknown,
  max: number,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    guestResourceCharacterLength(value) < 1 ||
    guestResourceCharacterLength(value) > max
  ) {
    invalidCatalogResponse();
  }
  return value;
}

function responseUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invalidCatalogResponse();
  }
  return value.toLowerCase();
}

function responseTimestamp(value: unknown): string {
  const result = responseString(value, 64) as string;
  if (!Number.isFinite(Date.parse(result))) invalidCatalogResponse();
  return result;
}

function responseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalidCatalogResponse();
  }
  return value as T;
}

function responseHttpUrl(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    guestResourceCharacterLength(value) > 2_048
  ) {
    invalidCatalogResponse();
  }
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password
    ) {
      invalidCatalogResponse();
    }
    return parsed.toString();
  } catch {
    return invalidCatalogResponse();
  }
}

function portalResourceDto(value: unknown): PortalGuestResourceDto {
  const row = responseRecord(value);
  if (typeof row.featured !== "boolean") invalidCatalogResponse();
  if (
    typeof row.display_order !== "number" ||
    !Number.isSafeInteger(row.display_order) ||
    row.display_order < 0 ||
    row.display_order > 1_000_000
  ) invalidCatalogResponse();
  const type = responseEnum(row.type, RESOURCE_TYPES);
  const url = responseHttpUrl(row.url);
  const fileUrl = responseHttpUrl(row.file_url);
  const content = row.content === null
    ? null
    : isCanonicalGuestResourceContent(row.content)
    ? row.content
    : invalidCatalogResponse();
  if (
    (type === "article" && !hasMeaningfulGuestResourceContent(content)) ||
    ((type === "video" || type === "link") && url === null) ||
    (type === "download" && fileUrl === null)
  ) {
    invalidCatalogResponse();
  }

  return {
    id: responseUuid(row.id),
    title: responseString(row.title, 200) as string,
    description: responseString(row.description, 2_000) as string,
    content,
    category: responseEnum(row.category, RESOURCE_CATEGORIES),
    type,
    url,
    file_url: fileUrl,
    featured: row.featured,
    display_order: row.display_order,
    published_at: responseTimestamp(row.published_at),
    updated_at: responseTimestamp(row.updated_at),
  };
}

function catalogRpcError(error: { code?: string; message?: string }): never {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (code === "P0002" || message.includes("not found")) {
    throw new HttpError(404, "CLIENT_NOT_FOUND", "Client workspace not found");
  }
  if (
    code === "42501" ||
    message.includes("portal access") ||
    message.includes("active workspace")
  ) {
    throw new HttpError(
      403,
      "PORTAL_ACCESS_UNAVAILABLE",
      "Client portal access is unavailable",
    );
  }
  if (["22023", "22P02"].includes(code) || message.includes("invalid")) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Guest resource request is invalid",
    );
  }
  throw new HttpError(
    500,
    "RESOURCE_LOOKUP_FAILED",
    "Guest resources could not be loaded",
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req, METHODS);

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Only POST is allowed");
    }

    const body = await parseJsonObject(req, 4_096);
    requireOnlyKeys(body, [
      "clientId",
      "sessionToken",
      "category",
      "type",
      "featured_only",
      "limit",
      "offset",
    ]);
    const clientId = requireUuid(body.clientId, "clientId");
    const sessionToken = body.sessionToken === undefined
      ? null
      : requireUuid(body.sessionToken, "sessionToken");
    const category = optionalEnum(
      body.category,
      "category",
      RESOURCE_CATEGORIES,
    );
    const type = optionalEnum(body.type, "type", RESOURCE_TYPES);
    const featuredOnly = optionalBoolean(
      body.featured_only,
      "featured_only",
      false,
    );
    const limit = paginationInteger(body.limit, "limit", 50, 1, 100);
    const offset = paginationInteger(body.offset, "offset", 0, 0, 1_000_000);
    const admin = createAdminClient();
    let sessionTokenHash: string | null = null;

    if (sessionToken) {
      sessionTokenHash = await hashPortalSessionToken(sessionToken);
      const { data: session, error: sessionError } = await admin
        .from("client_portal_sessions")
        .select(
          "client_id,clients(portal_access_enabled,workspace:workspaces!clients_workspace_id_fkey(status))",
        )
        .eq("session_token", sessionTokenHash)
        .eq("client_id", clientId)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (sessionError) {
        throw new HttpError(
          503,
          "SESSION_LOOKUP_FAILED",
          "Session validation is temporarily unavailable",
        );
      }

      const client = session?.clients as {
        portal_access_enabled?: boolean;
        workspace?: { status?: string } | null;
      } | null;
      if (
        !session ||
        !client?.portal_access_enabled ||
        client.workspace?.status !== "active"
      ) {
        throw new HttpError(
          401,
          "INVALID_PORTAL_SESSION",
          "Session expired or invalid",
        );
      }
    } else {
      // No portal token means this is the explicit operator impersonation path.
      const authContext = await requirePlatformAdmin(req);
      if (!workspaceCredentialIsFresh(authContext)) {
        throw new HttpError(
          401,
          "REAUTHENTICATION_REQUIRED",
          "Sign in again with the newest account credentials",
        );
      }
    }

    // The security-definer RPC derives the client's active workspace and applies
    // published/visibility assignment predicates before pagination.
    const { data, error } = await admin.rpc(
      "portal_guest_resources_for_client_v1",
      {
        p_client_id: clientId,
        p_session_token_hash: sessionTokenHash,
        p_category: category,
        p_type: type,
        p_featured_only: featuredOnly,
        p_limit: limit,
        p_offset: offset,
      },
    );

    if (error) catalogRpcError(error);
    const result = responseRecord(data);
    if (!Array.isArray(result.resources) || result.resources.length > limit) {
      invalidCatalogResponse();
    }
    if (
      typeof result.total !== "number" ||
      !Number.isSafeInteger(result.total) ||
      result.total < result.resources.length ||
      result.total > 1_000 ||
      (result.resources.length > 0 &&
        offset + result.resources.length > result.total)
    ) invalidCatalogResponse();
    const resources = result.resources.map(portalResourceDto);
    if (
      new Set(resources.map((resource) => resource.id)).size !==
        resources.length
    ) {
      invalidCatalogResponse();
    }

    return jsonResponse(req, METHODS, 200, {
      success: true,
      resources,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    return errorResponse(req, METHODS, error);
  }
});
