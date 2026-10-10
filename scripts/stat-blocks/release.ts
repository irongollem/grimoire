#!/usr/bin/env tsx
/**
 * The #1017 production release, as two guarded stages, so no step can be done
 * out of order or half done (the maintainer asked for a script that prevents
 * human error rather than a checklist).
 *
 *   npm run stat-blocks:release -- before-merge
 *     1. Reads production and reports what would change (nothing is written).
 *     2. Asks for a typed confirmation, then writes `structured` + `defenses`
 *        into every stat block, additively: the four old strings stay, so the
 *        client that is live keeps working.
 *     3. Re-reads production and checks every row against the contract
 *        migration's own refusal rule (`contractBlocker`). It ends with
 *        SAFE TO MERGE or DO NOT MERGE; merge the PR only after the first.
 *
 *   npm run stat-blocks:release -- after-merge
 *     1. Confirms the contract migration ran (it strips the old strings from
 *        every row that is safe to strip, so a passing row with strings left
 *        means it has not).
 *     2. Converts any straggler: a monster the old client saved between the
 *        first stage and the deploy, which the migration left alone.
 *     3. Re-seeds the SRD library from Open5e (dry run first, then a typed
 *        confirmation), which puts back the "(Costs 2 Actions)" Open5e strips
 *        from SRD legendary names, and confirms the costs are back.
 *
 * Counts only, never row content: user tables hold real accounts' rows.
 */
import { spawnSync } from "node:child_process";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import {
  type BlockerCount,
  TABLES,
  type Table,
  type Target,
  convertStragglers,
  countBlockers,
  loadExtractions,
  print,
  processTable,
  readRows,
  resolveTarget,
} from "./rows.ts";

function banner(text: string): void {
  const line = "=".repeat(Math.max(text.length, 40));
  console.log(`\n${line}\n${text}\n${line}`);
}

async function confirm(question: string, phrase: string): Promise<boolean> {
  // A piped "yes" must not be able to approve a production write.
  if (!stdin.isTTY) throw new Error("Run this in a terminal: it asks you to type a confirmation.");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`\n${question}\nType exactly "${phrase}" to continue, anything else to stop: `);
    return answer.trim() === phrase;
  } finally {
    rl.close();
  }
}

async function blockersEverywhere(target: Target): Promise<Map<Table, BlockerCount>> {
  const counts = new Map<Table, BlockerCount>();
  for (const table of TABLES) counts.set(table, await countBlockers(target, table));
  return counts;
}

function printBlockers(counts: Map<Table, BlockerCount>): { blocked: number; legacy: number; notStripped: number } {
  let blocked = 0;
  let legacy = 0;
  let notStripped = 0;
  for (const [table, c] of counts) {
    console.log(
      `  ${table.padEnd(18)} rows ${String(c.total).padStart(5)}   not structured ${c.unstructured}   text without defenses ${c.textWithoutDefenses}   still carrying old strings ${c.withLegacyStrings}`,
    );
    blocked += c.unstructured + c.textWithoutDefenses;
    legacy += c.withLegacyStrings;
    notStripped += c.passingWithLegacyStrings;
  }
  return { blocked, legacy, notStripped };
}

async function beforeMerge(target: Target): Promise<number> {
  banner(`Step 1 of the #1017 release: ${new URL(target.origin).host}`);
  console.log("Reading production. Nothing is written in this part.");
  const extractions = loadExtractions();
  let toWrite = 0;
  for (const table of TABLES) {
    const tally = await processTable(target, table, false, extractions);
    print(table, tally, false);
    toWrite += tally.toWrite;
  }

  console.log("\nWhat the contract migration would say right now:");
  const before = printBlockers(await blockersEverywhere(target));
  if (toWrite === 0 && before.blocked === 0) {
    banner("SAFE TO MERGE. Step 1 is already done; nothing needs writing.");
    printNextSteps();
    return 0;
  }

  const go = await confirm(
    `This writes ${toWrite} stat block(s) in production. It only ADDS structured actions and typed defenses; the old strings stay, so the live app keeps working.`,
    "write production",
  );
  if (!go) {
    console.log("\nStopped. Nothing was written.");
    return 1;
  }

  for (let pass = 1; pass <= 2; pass++) {
    console.log(pass === 1 ? "\nWriting." : "\nSome writes failed; trying those rows once more (finished rows are skipped).");
    let failed = 0;
    for (const table of TABLES) {
      const tally = await processTable(target, table, true, extractions);
      print(table, tally, true);
      failed += tally.failed;
    }
    if (failed === 0) break;
  }

  console.log("\nChecking every row against the contract migration's rule:");
  const after = printBlockers(await blockersEverywhere(target));
  if (after.blocked > 0) {
    banner("DO NOT MERGE. Some rows would still make the contract migration refuse.");
    console.log("Run this command again (it only touches rows that still need it). If the count does not reach 0, stop and tell Claude.");
    return 1;
  }
  banner("SAFE TO MERGE. Every stat block in production is structured.");
  printNextSteps();
  return 0;
}

