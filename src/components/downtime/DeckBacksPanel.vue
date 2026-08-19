<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useNpcs } from "@/composables/useNpcs";
import { useItems, useEnsureOwnedItem } from "@/composables/useItems";
import { useNotes } from "@/composables/useNotes";
import { useDeckBacks, useCreateDeckBack, useDeleteDeckBack } from "@/composables/useDowntime";
import { DOWNTIME_ACTIVITIES, getDowntimeActivity } from "@/data/downtimeActivities";
import type { DowntimeDeckBack, DowntimeRewardType } from "@/types/downtime.types";

const { data: backs } = useDeckBacks();
const { data: npcs } = useNpcs();
const { data: items } = useItems();
const { data: notes } = useNotes();
const { ensureOwnedItem } = useEnsureOwnedItem();
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
    // reward_id is a plain `uuid not null` column (the polymorphic pair can't
    // carry a real FK) — an srd item's slug id would fail the insert outright,
    // so it must become an owned row before it's handed to the mutation.
    let ownedRewardId = rewardId.value;
    if (rewardType.value === "item") {
      const picked = items.value?.find((i) => i.id === rewardId.value);
      if (!picked) {
        errorMessage.value = "That item is no longer available — pick another.";
        return;
      }
      const owned = await ensureOwnedItem(picked);
      ownedRewardId = owned.id;
    }
    await createBack.mutateAsync({
      activity_key: activityKey.value,
      reward_type: rewardType.value,
      reward_id: ownedRewardId,
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
      <h2 class="text-heading-sm font-semibold">Stack the deck</h2>
      <p class="mt-1 text-2xs text-muted-foreground">
        Slot a real NPC, item, or note onto the back of a card. Prepped backs are dealt first,
        in order; when the pile runs dry the deck falls back to a random system seed.
      </p>
    </header>

    <!-- Prep a back.
         Every control matches EntityCombobox's input metrics (rounded-md, px-3
         py-1.5, bg-card, font-fell, text-sm) so the three fields and the button
         share one baseline — the selects used to be shorter and squarer than the
         combobox, and the combobox's label sat higher than the other two. -->
    <div class="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_2fr_auto] sm:items-end">
      <div>
        <label for="deck-back-archetype" class="mb-1 block text-2xs font-medium">
          Archetype
        </label>
        <AppSelect
          id="deck-back-archetype"
          v-model="activityKey"
          size="body"
          weight="normal"
          block
          class="px-3"
        >
          <option v-for="a in DOWNTIME_ACTIVITIES" :key="a.key" :value="a.key">
            {{ a.title }}
          </option>
        </AppSelect>
      </div>

      <div>
        <label for="deck-back-type" class="mb-1 block text-2xs font-medium">Type</label>
        <AppSelect
          id="deck-back-type"
          v-model="rewardType"
          size="body"
          weight="normal"
          block
          class="px-3"
          @change="onRewardTypeChange"
        >
          <option v-for="t in PREP_TYPES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </AppSelect>
      </div>

      <div class="min-w-0">
        <span class="mb-1 block text-2xs font-medium">{{ rewardTypeLabel }}</span>
        <EntityCombobox
          v-model="rewardId"
          :options="rewardOptions"
          :placeholder="`Search ${rewardTypeLabel.toLowerCase()}s…`"
        />
      </div>

      <!-- `py-1.5 leading-5` override AppButton's `xs` size to match the selects'
           box model (py-1.5 + 1.25rem line-height). Without them it is ~8px
           shorter, and bottom-aligning a shorter control is what made it read as
           sitting oddly low next to the fields. -->
      <AppButton
        variant="primary"
        size="xs"
        label="Prep"
        :disabled="createBack.isPending.value"
        class="px-4 py-1.5 leading-5"
        @click="addBack"
      />
    </div>

    <!-- The text is one span, not loose nodes: `gap-2` treats every child as a
         flex item, so an inline <em> here would get spaced on both sides. -->
    <label class="mt-2 flex items-center gap-2 text-2xs">
      <input v-model="isRecurring" type="checkbox" />
      <span>
        Recurring — this back is <em>always</em> what they find here (never consumed)
      </span>
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
          <AppButton
            variant="link"
            tone="danger"
            size="inline-xs"
            label="Remove"
            class="ml-auto hover:underline"
            @click="deleteBack.mutate(back.id)"
          />
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
