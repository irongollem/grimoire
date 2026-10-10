import { watch, onMounted, onUnmounted, type Ref } from "vue";
import { supabase } from "@/lib/supabase";
import { onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useCampaignStore } from "@/stores/campaign";
import { deepEqual } from "@/lib/utils";
import type { WildshapeState } from "@/types/encounter.types";
import type { PartyMemberUpdate } from "@/types/party.types";

/**
 * Bidirectional sync between the encounter-run store and `party_members` rows,
 * mounted by the DM's EncounterRunner:
 *
 * - Outbound: debounced HP writes while live, plus the store's player-combatant
 *   persistence (HP, temp HP, conditions, wildshape, ...) routed through the
 *   party-member mutation so the party query cache is invalidated on every
 *   write. The store stays UI-only.
 * - Inbound: a party_members ring from the campaign doorbell (a ring names the
 *   table, never the row) triggers a re-read that ingests temp HP, player-rolled
 *   initiative (#504), and edits made outside the runner.
 *
 * A re-read must never apply, for a member, a value read before this client's
 * latest write to that member committed. Rings reach this tab too, so the read
 * a ring starts can be in flight while the runner writes again. Every write is
 * therefore tracked per member: a re-read remembers when it started, and drops
 * a member that has a write in flight, or whose write started or settled after
 * the read began. Because our own write also rings once it commits, the dropped
 * member is read again afterwards, and that later read applies the true value.
 * This one rule replaces the per-column echo ledgers the payload-era code kept
 * (last HP written, Wild Shape forms, death saves): they guessed which incoming
 * values were ours, where the epoch knows which reads are too old.
 *
 * Returns `cancelPendingHpFlush` so end-combat can drop the debounced write in
 * favour of its own authoritative one, and `writePartyMember`, which is that
 * write tracked by the same rule as every other.
 */
