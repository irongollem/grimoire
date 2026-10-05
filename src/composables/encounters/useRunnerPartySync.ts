import { watch, onMounted, onUnmounted, type Ref } from "vue";
import { supabase } from "@/lib/supabase";
import { createRealtimeChannel, type RealtimeChannelHandle } from "@/lib/realtimeChannel";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useCampaignStore } from "@/stores/campaign";
import { deepEqual } from "@/lib/utils";
import { createWriteEchoes } from "@/lib/encounters/writeEchoes";
import type { WildshapeState } from "@/types/encounter.types";

interface DeathSaves { successes: number; failures: number }

/**
 * Bidirectional sync between the encounter-run store and `party_members` rows,
 * mounted by the DM's EncounterRunner:
 *
 * - Outbound: debounced HP writes while live, plus the store's player-combatant
 *   persistence (HP, temp HP, conditions, wildshape, …) routed through the
 *   party-member mutation so the party query cache is invalidated on every
 *   write. The store stays UI-only.
 * - Inbound: a Realtime channel ingests temp HP, player-rolled initiative
 *   (#504), and HP edits made outside the runner.
 *
 * lastWrittenHp tracks the HP values we've sent to the DB so the Realtime echo
 * of our own write is dropped explicitly rather than relying on Vue's
 * same-value reactive no-op (which is an implementation detail, not a
 * guarantee).
 *
 * Returns `cancelPendingHpFlush` so end-combat can drop the debounced write in
 * favour of its own authoritative one.
 */
