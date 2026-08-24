import type { PartyMember } from "@/types/party.types";

/**
 * The "who is dying right now" reduction for the Death-Saves Alert (#764).
 *
 * **What counts as dying.** Reused, not reinvented: `PartyTrackerRow.vue:217`
 * (`v-if="member.current_hp <= 0"`) and `PlayerConditions.vue:41` (identical
 * condition) already agree that 0 HP or below is what puts a character on
 * death saves, and both surface the same `PartyDeathSaves`-shaped UI at that
 * threshold. This module keys off the exact same field for the exact same
 * reason those two do: a second definition here — say, "has any save
 * recorded" — could disagree with them about who is dying, which is the
 * failure mode the widget brief calls out by name.
 */
export interface DyingPartyMember {
  id: string;
  name: string;
  portraitUrl: string | null;
  portraitFocalPoint: { x: number; y: number } | null;
  /**
   * 0–3, or `null` when the row genuinely carries no count. `null` and `0`
   * are kept apart on purpose — see {@link trackedSaveCount}.
   */
  successes: number | null;
  failures: number | null;
  /** A third failure kills the character outright — see the sort/filter
   *  notes in {@link deriveDyingPartyMembers} for why this state, unlike
   *  stabilizing, stays in the list rather than dropping out of it. */
  isDead: boolean;
}

/**
 * `death_save_successes`/`death_save_failures` are typed as plain `number` on
 * `PartyMember`, matching the `NOT NULL DEFAULT 0` column
 * (`supabase/migrations/20260426000099_initial_schema_squashed.sql:1635-1636`).
 * But `useParty`'s `fetchParty` hands the query result straight through an
 * unchecked `data as PartyMember[]` cast (`src/composables/useParty.ts:23`) —
 * nothing at the boundary actually verifies the column came back as a number
 * — and this app has already shipped once with production schema drifted
 * from its own migrations undetected. Reading `unknown` here, instead of
 * trusting the declared type, is what makes this check real rather than
 * decorative.
 *
 * Absence is also not the same *fact* as zero: "0 recorded successes" means
 * three failed rolls could still be coming and none has landed a good one
 * yet, while "no count at all" means the widget has no idea where this
 * character stands. Collapsing the second into the first with `?? 0` would
 * make an unrecorded character look exactly like one who has rolled three
 * times and failed every save — a worse false signal than showing nothing.
 * So a missing count stays `null` all the way to the widget, which renders
 * it as its own state rather than as zero pips filled.
 */
function trackedSaveCount(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * Reduces the roster to the party members currently on death saves, most
 * urgent first.
 *
 * Two boundary states, both asked for explicitly in the #764 brief:
 *
 * - **Three successes stabilizes the character.** By the 5e rule they stop
 *   rolling and are no longer in danger of dying from this drop, even though
 *   `current_hp` stays at 0 until someone actually heals them (nothing in
 *   `PlayerConditions.vue`'s `toggleDeathSave`/`rollDeathSave` touches HP on
 *   the third success). The whole point of this widget is that it is silent
 *   unless the table needs to look at it *right now* — the always-on Party
 *   widget already shows a stabilized character's 0 HP, so re-showing them
 *   here would just be noise that teaches the DM to stop trusting the
 *   widget's silence. They are dropped from the result once stable.
 * - **Three failures kills the character.** Unlike stabilizing, this does
 *   NOT drop them from the list — a death is the single most time-sensitive
 *   thing that can happen at the table (a revivify-shaped window is closing),
 *   so the alert keeps naming them, sorted first, until the DM has actually
 *   done something about it (healed them, or reset the save counts by hand).
 */
export function deriveDyingPartyMembers(members: readonly PartyMember[]): DyingPartyMember[] {
  return members
    .filter((member) => member.current_hp <= 0)
    .map((member) => ({
      member,
      successes: trackedSaveCount(member.death_save_successes),
      failures: trackedSaveCount(member.death_save_failures),
    }))
    // Both boundary checks read the *narrowed* counts, never the raw fields.
    // Reading `member.death_save_successes !== 3` directly would undo the
    // whole point of `trackedSaveCount`: a drifted column returning the
    // string "3" is `!== 3`, so a stabilized character would keep shouting,
    // and `=== 3` is false, so a dead one would never be marked dead. A
    // module that distrusts a type in one place and trusts it two lines
    // later is not defensive, it is inconsistent.
    .filter(({ successes }) => successes !== 3)
    .map(({ member, successes, failures }) => ({
      id: member.id,
      name: member.name,
      portraitUrl: member.portrait_url,
      portraitFocalPoint: member.portrait_focal_point ?? null,
      successes,
      failures,
      isDead: failures === 3,
    }))
    // Dead first (nothing outranks it), then by failures descending so the
    // closest-to-death living characters lead the rest of the list.
    .sort((a, b) => {
      if (a.isDead !== b.isDead) return a.isDead ? -1 : 1;
      return (b.failures ?? 0) - (a.failures ?? 0);
    });
}
