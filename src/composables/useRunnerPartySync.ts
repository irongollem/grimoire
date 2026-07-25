import { watch, onMounted, onUnmounted, type Ref } from "vue";
import { supabase } from "@/lib/supabase";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useCampaignStore } from "@/stores/campaign";

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

  let partyMembersChannel: ReturnType<typeof supabase.channel> | null = null;

  store.setPersistHandler((id, update) => {
    void updatePartyMember({ id, update });
  });

  onMounted(() => {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return;
    partyMembersChannel = supabase
      .channel("runner_party_members_hp")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "party_members",
          filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const row = payload.new as { id: string; current_hp: number; temp_hp: number; current_initiative: number | null };
          const combatant = store.combatants.find((c) => c.party_member_id === row.id);

          // Temp HP the player granted themselves (or spent) on their own sheet.
          // No echo guard needed: our own writes set the combatant first, so the
          // values already match by the time the event comes back.
          if (combatant && (combatant.temp_hp ?? 0) !== (row.temp_hp ?? 0)) {
            store.ingestTempHp(combatant.instance_id, row.temp_hp ?? 0);
          }

          // Ingest player-rolled initiative (#504). The runner never writes
          // current_initiative, so there's no echo to guard against. Only apply a
          // fresh non-null value that differs — this keeps the player's own roll
          // and lets "Roll Initiative" skip anyone who already rolled.
          if (
            combatant &&
            row.current_initiative !== null &&
            combatant.initiative !== row.current_initiative
          ) {
            store.setInitiative(combatant.instance_id, row.current_initiative);
          }

          if (lastWrittenHp.get(row.id) === row.current_hp) {
            lastWrittenHp.delete(row.id);
            return;
          }
          if (combatant && combatant.hp !== row.current_hp) {
            store.setHp(combatant.instance_id, row.current_hp);
          }
        },
      )
      .subscribe();
  });

  onUnmounted(() => {
    store.setPersistHandler(null);
    if (partyHpTimer) clearTimeout(partyHpTimer);
    if (partyMembersChannel) {
      supabase.removeChannel(partyMembersChannel);
      partyMembersChannel = null;
    }
  });

  return { cancelPendingHpFlush };
}
