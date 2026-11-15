/**
 * Does Jev pick a monster's turn better than the rules-only picker? (#1203 story 3)
 *
 * Runs three pickers over every scenario in `scenarios.ts` and scores each pick against the labels:
 *   - rules: `pickTurn`, what the server does today;
 *   - choice: one Jev Choice question over the gated options (`choiceRequest`);
 *   - score: one Jev Score per option, the highest wins, a tie goes to the rules pick (`scoreRequest`).
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/tactics-eval/run.ts --dry          # rules only, no API call
 *   npx tsx --tsconfig tsconfig.node.json scripts/tactics-eval/run.ts --label v1     # the real run
 *   npx tsx --tsconfig tsconfig.node.json scripts/tactics-eval/run.ts --label v1-reversed --reverse   # same turns, listed in the opposite order
 *   npx tsx --tsconfig tsconfig.node.json scripts/tactics-eval/run.ts --label note-v1 --note-only [--reverse] [--thresholds 0.5,0.2]
 *                                                                      # only the note veto: one yes/no request per noted scenario
 *   npx tsx --tsconfig tsconfig.node.json scripts/tactics-eval/run.ts --options      # list every scenario's options
 *
 * The key is read from `JEV_API_KEY` in the environment or in `.env.local` (this checkout's, else the main
 * checkout's) and is never printed, logged or written. Only invented text is sent: see `scenarios.ts`.
 * Results go to the scratchpad directory (`--out <dir>`), not into the repo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pickTurn } from "../../src/rules/fight/tactics/pick.ts";
import { choiceRequest, noteProbabilities, noteRequest, NOTE_WORDING, optionsAllowedByNote, pickFromChoice, pickFromScores, scoreRequest, TACTICS_WORDING, type JudgedPick } from "../../supabase/functions/_shared/tacticsJudge.ts";
import { judge, type JudgeRequest, type JudgeResult } from "../../supabase/functions/_shared/typesafe.ts";
import { prepare } from "./fixtures.ts";
import { SCENARIOS, type Scenario } from "./scenarios.ts";

const DEFAULT_OUT = "/private/tmp/claude-501/-Users-jeffrey-Repositories-DnD-helper/168865c9-de66-4967-87a4-68f14f3eca87/scratchpad/tactics-eval";
const CONCURRENCY = 4;
/** A budget the story set: stop before this many requests. */
const REQUEST_CAP = 300;

type Verdict = "good" | "neither" | "bad" | "unanswered";
type Picker = "rules" | "choice" | "score";
const PICKERS: Picker[] = ["rules", "choice", "score"];

