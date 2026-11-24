<template>
  <div class="flex flex-col gap-2" data-testid="habitat-life">
    <p class="m-0 text-caption text-muted-foreground">
      When Grimoire needs a creature in this country it rolls from these shares. Leave it empty and it is left to the generator.
    </p>
    <ShareList :items="items" whole="everything that lives there" remainder="anything else" @set="setLifePercent" @remove="removeLife" />
    <EntityCombobox v-model="creaturePick" :options="creatureOptions" placeholder="Add a creature…" @open="creaturesWanted = true" />
    <div>
      <AppButton variant="link" size="inline" label="New creature" to="/monsters/new" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * What lives in a habitat, as shares of its life: `campaign_habitat_life`, the same interaction as the peoples but for
 * creatures only. A creature is never typed: it is picked from the bestiary (the encounter picker's own index, read
 * when the picker is first opened), so it carries the record's own name. Each habitat holds a creature once, and its
 * shares may not pass 100.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ShareList from "../ShareList.vue";
import { useHabitatEditing } from "@/composables/canon/useCampaignHabitats";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import type { Habitat } from "@/lib/canon/habitats";

const { habitat } = defineProps<{ habitat: Habitat }>();
const { life, addLife, setLifePercent, removeLife } = useHabitatEditing();

const here = computed(() => life.value.filter((l) => l.habitatId === habitat.id));
const items = computed(() => here.value.map((l) => ({ id: l.id, name: l.name, percent: l.percent })));

const creaturePick = ref("");
const creaturesWanted = ref(false);
const { data: creatureIndex } = useMonsterIndex(() => ({ enabled: creaturesWanted.value }));
const creatureOptions = computed(() => {
  const taken = new Set(here.value.map((l) => l.recordId));
  return (creatureIndex.value ?? []).filter((m) => !taken.has(m.id));
});

// An add-picker: it adds a creature at 0% and empties itself, so it is local state, not a list filter.
watch(creaturePick, (id) => {
  if (!id) return;
  const entry = creatureIndex.value?.find((m) => m.id === id);
  if (!entry) return;
  addLife({ habitatId: habitat.id, recordId: id, fromLibrary: entry.is_shared, percent: 0 });
  creaturePick.value = "";
});
</script>
