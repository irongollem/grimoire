<script setup lang="ts">
import { computed, ref } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useNpcs } from "@/composables/useNpcs";
import { useItems } from "@/composables/useItems";
import { useNotes } from "@/composables/useNotes";
import { useDeckBacks, useCreateDeckBack, useDeleteDeckBack } from "@/composables/useDowntime";
import { DOWNTIME_ACTIVITIES, getDowntimeActivity } from "@/data/downtimeActivities";
import type { DowntimeDeckBack, DowntimeRewardType } from "@/types/downtime.types";

const { data: backs } = useDeckBacks();
const { data: npcs } = useNpcs();
const { data: items } = useItems();
const { data: notes } = useNotes();
const createBack = useCreateDeckBack();
const deleteBack = useDeleteDeckBack();

/**
 * The reward types a DM can prep on a card back. Prepped backs can technically
 * carry any `DowntimeRewardType`, but only these three have a campaign-scoped
 * entity list to pick from here — and they mirror what the seed deck mints.
 */
const PREP_TYPES = [
  { value: "npc", label: "NPC" },
  { value: "item", label: "Item" },
  { value: "note", label: "Note" },
] as const satisfies ReadonlyArray<{ value: DowntimeRewardType; label: string }>;

const activityKey = ref(DOWNTIME_ACTIVITIES[0].key);
const rewardType = ref<DowntimeRewardType>("npc");
const rewardId = ref("");
const isRecurring = ref(false);
const errorMessage = ref<string | null>(null);

/** Options for the picker, per selected reward type. Notes key off `title`. */
const rewardOptions = computed<{ id: string; name: string }[]>(() => {
  switch (rewardType.value) {
    case "item":
      return (items.value ?? []).map((i) => ({ id: i.id, name: i.name }));
    case "note":
      return (notes.value ?? []).map((n) => ({ id: n.id, name: n.title }));
    case "npc":
    default:
      return (npcs.value ?? []).map((n) => ({ id: n.id, name: n.name }));
  }
});

const rewardTypeLabel = computed(
  () => PREP_TYPES.find((t) => t.value === rewardType.value)?.label ?? "entity",
);

/** Unconsumed, in the order the deck will hand them out. */
const pile = computed<DowntimeDeckBack[]>(() =>
  (backs.value ?? [])
    .filter((b) => b.consumed_at === null)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
);

const consumed = computed(() => (backs.value ?? []).filter((b) => b.consumed_at !== null));

/**
 * Resolve a back's linked entity name across every reward type. A deleted target
 * must read as absent, not vanish silently.
 */
function rewardName(type: DowntimeRewardType, id: string): string {
  switch (type) {
    case "item":
      return items.value?.find((i) => i.id === id)?.name ?? "??? (deleted)";
    case "note":
      return notes.value?.find((n) => n.id === id)?.title ?? "??? (deleted)";
    case "npc":
      return npcs.value?.find((n) => n.id === id)?.name ?? "??? (deleted)";
    default:
      // spell/quest/faction backs can exist from other tools; name unknown here.
      return "??? (linked)";
  }
}

function activityTitle(key: string): string {
  return getDowntimeActivity(key)?.title ?? "??? (unknown)";
}

function onRewardTypeChange() {
  // The previously-picked id belongs to the previous type's list; clear it.
  rewardId.value = "";
}

async function addBack() {
  errorMessage.value = null;
  if (rewardId.value === "") {
    errorMessage.value = `Pick ${rewardTypeLabel.value === "Item" ? "an" : "a"} ${rewardTypeLabel.value} to sit on the back of the card.`;
    return;
  }
  const nextPosition =
    pile.value.filter((b) => b.activity_key === activityKey.value).length;
  try {
    await createBack.mutateAsync({
      activity_key: activityKey.value,
      reward_type: rewardType.value,
      reward_id: rewardId.value,
      is_recurring: isRecurring.value,
      position: nextPosition,
    });
    rewardId.value = "";
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
        Slot a real NPC, item, or note onto the back of a card. Prepped backs are dealt first,
        in order; when the pile runs dry the deck falls back to a random system seed.
      </p>
    </header>

    <!-- Prep a back -->
    <div class="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
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

      <label class="block text-2xs font-medium">
        Type
        <select
          v-model="rewardType"
          class="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          @change="onRewardTypeChange"
        >
          <option v-for="t in PREP_TYPES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
      </label>

      <div class="text-2xs font-medium">
        {{ rewardTypeLabel }}
        <EntityCombobox
          v-model="rewardId"
          :options="rewardOptions"
          :placeholder="`Search ${rewardTypeLabel.toLowerCase()}s…`"
        />
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
      Recurring — this back is <em>always</em> what they find here (never consumed)
    </label>

    <p v-if="errorMessage" class="mt-2 text-2xs text-destructive">{{ errorMessage }}</p>

    <!-- The pile -->
    <div class="mt-5">
      <h3 class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        Waiting in the pile
      </h3>
      <p v-if="pile.length === 0" class="mt-1 text-2xs text-muted-foreground">
        Nothing prepped. Every draw will surface a random system seed.
      </p>
      <ul v-else class="mt-2 space-y-1">
        <li
          v-for="(back, i) in pile"
          :key="back.id"
          class="flex items-center gap-2 rounded border border-border px-2 py-1 text-2xs"
        >
          <span class="w-5 shrink-0 text-muted-foreground">{{ i + 1 }}.</span>
          <span class="font-medium">{{ rewardName(back.reward_type, back.reward_id) }}</span>
          <span
            class="rounded-full border border-border px-1.5 text-2xs capitalize text-muted-foreground"
          >
            {{ back.reward_type }}
          </span>
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
          <span>{{ rewardName(back.reward_type, back.reward_id) }}</span>
          <span>→ {{ activityTitle(back.activity_key) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
