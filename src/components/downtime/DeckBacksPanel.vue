<script setup lang="ts">
import { computed, ref } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useNpcs } from "@/composables/useNpcs";
import { useDeckBacks, useCreateDeckBack, useDeleteDeckBack } from "@/composables/useDowntime";
import { DOWNTIME_ACTIVITIES, getDowntimeActivity } from "@/data/downtimeActivities";
import type { DowntimeDeckBack } from "@/types/downtime.types";

const { data: backs } = useDeckBacks();
const { data: npcs } = useNpcs();
const createBack = useCreateDeckBack();
const deleteBack = useDeleteDeckBack();

const activityKey = ref(DOWNTIME_ACTIVITIES[0].key);
const npcId = ref("");
const isRecurring = ref(false);
const errorMessage = ref<string | null>(null);

const npcOptions = computed(() => (npcs.value ?? []).map((n) => ({ id: n.id, name: n.name })));

/** Unconsumed, in the order the deck will hand them out. */
const pile = computed<DowntimeDeckBack[]>(() =>
  (backs.value ?? [])
    .filter((b) => b.consumed_at === null)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
);

const consumed = computed(() => (backs.value ?? []).filter((b) => b.consumed_at !== null));

/** A deleted NPC must read as absent, not vanish silently. */
function npcName(id: string): string {
  return npcs.value?.find((n) => n.id === id)?.name ?? "??? (deleted)";
}

function activityTitle(key: string): string {
  return getDowntimeActivity(key)?.title ?? "??? (unknown)";
}

async function addBack() {
  errorMessage.value = null;
  if (npcId.value === "") {
    errorMessage.value = "Pick an NPC to sit on the back of the card.";
    return;
  }
  const nextPosition =
    pile.value.filter((b) => b.activity_key === activityKey.value).length;
  try {
    await createBack.mutateAsync({
      activity_key: activityKey.value,
      reward_type: "npc",
      reward_id: npcId.value,
      is_recurring: isRecurring.value,
      position: nextPosition,
    });
    npcId.value = "";
    isRecurring.value = false;
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Could not prep that card back.";
  }
}
</script>

<template>
  <section class="rounded-lg border border-border bg-card p-4">
    <header>
      <h2 class="font-cinzel text-base font-semibold">Stack the deck</h2>
      <p class="mt-1 text-2xs text-muted-foreground">
        Slot a real character onto the back of a card. Prepped backs are dealt first, in order;
        when the pile runs dry the deck falls back to a random contact.
      </p>
    </header>

    <!-- Prep a back -->
    <div class="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label class="block text-2xs font-medium">
        Archetype
        <select
          v-model="activityKey"
          class="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
        >
          <option v-for="a in DOWNTIME_ACTIVITIES" :key="a.key" :value="a.key">
            {{ a.title }}
          </option>
        </select>
      </label>

      <div class="text-2xs font-medium">
        NPC
        <EntityCombobox v-model="npcId" :options="npcOptions" placeholder="Search NPCs…" />
      </div>

      <button
        type="button"
        :disabled="createBack.isPending.value"
        class="h-8 rounded bg-primary px-3 font-cinzel text-2xs text-primary-foreground disabled:opacity-50"
        @click="addBack"
      >
        Prep
      </button>
    </div>

    <label class="mt-2 flex items-center gap-2 text-2xs">
      <input v-model="isRecurring" type="checkbox" />
      Recurring — this contact is <em>always</em> who they find here (never consumed)
    </label>

    <p v-if="errorMessage" class="mt-2 text-2xs text-destructive">{{ errorMessage }}</p>

    <!-- The pile -->
    <div class="mt-5">
      <h3 class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        Waiting in the pile
      </h3>
      <p v-if="pile.length === 0" class="mt-1 text-2xs text-muted-foreground">
        Nothing prepped. Every draw will surface a random system contact.
      </p>
      <ul v-else class="mt-2 space-y-1">
        <li
          v-for="(back, i) in pile"
          :key="back.id"
          class="flex items-center gap-2 rounded border border-border px-2 py-1 text-2xs"
        >
          <span class="w-5 shrink-0 text-muted-foreground">{{ i + 1 }}.</span>
          <span class="font-medium">{{ npcName(back.reward_id) }}</span>
          <span class="text-muted-foreground">→ {{ activityTitle(back.activity_key) }}</span>
          <span
            v-if="back.is_recurring"
            class="rounded-full border border-border px-1.5 text-2xs text-muted-foreground"
          >
            recurring
          </span>
          <button
            type="button"
            class="ml-auto text-destructive hover:underline"
            @click="deleteBack.mutate(back.id)"
          >
            Remove
          </button>
        </li>
      </ul>
    </div>

    <div v-if="consumed.length > 0" class="mt-4">
      <h3 class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        Already dealt
      </h3>
      <ul class="mt-2 space-y-1">
        <li
          v-for="back in consumed"
          :key="back.id"
          class="flex items-center gap-2 text-2xs text-muted-foreground line-through"
        >
          <span>{{ npcName(back.reward_id) }}</span>
          <span>→ {{ activityTitle(back.activity_key) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
