import type { Background } from "@/types/background.types";
import { SKILLS, type SkillProficiencies } from "@/types/party.types";
import { canonicalToolName } from "@/rules/toolProficiency";

export interface ProfForm {
  skill_proficiencies: SkillProficiencies;
  tool_proficiencies: string[];
  languages: string[];
}

export interface BgRemovalState {
  prevBgName: string;
  skillKeys: (keyof SkillProficiencies)[];
  skillLabels: string[];
  tools: string[];
  languages: string[];
}

/** Add a background's proficiencies to a form — skips skills already ≥ proficient. */
export function applyBackgroundProfs(form: ProfForm, bg: Background): void {
  for (const skill of bg.skill_proficiencies ?? []) {
    const key = SKILLS.find((s) => s.label.toLowerCase() === skill.toLowerCase())?.key;
    if (key && (form.skill_proficiencies[key] ?? "none") === "none") {
      form.skill_proficiencies[key] = "proficient";
    }
  }
  // Canonicalise before pushing so a new character's tool_proficiencies stays
  // clean even when the background's own row is dirty (Open5e import prose,
  // homebrew free text). "Of your choice"/"no additional" prose names no real
  // tool and is dropped rather than stored as a literal, unusable string.
  for (const tool of bg.tool_proficiencies ?? []) {
    const canonical = canonicalToolName(tool);
    if (!canonical) continue;
    const alreadyPresent = form.tool_proficiencies.some(
      (existing) => canonicalToolName(existing)?.toLowerCase() === canonical.toLowerCase(),
    );
    if (!alreadyPresent) form.tool_proficiencies.push(canonical);
  }
  for (const lang of bg.languages ?? []) {
    if (!form.languages.includes(lang)) form.languages.push(lang);
  }
}

/**
 * Return which proficiencies from `oldBg` can safely be removed when swapping to `newBg`.
 * Only removes skills at exactly "proficient" level (not expertise — that likely came from class).
 * Returns null when nothing needs removal.
 */
export function computeRemovals(
  form: ProfForm,
  oldBg: Background,
  newBg: Background,
): BgRemovalState | null {
  const newBgSkills = new Set((newBg.skill_proficiencies ?? []).map((s) => s.toLowerCase()));
  const skillKeys: (keyof SkillProficiencies)[] = [];
  const skillLabels: string[] = [];

  for (const skill of oldBg.skill_proficiencies ?? []) {
    const def = SKILLS.find((s) => s.label.toLowerCase() === skill.toLowerCase());
    if (!def) continue;
    if (newBgSkills.has(skill.toLowerCase())) continue;
    if ((form.skill_proficiencies[def.key] ?? "none") !== "proficient") continue;
    skillKeys.push(def.key);
    skillLabels.push(def.label);
  }

  const tools = (oldBg.tool_proficiencies ?? []).filter(
    (t) => !(newBg.tool_proficiencies ?? []).includes(t) && form.tool_proficiencies.includes(t),
  );
  const languages = (oldBg.languages ?? []).filter(
    (l) => !(newBg.languages ?? []).includes(l) && form.languages.includes(l),
  );

  if (skillKeys.length === 0 && tools.length === 0 && languages.length === 0) return null;
  return { prevBgName: oldBg.name, skillKeys, skillLabels, tools, languages };
}

/** Apply a removal state to a form (called when user confirms removal). */
export function removeBackgroundProfs(form: ProfForm, state: BgRemovalState): void {
  for (const key of state.skillKeys) {
    form.skill_proficiencies[key] = "none";
  }
  for (const tool of state.tools) {
    const idx = form.tool_proficiencies.indexOf(tool);
    if (idx >= 0) form.tool_proficiencies.splice(idx, 1);
  }
  for (const lang of state.languages) {
    const idx = form.languages.indexOf(lang);
    if (idx >= 0) form.languages.splice(idx, 1);
  }
}
