/**
 * Asserts that Stripe's webhook configuration matches what the code expects.
 *
 * Stripe keeps test and live configuration completely separate, and neither
 * lives in this repo — so "it worked in test mode" says nothing about live, and
 * a missing event produces no error anywhere. It produces a customer who paid
 * and got nothing. This makes that drift a failing check instead.
 *
 * Run it per mode; the key decides which one you are inspecting:
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:check
 *   STRIPE_SECRET_KEY=sk_live_... npm run stripe:check
 *
 * See docs/stripe-testing.md for what to do about each failure.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  parseHandledEvents,
  compareEvents,
  compareApiVersions,
  parseApiVersions,
} from "./lib/stripe-webhook-parity";

const FUNCTIONS_DIR = "supabase/functions";
const WEBHOOK_SOURCE = path.join(FUNCTIONS_DIR, "stripe-webhook/index.ts");
/** Matches the endpoint by path, so it works whichever Supabase project is linked. */
const ENDPOINT_PATH = "/functions/v1/stripe-webhook";

interface WebhookEndpoint {
  id: string;
  url: string;
  status: string;
  api_version: string | null;
  enabled_events: string[];
  livemode: boolean;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Every .ts under supabase/functions, so no Stripe client escapes the version check. */
function functionSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) out.push(readFileSync(full, "utf8"));
    }
  };
  walk(FUNCTIONS_DIR);
  return out;
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    fail(
      "STRIPE_SECRET_KEY is not set. This check cannot run without one, and skipping it\n" +
        "  quietly would defeat the point. Pass a test key to inspect test mode, or a live\n" +
        "  key to inspect live:  STRIPE_SECRET_KEY=sk_test_... npm run stripe:check",
    );
  }

  const mode = key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "LIVE" : "TEST";
  console.log(`Checking Stripe webhook configuration — ${mode} mode\n`);

  const response = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    fail(`Stripe API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const payload = (await response.json()) as { data?: WebhookEndpoint[] };
  const endpoints: WebhookEndpoint[] = payload.data ?? [];

  const ours = endpoints.filter((e) => e.url.includes(ENDPOINT_PATH));
  if (ours.length === 0) {
    fail(
      `No webhook endpoint in ${mode} mode points at ${ENDPOINT_PATH}.\n` +
        `  Stripe will deliver nothing, so no payment will ever be recorded.\n` +
        `  ${endpoints.length} other endpoint(s) exist. See docs/stripe-testing.md to create one.`,
    );
  }

  const handled = parseHandledEvents(readFileSync(WEBHOOK_SOURCE, "utf8"));
  if (handled.length === 0) fail(`Parsed zero event types out of ${WEBHOOK_SOURCE} — check the parser.`);

  // One version across every client, or some function is on a different API.
  const codeVersions = parseApiVersions(functionSources());
  let problems = 0;

  if (codeVersions.length === 0) {
    console.error("✖ No Stripe client pins an apiVersion — they will drift with the account default.");
    problems++;
  } else if (codeVersions.length > 1) {
    console.error(`✖ Edge functions disagree on apiVersion: ${codeVersions.join(", ")}`);
    console.error("  A partly-finished upgrade: some functions talk to a different Stripe API.");
    problems++;
  } else {
    console.log(`  Code sends apiVersion  ${codeVersions[0]}`);
  }

  for (const endpoint of ours) {
    console.log(`\n  Endpoint ${endpoint.id}`);
    console.log(`    url            ${endpoint.url}`);
    console.log(`    status         ${endpoint.status}`);
    console.log(`    api_version    ${endpoint.api_version ?? "(account default)"}`);
    console.log(`    events         ${endpoint.enabled_events.length}`);

    if (endpoint.status !== "enabled") {
      console.error(`\n✖ Endpoint is "${endpoint.status}" — Stripe is not delivering to it.`);
      problems++;
    }

    if (endpoint.enabled_events.includes("*")) {
      console.log("\n  Subscribed to all events (*), so no event can be missing.");
    } else {
      const drift = compareEvents(handled, endpoint.enabled_events);

      if (drift.handledButNotEnabled.length > 0) {
        console.error("\n✖ The code handles these, but Stripe will never send them:");
        for (const event of drift.handledButNotEnabled) console.error(`    ${event}`);
        console.error("  This is the direction that loses money — the handler simply never runs.");
        console.error("  Fix: add them to the endpoint's enabled events (docs/stripe-testing.md).");
        problems++;
      }

      if (drift.enabledButNotHandled.length > 0) {
        console.error("\n✖ Stripe sends these, but the webhook ignores them:");
        for (const event of drift.enabledButNotHandled) console.error(`    ${event}`);
        console.error("  Not dangerous, but someone enabled them expecting something to happen.");
        console.error("  Fix: handle them, or remove them from the endpoint.");
        problems++;
      }
    }

    // The endpoint's version shapes what we RECEIVE; the code's shapes what we SEND.
    // Different releases are where fields move (Basil relocated Invoice.subscription).
    if (codeVersions.length === 1 && endpoint.api_version) {
      const verdict = compareApiVersions(codeVersions[0], endpoint.api_version);
      if (verdict === "different-release") {
        console.error(
          `\n✖ Endpoint renders payloads at ${endpoint.api_version}, code expects ${codeVersions[0]}.`,
        );
        console.error("  Different Stripe releases: fields move between them, so the webhook may");
        console.error("  read properties that are not in the payloads it receives.");
        problems++;
      } else if (verdict === "same-release") {
        console.log(
          `    version note   endpoint ${endpoint.api_version} differs from ${codeVersions[0]},` +
            " but same release — Stripe guarantees no breaking changes within one.",
        );
      }
    }
  }

  if (problems > 0) fail(`${problems} problem(s) found in ${mode} mode.`);
  console.log(`\n✔ ${mode} webhook configuration matches the code (${handled.length} events).`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
