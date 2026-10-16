<template>
  <div class="space-y-1">
    <label class="text-caption font-semibold text-foreground">From an NPC or monster</label>
    <EntityCombobox v-model="picked" :options="options" placeholder="Take a name and portrait from…">
      <template #option="{ opt }">
        <span class="flex items-center gap-2">
          <span>{{ opt.name }}</span>
          <span class="text-label text-muted-foreground">{{ opt.kind }}</span>
        </span>
      </template>
    </EntityCombobox>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useNpcs } from "@/composables/npcs/useNpcs";

interface Subject {
  /** Prefixed with the kind: an NPC and a monster may share a name, never an id. */
  id: string;
  name: string;
  kind: "NPC" | "Monster";
  image: string | null;
}

const emit = defineEmits<{ pick: [subject: { name: string; image: string | null }] }>();

const { data: npcs } = useNpcs();
const { data: monsters } = useMonsterIndex();

const options = computed<Subject[]>(() => [
  ...(npcs.value ?? []).map((n) => ({ id: `npc:${n.id}`, name: n.name, kind: "NPC" as const, image: n.portrait_url })),
  ...(monsters.value ?? []).map((m) => ({ id: `monster:${m.id}`, name: m.name, kind: "Monster" as const, image: m.image_url })),
]);

// A one-shot action, not a stored choice: picking copies the name and portrait, and the field empties for the next.
const picked = ref("");
watch(picked, (id) => {
  if (!id) return;
  const subject = options.value.find((o) => o.id === id);
  if (subject) emit("pick", { name: subject.name, image: subject.image });
  picked.value = "";
});
</script>