export function useRunnerPartySync(isLive: Ref<boolean>) {
  const store = useEncounterRunStore();
  const campaign = useCampaignStore();
  const { mutateAsync: updatePartyMember } = useUpdatePartyMember();

  const partyHpQueue = new Map<string, number>(); // partyMemberId → pending hp
  const lastWrittenHp = new Map<string, number>(); // partyMemberId → hp we last wrote
  // Forms change in quick bursts (a hit, then another), so every unechoed write
  // is kept, not just the last: see `createWriteEchoes`.
  const wildshapeEchoes = createWriteEchoes<WildshapeState | null>();
  // Death saves are written by the runner on every hit at 0 HP, so the same
  // out-of-order echo that bites the beast form would put a stale tally back.
  const deathSaveEchoes = createWriteEchoes<DeathSaves>();
  let partyHpTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelPendingHpFlush() {
    if (partyHpTimer) {
      clearTimeout(partyHpTimer);
      partyHpTimer = null;
    }
    partyHpQueue.clear();
  }

  watch(
    () => store.combatants
      .filter((c) => c.type === "player" && c.party_member_id)
      .map((c) => ({ iid: c.instance_id, hp: c.hp, pmId: c.party_member_id! })),
    (newVals, oldVals) => {
      if (!isLive.value || !oldVals) return;
      for (const nv of newVals) {
        const ov = oldVals.find((o) => o.iid === nv.iid);
        if (ov && ov.hp !== nv.hp) partyHpQueue.set(nv.pmId, nv.hp);
      }
      if (!partyHpQueue.size) return;
      if (partyHpTimer) clearTimeout(partyHpTimer);
      partyHpTimer = setTimeout(async () => {
        const entries = [...partyHpQueue.entries()];
        partyHpQueue.clear();
        entries.forEach(([id, hp]) => lastWrittenHp.set(id, hp));
        await Promise.all(entries.map(([id, current_hp]) =>
          updatePartyMember({ id, update: { current_hp } }),
        ));
      }, 400);
    },
  );

  let partyMembersRealtime: RealtimeChannelHandle | null = null;
  let subscribedCampaignId: string | null = null;

  store.setPersistHandler((id, update) => {
    const form = "wildshape_state" in update ? (update.wildshape_state ?? null) : undefined;
    if (form !== undefined) wildshapeEchoes.sent(id, form);
    const saves = deathSavesOf(update.death_save_successes, update.death_save_failures);
    if (saves) deathSaveEchoes.sent(id, saves);
    void updatePartyMember({ id, update }).catch((error: unknown) => {
      // No echo will come for a failed write. Rethrown so the failure still
      // surfaces exactly as it did before this bookkeeping existed.
      if (form !== undefined) wildshapeEchoes.failed(id, form);
      if (saves) deathSaveEchoes.failed(id, saves);
      throw error;
    });
  });

  interface PartyMemberSyncRow {
    id: string;
    current_hp: number;
    temp_hp: number;
    current_initiative: number | null;
    conditions: string[];
    wildshape_state: WildshapeState | null;
    death_save_successes: number;
    death_save_failures: number;
  }

  /** Both counts of a write, or null when the write carries neither. */
  function deathSavesOf(successes: number | undefined, failures: number | undefined): DeathSaves | null {
    if (successes === undefined || failures === undefined) return null;
    return { successes, failures };
  }

  /**
   * Apply one party_members row to the run store. Shared by the Realtime handler
   * and the post-gap resync, so a recovered row lands through exactly the same
   * rules as a live event — including the HP echo guard.
   */
  function applyPartyRow(row: PartyMemberSyncRow): void {
    const combatant = store.combatants.find((c) => c.party_member_id === row.id);

    // Temp HP the player granted themselves (or spent) on their own sheet.
    // No echo guard needed: our own writes set the combatant first, so the
    // values already match by the time the event comes back.
    if (combatant && (combatant.temp_hp ?? 0) !== (row.temp_hp ?? 0)) {
      store.ingestTempHp(combatant.instance_id, row.temp_hp ?? 0);
    }

    // An UPDATE payload omits any column Postgres left unchanged and stored
    // out-of-line (TOAST) — `conditions` is a text[] and can qualify with
    // enough/long enough condition names. `"conditions" in row` distinguishes
    // that omission from a genuine empty array, which `?? []` cannot: without
    // it, an unrelated party_members edit (e.g. backstory) could read as
    // "conditions cleared" and wipe them from the runner.
    if (combatant && "conditions" in row && !sameConditions(combatant.conditions, row.conditions ?? [])) {
      store.ingestConditions(combatant.instance_id, row.conditions ?? []);
    }

    // A form the player took or dropped on their own sheet. Guarded by `in` for
    // the same TOAST reason as conditions. The runner's own writes are dropped
    // through the echo ledger (a stale echo would put a hit beast back to an
    // earlier HP), and anything else is compared structurally: the row is jsonb,
    // whose key order is Postgres's own, never the order the client built.
    if (combatant && "wildshape_state" in row) {
      const form = row.wildshape_state ?? null;
      if (!wildshapeEchoes.isOwn(row.id, form) && !deepEqual(combatant.wildshape ?? null, form)) {
        store.ingestWildshape(combatant.instance_id, form);
      }
    }

    // Death saves a player rolled on their own sheet. Without this the runner
    // keeps the tally from when the fight began, and end of combat writes it
    // straight back over the character's real one. Guarded by `in` like the
    // other columns an UPDATE payload may omit; the runner's own writes come
    // back through the echo ledger.
    if (combatant && "death_save_successes" in row && "death_save_failures" in row) {
      const saves = deathSavesOf(row.death_save_successes, row.death_save_failures);
      if (
        saves &&
        !deathSaveEchoes.isOwn(row.id, saves) &&
        (combatant.death_saves.successes !== saves.successes || combatant.death_saves.failures !== saves.failures)
      ) {
        store.ingestDeathSaves(combatant.instance_id, saves);
      }
    }

    // Ingest player-rolled initiative (#504). The runner never writes a roll to
    // current_initiative (it only clears it), so there's no echo to guard
    // against. Only apply a fresh non-null value that differs: this keeps the
    // player's own roll and lets "Roll Initiative" skip anyone who already
    // rolled. Only while live: a row read before the lobby opens still carries
    // last session's roll, and `clearPartyInitiatives` blanks it as the lobby opens.
    if (
      isLive.value &&
      combatant &&
      row.current_initiative !== null &&
      combatant.initiative !== row.current_initiative
    ) {
      store.setInitiative(combatant.instance_id, row.current_initiative);
    }

    // Checked before the combatant guard so a stale echo entry is always
    // consumed, even for a party member not currently in the encounter.
    if (lastWrittenHp.get(row.id) === row.current_hp) {
      lastWrittenHp.delete(row.id);
      return;
    }
    if (combatant && combatant.hp !== row.current_hp) {
      store.ingestHp(combatant.instance_id, row.current_hp);
    }
  }

  function sameConditions(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((condition, index) => condition === right[index]);
  }

  /**
   * Re-derive every party member's synced fields from the DB. The runner had no
   * recovery at all before this: a DM whose socket dropped mid-combat kept
   * showing the HP, temp HP and initiative from whenever the gap started, with
   * a page reload as the only way out.
   */
  async function resyncPartyFromDb(campaignId: string): Promise<void> {
    const { data, error } = await supabase
      .from("party_members")
      .select("id, current_hp, temp_hp, current_initiative, conditions, wildshape_state, death_save_successes, death_save_failures")
      .eq("campaign_id", campaignId);
    if (error) throw error;
    if (campaignId !== subscribedCampaignId) return;
    // A gap may have swallowed echoes; the rows just read are the truth now.
    wildshapeEchoes.clear();
    deathSaveEchoes.clear();
    for (const row of (data ?? []) as PartyMemberSyncRow[]) applyPartyRow(row);
  }

  /**
   * Blank every PC's initiative, in the store and on the party_members rows. A
   * row's `current_initiative` is never cleared by anything else, so last
   * week's roll would be ingested into this week's fight on the first resync.
   * Called as the lobby opens, so everything the runner sees afterwards is a
   * roll made for this encounter.
   */
  async function clearPartyInitiatives(): Promise<void> {
    const ids = store.combatants
      .filter((c) => c.type === "player" && c.party_member_id)
      .map((c) => c.party_member_id!);
    store.clearPlayerInitiatives();
    await Promise.all(ids.map((id) => updatePartyMember({ id, update: { current_initiative: null } })));
  }

  // A runner reopened onto a live encounter (or one whose live state arrives
  // after mount) reads the rolls made so far once it knows it is live.
  watch(isLive, (live) => {
    const campaignId = subscribedCampaignId;
    if (live && campaignId) void resyncPartyFromDb(campaignId);
  });

  onMounted(() => {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return;
    subscribedCampaignId = campaignId;
    void resyncPartyFromDb(campaignId);
    partyMembersRealtime = createRealtimeChannel({
      topic: `runner_party_members:${campaignId}`,
      reconcile: () => void resyncPartyFromDb(campaignId),
      bind: (channel) => channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "party_members",
          filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          if (subscribedCampaignId === campaignId) {
            applyPartyRow(payload.new as PartyMemberSyncRow);
          }
        },
      ),
    });
  });

  onUnmounted(() => {
    store.setPersistHandler(null);
    subscribedCampaignId = null;
    if (partyHpTimer) clearTimeout(partyHpTimer);
    partyMembersRealtime?.stop();
    partyMembersRealtime = null;
  });

  return { cancelPendingHpFlush, clearPartyInitiatives };
}
