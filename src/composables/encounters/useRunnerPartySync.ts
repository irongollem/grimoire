import { watch, onMounted, onUnmounted, type Ref } from "vue";
import { supabase } from "@/lib/supabase";
import { onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useCampaignStore } from "@/stores/campaign";
import type { PartyIngestRow } from "@/rules/fight/partyIngest";
import type { PartyMemberUpdate } from "@/types/party.types";

const FLUSH_MS = 400;

/**
 * Bidirectional sync between the encounter-run store and `party_members` rows,
 * mounted by the DM's EncounterRunner:
 *
 * - Outbound: ONE write path. The store's player-combatant persistence (HP,
 *   temp HP, conditions, wildshape, ...) is collected per member and written
 *   once the DM pauses for `FLUSH_MS`, through the party-member mutation so the
 *   party query cache is invalidated. Clicking HP up ten times is one request
 *   carrying the final values, not ten. The store stays UI-only.
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
 * Nothing waiting is ever dropped. A write made by hand (`writePartyMember`,
 * end-combat's authoritative one) absorbs the member's pending patch, so the
 * row gets one write carrying both; and unmounting flushes whatever is left.
 * Returns `clearPartyInitiatives` and `writePartyMember`.
 */
export function useRunnerPartySync(isLive: Ref<boolean>) {
  const store = useEncounterRunStore();
  const campaign = useCampaignStore();
  const { mutateAsync: updatePartyMember } = useUpdatePartyMember();

  // partyMemberId → the merged patch still waiting for its write (last value wins per column).
  const pending = new Map<string, PartyMemberUpdate>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

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

  function reportFailure(error: unknown): void {
    // Surface it to Sentry without an unhandled rejection from a timer.
    setTimeout(() => { throw error; });
  }

  /** Write every member's pending patch now, one write per member. */
  function flushPending(): Promise<unknown[]> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const entries = [...pending.entries()];
    pending.clear();
    // Tracked in this same tick, so there is no gap between the queue
    // emptying and the writes counting as in flight.
    return Promise.all(entries.map(([id, update]) =>
      trackWrite(id, () => updatePartyMember({ id, update })).catch(reportFailure),
    ));
  }

  /** Queue a player change; the write goes out once the DM has paused. */
  function enqueue(id: string, patch: PartyMemberUpdate): void {
    pending.set(id, { ...pending.get(id), ...patch });
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { void flushPending(); }, FLUSH_MS);
  }

  let stopRings: (() => void) | null = null;
  let subscribedCampaignId: string | null = null;

  /**
   * A write to a member from anywhere in the runner, tracked like the rest. It
   * absorbs the member's pending patch (the explicit values win), so the row is
   * written once and the waiting change is neither lost nor written twice.
   */
  function writePartyMember(id: string, update: PartyMemberUpdate) {
    const merged = { ...pending.get(id), ...update };
    pending.delete(id);
    if (!pending.size && flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    return trackWrite(id, () => updatePartyMember({ id, update: merged }));
  }

  store.setPersistHandler(enqueue);

  // The spell each member was last read concentrating on (null: none). Absent until first read.
  const lastConcentration = new Map<string, string | null>();

  /**
   * Apply one party_members row to the run store. Shared by the ring re-read and
   * the post-gap resync, so a recovered row lands through exactly the same rules
   * (`rules/fight/partyIngest`). The caller has already dropped any member this
   * client is writing to: that guard is about this browser's write timing, and
   * stays here.
   */
  function applyPartyRow(row: PartyIngestRow): void {
    const concentration = store.ingestParty(row, {
      live: isLive.value,
      lastConcentration: lastConcentration.get(row.id),
    });
    if (concentration !== undefined) lastConcentration.set(row.id, concentration);
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
      .select("id, current_hp, temp_hp, current_initiative, conditions, concentration, wildshape_state, death_save_successes, death_save_failures")
      .eq("campaign_id", campaignId);
    if (error) throw error;
    if (campaignId !== subscribedCampaignId) return false;
    let again = false;
    for (const row of data as PartyIngestRow[]) {
      // A change still waiting for its write is newer than this read, whatever
      // column it holds. Its write rings, and that ring reads the row again.
      if (pending.has(row.id)) continue;
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
    await Promise.all(ids.map((id) => writePartyMember(id, { current_initiative: null })));
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
    // The runner closing must not lose the last clicks.
    void flushPending();
    stopRings?.();
    stopRings = null;
  });

  return { clearPartyInitiatives, writePartyMember };
}
