<template>
  <div class="flex items-center gap-2 min-w-0">
    <!-- FocalImage fills its parent, so the parent sets the size. -->
    <div v-if="modelValue && picture?.image_url" class="size-10 shrink-0 overflow-hidden rounded-md">
      <FocalImage :src="picture.image_url" :alt="picture.name" format="square" :focal-point="picture.focal" record />
    </div>
    <SegmentedControl
      :model-value="kind"
      :options="KIND_OPTIONS"
      size="xs"
      @update:model-value="onKind"
    />
    <EntityCombobox
      v-if="kind !== ''"
      :key="kind"
      :model-value="modelValue?.id ?? ''"
      :options="options"
      :selected-label="picture?.name ?? null"
      placeholder="This entry is…"
      @update:model-value="onPick"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * "This entry is…": names the creature, item or NPC a roll table entry stands
 * for, so a question made from the table can show its picture (#1212). The
 * lists load only for the kind chosen, so an entry that names nothing reads
 * no index at all.
 */
import { computed, ref, watch } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useNpcs } from "@/composables/npcs/useNpcs";
import type { EntryPicture } from "@/lib/tableQuestions/options";
import type { EntryRef, EntryRefKind } from "@/types/tableQuestion.types";

type Kind = EntryRefKind | "";

const KIND_OPTIONS: SegmentedOption<Kind>[] = [
  { value: "", label: "Nothing" },
  { value: "monster", label: "Creature" },
  { value: "item", label: "Item" },
  { value: "npc", label: "NPC" },
];

const { picture = null } = defineProps<{ picture?: EntryPicture | null }>();
const modelValue = defineModel<EntryRef | null>({ required: true });
/** The name of what was just picked, for the caller to offer as the entry's label. */
const emit = defineEmits<{ picked: [name: string] }>();

const kind = ref<Kind>(modelValue.value?.kind ?? "");
watch(modelValue, (ref) => { if (ref) kind.value = ref.kind; });

const monsters = useMonsterIndex(() => ({ enabled: kind.value === "monster" }));
const items = useItemIndex(() => ({ enabled: kind.value === "item" }));
const npcs = useNpcs(() => kind.value === "npc");

const options = computed<{ id: string; name: string }[]>(() => {
  if (kind.value === "monster") return monsters.data.value ?? [];
  if (kind.value === "item") return items.data.value ?? [];
  if (kind.value === "npc") return npcs.data.value ?? [];
  return [];
});

function onKind(next: Kind) {
  kind.value = next;
  // A ref of another kind would point at the wrong table's id.
  if (modelValue.value && modelValue.value.kind !== next) modelValue.value = null;
}

function onPick(id: string) {
  if (kind.value === "" || id === "") {
    modelValue.value = null;
    return;
  }
  modelValue.value = { kind: kind.value, id };
  const name = options.value.find((o) => o.id === id)?.name;
  if (name) emit("picked", name);
}
</script>
