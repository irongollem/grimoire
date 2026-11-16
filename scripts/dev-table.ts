#!/usr/bin/env tsx
/**
 * Sit down at the AI table from a terminal (#1021), against the LOCAL stack.
 *
 * The table has no screen yet. Until it does, the only way to play a turn was a
 * one-off script that sent fixed messages; this is the same thing made
 * interactive, so the maintainer can try a scene himself: type what the
 * character says or does, read the narration, each character's own line and
 * deed, and what went on the record.
 *
 * It signs in as the DM fixture (`npm run dev:auth`), picks one of its campaigns
 * and talks to the locally served `agent-turn` function exactly as the app's
 * screen will: the same request, the same event stream. Nothing here is a
 * shortcut around the function's gates.
 *
 * Before the first run:
 *   npm run db:start && npm run dev:auth && npm run dev:demo
 *   npx tsx --tsconfig tsconfig.node.json scripts/local-provider-key.ts   (a provider key the local stack can decrypt)
 *   supabase functions serve --env-file supabase/functions/.env          (leave it running)
 *
 * Then:
 *   npm run dev:table                         the Sugarwell demo, no starting place
 *   npm run dev:table -- --place workshop     begin at a place whose name contains "workshop"
 *   npm run dev:table -- --campaign "kind"    another of the fixture's campaigns
 *
 * At the prompt: a plain line is said aloud; `/do <text>` is done; `/new` starts
 * a fresh conversation (a new sitting); `/quit` leaves.
 *
 * Local only, by construction: `readLocalStack` refuses a stack that is not on
 * loopback. It switches `ai_enabled` on for the chosen LOCAL campaign, because a
 * fresh demo copy has it off, and says so. Every turn is a real model call on
 * the key in `supabase/functions/.env`, at about a tenth of a US cent a turn.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { LOCAL_DEV_PASSWORD, readLocalStack } from "./lib/dev-stack.ts";

const DM_FIXTURE = "dm-fixture@example.invalid";

interface TableEvent {
  type: string;
  [key: string]: unknown;
}

const { values } = parseArgs({
  options: { campaign: { type: "string" }, place: { type: "string" } },
});

const stack = readLocalStack();
const client = createClient(stack.API_URL, stack.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email: DM_FIXTURE, password: LOCAL_DEV_PASSWORD });
if (signInError || !signedIn.session) {
  throw new Error("Could not sign in as the DM fixture. Run `npm run dev:auth` first.");
}
const token = signedIn.session.access_token;
const userId = signedIn.session.user.id;

// The fixture's own campaigns only: the query names the owner, it does not lean on RLS to do it.
const { data: campaigns, error: campaignsError } = await client
  .from("campaigns")
  .select("id, name, ai_enabled")
  .eq("user_id", userId)
  .order("name", { ascending: true });
if (campaignsError) throw campaignsError;
const wanted = (values.campaign ?? "sugarwell").toLowerCase();
const campaign = (campaigns ?? []).find((c) => String(c.name).toLowerCase().includes(wanted));
if (!campaign) {
  const names = (campaigns ?? []).map((c) => `  ${c.name}`).join("\n");
  throw new Error(`No campaign of the DM fixture matches "${wanted}". It has:\n${names}\nRun \`npm run dev:demo\` for the Sugarwell demo.`);
}
const campaignId = campaign.id as string;
const campaignName = campaign.name as string;

if (campaign.ai_enabled !== true) {
  const { error } = await admin.from("campaigns").update({ ai_enabled: true }).eq("id", campaignId).eq("user_id", userId);
  if (error) throw error;
  console.log(`Switched AI on for the local campaign "${campaignName}".`);
}

let startLocationId: string | undefined;
if (values.place) {
  const { data: places, error } = await client
    .from("locations")
    .select("id, name")
    .eq("campaign_id", campaignId)
    .ilike("name", `%${values.place.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    .order("name", { ascending: true })
    .limit(5);
  if (error) throw error;
  if (!places || places.length === 0) throw new Error(`No place in "${campaignName}" has "${values.place}" in its name.`);
  startLocationId = places[0].id as string;
  console.log(`Beginning at ${places[0].name}.`);
}

const endpoint = `${stack.API_URL}/functions/v1/agent-turn`;
const probe = await fetch(endpoint, { method: "POST" }).catch(() => null);
if (!probe || probe.status !== 401) {
  throw new Error("The agent-turn function is not being served. Run `supabase functions serve --env-file supabase/functions/.env` and leave it running.");
}

function show(event: TableEvent, narration: { text: string }): void {
  const flush = () => {
    if (narration.text.trim()) console.log(`\n${narration.text.trim()}`);
    narration.text = "";
  };
  if (event.type === "text") {
    narration.text += String(event.delta);
    return;
  }
  flush();
  if (event.type === "line") {
    const line = event.line as { kind: string; speaker: { name: string }; text: string };
    console.log(line.kind === "spoken" ? `\n  ${line.speaker.name}: "${line.text}"` : `\n  ${line.speaker.name} (does): ${line.text}`);
  } else if (event.type === "fact") {
    console.log(`  [on record] ${(event.fact as { body: string }).body}`);
  } else if (event.type === "scene") {
    console.log(`  [the party is at ${(event.scene as { name: string }).name}]`);
  } else if (event.type === "error") {
    console.log(`\n  [the turn failed] ${String(event.message)}`);
  } else if (event.type === "done") {
    console.log(`  (${String(event.tokens)} tokens, ${String(event.credits)} credits billed)`);
  }
}

async function turn(sessionId: string | null, mode: "say" | "do", message: string): Promise<string | null> {
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: stack.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId,
      message,
      mode,
      ...(sessionId ? { sessionId } : startLocationId ? { startLocationId } : {}),
    }),
  });
  if (!response.body || !response.headers.get("content-type")?.includes("event-stream")) {
    console.log(`\n  [refused ${response.status}] ${await response.text()}`);
    return sessionId;
  }
  const narration = { text: "" };
  const decoder = new TextDecoder();
  let buffer = "";
  let id = sessionId;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let cut = buffer.indexOf("\n\n");
    while (cut >= 0) {
      const event = JSON.parse(buffer.slice(0, cut).replace(/^data: /, "")) as TableEvent;
      buffer = buffer.slice(cut + 2);
      if (event.type === "session") id = String(event.sessionId);
      else show(event, narration);
      cut = buffer.indexOf("\n\n");
    }
  }
  if (narration.text.trim()) console.log(`\n${narration.text.trim()}`);
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  return id;
}

console.log(`\nAt the table in "${campaignName}". A plain line is said aloud, /do <text> is done, /new starts a fresh sitting, /quit leaves.\n`);
// Read line by line rather than asking a question each time: input that ends (a pipe, Ctrl-D) then simply ends
// the sitting, where a question asked of a closed input throws.
const prompt = createInterface({ input: process.stdin, output: process.stdout, prompt: "\n> " });
let sessionId: string | null = null;
// Input can end while a turn is still being played; the lines already read are still served, but a closed
// prompt must not be shown again.
let open = true;
prompt.on("close", () => {
  open = false;
});
prompt.prompt();
for await (const line of prompt) {
  const typed = line.trim();
  if (typed === "/quit") break;
  if (typed === "/new") {
    sessionId = null;
    console.log("A fresh sitting: the next message starts a new conversation.");
  } else if (typed !== "") {
    const done = typed.startsWith("/do ");
    sessionId = await turn(sessionId, done ? "do" : "say", done ? typed.slice(4).trim() : typed);
  }
  if (open) prompt.prompt();
}
if (open) prompt.close();
