#!/usr/bin/env tsx
/**
 * Imports a setting book's markdown stat blocks (`::: statblock` ... `:::`) as
 * monsters of one campaign (epic #1115), so the book can embed them and the DM can
 * run them. The parsing and the row shape live in `lib/statblockMarkdown.ts`.
 *
 * Usage:
 *   npm run import-statblocks -- --dry-run                      # local stack, writes nothing
 *   npm run import-statblocks                                   # write to the local stack
 *   npm run import-statblocks -- --dir <folder> --campaign-id <uuid> --user-id <uuid> --source "<book>"
 *   npm run import-statblocks -- --production --dry-run         # read production, write nothing
 *   npm run import-statblocks -- --production --yes-production  # write to production
 *
 * Idempotent by normalised name within the campaign: an existing monster of that name
 * has its stat block, type, size, alignment, ruleset and source replaced (its art,
 * tags and notes stay); anything else is inserted. Writes go through the service role
 * but name the campaign owner as `user_id`, and the script refuses a campaign that
 * owner does not own. The default target is the local stack and anything but
 * loopback is refused; production needs both --production and --yes-production.
 * Output never includes a key.
 */
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Target, resolveTarget } from "./stat-blocks/rows.ts";
import { DEFAULT_SOURCE, type MonsterRowFields, StatblockParseError, normalizeName, parseStatblockFile } from "./lib/statblockMarkdown.ts";

const DEFAULT_DIR = "~/Documents/Claude/Projects/Sothery Book I - manuscript/data/statblocks/";
const DEFAULT_CAMPAIGN = "f6220b21-bff2-4419-a8c1-3dd7d6fc371b";
const DEFAULT_OWNER = "fc8ae595-641f-4127-87ad-03588f3710d1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ExistingMonster {
  id: string;
  name: string;
}

type Outcome =
  | { file: string; name: string; action: "insert" | "update"; id?: string }
  | { file: string; name?: string; action: "skip"; reason: string };

function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

function headers(target: Target, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: target.key, Authorization: `Bearer ${target.key}`, ...extra };
}

