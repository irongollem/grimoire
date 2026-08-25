#!/usr/bin/env -S npx tsx --tsconfig tsconfig.node.json

import { parseArgs } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PackCategory, TilePackManifest } from "../src/cartographer/packSchema.ts";
import type { GenerationAttempt, ImageGenerationQuality } from "../src/cartographer/authoringPlan.ts";
import {
  defaultArtBible,
  importJob,
  initWorkspace,
  loadWorkspace,
  rebuildPlan,
  rejectJob,
  schemaSummary,
  workspacePath,
} from "./cartographer-pack/workspace.ts";
import { generateQa, validateAuthoredPack } from "./cartographer-pack/qa.ts";

const HELP = `Cartographer tile-pack authoring

Usage:
  npm run cartographer:pack -- init --id <id> --name <name> --theme <description> [options]
  npm run cartographer:pack -- plan --workspace <path> [--slot <category:variant> ...]
  npm run cartographer:pack -- import --workspace <path> --slot <id> --source <image> [options]
  npm run cartographer:pack -- reject --workspace <path> --slot <id> --reason <text>
  npm run cartographer:pack -- validate --workspace <path>
  npm run cartographer:pack -- qa --workspace <path>
  npm run cartographer:pack -- status --workspace <path>

init options:
  --version <n>                 Pack version (default: 1)
  --output <path>               Workspace (default: art-src/cartographer/<id>/v<n>)
  --medium <text>               Visual medium
  --style-note <text>           Repeatable rendering note
  --material-note <text>        Repeatable compatible world motif/material
  --palette-note <text>         Repeatable tone/palette note
  --palette <category=#rrggbb>  Repeatable runtime placeholder palette entry
  --reference <path>            Repeatable user/style reference path
  --campaign-context <text>     Stored as provenance; never appended wholesale to jobs
  --consistency <mode>          adaptive | match-campaign | independent

import provenance options:
  --provider <name>             Provider used for this accepted candidate
  --model <name>                Model used (normally gpt-image-2)
  --quality <tier>              low | medium | high | auto (normally low)
  --request-id <id>             Provider request id for later traceability
  --input-text-tokens <n>       Reported or estimated text-input tokens
  --input-image-tokens <n>      Reported or estimated image-input tokens
  --output-image-tokens <n>     Reported or estimated image-output tokens
  --estimated-cost-usd <n>      Estimated candidate cost in US dollars
  --duration-ms <n>             Candidate generation duration in milliseconds

The default workflow only prepares/imports interactive $imagegen jobs. It never reads
OPENAI_API_KEY and contains no Images API runner. Jobs use gpt-image-2 low as the
production hint; a candidate that passes QA is final, with quality escalation manual.`;

