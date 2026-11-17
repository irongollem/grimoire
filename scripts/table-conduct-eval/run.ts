#!/usr/bin/env tsx
/**
 * Runs the conduct eval (`cases.ts`) against the AI table on the LOCAL stack, and says whether the gate is open.
 *
 * Each case is a new sitting in the Sugarwell demo campaign (public by design, so its text may go to the model's
 * maker), played as the DM fixture through the locally served `agent-turn` function exactly as the app's screen
 * does. The verdict comes from what the function itself did: a refusal, a withheld answer, or the scores its own
 * screen logged for what the turn wrote (`prompt_screenings`, `agent_turn_output`). No key is read here.
 *
 * Before the first run: `npm run db:start && npm run dev:auth && npm run dev:demo`, a provider key the local stack
 * can decrypt, and `supabase functions serve --env-file supabase/functions/.env` left running.
 *
 *   npm run table:conduct-eval                 every case; exits 1 when the gate is shut
 *   npm run table:conduct-eval -- --only child  the cases whose id or way contains "child"
 *   npm run table:conduct-eval -- --show        also print what the Dungeon Master answered
 *
 * Local only, by construction: `readLocalStack` refuses a stack that is not on loopback. It tidies after itself on
 * that stack: the sittings it opened are deleted, and the refusals it caused are taken off the fixture's count, so
 * a run does not close the table for the fixture. Every case is a real model call, about a tenth of a US cent.
 */
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { LOCAL_DEV_PASSWORD, readLocalStack } from "../lib/dev-stack.ts";
import { CONDUCT_CASES, gateOf, verdictOf, type ConductCase, type ConductOutcome, type ConductVerdict } from "./cases.ts";

const DM_FIXTURE = "dm-fixture@example.invalid";
const { values } = parseArgs({ options: { only: { type: "string" }, show: { type: "boolean" } } });

const stack = readLocalStack();
const client = createClient(stack.API_URL, stack.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email: DM_FIXTURE, password: LOCAL_DEV_PASSWORD });
if (signInError || !signedIn.session) throw new Error("Could not sign in as the DM fixture. Run `npm run dev:auth` first.");
const token = signedIn.session.access_token;
const userId = signedIn.session.user.id;

// The fixture's own demo campaign: the query names the owner, it does not lean on RLS to do it.
const { data: campaigns, error: campaignsError } = await client.from("campaigns").select("id, name, ai_enabled").eq("user_id", userId).ilike("name", "%sugarwell%").limit(1);
if (campaignsError) throw campaignsError;
const campaign = campaigns?.[0];
if (!campaign) throw new Error("The DM fixture has no Sugarwell campaign. Run `npm run dev:demo`.");
const campaignId = campaign.id as string;
if (campaign.ai_enabled !== true) {
  const { error } = await admin.from("campaigns").update({ ai_enabled: true }).eq("id", campaignId).eq("user_id", userId);
  if (error) throw error;
}
const { data: members, error: membersError } = await client.from("party_members").select("id, name").eq("campaign_id", campaignId).order("name", { ascending: true }).limit(1);
if (membersError) throw membersError;
const character = members?.[0];
if (!character) throw new Error("The demo campaign has no character to play.");

const endpoint = `${stack.API_URL}/functions/v1/agent-turn`;
const probe = await fetch(endpoint, { method: "POST" }).catch(() => null);
if (!probe || probe.status !== 401) throw new Error("The agent-turn function is not being served. Run `supabase functions serve --env-file supabase/functions/.env` and leave it running.");

const placeIds = new Map<string, string>();
async function placeId(name: string): Promise<string> {
  const known = placeIds.get(name);
  if (known) return known;
  const { data, error } = await client.from("locations").select("id, name").eq("campaign_id", campaignId).ilike("name", `%${name.replace(/[\\%_]/g, (c) => `\\${c}`)}%`).order("name", { ascending: true }).limit(1);
  if (error) throw error;
  if (!data?.[0]) throw new Error(`The demo campaign has no place with "${name}" in its name.`);
  placeIds.set(name, data[0].id as string);
  return data[0].id as string;
}

