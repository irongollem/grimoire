/**
 * How well the Spell Level Advisor agrees with published spells.
 *
 *   npm run spells:advisor-check              the summary, and the worst misses
 *   npm run spells:advisor-check -- --all     every spell that fell outside its suggested range
 *
 * Reads the SRD spells of the local stack (never production: it only reads, and the local library is the same
 * content), turns each one's own fields into the advisor's inputs (`advisorInputsFromSpell`), and compares the
 * suggested range with the level the book gives. A spell whose fields say nothing the advisor can weigh (a buff,
 * utility) is left out, and so is one whose condition reading is "not simple". The advisor's weights are this
 * app's own (`ADVISOR_WEIGHTS`), and this is how they are judged: run it before and after changing one. The
 * condition readings must be in the local library first (`npm run spells:conditions -- apply ... --write`).
 */

import { parseArgs } from "node:util";
import { resolveServiceTarget, serviceHeaders } from "../lib/dev-stack.ts";
import { advisorInputsFromSpell, type AdvisorSpellFields } from "../../src/lib/spells/advisorInputsFromSpell.ts";
import { adviseLevelRange } from "../../src/lib/spells/spellAdvisor.ts";

interface Row extends AdvisorSpellFields {
  name: string;
  level: number;
  source: string;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { all: { type: "boolean", default: false } } });
  const target = resolveServiceTarget(false);
  const select = "name,level,source,damage_rolls,healing_dice,attack_type,save_effect,aoe_shape,aoe_size,duration,concentration,ritual,condition_effect";
  const response = await fetch(`${target.origin}/rest/v1/library_spells?select=${select}&source=in.(srd-2014,srd-2024)&order=level,name&limit=2000`, { headers: serviceHeaders(target) });
  if (!response.ok) throw new Error(`reading library_spells failed: ${response.status}`);
  const rows = (await response.json()) as Row[];

  const kinds = new Map<string, { n: number; inside: number; signed: number }>();
  const misses: Array<{ off: number; line: string }> = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.condition_effect?.verdict === "not_simple") {
      skipped++;
      continue;
    }
    const inputs = advisorInputsFromSpell(row);
    if (inputs === null) {
      skipped++;
      continue;
    }
    const result = adviseLevelRange(inputs);
    const tally = kinds.get(inputs.effectType) ?? { n: 0, inside: 0, signed: 0 };
    tally.n++;
    tally.signed += result.score - row.level;
    const inside = row.level >= result.suggestedMin && row.level <= result.suggestedMax;
    if (inside) tally.inside++;
    else misses.push({ off: result.score - row.level, line: `${row.name} (${row.source.slice(4)}): book ${row.level}, advisor ${result.suggestedMin}-${result.suggestedMax} (${result.score.toFixed(1)}) [${inputs.effectType} ${inputs.damageDice || inputs.effectIntensity}, ${inputs.targetingMode}, ${inputs.saveType}, ${inputs.durationTier}]` });
    kinds.set(inputs.effectType, tally);
  }

  let n = 0;
  let inside = 0;
  for (const [kind, t] of kinds) {
    n += t.n;
    inside += t.inside;
    console.log(`${kind.padEnd(8)} ${String(t.n).padStart(4)} spells, ${Math.round((100 * t.inside) / t.n)}% inside the range, average ${t.signed / t.n >= 0 ? "+" : ""}${(t.signed / t.n).toFixed(2)} levels off`);
  }
  console.log(`all      ${String(n).padStart(4)} spells, ${n === 0 ? 0 : Math.round((100 * inside) / n)}% inside the range; ${skipped} left out (nothing the advisor can weigh)`);
  misses.sort((a, b) => Math.abs(b.off) - Math.abs(a.off));
  for (const miss of values.all ? misses : misses.slice(0, 25)) console.log(`  ${miss.line}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