export function useRunnerPartySync(isLive: Ref<boolean>) {
  const store = useEncounterRunStore();
  const campaign = useCampaignStore();
  const { mutateAsync: updatePartyMember } = useUpdatePartyMember();

  const partyHpQueue = new Map<string, number>(); // partyMemberId → pending hp
  let partyHpTimer: ReturnType<typeof setTimeout> | null = null;

  // One counter ticks whenever a write to any member starts or settles, and
  // `touchedAt` remembers the tick of each member's latest start or settle. A
  // read that began at tick T is stale for a member whose `touchedAt` is above T.
  let tick = 0;
  const touchedAt = new Map<string, number>();
  const writesInFlight = new Map<string, number>(); // partyMemberId → unsettled writes
  // Members a re-read had to drop while their write was unsettled. The write's
  // own ring may already have been spent on that read, so settling re-reads them.
  const deferred = new Set<string>();

  function touch(id: string): void {
    tick += 1;
    touchedAt.set(id, tick);
  }

  /** Run one write to a member, marking it in flight from the moment it starts. */
  function trackWrite<T>(id: string, run: () => Promise<T>): Promise<T> {
    touch(id);
    writesInFlight.set(id, writesInFlight.has(id) ? writesInFlight.get(id)! + 1 : 1);
    return run().finally(() => {
      const left = writesInFlight.get(id)! - 1;
      if (left > 0) writesInFlight.set(id, left);
      else writesInFlight.delete(id);
      touch(id);
      if (left === 0 && deferred.delete(id)) requestReread();
    });
  }

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
        // Tracked in this same tick, so there is no gap between the queue
        // emptying and the writes counting as in flight.
        await Promise.all(entries.map(([id, current_hp]) =>
          trackWrite(id, () => updatePartyMember({ id, update: { current_hp } })),
        ));
      }, 400);
    },
  );

  let stopRings: (() => void) | null = null;
  let subscribedCampaignId: string | null = null;

  /** A write to a member from anywhere in the runner, tracked like the rest. */
  function writePartyMember(id: string, update: PartyMemberUpdate) {
    return trackWrite(id, () => updatePartyMember({ id, update }));
  }

  store.setPersistHandler((id, update) => {
    void writePartyMember(id, update);
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

  /**
   * Apply one party_members row to the run store. Shared by the ring re-read and
   * the post-gap resync, so a recovered row lands through exactly the same rules.
   * The caller has already dropped any member this client is writing to.
   */
  function applyPartyRow(row: PartyMemberSyncRow): void {
    const combatant = store.combatants.find((c) => c.party_member_id === row.id);
    if (!combatant) return;

    // Temp HP the player granted themselves (or spent) on their own sheet.
    if ((combatant.temp_hp ?? 0) !== (row.temp_hp ?? 0)) {
      store.ingestTempHp(combatant.instance_id, row.temp_hp ?? 0);
    }

    // A re-read selects its columns, so none is ever omitted the way an UPDATE
    // payload omitted an unchanged TOAST column: an empty array is a real empty.
    if (!sameConditions(combatant.conditions, row.conditions)) {
      store.ingestConditions(combatant.instance_id, row.conditions);
    }

    // A form the player took or dropped on their own sheet. Compared
    // structurally: the row is jsonb, whose key order is Postgres's own, never
    // the order the client built.
    if (!deepEqual(combatant.wildshape ?? null, row.wildshape_state ?? null)) {
      store.ingestWildshape(combatant.instance_id, row.wildshape_state ?? null);
    }

    // Death saves a player rolled on their own sheet. Without this the runner
    // keeps the tally from when the fight began, and end of combat writes it
    // straight back over the character's real one.
    if (
      combatant.death_saves.successes !== row.death_save_successes ||
      combatant.death_saves.failures !== row.death_save_failures
    ) {
      store.ingestDeathSaves(combatant.instance_id, {
        successes: row.death_save_successes,
        failures: row.death_save_failures,
      });
    }

    // Ingest player-rolled initiative (#504). Only apply a fresh non-null value
    // that differs: this keeps the player's own roll and lets "Roll Initiative"
    // skip anyone who already rolled. Only while live: a row read before the
    // lobby opens still carries last session's roll, and `clearPartyInitiatives`
    // blanks it as the lobby opens.
    if (isLive.value && row.current_initiative !== null && combatant.initiative !== row.current_initiative) {
      store.setInitiative(combatant.instance_id, row.current_initiative);
    }

    // An HP change still waiting for its debounced write is newer than this read.
    if (partyHpQueue.has(row.id)) return;
    if (combatant.hp !== row.current_hp) {
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
   *
   * Returns true when it dropped a member whose write settled while the read was
   * in flight, which needs another read because no further ring is owed.
   */
  async function resyncPartyFromDb(campaignId: string): Promise<boolean> {
    const startedAt = tick;
    const { data, error } = await supabase
      .from("party_members")
      .select("id, current_hp, temp_hp, current_initiative, conditions, wildshape_state, death_save_successes, death_save_failures")
      .eq("campaign_id", campaignId);
    if (error) throw error;
    if (campaignId !== subscribedCampaignId) return false;
    let again = false;
    for (const row of data as PartyMemberSyncRow[]) {
      if (writesInFlight.has(row.id)) {
        deferred.add(row.id);
        continue;
      }
      const touched = touchedAt.get(row.id);
      if (touched !== undefined && touched > startedAt) {
        again = true;
        continue;
      }
      applyPartyRow(row);
    }
    return again;
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
    await Promise.all(ids.map((id) =>
      trackWrite(id, () => updatePartyMember({ id, update: { current_initiative: null } })),
    ));
  }

  // Rings come in bursts (a round of HP writes), so one read runs at a time and a
  // ring or a settled write landing meanwhile schedules exactly one more.
  let reading = false;
  let again = false;
  async function reread(): Promise<void> {
    const campaignId = subscribedCampaignId;
    if (!campaignId) return;
    if (reading) { again = true; return; }
    reading = true;
    try {
      do {
        again = false;
        if (await resyncPartyFromDb(campaignId)) again = true;
      } while (again && subscribedCampaignId === campaignId);
    } catch (error) {
      // Surface it to Sentry without an unhandled rejection from a listener.
      setTimeout(() => { throw error; });
    } finally {
      reading = false;
    }
  }
  function requestReread(): void {
    void reread();
  }

  // A runner reopened onto a live encounter (or one whose live state arrives
  // after mount) reads the rolls made so far once it knows it is live.
  watch(isLive, (live) => {
    if (live) requestReread();
  });

  onMounted(() => {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return;
    subscribedCampaignId = campaignId;
    requestReread();
    // Every ring is read, this tab's own included: the ring of our own write is
    // what brings the committed value back after a read the write outran.
    const offRing = onCampaignRing(["party_members"], (ring) => {
      if (ring.campaignId === campaignId && subscribedCampaignId === campaignId) requestReread();
    });
    const offReconcile = onCampaignReconcile((id) => {
      if (id === campaignId && subscribedCampaignId === campaignId) requestReread();
    });
    stopRings = () => { offRing(); offReconcile(); };
  });

  onUnmounted(() => {
    store.setPersistHandler(null);
    subscribedCampaignId = null;
    if (partyHpTimer) clearTimeout(partyHpTimer);
    stopRings?.();
    stopRings = null;
  });

  return { cancelPendingHpFlush, clearPartyInitiatives, writePartyMember };
}
