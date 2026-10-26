import { computed, reactive, ref, type Ref } from "vue";
import { COINS } from "@/rules/currency";
import type { CoinKey } from "@/types/downtime.types";
import type { PartyMember } from "@/types/party.types";
import { hasPowerfulBuild, carryCapacity } from "@/lib/utils";
import { ENCUMBERED_AT, HEAVY_AT, burdenLevel as burdenOf, carryColorClass } from "@/lib/inventory/pack";
import { useParty, useUpdatePartyMember } from "@/composables/party/useParty";
import { useGiveCoins } from "@/composables/items/useGiveInventory";
import {
  coinGiveBlocked,
  giveCoinsLabel,
  hasCoins,
  leavesYouLine,
  wholeCoins,
} from "@/lib/inventory/coinGive";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { useToast } from "@/composables/useToast";

/**
 * The money and the weight limit of one character: carry capacity (with its override
 * editor), the burden it implies, and the coin purse with its drop-to-chat form.
 * Split out of `CharacterInventory` so the pack component stays about items.
 */
export function useCharacterPurse(member: Ref<PartyMember | null>, totalCarriedWeight: Ref<number>) {
  const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
  const { sendCurrencyDrop } = useCampaignMessages();
  const toast = useToast();
  const { data: partyMembers } = useParty();
  const { mutateAsync: giveCoins } = useGiveCoins();
  const { reportChatFailure } = useChatSendFailure();
  const { data: speciesById } = useSpeciesByIds(() => [member.value?.species_id]);

  // ── Carry capacity ───────────────────────────────────────────────────────────
  const memberSpeciesName = computed(() =>
    member.value?.species_id ? (speciesById.value.get(member.value.species_id)?.name ?? null) : null,
  );
  const powerfulBuild = computed(() => hasPowerfulBuild(memberSpeciesName.value));
  const effectiveCapacity = computed(() =>
    carryCapacity(member.value?.str ?? 10, memberSpeciesName.value, member.value?.carry_capacity_override ?? null),
  );
  const carryPercent = computed(() =>
    effectiveCapacity.value > 0 ? Math.min(100, (totalCarriedWeight.value / effectiveCapacity.value) * 100) : 0,
  );
  const carryColor = computed(() => carryColorClass(carryPercent.value));
  const encumberedThreshold = computed(() =>
    member.value ? member.value.str * 5 * (powerfulBuild.value ? 2 : 1) : 0,
  );
  const heavyThreshold = computed(() =>
    member.value ? member.value.str * 10 * (powerfulBuild.value ? 2 : 1) : 0,
  );
  // The bands are proportional thirds of the effective capacity (which honours
  // carry_capacity_override), so the markers sit at fixed 1/3 and 2/3 of the bar.
  const encumberedMarkerPct = ENCUMBERED_AT;
  const heavyMarkerPct = HEAVY_AT;
  // Same effective capacity as the bar, so an override never shows a half-full bar
  // under an "Over Encumbered" label.
  const burdenLevel = computed(() => (member.value ? burdenOf(carryPercent.value) : "unencumbered"));

  const editingCapacity = ref(false);
  const capacityDraft = ref("");

  function openCapacityEdit() {
    capacityDraft.value = member.value?.carry_capacity_override ?? "";
    editingCapacity.value = true;
  }

  async function onSaveCapacity(draft: string) {
    capacityDraft.value = draft;
    if (!member.value) return;
    const val = capacityDraft.value.trim() || null;
    await updatePartyMember({ id: member.value.id, update: { carry_capacity_override: val } });
    editingCapacity.value = false;
  }

  function resetCapacity() {
    if (!member.value) return;
    void updatePartyMember({ id: member.value.id, update: { carry_capacity_override: null } });
    editingCapacity.value = false;
  }

  // ── Currency ─────────────────────────────────────────────────────────────────
  const memberCoins = computed((): Record<CoinKey, number> => ({
    pp: member.value?.pp ?? 0,
    gp: member.value?.gp ?? 0,
    ep: member.value?.ep ?? 0,
    sp: member.value?.sp ?? 0,
    cp: member.value?.cp ?? 0,
  }));

  async function setCurrency(key: CoinKey, value: number) {
    if (!member.value) return;
    try {
      await updatePartyMember({ id: member.value.id, update: { [key]: value } });
    } catch (error) {
      toast.error(toast.fromError(error, "Couldn't update your coins."));
    }
  }

  const showCoinDrop = ref(false);
  const coinDrop = reactive<Record<CoinKey, number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  const coinDropHasValue = computed(() => COINS.some((c) => coinDrop[c.key] > 0));
  const coinDropOverLimit = computed(() =>
    member.value ? COINS.some((c) => coinDrop[c.key] > (member.value![c.key] ?? 0)) : false,
  );

  function openCoinDrop() {
    COINS.forEach((c) => { coinDrop[c.key] = 0; });
    showCoinDrop.value = true;
  }

  async function submitCoinDrop() {
    if (!member.value || !coinDropHasValue.value || coinDropOverLimit.value) return;
    // Clamp to non-negative integers up front and deduct exactly what is dropped —
    // sendCurrencyDrop floors internally, so deducting the raw (fractional) input
    // would destroy coin (or debit for a drop that floored to nothing and never sent).
    const coin = (n: number) => Math.max(0, Math.floor(n || 0));
    const clamped: Record<CoinKey, number> = {
      pp: coin(coinDrop.pp), gp: coin(coinDrop.gp), ep: coin(coinDrop.ep), sp: coin(coinDrop.sp), cp: coin(coinDrop.cp),
    };
    if (!COINS.some((c) => clamped[c.key] > 0)) return; // nothing droppable after clamping
    // The purse is debited only after the drop is posted, so a failed post loses no coin.
    try {
      await sendCurrencyDrop(
        clamped.pp, clamped.gp, clamped.ep, clamped.sp, clamped.cp,
        member.value.name ?? undefined,
      );
    } catch (e) {
      reportChatFailure(e, "drop the coins to the chat");
      return;
    }
    for (const c of COINS) {
      if (clamped[c.key] > 0) {
        void setCurrency(c.key, Math.max(0, (member.value[c.key] ?? 0) - clamped[c.key]));
      }
    }
    showCoinDrop.value = false;
  }

  // ── Giving coins to another character (#1112) ────────────────────────────────
  const showCoinGive = ref(false);
  const coinGive = reactive<Record<CoinKey, number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  const coinGiveTo = ref("");
  /** Everyone at the table but this character; the stash is not a person to hand coin to. */
  const coinGiveRecipients = computed(() =>
    (partyMembers.value ?? []).filter((m) => m.id !== member.value?.id),
  );
  const coinGiveRecipient = computed(
    () => coinGiveRecipients.value.find((m) => m.id === coinGiveTo.value) ?? null,
  );
  const coinGiveCanSend = computed(
    () =>
      coinGiveRecipient.value !== null &&
      hasCoins(wholeCoins(coinGive)) &&
      !coinGiveBlocked(memberCoins.value, wholeCoins(coinGive)),
  );
  const coinGiveLeaves = computed(() => leavesYouLine(memberCoins.value, wholeCoins(coinGive)));
  const coinGiveLabel = computed(() => giveCoinsLabel(wholeCoins(coinGive), coinGiveRecipient.value?.name ?? null));

  function openCoinGive() {
    COINS.forEach((c) => { coinGive[c.key] = 0; });
    coinGiveTo.value = coinGiveRecipients.value[0]?.id ?? "";
    showCoinGive.value = true;
  }

  async function submitCoinGive() {
    const to = coinGiveRecipient.value;
    if (!member.value || !to || !coinGiveCanSend.value) return;
    try {
      await giveCoins({ fromMemberId: member.value.id, toMemberId: to.id, coins: wholeCoins(coinGive) });
    } catch {
      return; // useGiveCoins has already toasted; keep the form so nothing typed is lost
    }
    showCoinGive.value = false;
  }

  return {
    showCoinGive,
    coinGive,
    coinGiveTo,
    coinGiveRecipients,
    coinGiveCanSend,
    coinGiveLeaves,
    coinGiveLabel,
    openCoinGive,
    submitCoinGive,
    powerfulBuild,
    effectiveCapacity,
    carryPercent,
    carryColor,
    encumberedThreshold,
    heavyThreshold,
    encumberedMarkerPct,
    heavyMarkerPct,
    burdenLevel,
    editingCapacity,
    capacityDraft,
    openCapacityEdit,
    onSaveCapacity,
    resetCapacity,
    memberCoins,
    setCurrency,
    showCoinDrop,
    coinDrop,
    coinDropHasValue,
    coinDropOverLimit,
    openCoinDrop,
    submitCoinDrop,
  };
}
