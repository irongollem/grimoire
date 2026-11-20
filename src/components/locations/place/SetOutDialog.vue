<template>
  <AppModal :open="open" size="md" @close="emit('close')">
    <ModalHeader :title="`Set out for ${destination.name}`" :icon="IconAddEvent" tone="primary" closeable @close="emit('close')" />
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">
      <p class="text-body text-foreground" data-testid="set-out-summary">
        <span class="font-semibold">{{ formatDistance(journey.summary.distance, journey.summary.unit) }}</span>
        at a {{ paceLabel }} pace: <span class="font-semibold">{{ formatTravelTime(journey.summary.time) }}</span>.
        They arrive on {{ arrivesOn }}.
      </p>

      <section class="flex flex-col gap-1">
        <p class="text-label-lg font-semibold text-foreground">Who goes</p>
        <AppCheckbox
          v-for="m in candidates"
          :key="m.id"
          :model-value="going.includes(m.id)"
          :label="m.name"
          @update:model-value="setGoing(m.id, $event)"
        />
        <p v-if="candidates.length === 0" class="text-caption text-muted-foreground">Nobody stands where the journey starts.</p>
      </section>

      <SetOutProvisions
        v-if="countsFood && going.length > 0"
        v-model:forage="forageOn"
        v-model:terrain="terrain"
        v-model:foragers="foragerIds"
        :stash="stash"
        :lines="lines"
        :can-forage="isSlow"
        :rolls="rollWords"
        @reroll="reroll"
      />
      <p v-if="failure" class="text-caption text-destructive" data-testid="set-out-error">{{ failure }}</p>
    </div>
    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton variant="primary" size="sm" :label="busy ? 'Setting out…' : 'Set out'" :disabled="busy || going.length === 0" data-testid="set-out-confirm" @click="confirm" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { useSetOut } from "@/composables/locations/useSetOut";
import { useAllCampaignCharacterClasses } from "@/composables/party/useCharacterClasses";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useParty } from "@/composables/party/useParty";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import { addDays } from "@/lib/calendar/dayMath";
import { rollDie } from "@/lib/dice/dice";
import { IconAddEvent } from "@/lib/icons";
import { formatDistance } from "@/lib/locations/mapScale";
import { FORAGE_TERRAINS, isRationRow, planProvisions, type ForageTerrainId } from "@/lib/travel/provisions";
import { daysWithoutFoodAllowed } from "@/rules/rations";
import { getExhaustionLevel } from "@/rules/conditions";
import { abilityMod } from "@/rules/abilityScore";
import { jackOfAllTrades, skillCheckBonus } from "@/rules/skillCheck";
import { formatTravelTime } from "@/rules/travelPace";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import type { Journey } from "@/lib/travel/journey";
import SetOutProvisions from "./SetOutProvisions.vue";

/**
 * "Set out for <place>" (#1222 decisions 4, 6, 7): who goes, when they arrive and, where the campaign counts food,
 * what the journey eats and what foraging finds, all shown before the DM confirms.
 */
const { open, destination, journey, paceLabel, travellerIds, movesParty, description } = defineProps<{
  open: boolean;
  destination: { id: string; name: string };
  journey: Journey;
  paceLabel: string;
  travellerIds: readonly string[];
  movesParty: boolean;
  description: string;
}>();
const emit = defineEmits<{ close: [] }>();

const calendar = useCalendarStore();
const campaign = useCampaignStore();
const { data: party } = useParty();
const { data: inventory } = usePartyInventory();
const { data: classRows } = useAllCampaignCharacterClasses();
const countsFood = useIsRuleEnabled("rations");
const { setOut } = useSetOut();

const candidates = computed(() => (party.value ?? []).filter((m) => travellerIds.includes(m.id)));
const going = ref<string[]>([]);
const travellers = computed(() => candidates.value.filter((m) => going.value.includes(m.id)));
function setGoing(id: string, on: boolean): void {
  going.value = on ? [...going.value, id] : going.value.filter((g) => g !== id);
}

const days = computed(() => journey.summary.time.calendarDays);
const arrivesOn = computed(() => {
  const start = { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay };
  const at = addDays(calendar.adapter, start, days.value);
  return calendar.adapter.formatDate(at.year, at.month, at.day, null);
});
const isSlow = computed(() => journey.summary.paceId === "slow");

// ── Food ──────────────────────────────────────────────────────────────────────
const rationRows = computed(() => (inventory.value ?? []).filter(isRationRow));
const carriedBy = (id: string): number => rationRows.value.filter((r) => r.carried_by === id).reduce((n, r) => n + r.quantity, 0);
const stash = computed(() => rationRows.value.filter((r) => r.carried_by === null).reduce((n, r) => n + r.quantity, 0));

