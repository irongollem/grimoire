// The fight as the client describes it, read defensively: the snapshot is client-controlled, so a malformed one loses
// the fields it got wrong instead of throwing (it used to throw after the credit hold was taken, #1234).

/**
 * The state of the fight, as the runner sees it.
 *
 * Sent by the client rather than read from `encounter_state` server-side, and
 * that is deliberate: the runner's store is the live truth, while the DB row
 * lags behind it by up to a 300 ms debounce (useEncounterLive.schedulePush) —
 * and a DM who has not gone live at all has no row whatsoever. Trusting the
 * client here costs nothing: this is the DM's own encounter, the snapshot
 * grants no privilege, and the only thing it influences is the flavour of a
 * proposal they must then approve.
 */
export interface EncounterSnapshot {
  name?: string;
  round?: number;
  factions?: string[];
  combatants?: { name: string; faction: string; hp_pct: number; is_player: boolean }[];
}

const MAX_SNAPSHOT_COMBATANTS = 30;

/**
 * The snapshot is client-controlled, so its shape is untrusted: a `null`, a string for `combatants` or a combatant
 * without a name must cost a dropped field, never a throw while the prompt is built. Whatever survives is the
 * well-typed `EncounterSnapshot` the rest of this file reads.
 */
export function parseSnapshot(raw: unknown): EncounterSnapshot {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const snapshot: EncounterSnapshot = {};
  if (typeof r.name === "string") snapshot.name = r.name;
  if (typeof r.round === "number" && Number.isFinite(r.round)) snapshot.round = r.round;
  if (Array.isArray(r.factions)) snapshot.factions = r.factions.filter((f): f is string => typeof f === "string");
  if (Array.isArray(r.combatants)) {
    snapshot.combatants = r.combatants.flatMap((c: unknown) => {
      if (c === null || typeof c !== "object") return [];
      const o = c as Record<string, unknown>;
      if (typeof o.name !== "string" || typeof o.faction !== "string") return [];
      const hp_pct = typeof o.hp_pct === "number" ? o.hp_pct : NaN;
      return [{ name: o.name, faction: o.faction, hp_pct, is_player: o.is_player === true }];
    });
  }
  return snapshot;
}

export function formatSnapshot(snapshot: EncounterSnapshot): string {
  const lines: string[] = [];
  if (snapshot.name) lines.push(`Encounter: ${snapshot.name}`);
  if (typeof snapshot.round === "number") lines.push(`Current round: ${snapshot.round}`);
  if (snapshot.factions?.length) lines.push(`Sides: ${snapshot.factions.join(", ")}`);

  const combatants = (snapshot.combatants ?? []).slice(0, MAX_SNAPSHOT_COMBATANTS);
  if (combatants.length > 0) {
    lines.push("On the board (name | side | remaining HP):");
    for (const c of combatants) {
      const pct = Number.isFinite(c.hp_pct) ? Math.max(0, Math.min(100, Math.round(c.hp_pct))) : 100;
      lines.push(`${c.is_player ? "PC " : ""}${c.name}|${c.faction}|${pct}%`);
    }
  }
  return lines.length > 0 ? `\n\nThe fight as it stands right now:\n${lines.join("\n")}` : "";
}
