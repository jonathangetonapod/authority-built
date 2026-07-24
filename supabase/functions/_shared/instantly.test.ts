import {
  decryptInstantlyApiKey,
  encryptInstantlyApiKey,
  getInstantlyDailyAccountSends,
  getInstantlyWarmupAnalytics,
  localCampaignStatus,
  safeInstantlyAccount,
  safeInstantlyAnalytics,
} from "./instantly.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

Deno.test("Instantly credentials round-trip without storing plaintext", async () => {
  const apiKey = "instant-api-key-that-must-stay-server-side";
  const secret = "a-test-only-encryption-secret-with-more-than-32-characters";
  const encrypted = await encryptInstantlyApiKey(apiKey, secret);

  assert(
    encrypted.ciphertext !== apiKey,
    "ciphertext must not contain the plaintext API key",
  );
  assertEquals(
    await decryptInstantlyApiKey(encrypted, secret),
    apiKey,
    "the encrypted credential should round-trip",
  );
  let rejected = false;
  try {
    await decryptInstantlyApiKey(encrypted, `${secret}-wrong`);
  } catch (error) {
    rejected = error instanceof Error &&
      error.message.includes("could not be decrypted");
  }
  assert(rejected, "the wrong encryption secret must be rejected");
});

Deno.test("Instantly provider values are reduced to the supported campaign DTO", () => {
  assertEquals(localCampaignStatus(1), "active", "active status should map");
  assertEquals(localCampaignStatus(2), "paused", "paused status should map");
  assertEquals(
    localCampaignStatus(4),
    "attention",
    "subsequence status should require attention",
  );
  assertEquals(
    safeInstantlyAnalytics({
      emails_sent_count: 20,
      contacted_count: 10,
      reply_count_unique: 4,
      total_interested: 2,
      unsafe_provider_field: "not returned",
    }),
    {
      emails_sent_count: 20,
      contacted_count: 10,
      open_count_unique: 0,
      reply_count_unique: 4,
      bounced_count: 0,
      unsubscribed_count: 0,
      total_interested: 2,
      total_meeting_booked: 0,
    },
    "analytics should expose only the supported non-negative counters",
  );
});

Deno.test("Instantly account values are reduced to mailbox-safe fields", () => {
  assertEquals(
    safeInstantlyAccount({
      email: " Admin@SolarAccountReview.Help ",
      first_name: "Solar",
      last_name: "Admin",
      status: -3,
      status_message: {
        code: "EENVELOPE",
        command: "DATA",
        response: "550 sending failed",
        e_message: "SMTP send failed",
        responseCode: 550,
      },
      warmup_status: 1,
      daily_limit: 15,
      warmup: { limit: 70, unsafe_advanced_settings: "hidden" },
      stat_warmup_score: 99,
      tags: [
        { id: "tag-z", label: "Zulu", description: null },
        { id: "tag-a", label: "Solar - CI 04/23/2026" },
      ],
      api_key: "must-not-leak",
    }),
    {
      email: "admin@solaraccountreview.help",
      first_name: "Solar",
      last_name: "Admin",
      status: -3,
      status_message: {
        code: "EENVELOPE",
        command: "DATA",
        response: "550 sending failed",
        e_message: "SMTP send failed",
        response_code: 550,
      },
      warmup_status: 1,
      daily_limit: 15,
      warmup_limit: 70,
      stat_warmup_score: 99,
      tags: [
        { id: "tag-a", label: "Solar - CI 04/23/2026", description: null },
        { id: "tag-z", label: "Zulu", description: null },
      ],
    },
    "accounts should expose only validated mailbox fields",
  );
  assertEquals(
    safeInstantlyAccount({ email: "missing-status@example.com" }),
    null,
    "accounts without a numeric status should be ignored",
  );
});

Deno.test("Instantly mailbox analytics use the documented account endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input.toString();
    requests.push({ url, init });
    if (url.includes("/accounts/analytics/daily")) {
      return new Response(
        JSON.stringify([
          {
            date: "2026-07-23",
            email_account: "admin@solaraccountreview.help",
            sent: 99,
          },
          {
            date: "2026-07-24",
            email_account: "ADMIN@SOLARACCOUNTREVIEW.HELP",
            sent: 3,
          },
        ]),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        aggregate_data: {
          "admin@solaraccountreview.help": { sent: 70, health_score: 100 },
        },
      }),
      { status: 200 },
    );
  };

  try {
    const emails = ["admin@solaraccountreview.help"];
    const daily = await getInstantlyDailyAccountSends(
      "server-side-key",
      emails,
      new Date("2026-07-24T12:00:00.000Z"),
    );
    const warmup = await getInstantlyWarmupAnalytics(
      "server-side-key",
      emails,
    );

    assertEquals(
      daily.get(emails[0]),
      3,
      "only today's campaign sends should be shown",
    );
    assertEquals(
      warmup.get(emails[0]),
      { sent: 70, health_score: 100 },
      "aggregate warmup metrics should map by email",
    );
    const dailyRequest = new URL(requests[0].url);
    assertEquals(
      dailyRequest.pathname,
      "/api/v2/accounts/analytics/daily",
      "daily analytics path should match the API",
    );
    assertEquals(
      dailyRequest.searchParams.get("start_date"),
      "2026-07-23",
      "the range should start one day earlier",
    );
    assertEquals(
      dailyRequest.searchParams.get("end_date"),
      "2026-07-24",
      "the range should end today",
    );
    assertEquals(
      dailyRequest.searchParams.getAll("emails"),
      emails,
      "the account filter should be repeated safely",
    );
    assert(
      requests[1].url.endsWith("/api/v2/accounts/warmup-analytics"),
      "warmup analytics path should match the API",
    );
    assertEquals(
      JSON.parse(String(requests[1].init?.body)),
      { emails },
      "warmup analytics should send the bounded email batch",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