const forageOn = ref(false);
const terrain = ref<ForageTerrainId>("limited");
const foragerIds = ref<string[]>([]);
// The dice are drawn once and read in order, so the same options always give the same rolls until "Roll again".
const seeds = ref<number[]>([]);
function reroll(): void {
  seeds.value = Array.from({ length: 400 }, () => rollDie(1_000_000));
}
watch(() => [open, forageOn.value, terrain.value], reroll, { immediate: true });
// Everyone who stands where the journey starts goes unless unticked, including those whose sheets arrive after the
// dialog opened.
watch(
  () => (open ? travellerIds.join(",") : null),
  (openWith) => {
    if (openWith !== null) {
      going.value = [...travellerIds];
      forageOn.value = false;
      foragerIds.value = [...travellerIds];
    }
  },
  { immediate: true },
);
// Foraging is for the slow pace only; moving to a faster one drops it.
watch(isSlow, (slow) => {
  if (!slow) forageOn.value = false;
});

const dc = computed(() => FORAGE_TERRAINS.find((t) => t.id === terrain.value)?.dc ?? FORAGE_TERRAINS[1].dc);
const jackOf = (m: { id: string; ruleset: "2014" | "2024" }) => jackOfAllTrades((classRows.value ?? []).filter((c) => c.party_member_id === m.id), m.ruleset);

const provisions = computed(() => {
  if (!countsFood.value) return null;
  let at = 0;
  const roll = (sides: number): number => Math.floor(((seeds.value[at++ % seeds.value.length] ?? 0) / 1_000_000) * sides) + 1;
  const foraging = forageOn.value && isSlow.value;
  const result = planProvisions({
    days: days.value,
    travellers: travellers.value.map((m) => ({
      id: m.id,
      carried: carriedBy(m.id),
      daysWithoutFood: m.days_without_food,
      exhaustion: getExhaustionLevel(m.conditions),
      conModifier: abilityMod(m.con),
      ruleset: m.ruleset,
    })),
    stash: stash.value,
    forage: foraging
      ? {
          dc: dc.value,
          foragers: travellers.value
            .filter((m) => foragerIds.value.includes(m.id))
            .map((m) => ({ id: m.id, survivalBonus: skillCheckBonus(m, "survival", jackOf(m)), wisModifier: abilityMod(m.wis) })),
        }
      : null,
    roll,
  });
  return result;
});

const nameOf = (id: string): string => candidates.value.find((m) => m.id === id)?.name ?? "Someone";
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const lines = computed(() =>
  candidates.value.map((m) => {
    const p = provisions.value?.travellers.find((t) => t.id === m.id);
    const parts: string[] = [];
    if (p) {
      if (p.fromForage > 0) parts.push(`${plural(p.fromForage, "day", "days")} from foraging`);
      if (p.fromOwn > 0) parts.push(`${plural(p.fromOwn, "day", "days")} from the pack`);
      if (p.fromStash > 0) parts.push(`${plural(p.fromStash, "day", "days")} from the stash`);
      if (p.hungryDays > 0) {
        const free = daysWithoutFoodAllowed(abilityMod(m.con), m.ruleset);
        const cost = p.exhaustionGained > 0 ? `${plural(p.exhaustionGained, "level", "levels")} of Exhaustion` : `no Exhaustion yet, ${free} days are free`;
        parts.push(`goes without for ${plural(p.hungryDays, "day", "days")}: ${cost}`);
      }
    }
    return { id: m.id, name: m.name, carried: carriedBy(m.id), outcome: going.value.includes(m.id) ? parts.join("; ") + (parts.length > 0 ? "." : "") : "Stays behind." };
  }),
);
const rollWords = computed(() =>
  (provisions.value?.forage ?? []).flatMap((d) =>
    d.rolls.map((r) => `Day ${d.day}: ${nameOf(r.id)} rolls ${r.d20} (${r.total} in all), ${r.success ? `finds ${plural(r.found, "pound", "pounds")} of food` : "finds nothing"}.`),
  ),
);

// ── Setting out ───────────────────────────────────────────────────────────────
const busy = ref(false);
const failure = ref<string | null>(null);
async function confirm(): Promise<void> {
  busy.value = true;
  failure.value = null;
  try {
    await setOut({
      destination,
      summary: journey.summary,
      description,
      travellers: travellers.value,
      movesParty,
      adapter: calendar.adapter,
      provisions: provisions.value ? { plan: provisions.value, inventory: inventory.value ?? [] } : null,
    });
    emit("close");
  } catch (cause) {
    failure.value = cause instanceof Error ? cause.message : "The journey could not be started.";
  } finally {
    busy.value = false;
  }
}
</script>