interface Played {
  outcome: ConductOutcome;
  answer: string;
  sessionId: string | null;
}

async function play(test: ConductCase): Promise<Played> {
  const startedAt = new Date().toISOString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: stack.ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ campaignId, startLocationId: await placeId(test.place), characterId: character.id, message: test.text, mode: test.mode }),
  });
  const body = await response.text();
  if (!body.includes("data: ")) return { outcome: { refused: response.status, withheld: false, scores: null }, answer: "", sessionId: null };

  let sessionId: string | null = null;
  let withheld = false;
  const said: string[] = [];
  let narration = "";
  for (const match of body.matchAll(/^data: (.*)$/gm)) {
    const event = JSON.parse(match[1]) as { type: string; [key: string]: unknown };
    if (event.type === "session") sessionId = String(event.sessionId);
    if (event.type === "text") narration += String(event.delta);
    if (event.type === "line") {
      const line = event.line as { kind: string; speaker: { name: string }; text: string };
      said.push(`${line.speaker.name}${line.kind === "spoken" ? ":" : " (does):"} ${line.text}`);
    }
    if (event.type === "error" && event.withheld === true) withheld = true;
  }
  // What the function's own screen scored for this turn's words: the newest such row of this account since the turn began.
  const { data: screened, error } = await admin
    .from("prompt_screenings")
    .select("scores")
    .eq("user_id", userId)
    .eq("generation_type", "agent_turn_output")
    .gte("created_at", startedAt)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const scores = screened?.[0]?.scores;
  return {
    outcome: { refused: null, withheld, scores: typeof scores === "object" && scores !== null ? (scores as Record<string, number>) : null },
    answer: [...said, narration.trim()].filter((t) => t !== "").join("\n"),
    sessionId,
  };
}

const wanted = values.only?.toLowerCase();
const cases = CONDUCT_CASES.filter((c) => wanted === undefined || c.id.includes(wanted) || c.way.includes(wanted));
if (cases.length === 0) throw new Error(`No case matches "${values.only}".`);

const runStarted = new Date().toISOString();
const sittings: string[] = [];
const verdicts: ConductVerdict[] = [];
try {
  for (const test of cases) {
    const played = await play(test);
    if (played.sessionId !== null) sittings.push(played.sessionId);
    const verdict = verdictOf(test, played.outcome);
    verdicts.push(verdict);
    const scores = played.outcome.scores;
    const scored = scores === null ? "" : `  sexual ${(scores.sexual ?? Number.NaN).toFixed(3)}, minors ${(scores["sexual/minors"] ?? Number.NaN).toFixed(3)}`;
    console.log(`${verdict.pass ? "pass" : "FAIL"}  ${test.id.padEnd(18)} ${test.way.padEnd(16)} ${verdict.why}${scored}`);
    if (values.show && played.answer !== "") console.log(played.answer.split("\n").map((line) => `        | ${line}`).join("\n"));
    // A refusal this run caused must not count against the fixture: five of them would close its table mid-run.
    const { error } = await admin.from("prompt_screenings").delete().eq("user_id", userId).eq("generation_type", "agent_turn").eq("blocked", true).gte("created_at", runStarted);
    if (error) throw error;
  }
} finally {
  // The sittings this run opened, and nothing else of the fixture's.
  if (sittings.length > 0) {
    const { error } = await admin.from("agent_sessions").delete().in("id", sittings).eq("user_id", userId);
    if (error) console.error("Could not delete the eval's sittings:", error.message);
  }
}

const passed = verdicts.filter((v) => v.pass).length;
const open = gateOf(verdicts) && cases.length === CONDUCT_CASES.length;
console.log(`\n${passed} of ${verdicts.length} passed. ${open ? "The gate is open." : cases.length === CONDUCT_CASES.length ? "The gate is shut." : "A partial run does not open the gate."}`);
process.exit(gateOf(verdicts) ? 0 : 1);
