import {
  decryptInstantlyApiKey,
  encryptInstantlyApiKey,
  getInstantlyAccountSendHistory,
  getInstantlyWarmupAnalytics,
  listInstantlyCampaignAnalytics,
  localCampaignStatus,
  safeInstantlyAccount,
  safeInstantlyAnalytics,
  withStoredOpportunityCounts,
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

Deno.test("a mailbox with no usable signature is reported as having none", () => {
  // Whitespace is not a signature. An email ending in a blank line reads the
  // same to a host as one ending in nothing.
  for (const signature of [undefined, null, "", "   ", "\n"]) {
    const account = safeInstantlyAccount({
      email: "no-sig@example.com",
      first_name: "No",
      last_name: "Sig",
      status: 1,
      signature,
    });
    assertEquals(account?.has_signature, false, JSON.stringify(signature));
  }
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
      signature: "  Best,\nSolar Admin  ",
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
      // Whether one exists, never the text: the content is the workspace's
      // business, and the question this answers is only whether outreach from
      // this mailbox ends with a name.
      has_signature: true,
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
    const daily = await getInstantlyAccountSendHistory(
      "server-side-key",
      emails,
      { days: 2, timeZone: "UTC", now: new Date("2026-07-24T12:00:00.000Z") },
    );
    const warmup = await getInstantlyWarmupAnalytics(
      "server-side-key",
      emails,
    );

    assertEquals(
      daily.get(emails[0]),
      [{ date: "2026-07-23", sent: 99 }, { date: "2026-07-24", sent: 3 }],
      "each day in the window should be reported on its own date",
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

Deno.test("Campaign analytics are fetched for every campaign in one request", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    requests.push(input.toString());
    return new Response(
      JSON.stringify([
        {
          campaign_id: "11111111-1111-4111-8111-111111111111",
          campaign_status: 1,
          emails_sent_count: 40,
          contacted_count: 20,
          open_count_unique: 12,
          reply_count_unique: 3,
          bounced_count: 1,
          unsubscribed_count: 0,
        },
        // A campaign belonging to somebody else, which the caller never asked
        // for and must not be able to write onto its own rows.
        {
          campaign_id: "99999999-9999-4999-8999-999999999999",
          campaign_status: 1,
          emails_sent_count: 9_000,
        },
      ]),
      { status: 200 },
    );
  };

  try {
    const analytics = await listInstantlyCampaignAnalytics("server-side-key", [
      "11111111-1111-4111-8111-111111111111",
      // Deleted in Instantly: asked for, never answered.
      "22222222-2222-4222-8222-222222222222",
      "  ",
    ]);

    assertEquals(requests.length, 1, "one batch should cost one request");
    const url = new URL(requests[0]);
    assertEquals(
      url.pathname,
      "/api/v2/campaigns/analytics",
      "the documented list endpoint should be used",
    );
    assertEquals(
      url.searchParams.getAll("ids"),
      [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      "blank ids should be dropped and the rest repeated",
    );
    assertEquals(
      url.searchParams.get("exclude_total_leads_count"),
      "true",
      "the slow lead count should be excluded",
    );
    assertEquals(
      analytics.get("11111111-1111-4111-8111-111111111111")?.analytics,
      {
        emails_sent_count: 40,
        contacted_count: 20,
        open_count_unique: 12,
        reply_count_unique: 3,
        bounced_count: 1,
        unsubscribed_count: 0,
        total_interested: 0,
        total_meeting_booked: 0,
      },
      "the campaign row should map onto the stored analytics shape",
    );
    assertEquals(
      analytics.get("11111111-1111-4111-8111-111111111111")?.status,
      1,
      "the provider status should come across",
    );
    assert(
      !analytics.has("22222222-2222-4222-8222-222222222222"),
      "a campaign the provider did not answer for must be absent, not zeroed",
    );
    assert(
      !analytics.has("99999999-9999-4999-8999-999999999999"),
      "a campaign that was never requested must be ignored",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Campaign analytics batches stay inside the id limit", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    requests.push(input.toString());
    return new Response(JSON.stringify([]), { status: 200 });
  };

  try {
    const ids = Array.from(
      { length: 41 },
      (_value, index) => `${index}`.padStart(8, "0") + "-0000-4000-8000-000000000000",
    );
    await listInstantlyCampaignAnalytics("server-side-key", ids);

    assertEquals(requests.length, 2, "41 ids should split into two batches");
    assertEquals(
      new URL(requests[0]).searchParams.getAll("ids").length,
      40,
      "the first batch should be full",
    );
    assertEquals(
      new URL(requests[1]).searchParams.getAll("ids").length,
      1,
      "the remainder should follow in a second request",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("A bulk refresh keeps the counts its endpoint does not report", () => {
  const fresh = safeInstantlyAnalytics({
    emails_sent_count: 40,
    reply_count_unique: 3,
  });
  const stored = {
    emails_sent_count: 30,
    reply_count_unique: 2,
    total_interested: 4,
    total_meeting_booked: 1,
  };

  assertEquals(
    withStoredOpportunityCounts(fresh, stored),
    {
      emails_sent_count: 40,
      contacted_count: 0,
      open_count_unique: 0,
      reply_count_unique: 3,
      bounced_count: 0,
      unsubscribed_count: 0,
      // Only the overview endpoint reports these; the list form leaves them at
      // zero, and zeroing a real number would read as lost interest.
      total_interested: 4,
      total_meeting_booked: 1,
    },
    "interested and meeting counts should survive a totals-only refresh",
  );
});

Deno.test("The sending day is the campaign's day, not UTC's", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    requests.push(input.toString());
    return new Response(
      JSON.stringify([
        { date: "2026-07-27", email_account: "sender@example.com", sent: 40 },
      ]),
      { status: 200 },
    );
  };

  try {
    // 01:00 UTC on the 28th is still the evening of the 27th in Los Angeles —
    // right after a 09:00-17:00 send window closed. Reading the day off UTC
    // reported that afternoon's sending as zero.
    const evening = new Date("2026-07-28T01:00:00.000Z");
    const local = await getInstantlyAccountSendHistory(
      "server-side-key",
      ["sender@example.com"],
      { days: 2, timeZone: "America/Los_Angeles", now: evening },
    );
    const today = local.get("sender@example.com")?.at(-1);
    assertEquals(
      today,
      { date: "2026-07-27", sent: 40 },
      "today should be the local day, and should carry the day's sends",
    );
    assertEquals(
      new URL(requests[0]).searchParams.get("end_date"),
      "2026-07-27",
      "the range should end on the local day",
    );

    const utc = await getInstantlyAccountSendHistory(
      "server-side-key",
      ["sender@example.com"],
      { days: 2, timeZone: "UTC", now: evening },
    );
    assertEquals(
      utc.get("sender@example.com")?.at(-1),
      { date: "2026-07-28", sent: 0 },
      "the UTC day is a day ahead there, which is what used to be reported",
    );

    // An unusable zone must degrade, not throw.
    const broken = await getInstantlyAccountSendHistory(
      "server-side-key",
      ["sender@example.com"],
      { days: 1, timeZone: "Not/AZone", now: evening },
    );
    assertEquals(
      broken.get("sender@example.com")?.length,
      1,
      "an invalid timezone should fall back rather than fail the page",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
