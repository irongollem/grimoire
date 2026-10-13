import { CONDITIONS, EXHAUSTION } from "@/rules/conditions";
import type { AppliedCondition, ConditionEnds, OngoingDamage, TurnEdge } from "@/types/condition.types";
import { DAMAGE_TYPES } from "@/types/damage.types";
import type { SaveAbility } from "@/types/statBlock.types";

/**
 * The condition editor's fields, flat so they bind to inputs, and the two
 * conversions between them and an `AppliedCondition` (#1018). Kept out of the
 * component so the record a form produces is testable without mounting it.
 */
export interface ConditionForm {
  name: string;
  /** Exhaustion only; carried through an edit untouched. */
  level: number | undefined;
  /** "" for no source. */
  sourceId: string;
  spell: string;
  concentration: boolean;
  endsKind: "none" | "turn" | "rounds" | "save";
  turnAt: TurnEdge;
  turnOf: "self" | "source";
  rounds: number;
  saveAbility: SaveAbility;
  saveDc: number;
  saveAt: TurnEdge;
  /** A save end that also lapses after this many rounds (#1055); null for no cap. */
  saveCap: number | null;
  /** "" for no ongoing damage. */
  ongoingDice: string;
  /** "" for untyped. */
  ongoingType: string;
  ongoingAt: TurnEdge;
}

/** The form for an existing record, or an empty one for a new condition (null). */
export function conditionToForm(c: AppliedCondition | null): ConditionForm {
  const ends = c?.ends;
  return {
    name: c?.name ?? "",
    level: c?.level,
    sourceId: c?.source?.id ?? "",
    spell: c?.source?.spell ?? "",
    concentration: c?.source?.concentration ?? false,
    endsKind: ends ? ends.kind : "none",
    turnAt: ends?.kind === "turn" ? ends.at : "end",
    turnOf: ends?.kind === "turn" ? ends.of : "self",
    rounds: ends?.kind === "rounds" ? ends.remaining : 1,
    saveAbility: ends?.kind === "save" ? ends.ability : "wis",
    saveDc: ends?.kind === "save" ? ends.dc : 10,
    saveAt: ends?.kind === "save" ? ends.at : "end",
    saveCap: ends?.kind === "save" && ends.remaining !== undefined ? ends.remaining : null,
    ongoingDice: c?.ongoing?.dice ?? "",
    ongoingType: c?.ongoing?.type ?? "",
    ongoingAt: c?.ongoing?.at ?? "start",
  };
}

function endsFromForm(f: ConditionForm): ConditionEnds | undefined {
  switch (f.endsKind) {
    case "none":
      return undefined;
    case "turn":
      return { kind: "turn", at: f.turnAt, of: f.sourceId ? f.turnOf : "self" };
    case "rounds":
      return { kind: "rounds", remaining: Math.max(1, Math.floor(f.rounds)) };
    case "save":
      return {
        kind: "save",
        ability: f.saveAbility,
        dc: Math.max(1, Math.floor(f.saveDc)),
        at: f.saveAt,
        ...(typeof f.saveCap === "number" && Number.isFinite(f.saveCap) ? { remaining: Math.max(1, Math.floor(f.saveCap)) } : {}),
      };
  }
}

function ongoingFromForm(f: ConditionForm): OngoingDamage | undefined {
  const dice = f.ongoingDice.trim();
  if (!dice) return undefined;
  const type = DAMAGE_TYPES.find((t) => t === f.ongoingType) ?? null;
  return { dice, type, at: f.ongoingAt };
}

/**
 * A typed name that is one of the game's conditions takes its canonical
 * spelling: every rule matches by exact name, so a custom "prone" would grant
 * no advantage and sit beside a real "Prone" as a second record.
 */
function canonicalName(typed: string): string {
  const name = typed.trim();
  return CONDITIONS.find((c) => c.toLowerCase() === name.toLowerCase()) ?? name;
}

/** The record a form describes. Optional parts are left out, not set to empty values. */
export function buildCondition(f: ConditionForm): AppliedCondition {
  const record: AppliedCondition = { name: canonicalName(f.name) };
  // Exhaustion is read by its level; a record without one would count as level 0 and never show.
  const level = record.name === EXHAUSTION ? (f.level ?? 1) : f.level;
  if (level !== undefined) record.level = level;
  if (f.sourceId) {
    const spell = f.spell.trim();
    record.source = {
      id: f.sourceId,
      ...(spell ? { spell } : {}),
      ...(f.concentration ? { concentration: true } : {}),
    };
  }
  const ends = endsFromForm(f);
  if (ends) record.ends = ends;
  const ongoing = ongoingFromForm(f);
  if (ongoing) record.ongoing = ongoing;
  return record;
}