function requireString(values: Record<string, unknown>, name: string): string {
  const value = values[name];
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string" && value[0].trim()) return value[0];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required --${name}`);
  return value;
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function optionalNonNegativeNumber(values: Record<string, unknown>, name: string): number | undefined {
  const raw = values[name];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !raw.trim()) throw new Error(`--${name} must be a non-negative number`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number`);
  return value;
}

function importExecution(values: Record<string, unknown>): GenerationAttempt["execution"] | undefined {
  const quality = typeof values.quality === "string" ? values.quality : undefined;
  if (quality && !(["low", "medium", "high", "auto"] as const).includes(quality as ImageGenerationQuality)) {
    throw new Error("--quality must be low, medium, high, or auto");
  }
  const execution: NonNullable<GenerationAttempt["execution"]> = {
    ...(typeof values.provider === "string" ? { provider: values.provider } : {}),
    ...(typeof values.model === "string" ? { model: values.model } : {}),
    ...(quality ? { quality: quality as ImageGenerationQuality } : {}),
    ...(typeof values["request-id"] === "string" ? { request_id: values["request-id"] } : {}),
  };
  for (const [option, field] of [
    ["input-text-tokens", "input_text_tokens"],
    ["input-image-tokens", "input_image_tokens"],
    ["output-image-tokens", "output_image_tokens"],
    ["estimated-cost-usd", "estimated_cost_usd"],
    ["duration-ms", "duration_ms"],
  ] as const) {
    const value = optionalNonNegativeNumber(values, option);
    if (value !== undefined) execution[field] = value;
  }
  return Object.keys(execution).length ? execution : undefined;
}

function parsePalette(entries: string[]): TilePackManifest["palette"] | undefined {
  if (!entries.length) return undefined;
  const palette: NonNullable<TilePackManifest["palette"]> = {};
  for (const entry of entries) {
    const match = /^([^=]+)=#?([0-9a-f]{6})$/i.exec(entry);
    if (!match) throw new Error(`Invalid --palette ${entry}; expected category=#rrggbb`);
    const category = match[1] as PackCategory;
    const hex = match[2]!;
    palette[category] = [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
  }
  return palette;
}

function counts(statuses: string[]): string {
  const tally = new Map<string, number>();
  for (const status of statuses) tally.set(status, (tally.get(status) ?? 0) + 1);
  return [...tally].map(([status, count]) => `${status}: ${count}`).join(", ");
}

export async function run(argv = process.argv.slice(2), repoRoot = process.cwd()): Promise<number> {
  const command = argv[0];
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return 0;
  }
  const { values } = parseArgs({
    args: argv.slice(1),
    strict: true,
    allowPositionals: false,
    options: {
      id: { type: "string" },
      name: { type: "string" },
      theme: { type: "string" },
      version: { type: "string" },
      output: { type: "string" },
      workspace: { type: "string" },
      medium: { type: "string" },
      "style-note": { type: "string", multiple: true },
      "material-note": { type: "string", multiple: true },
      "palette-note": { type: "string", multiple: true },
      palette: { type: "string", multiple: true },
      reference: { type: "string", multiple: true },
      "campaign-context": { type: "string" },
      consistency: { type: "string" },
      slot: { type: "string", multiple: true },
      source: { type: "string" },
      note: { type: "string" },
      reason: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      quality: { type: "string" },
      "request-id": { type: "string" },
      "input-text-tokens": { type: "string" },
      "input-image-tokens": { type: "string" },
      "output-image-tokens": { type: "string" },
      "estimated-cost-usd": { type: "string" },
      "duration-ms": { type: "string" },
    },
  });

  if (command === "init") {
    const id = requireString(values, "id");
    const version = Number.parseInt(typeof values.version === "string" ? values.version : "1", 10);
    if (!Number.isInteger(version) || version < 1) throw new Error("--version must be a positive integer");
    const consistency = typeof values.consistency === "string" ? values.consistency : "adaptive";
    if (!(["adaptive", "match-campaign", "independent"] as const).includes(consistency as "adaptive")) {
      throw new Error("--consistency must be adaptive, match-campaign, or independent");
    }
    const theme = requireString(values, "theme");
    const root = path.resolve(repoRoot, typeof values.output === "string" ? values.output : workspacePath(repoRoot, id, version));
    const artBible = defaultArtBible({
      theme,
      medium: typeof values.medium === "string" ? values.medium : undefined,
      styleNotes: strings(values["style-note"]),
      materialNotes: strings(values["material-note"]),
      paletteNotes: strings(values["palette-note"]),
      campaignContext: typeof values["campaign-context"] === "string" ? values["campaign-context"] : undefined,
      consistency: consistency as "adaptive" | "match-campaign" | "independent",
    });
    const state = await initWorkspace({
      repoRoot,
      workspaceRoot: root,
      packId: id,
      name: requireString(values, "name"),
      theme,
      packVersion: version,
      artBible,
      palette: parsePalette(strings(values.palette)),
      references: strings(values.reference),
    });
    console.log(`Initialised ${state.plan.pack.name} at ${state.root}`);
    console.log(`${state.plan.jobs.length} jobs from ${schemaSummary()}`);
    return 0;
  }

  const root = path.resolve(repoRoot, requireString(values, "workspace"));
  if (command === "plan") {
    const state = await rebuildPlan(root, strings(values.slot));
    console.log(`Plan contains ${state.plan.jobs.length} jobs (${counts(state.plan.jobs.map((job) => job.status))})`);
    return 0;
  }
  if (command === "import") {
    const execution = importExecution(values);
    const state = await importJob({
      repoRoot,
      workspaceRoot: root,
      jobId: requireString(values, "slot"),
      source: requireString(values, "source"),
      ...(typeof values.note === "string" ? { note: values.note } : {}),
      ...(execution ? { execution } : {}),
    });
    console.log(`Imported ${requireString(values, "slot")} (${counts(state.plan.jobs.map((job) => job.status))})`);
    return 0;
  }
  if (command === "reject") {
    await rejectJob(root, requireString(values, "slot"), requireString(values, "reason"));
    console.log(`Rejected ${requireString(values, "slot")}; rerun/import that slot independently.`);
    return 0;
  }
  const state = await loadWorkspace(root);
  const failedJobs = state.plan.jobs.filter((job) => job.status === "failed").map((job) => job.id);
  if (command === "validate") {
    const report = await validateAuthoredPack({ repoRoot, manifest: state.manifest, failedJobs });
    console.log(JSON.stringify(report, null, 2));
    return report.valid ? 0 : 1;
  }
  if (command === "qa") {
    const report = await generateQa({ repoRoot, workspaceRoot: root, manifest: state.manifest, failedJobs });
    console.log(`QA written to ${path.join(root, "qa")} — ${report.valid ? "valid" : "not yet valid"}`);
    return report.valid ? 0 : 1;
  }
  if (command === "status") {
    console.log(`${state.plan.pack.name}: ${counts(state.plan.jobs.map((job) => job.status))}`);
    console.log(`Manifest: ${state.manifest.pack_id}/v${state.manifest.pack_version}; ${schemaSummary()}`);
    return 0;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
