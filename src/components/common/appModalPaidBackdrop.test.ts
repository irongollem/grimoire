import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A modal holding paid output must not dismiss on a backdrop click — see the
 * `backdropDismiss` docstring in AppModal.vue.
 *
 * Asserted structurally rather than per-dialog, for the same reason the
 * search_path suite covers every function instead of the important ones:
 * "no paid-output modal dismisses on a stray click" is a property a scan can
 * check, while "no important one does" is a judgement re-made per review, and
 * that is the kind of rule that quietly decays. Three separate surfaces had
 * each shipped without it — the Chronicler's recap, its scene illustration,
 * and the cartographer's styled map, the last of which is an in-memory blob
 * nothing reopens.
 */

const SRC = join(import.meta.dirname, "../..");

/**
 * What marks a component as holding paid output: it prices a generation, shows
 * the cost, or runs a generator. Deliberately broad — a false positive costs
 * one line of prop, a false negative costs a DM their credits.
 */
const PAID_MARKERS = [
  "useAiCredits",
  "GenerationCostBadge",
  /use[A-Z][A-Za-z]*Generation\b/,
  "useMiniForge",
  "useGroupPortrait",
];

/**
 * Deliberate exceptions, each with the reason. Add here only when the modal
 * genuinely cannot lose anything paid — not to quiet the test.
 */
const EXEMPT = new Map<string, string>();

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return vueFiles(full);
    return entry.name.endsWith(".vue") ? [full] : [];
  });
}

/** Every `<AppModal …>` opening tag in the source, attributes included. */
function appModalTags(source: string): string[] {
  return source.match(/<AppModal(?:\s[^>]*)?>/g) ?? [];
}

function isPaid(source: string): boolean {
  return PAID_MARKERS.some((m) => (typeof m === "string" ? source.includes(m) : m.test(source)));
}

describe("AppModal — paid output never dismisses on a backdrop click", () => {
  const offenders: string[] = [];
  const covered: string[] = [];

  for (const file of vueFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    const tags = appModalTags(source);
    if (!tags.length || !isPaid(source)) continue;

    const path = relative(SRC, file);
    if (EXEMPT.has(path)) continue;
    covered.push(path);

    const unguarded = tags.filter((tag) => !/:?backdrop-dismiss="false"/.test(tag));
    if (unguarded.length) offenders.push(`${path} — ${unguarded.length} of ${tags.length} <AppModal> tags`);
  }

  it("holds for every modal that prices, shows or runs a generation", () => {
    expect(
      offenders,
      'Add `:backdrop-dismiss="false"` to each listed <AppModal>, or add the file to EXEMPT ' +
        "in this test with the reason it cannot lose paid output.",
    ).toEqual([]);
  });

  it("is actually scanning something — a marker list that matches nothing proves nothing", () => {
    expect(covered.length).toBeGreaterThanOrEqual(3);
  });
});
