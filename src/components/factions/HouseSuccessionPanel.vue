<template>
  <aside class="flex flex-col gap-2.5" aria-label="Line of succession">
    <p class="text-eyebrow font-semibold text-muted-foreground">Line of succession</p>

    <p v-if="!line.length" class="text-caption italic text-muted-foreground">No one yet. Click people on the tree.</p>
    <ol v-else class="m-0 flex list-none flex-col gap-1.5 p-0 text-body">
      <li v-for="(key, i) in line" :key="key" class="flex items-center gap-2">
        <span class="w-4 text-label text-muted-foreground">{{ i + 1 }}</span>
        <span
          class="min-w-0 flex-1 truncate"
          :class="[i === 0 ? 'font-bold' : '', people.get(key)?.dead ? 'line-through text-muted-foreground' : '']"
        >{{ people.get(key)?.name ?? "Unknown" }}</span>
        <span v-if="key === heir" class="rounded-full border border-border px-2 text-label">Heir</span>
        <span v-if="people.get(key)?.isPc" class="rounded-full border border-primary px-2 text-label text-primary">PC</span>
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronUp"
          :aria-label="`Move ${people.get(key)?.name ?? 'person'} up`"
          :disabled="i === 0"
          @click="emit('move', key, -1)"
        />
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronDown"
          :aria-label="`Move ${people.get(key)?.name ?? 'person'} down`"
          :disabled="i === line.length - 1"
          @click="emit('move', key, 1)"
        />
      </li>
    </ol>

    <hr class="my-1 border-border" />

    <label for="succession-custom" class="text-eyebrow font-semibold text-muted-foreground">Succession custom</label>
    <textarea
      id="succession-custom"
      v-model="draft.succession_note"
      rows="4"
      data-hand
      class="field-input resize-none"
    />
    <AutosaveStatus :status="autosave.status.value" :error="autosave.saveError.value" />
    <p class="text-caption italic text-muted-foreground">
      Kept on the house page and read by the AI. It is a note, not a rule: the order above is only ever what you set.
    </p>
    <hr class="my-1 border-border" />
    <p class="text-caption italic text-muted-foreground">
      First in line is the house's Heir, so there is no separate Heir role to keep in step. When someone in the line
      dies, they drop out and the rest move up.
    </p>
  </aside>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/controls/AppButton.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { useUpdateFaction } from "@/composables/factions/useFactions";
import type { KinPersonView } from "@/composables/kinship/useKinGraph";
import { useAutosave } from "@/composables/useAutosave";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import { heirOf } from "@/lib/kinship/succession";
import type { Faction } from "@/types/faction.types";
import type { PersonKey } from "@/types/kinship.types";

const { faction, line, people } = defineProps<{
  faction: Pick<Faction, "id" | "succession_note">;
  line: PersonKey[];
  people: Map<PersonKey, KinPersonView>;
}>();
const emit = defineEmits<{ move: [key: PersonKey, delta: -1 | 1] }>();

const heir = computed(() => heirOf(line, (k) => people.get(k)?.dead ?? false));

const updateFaction = useUpdateFaction();
const queryClient = useQueryClient();

const draft = reactive({ succession_note: faction.succession_note });
const autosave = useAutosave({
  draft,
  initial: () => ({ succession_note: faction.succession_note }),
  equal: (a, b) => a.succession_note === b.succession_note,
  save: async (snapshot) => {
    await updateFaction.mutateAsync({ id: faction.id, update: { succession_note: snapshot.succession_note } });
    // The detail page reads the faction under its own key, which the list invalidation misses.
    await queryClient.invalidateQueries({ queryKey: ["factions", faction.id] });
  },
});
</script>
