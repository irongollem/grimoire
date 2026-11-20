<template>
  <div class="flex flex-col gap-2" data-testid="where-picker">
    <SegmentedControl :model-value="kind" :options="options" wrap aria-label="Where it comes out" @update:model-value="onKind" />

    <template v-if="kind === 'location' || kind === 'npc'">
      <p v-if="picked" class="flex items-center gap-2 text-body" data-testid="where-picked">
        <span class="font-bold">{{ picked.name }}</span>
        <AppButton variant="ghost" size="xs" label="Change" @click="picked = null" />
      </p>
      <WorldEntityPicker v-else :kinds="kind === 'location' ? PLACE_KINDS : PERSON_KINDS" @pick="onPick" />
    </template>
    <EntityCombobox v-else-if="kind === 'quest_beat'" :model-value="beatId" :options="beats ?? []" placeholder="Find a beat…" @update:model-value="onBeat" />
  </div>
</template>

<script setup lang="ts">
/**
 * "Where it can be found / comes out": a place, a person, a beat or nowhere, shared by a clue's form and a lore
 * passage. It says nothing until a choice is complete: `choose` carries the target, or null for nowhere. Choosing a
 * kind alone (a place, but none picked yet) emits nothing, so switching the kind never clears what was already set.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import WorldEntityPicker from "@/components/common/entity/WorldEntityPicker.vue";
import { useBeatOptions } from "@/composables/quests/useBeatOptions";
import type { ClueKind } from "@/composables/canon/useCanonClues";

export type Where = ClueKind | "nowhere";
export interface WhereTarget { kind: ClueKind; id: string }

const { nowhereLabel = "Nowhere yet" } = defineProps<{ nowhereLabel?: string }>();
const kind = defineModel<Where>("kind", { default: "location" });
const emit = defineEmits<{ choose: [target: WhereTarget | null] }>();

const options = computed<ReadonlyArray<{ value: Where; label: string }>>(() => [
  { value: "location", label: "A place" },
  { value: "npc", label: "A person" },
  { value: "quest_beat", label: "A beat" },
  { value: "nowhere", label: nowhereLabel },
]);
const PLACE_KINDS = ["location"] as const;
const PERSON_KINDS = ["npc"] as const;

const picked = ref<{ id: string; name: string } | null>(null);
const beatId = ref("");
const { data: beats } = useBeatOptions(() => kind.value === "quest_beat");

function onKind(next: Where) {
  kind.value = next;
  picked.value = null;
  beatId.value = "";
  if (next === "nowhere") emit("choose", null);
}

function onPick(p: { id: string; name: string }) {
  picked.value = { id: p.id, name: p.name };
  if (kind.value === "location" || kind.value === "npc") emit("choose", { kind: kind.value, id: p.id });
}

function onBeat(id: string) {
  beatId.value = id;
  if (id) emit("choose", { kind: "quest_beat", id });
}
</script>
