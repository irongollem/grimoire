/**
 * The prose check (#1017). Whoever produced a structure (the parser, an agent, an
 * Open5e import), every number and word it claims must appear in the entry's own
 * text, or it is rejected. Strict on purpose: a rejected structure costs a roll
 * button, an accepted wrong one costs a wrong roll.
 */
import type { ActionOption, ActionStructure, AttackStructure, DamagePart, SaveStructure } from "../../types/statBlock.types.ts";
import { SRD_CONDITION_NAMES } from "../../types/statBlock.types.ts";
import { entryMatchText, normalizeForMatch } from "./proseText.ts";
import { ABILITY_NAMES, CONDITION_STEMS } from "./vocab.ts";

export type CheckResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): CheckResult => ({ ok: false, reason });

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkDamage(parts: DamagePart[], where: string, text: string, squashed: string): string | null {
  for (const part of parts) {
    if (/^\d+$/.test(part.dice)) {
      if (!new RegExp(`(?<![\\d.])${part.dice}\\s+(?:[a-z]+\\s+)?damage\\b`, "i").test(text)) {
        return `${where} damage ${part.dice} not in the prose`;
      }
    } else if (!new RegExp(`(?<![\\w])${escapeRe(part.dice)}(?![\\d]|[+-]\\d)`, "i").test(squashed)) {
      return `${where} damage ${part.dice} not in the prose`;
    }
    if (part.type !== null && !new RegExp(`\\b${part.type}\\b`, "i").test(text)) {
      return `${where} damage type ${part.type} not in the prose`;
    }
  }
  return null;
}

/** Check an attack and/or save against `body` (the prose they claim to come from). */
function checkRolls(
  attack: AttackStructure | undefined,
  save: SaveStructure | undefined,
  name: string,
  body: string,
): string | null {
  const text = `${name} ${body}`;
  // Dice are compared with the spaces around "+" and "-" closed up: "2d6 + 3" is "2d6+3".
  const squashed = text.replace(/\s*([+-])\s*/g, "$1");
  if (attack) {
    const sign = attack.bonus < 0 ? "-" : "+";
    if (!new RegExp(`(?<![\\w])${escapeRe(sign)}\\s?${Math.abs(attack.bonus)}(?!\\d)`).test(body)) {
      return `attack bonus ${sign}${Math.abs(attack.bonus)} not in the prose`;
    }
    const words = attack.delivery === "melee_or_ranged" ? ["melee", "ranged"] : [attack.delivery];
    for (const w of words) if (!new RegExp(`\\b${w}\\b`, "i").test(body)) return `delivery ${w} not in the prose`;
    const bad = checkDamage(attack.hit, "hit", text, squashed);
    if (bad) return bad;
  }

  if (save) {
    if (!new RegExp(`\\bDC\\s*${save.dc}(?!\\d)`, "i").test(body)) return `save DC ${save.dc} not in the prose`;
    const full = ABILITY_NAMES[save.ability];
    if (!new RegExp(`\\b(?:${full}|${save.ability})\\b`, "i").test(body)) return `save ability ${full} not in the prose`;
    const bad = checkDamage(save.fail, "save", text, squashed);
    if (bad) return bad;
    for (const c of save.conditions) {
      if (!SRD_CONDITION_NAMES.includes(c) || !CONDITION_STEMS[c].test(body)) return `condition ${c} not in the prose`;
    }
  }

  return null;
}

/** Each option's name must be in the prose, and its numbers in the stretch of prose that follows that name. */
function checkOptions(options: ActionOption[], body: string): string | null {
  // The name as a heading ("Pull." / "Pull:" / "Tentacle Melee Weapon Attack:"), not the same word in running prose.
  const starts = options.map((o) => {
    const heading = new RegExp(`(?<![A-Za-z])${escapeRe(o.name.trim())}(?=\\s*[.:]|\\s+(?:Target\\s*:|Melee\\b|Ranged\\b))`, "i").exec(body);
    return heading ? heading.index : -1;
  });
  for (let i = 0; i < options.length; i++) {
    if (starts[i] < 0) return `option ${options[i].name} not in the prose`;
  }
  const order = [...starts].sort((a, b) => a - b);
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (o.kind === "attack" && !o.attack) return `option ${o.name} is an attack without attack`;
    if (o.kind === "save" && !o.save) return `option ${o.name} is a save without save`;
    if (o.kind === "save" && o.attack) return `option ${o.name} is a save with an attack`;
    const next = order.find((x) => x > starts[i]);
    const segment = body.slice(starts[i], next ?? body.length);
    const bad = checkRolls(o.attack, o.save, o.name, segment);
    if (bad) return `option ${o.name}: ${bad}`;
  }
  return null;
}

export function checkActionAgainstProse(
  entry: { name: string; description: string },
  structure: ActionStructure,
  siblings: string[],
): CheckResult {
  const body = entryMatchText(entry.description);
  const text = `${normalizeForMatch(entry.name)} ${body}`;

  if (structure.review !== undefined && structure.kind !== "other") return fail("review on a non-other kind");
  if (structure.kind === "attack" && !structure.attack) return fail("attack kind without attack");
  if (structure.kind === "save" && !structure.save) return fail("save kind without save");
  if (structure.kind === "multiattack" && !structure.multiattack) return fail("multiattack kind without steps");

  const rolls = checkRolls(structure.attack, structure.save, normalizeForMatch(entry.name), body);
  if (rolls) return fail(rolls);

  if (structure.kind === "options" || structure.options) {
    const options = structure.options;
    if (structure.kind !== "options" || !options || options.length < 2) return fail("options need kind options and two or more");
    const bad = checkOptions(options, body);
    if (bad) return fail(bad);
  }

  if (structure.recharge) {
    const { min, max } = structure.recharge;
    if (!/\brecharge/i.test(text) || !new RegExp(`(?<!\\d)${min}(?!\\d)`).test(text) || !new RegExp(`(?<!\\d)${max}(?!\\d)`).test(text)) {
      return fail(`recharge ${min}-${max} not in the prose`);
    }
  }
  if (structure.uses) {
    const { count, per } = structure.uses;
    const word = per === "day" ? /\bday\b/i : /\brest\b/i;
    if (!new RegExp(`(?<!\\d)${count}(?!\\d)`).test(text) && !(count === 1 && /\brecharges? after\b|\bonce\b/i.test(text))) {
      return fail(`uses ${count} not in the prose`);
    }
    if (!word.test(text)) return fail(`uses period ${per} not in the prose`);
  }
  if (structure.legendary_cost !== undefined && structure.legendary_cost > 1) {
    if (!new RegExp(
        `\\bcosts?\\s+${structure.legendary_cost}\\s+actions?|\\(${structure.legendary_cost}\\s+actions?\\b|\\(${structure.legendary_cost}\\)`,
        "i",
      ).test(text)) {
      return fail(`legendary cost ${structure.legendary_cost} not in the prose`);
    }
  }
  if (structure.multiattack) {
    const printed = new Set(siblings.map((s) => s.trim().toLowerCase()));
    for (const step of structure.multiattack) {
      if (!printed.has(step.action.trim().toLowerCase())) return fail(`multiattack step ${step.action} is not an entry`);
      if (!Number.isInteger(step.count) || step.count < 1) return fail(`multiattack step ${step.action} has a bad count`);
    }
  }
  if (structure.review !== undefined && structure.kind !== "other") return fail("review on a non-other kind");
  return { ok: true };
}