function printNextSteps(): void {
  console.log(`
Next:
  1. Merge the #1017 pull request now. Do NOT run the library seed before it is merged and deployed.
  2. Wait for the release workflow to finish (it applies the migrations and deploys the app).
  3. Straight away run:  npm run stat-blocks:release -- after-merge
     (a monster someone saves on the old app in between is converted there).`);
}

/** Legendary entries whose name carries a cost above 1, in the SRD rows. */
async function srdLegendaryCosts(target: Target): Promise<number> {
  const rows = await readRows(target, "library_monsters");
  let costly = 0;
  for (const row of rows) {
    if (!row.id.startsWith("srd_")) continue;
    const block = row.stat_block as { legendary_actions?: Array<{ structured?: { legendary_cost?: number } }> } | null;
    for (const entry of block?.legendary_actions ?? []) {
      if ((entry.structured?.legendary_cost ?? 1) > 1) costly++;
    }
  }
  return costly;
}

function runSeed(args: string[]): boolean {
  const result = spawnSync("npm", ["run", "seed-library-monsters", "--", ...args], { stdio: "inherit" });
  return result.status === 0;
}

async function afterMerge(target: Target): Promise<number> {
  banner(`After the #1017 merge: ${new URL(target.origin).host}`);
  console.log("Checking the contract migration ran:");
  const state = printBlockers(await blockersEverywhere(target));
  if (state.notStripped > 0) {
    banner("NOT YET. The contract migration has not run (rows it would strip still carry old strings).");
    console.log("Check that the PR is merged and the release workflow's database job is green, then run this again.");
    return 1;
  }

  if (state.blocked > 0) {
    const go = await confirm(
      `${state.blocked} stat block(s) were saved on the old app after the first stage, so the migration left them alone. They will be structured now, and their old strings dropped like everyone else's.`,
      "convert stragglers",
    );
    if (!go) {
      console.log("\nStopped. Those rows will not render in the new app until this runs. Run this command again.");
      return 1;
    }
    const extractions = loadExtractions();
    for (const table of TABLES) {
      const r = await convertStragglers(target, table, extractions);
      if (r.found > 0) console.log(`  ${table.padEnd(18)} found ${r.found}   converted ${r.written}   failed ${r.failed}`);
    }
    console.log("\nChecking again:");
    const again = printBlockers(await blockersEverywhere(target));
    if (again.blocked > 0 || again.legacy > 0) {
      banner("STOP. Some rows are still not converted. Run this command again; if the count does not reach 0, tell Claude.");
      return 1;
    }
  }

  console.log("\nEvery stat block is converted. Next: re-seed the SRD library from Open5e.");
  console.log("First a dry run (fetches and maps, writes nothing):\n");
  if (!runSeed(["--dry-run"])) {
    banner("The dry run failed. Nothing was written. Tell Claude what it printed.");
    return 1;
  }
  const go = await confirm(
    "The dry run above is what the seed will write to the SRD library rows (srd-2014 and srd-2024 only; art, descriptions and agent-extracted actions are kept).",
    "seed srd",
  );
  if (!go) {
    console.log("\nStopped. Nothing was written. Run this command again when ready.");
    return 1;
  }
  if (!runSeed([])) {
    banner("The seed failed partway. Run this command again; it is safe to repeat.");
    return 1;
  }
  const costly = await srdLegendaryCosts(target);
  if (costly === 0) {
    banner("The seed ran, but no SRD legendary action costs more than 1. Tell Claude.");
    return 1;
  }
  banner(`DONE. ${costly} SRD legendary actions have their cost back. Tell Claude: it runs the security advisors and closes #1017.`);
  return 0;
}

async function main(): Promise<void> {
  const stage = process.argv[2];
  if (stage !== "before-merge" && stage !== "after-merge") {
    throw new Error('Say which stage: npm run stat-blocks:release -- before-merge   (or: -- after-merge)');
  }
  const target = resolveTarget(true);
  process.exitCode = stage === "before-merge" ? await beforeMerge(target) : await afterMerge(target);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected failure.");
  process.exit(1);
});
