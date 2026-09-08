<template>
  <section class="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Held payoff">
    <header class="flex flex-wrap items-center gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Held payoff</h3>
      <span v-if="total" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">{{ total }} to dispatch</span>
      <p class="basis-full text-caption text-muted-foreground">Consequences already fired; these are yours to hand over.</p>
    </header>

    <div v-if="total" class="grid gap-2 sm:grid-cols-2">
      <div v-for="entry in loot" :key="entry.id" class="flex items-center gap-2 rounded-lg border border-border p-2">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <component :is="lootIcon(entry.kind)" class="h-4 w-4" aria-hidden="true" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-body font-semibold text-foreground">{{ entry.label }}</p>
          <p class="text-caption text-muted-foreground">{{ describeHeldLoot(entry.kind) }}</p>
        </div>
        <AppButton label="Dispatch" size="xs" variant="primary" :loading="dispatchingId === entry.id" @click="dispatchOne(entry.id)" />
      </div>

      <div v-for="event in held" :key="event.event_id" class="flex items-center gap-2 rounded-lg border border-border p-2">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tone-arcane/15 text-ink-arcane">
          <IconClock class="h-4 w-4" aria-hidden="true" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-body font-semibold text-foreground">{{ describeHeldPayoff(event) }}</p>
          <p class="text-caption text-muted-foreground">{{ event.beat_title ? `held at ${event.beat_title}` : "held" }}</p>
        </div>
        <AppButton label="Fire now" size="xs" variant="primary" :loading="firingId === event.event_id" @click="fireOne(event.event_id)" />
      </div>
    </div>
    <p v-else class="text-caption italic text-muted-foreground">Nothing held back — every fired consequence has already gone out.</p>
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * What the ledger has already fired but the DM has not yet handed to the
 * table (#853, story F, `Main` board's "beats are events, objectives are
 * state" model applied to payoffs): loot rolled and waiting in
 * `loot_placements`, and consequence events held back in the Advance dialog
 * rather than performed on the spot. Quest-wide, not beat-scoped — a payoff
 * held three beats ago is still the DM's to dispatch today.
 */
import { computed, ref } from "vue";
import { useDispatchLoot } from "@/composables/quests/useQuestFlow";
import { useFireHeldConsequence } from "@/composables/quests/useQuestThreads";
import { describeHeldLoot, describeHeldPayoff } from "@/lib/quests/run";
import { IconClock, IconCoins, IconPackage, IconPackageOpen } from "@/lib/icons";
import type { LootPlacement, LootPlacementKind, QuestHeldPayoff } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";

const { campaignId, loot, held } = defineProps<{
  campaignId: string;
  loot: LootPlacement[];
  held: QuestHeldPayoff[];
}>();

const total = computed(() => loot.length + held.length);
const dispatchLoot = useDispatchLoot();
const fireConsequence = useFireHeldConsequence();
const dispatchingId = ref("");
const firingId = ref("");
const error = ref("");

function lootIcon(kind: LootPlacementKind) {
  return kind === "currency" ? IconCoins : kind === "loot_chest" ? IconPackageOpen : IconPackage;
}

async function dispatchOne(entryId: string) {
  dispatchingId.value = entryId;
  error.value = "";
  try { await dispatchLoot.mutateAsync({ entryIds: [entryId], campaignId }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not drop loot in chat"; }
  finally { dispatchingId.value = ""; }
}

async function fireOne(eventId: string) {
  firingId.value = eventId;
  error.value = "";
  try { await fireConsequence.mutateAsync({ eventId }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not fire the held consequence"; }
  finally { firingId.value = ""; }
}
</script>