/** Status only: a body could echo row content. */
async function request(target: Target, method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${target.origin}/rest/v1/${path}`, {
    method,
    headers: headers(target, { "Content-Type": "application/json", Prefer: "return=representation" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    // PostgREST error bodies carry a message, never row data; trim to the message.
    let message = `${response.status}`;
    try {
      const parsed = JSON.parse(detail) as { message?: string };
      if (parsed.message) message += ` ${parsed.message}`;
    } catch {
      // Not JSON: status alone.
    }
    throw new Error(`${method} ${path.split("?")[0]} failed (${message}).`);
  }
  return response.status === 204 ? null : response.json();
}

async function assertCampaignOwner(target: Target, campaignId: string, userId: string): Promise<void> {
  const rows = (await request(target, "GET", `campaigns?id=eq.${campaignId}&select=id,user_id`)) as { id: string; user_id: string }[];
  if (rows.length === 0) throw new Error(`Campaign ${campaignId} does not exist on ${target.label}.`);
  if (rows[0].user_id !== userId) throw new Error(`Campaign ${campaignId} is not owned by ${userId} on ${target.label}.`);
}

async function existingMonsters(target: Target, campaignId: string): Promise<Map<string, ExistingMonster[]>> {
  const byName = new Map<string, ExistingMonster[]>();
  const rows = (await request(target, "GET", `monsters?campaign_id=eq.${campaignId}&select=id,name&limit=1000`)) as ExistingMonster[];
  for (const row of rows) {
    const key = normalizeName(row.name);
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return byName;
}

function updatePayload(row: MonsterRowFields): Record<string, unknown> {
  return {
    stat_block: row.stat_block,
    monster_type: row.monster_type,
    size: row.size,
    alignment: row.alignment,
    ruleset: row.ruleset,
    source: row.source,
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

function printSummary(outcomes: Outcome[], dryRun: boolean): void {
  const count = (action: Outcome["action"]) => outcomes.filter((o) => o.action === action).length;
  for (const o of outcomes) {
    if (o.action === "skip") console.log(`  ${"skip".padEnd(13)} ${o.file}: ${o.reason}`);
    else {
      const label = dryRun ? `would ${o.action}` : o.action === "insert" ? "inserted" : "updated";
      console.log(`  ${label.padEnd(13)} ${o.file}: ${o.name}`);
    }
  }
  const parsed = outcomes.filter((o) => o.action !== "skip" || o.name !== undefined).length;
  console.log(
    `\nFiles ${outcomes.length}, parsed ${parsed}, ${dryRun ? "to insert" : "inserted"} ${count("insert")}, ` +
      `${dryRun ? "to update" : "updated"} ${count("update")}, skipped ${count("skip")}.${dryRun ? " Dry run: nothing written." : ""}`,
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: DEFAULT_DIR },
      "campaign-id": { type: "string", default: DEFAULT_CAMPAIGN },
      "user-id": { type: "string", default: DEFAULT_OWNER },
      source: { type: "string", default: DEFAULT_SOURCE },
      "dry-run": { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
    },
  });
  const dryRun = values["dry-run"];
  const campaignId = values["campaign-id"];
  const userId = values["user-id"];
  if (!UUID.test(campaignId) || !UUID.test(userId)) throw new Error("--campaign-id and --user-id must be UUIDs.");
  if (values.production && !dryRun && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production (use --production --yes-production, or --dry-run).");
  }

  const dir = resolve(expandHome(values.dir));
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) throw new Error(`No .md files in ${dir}.`);

  // resolveTarget refuses anything but loopback unless --production is given.
  const target = resolveTarget(values.production);
  console.log(`${dryRun ? "Planning for" : "Writing to"} ${target.label}, campaign ${campaignId}, ${files.length} file(s) in ${dir}.`);
  await assertCampaignOwner(target, campaignId, userId);
  const existing = await existingMonsters(target, campaignId);
  const seen = new Set<string>();
  const outcomes: Outcome[] = [];
  let failed = 0;

  for (const file of files) {
    let row: MonsterRowFields;
    try {
      row = parseStatblockFile(readFileSync(join(dir, file), "utf8"), values.source);
    } catch (error) {
      if (!(error instanceof StatblockParseError)) throw error;
      outcomes.push({ file, action: "skip", reason: error.message });
      continue;
    }
    const key = normalizeName(row.name);
    if (seen.has(key)) {
      outcomes.push({ file, name: row.name, action: "skip", reason: "another file already defines this name" });
      continue;
    }
    seen.add(key);

    const matches = existing.get(key) ?? [];
    if (matches.length > 1) {
      outcomes.push({ file, name: row.name, action: "skip", reason: `${matches.length} monsters in the campaign share this name` });
      continue;
    }
    const match = matches[0];
    if (dryRun) {
      outcomes.push({ file, name: row.name, action: match ? "update" : "insert", id: match?.id });
      continue;
    }
    try {
      if (match) {
        await request(target, "PATCH", `monsters?id=eq.${match.id}&campaign_id=eq.${campaignId}`, updatePayload(row));
        outcomes.push({ file, name: row.name, action: "update", id: match.id });
      } else {
        const { stat_block, name, monster_type, size, alignment, tags, ruleset, source, notes } = row;
        const created = (await request(target, "POST", "monsters", {
          user_id: userId,
          campaign_id: campaignId,
          name,
          monster_type,
          size,
          alignment,
          tags,
          ruleset,
          source,
          notes,
          stat_block,
        })) as { id: string }[];
        outcomes.push({ file, name: row.name, action: "insert", id: created[0]?.id });
      }
    } catch (error) {
      failed++;
      outcomes.push({ file, name: row.name, action: "skip", reason: error instanceof Error ? error.message : "write failed" });
    }
  }

  printSummary(outcomes, dryRun);
  if (failed > 0) {
    console.error(`${failed} write(s) failed.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected failure.");
  process.exit(1);
});