function argOf(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const flag = (name: string) => process.argv.includes(name);

function readEnvKey(path: string): string | null {
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("JEV_API_KEY=")) {
      const value = trimmed.slice("JEV_API_KEY=".length).replace(/^["']|["']$/g, "");
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function apiKey(): string {
  const fromEnv = process.env.JEV_API_KEY;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const here = readEnvKey(".env.local");
  if (here) return here;
  // A worktree has no .env.local of its own; the main checkout does.
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim();
  const main = readEnvKey(join(dirname(resolve(process.cwd(), common)), ".env.local"));
  if (main) return main;
  throw new Error("JEV_API_KEY is not set in the environment or in .env.local");
}

// ── usage, read from the API's own report ───────────────────────────────────────

const usage = { requests: 0, failures: 0, inputTokens: 0, numbers: {} as Record<string, number> };

/** Wraps fetch to add up whatever numeric fields the API puts in `usage`, without ever touching the request. */
function countingFetch(): typeof fetch {
  return async (input, init) => {
    usage.requests++;
    if (usage.requests > REQUEST_CAP) throw new Error(`Refusing to send request ${usage.requests}: the cap is ${REQUEST_CAP}`);
    const res = await fetch(input, init);
    if (res.status === 200) {
      try {
        const body: unknown = await res.clone().json();
        const u = typeof body === "object" && body !== null && "usage" in body ? (body as { usage: unknown }).usage : null;
        if (typeof u === "object" && u !== null) {
          for (const [k, v] of Object.entries(u)) if (typeof v === "number") usage.numbers[k] = (usage.numbers[k] ?? 0) + v;
        }
      } catch {
        // a body we cannot read adds nothing to the totals
      }
    }
    return res;
  };
}

// ── one scenario, three pickers ─────────────────────────────────────────────────

interface Picked {
  optionId: string | null;
  verdict: Verdict;
  confidence?: number | null;
}

interface Row {
  scenario: Scenario;
  summaries: Record<string, string>;
  picks: Record<Picker, Picked>;
  /** Only for a creature with a note: the model's chance, per turn, that the turn goes against it, and the rules pick over what each threshold allows. */
  note: { probabilities: Record<string, number | null>; picks: Record<string, Picked> } | null;
}

const thresholds = (): number[] => (argOf("--thresholds") ?? "0.5").split(",").map(Number);

const verdictOf = (s: Scenario, id: string | null): Verdict => (id === null ? "unanswered" : s.good.includes(id) ? "good" : s.bad.includes(id) ? "bad" : "neither");

async function ask(request: JudgeRequest | null, key: string, fetchImpl: typeof fetch): Promise<JudgeResult | null> {
  if (request === null) return null;
  try {
    return await judge(request, { apiKey: key, fetch: fetchImpl, timeoutMs: 45_000 });
  } catch {
    usage.failures++;
    return null;
  }
}

async function runOne(s: Scenario, key: string | null, fetchImpl: typeof fetch): Promise<Row> {
  const p = prepare(s.fight);
  const ctx = { combatants: p.combatants, moverId: p.mover.instance_id, armorClassOf: p.armorClassOf };
  const rules = pickTurn(p.options, p.profile, ctx);
  const rulesId = rules === null ? null : rules.optionId;
  // `--reverse` hands the judge the same turns in the opposite order. The options arrive with the attacks first, which
  // is also where the rules picker usually lands, so a judge that favours whatever is listed first would look as if it
  // agreed with the rules. Reversed, that agreement has to survive on its merits.
  const judged = flag("--reverse") ? [...p.options].reverse() : p.options;
  const input = { mover: p.mover, profile: p.profile, combatants: p.combatants, options: judged };

  let choice: JudgedPick | null = null;
  let score: JudgedPick | null = null;
  let note: Row["note"] = null;
  if (p.profile.note !== null && p.options.length >= 2 && key !== null) {
    const n = await ask(noteRequest(input), key, fetchImpl);
    if (n !== null) {
      usage.inputTokens += n.inputTokens;
      const probs = noteProbabilities(n, judged);
      note = {
        probabilities: Object.fromEntries(judged.map((o, i) => [o.id, probs[i]])),
        picks: Object.fromEntries(
          thresholds().map((t) => {
            const allowed = optionsAllowedByNote(n, judged, t);
            const pick = pickTurn(p.options.filter((o) => allowed.some((a) => a.id === o.id)), p.profile, ctx);
            const id = pick === null ? null : pick.optionId;
            return [String(t), { optionId: id, verdict: verdictOf(s, id) }];
          }),
        ),
      };
    }
  }
  if (flag("--note-only")) {
    // the other two pickers are not asked
  } else if (p.options.length === 1) {
    // Nothing to judge: a lone turn is every picker's pick.
    choice = { optionId: p.options[0].id, confidence: null };
    score = choice;
  } else if (key !== null) {
    const [c, sc] = await Promise.all([ask(choiceRequest(input), key, fetchImpl), ask(scoreRequest(input), key, fetchImpl)]);
    usage.inputTokens += (c === null ? 0 : c.inputTokens) + (sc === null ? 0 : sc.inputTokens);
    choice = c === null ? null : pickFromChoice(c, judged);
    score = sc === null ? null : pickFromScores(sc, judged, rulesId);
  }
  const wrap = (id: string | null, confidence?: number | null): Picked => ({ optionId: id, verdict: verdictOf(s, id), ...(confidence === undefined ? {} : { confidence }) });
  return {
    scenario: s,
    summaries: Object.fromEntries(p.options.map((o) => [o.id, o.summary])),
    picks: {
      rules: wrap(rulesId),
      choice: wrap(choice === null ? null : choice.optionId, choice === null ? undefined : choice.confidence),
      score: wrap(score === null ? null : score.optionId, score === null ? undefined : score.confidence),
    },
    note,
  };
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]);
      }
    }),
  );
  return out;
}

// ── the report ──────────────────────────────────────────────────────────────────

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const VERDICTS: Verdict[] = ["good", "neither", "bad", "unanswered"];

function table(rows: Row[], pickers: Picker[]): string {
  const lines = [pad("picker", 10) + VERDICTS.map((v) => pad(v, 12)).join("")];
  for (const picker of pickers) {
    const counts = Object.fromEntries(VERDICTS.map((v) => [v, rows.filter((r) => r.picks[picker].verdict === v).length]));
    lines.push(pad(picker, 10) + VERDICTS.map((v) => pad(counts[v], 12)).join(""));
  }
  return lines.join("\n");
}

function disagreements(rows: Row[], pickers: Picker[]): string {
  const out: string[] = [];
  for (const r of rows) {
    const ids = pickers.map((p) => r.picks[p].optionId);
    if (new Set(ids).size <= 1) continue;
    out.push(`\n${r.scenario.id}: ${r.scenario.setup}`);
    for (const p of pickers) {
      const pick = r.picks[p];
      out.push(`  ${pad(p, 7)} ${pad(pick.verdict, 10)} ${pick.optionId === null ? "(no answer)" : `${pick.optionId} | ${r.summaries[pick.optionId]}`}`);
    }
    out.push(`  labels: good=[${r.scenario.good.join(", ")}] bad=[${r.scenario.bad.join(", ")}]`);
    out.push(`  why: ${r.scenario.why}`);
  }
  return out.length === 0 ? "(the pickers never disagree)" : out.join("\n");
}

