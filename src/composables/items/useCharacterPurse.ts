import { computed, ref, type Ref } from "vue";
import type { PartyMember } from "@/types/party.types";
import { hasPowerfulBuild, carryCapacity } from "@/lib/utils";
import { ENCUMBERED_AT, HEAVY_AT, burdenLevel as burdenOf, carryColorClass } from "@/lib/inventory/pack";
import { useParty, useUpdatePartyMember } from "@/composables/party/useParty";
import { useCurrency } from "@/composables/currency/useCurrency";
import { hasCoins, type Coins } from "@/lib/currency/currency";
import { useGiveCoins } from "@/composables/items/useGiveInventory";
import { coinGiveBlocked, coinsLeft, giveCoinsLabel, leavesYouLine } from "@/lib/inventory/coinGive";
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
  const { currency } = useCurrency();
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
  const memberCoins = computed((): Coins => member.value?.coins ?? {});

  /** Writes the whole purse: the column is one map, so a change sends all of it. */
  async function setCoins(coins: Coins) {
    if (!member.value) return;
    try {
      await updatePartyMember({ id: member.value.id, update: { coins } });
    } catch (error) {
      toast.error(toast.fromError(error, "Couldn't update your coins."));
    }
  }

  async function setCurrency(key: string, value: number) {
    const next: Coins = { ...memberCoins.value };
    if (value > 0) next[key] = value;
    else delete next[key];
    await setCoins(next);
  }

  const showCoinDrop = ref(false);
  const coinDrop = ref<Coins>({});
  const coinDropHasValue = computed(() => hasCoins(coinDrop.value));
  const coinDropOverLimit = computed(() => coinGiveBlocked(memberCoins.value, coinDrop.value));

  function openCoinDrop() {
    coinDrop.value = {};
    showCoinDrop.value = true;
  }

  async function submitCoinDrop() {
    if (!member.value || !coinDropHasValue.value || coinDropOverLimit.value) return;
    // The coins handed over leave the purse as exactly those coins (no change-making),
    // and only after the drop is posted, so a failed post loses no coin.
    const dropped = { ...coinDrop.value };
    try {
      await sendCurrencyDrop(dropped, member.value.name ?? undefined);
    } catch (e) {
      reportChatFailure(e, "drop the coins to the chat");
      return;
    }
    void setCoins(coinsLeft(memberCoins.value, dropped));
    showCoinDrop.value = false;
  }

  // ── Giving coins to another character (#1112) ────────────────────────────────
  const showCoinGive = ref(false);
  const coinGive = ref<Coins>({});
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
      hasCoins(coinGive.value) &&
      !coinGiveBlocked(memberCoins.value, coinGive.value),
  );
  const coinGiveLeaves = computed(() => leavesYouLine(memberCoins.value, coinGive.value, currency.value));
  const coinGiveLabel = computed(() => giveCoinsLabel(coinGive.value, coinGiveRecipient.value?.name ?? null, currency.value));

  function openCoinGive() {
    coinGive.value = {};
    coinGiveTo.value = coinGiveRecipients.value[0]?.id ?? "";
    showCoinGive.value = true;
  }

  async function submitCoinGive() {
    const to = coinGiveRecipient.value;
    if (!member.value || !to || !coinGiveCanSend.value) return;
    try {
      await giveCoins({ fromMemberId: member.value.id, toMemberId: to.id, coins: coinGive.value });
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