function byTag(rows: Row[], pickers: Picker[]): string {
  const tags = [...new Set(rows.flatMap((r) => r.scenario.tags))].sort();
  const lines = [pad("tag", 20) + pad("n", 4) + pickers.map((p) => pad(`${p} good/bad`, 16)).join("")];
  for (const tag of tags) {
    const subset = rows.filter((r) => r.scenario.tags.includes(tag));
    lines.push(pad(tag, 20) + pad(subset.length, 4) + pickers.map((p) => pad(`${subset.filter((r) => r.picks[p].verdict === "good").length}/${subset.filter((r) => r.picks[p].verdict === "bad").length}`, 16)).join(""));
  }
  return lines.join("\n");
}

/** The veto column: a noted creature's rules pick over the allowed turns; everyone else's rules pick, by construction. */
function noteVetoPick(r: Row, t: string): Picked {
  return r.note === null ? r.picks.rules : r.note.picks[t];
}

function noteReport(rows: Row[]): string {
  const out: string[] = [];
  const ts = thresholds().map(String);
  const noted = rows.filter((r) => r.scenario.tags.includes("note"));
  const count = (list: Row[], pick: (r: Row) => Picked) => VERDICTS.map((v) => list.filter((r) => pick(r).verdict === v).length);
  const head = pad("column", 18) + VERDICTS.map((v) => pad(v, 12)).join("");
  for (const [title, list] of [["all scenarios", rows], [`the ${noted.length} noted scenarios`, noted]] as const) {
    out.push(`\nNote veto, ${title}:`, head, pad("rules", 18) + count(list, (r) => r.picks.rules).map((n) => pad(n, 12)).join(""));
    for (const t of ts) out.push(pad(`note-veto@${t}`, 18) + count(list, (r) => noteVetoPick(r, t)).map((n) => pad(n, 12)).join(""));
  }
  out.push("\nThe noted scenarios one by one (verdict: rules | veto per threshold):");
  for (const r of noted) {
    out.push(`  ${pad(r.scenario.id, 44)} rules ${pad(r.picks.rules.verdict, 8)} | ${ts.map((t) => `${t}: ${pad(noteVetoPick(r, t).verdict, 8)}`).join(" ")}`);
    if (r.note) out.push(`      chance against the note: ${Object.entries(r.note.probabilities).map(([id, p]) => `${id.replace("attack:actions:", "")}=${p === null ? "?" : p.toFixed(2)}`).join("  ")}`);
  }
  return out.join("\n");
}

function listOptions(): void {
  for (const s of SCENARIOS) {
    const p = prepare(s.fight);
    console.log(`\n## ${s.id} [${p.profile.tier}/${p.profile.role}/${p.profile.targets}]`);
    for (const o of p.options) console.log(`  ${o.id} | ${o.summary}`);
  }
}

async function main(): Promise<void> {
  if (flag("--options")) return listOptions();
  const dry = flag("--dry");
  const label = argOf("--label") ?? (dry ? "dry" : "run");
  const out = argOf("--out") ?? DEFAULT_OUT;
  const key = dry ? null : apiKey();
  const fetchImpl = countingFetch();

  const rows = await pool(SCENARIOS, CONCURRENCY, (s) => runOne(s, key, fetchImpl));
  const pickers = dry || flag("--note-only") ? (["rules"] as Picker[]) : PICKERS;

  console.log(`Tactics evaluation: ${rows.length} scenarios, wording ${TACTICS_WORDING}${dry ? " (dry: rules only, no API call)" : ""}\n`);
  console.log(table(rows, pickers));
  console.log("\nBy tag (good/bad):\n" + byTag(rows, pickers));
  if (!dry) console.log(noteReport(rows));
  if (!dry && !flag("--note-only")) {
    console.log("\nWhere the pickers disagree:" + disagreements(rows, pickers));
    console.log(`\nRequests ${usage.requests} (failed: ${usage.failures}); input tokens counted by the client ${usage.inputTokens}`);
    console.log(`Usage as the API reports it: ${JSON.stringify(usage.numbers)}`);
  }

  mkdirSync(out, { recursive: true });
  const file = join(out, `${label}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        label,
        wording: TACTICS_WORDING,
        noteWording: NOTE_WORDING,
        reversed: flag("--reverse"),
        thresholds: thresholds(),
        dry,
        at: new Date().toISOString(),
        usage: { requests: usage.requests, failures: usage.failures, inputTokens: usage.inputTokens, reported: usage.numbers },
        scenarios: rows.map((r) => ({ id: r.scenario.id, tags: r.scenario.tags, good: r.scenario.good, bad: r.scenario.bad, why: r.scenario.why, summaries: r.summaries, picks: r.picks, note: r.note })),
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${file}`);
}

main().catch((e: unknown) => {
  // An error here can only be ours: the key never reaches a message (see typesafe.ts).
  console.error(e instanceof Error ? e.message : "failed");
  process.exitCode = 1;
});
