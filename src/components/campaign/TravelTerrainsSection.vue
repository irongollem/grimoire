<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-3">
    <h2 class="text-heading-sm font-semibold text-foreground">Terrains</h2>

    <ul class="divide-y divide-border">
      <li v-for="t in rows" :key="t.terrain.key" class="py-2" :data-testid="`terrain-${t.terrain.key}`">
        <form v-if="editingKey === t.terrain.key" class="space-y-2" @submit.prevent="save">
          <TravelTerrainFields v-model:name="form.name" v-model:factor="form.factor" v-model:sink="form.sink" />
          <div class="flex gap-2">
            <AppButton type="submit" size="sm" :disabled="!valid" :loading="saving">Save</AppButton>
            <AppButton size="sm" variant="ghost" @click="editingKey = null">Cancel</AppButton>
          </div>
        </form>
        <div v-else class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-label-lg font-semibold text-foreground">{{ t.terrain.name }}</span>
              <span v-if="t.changed" class="text-eyebrow uppercase text-ink-caution">Changed</span>
            </div>
            <p class="text-caption text-foreground">{{ terrainEffectText(t.terrain) }}</p>
            <p class="text-caption text-muted-foreground">{{ t.sourceText }}</p>
          </div>
          <AppButton size="sm" variant="ghost" @click="edit(t.terrain)">Edit</AppButton>
          <AppButton v-if="t.changed" size="sm" variant="ghost" @click="reset(t.terrain.key)">Back to the book</AppButton>
          <AppButton v-else-if="!t.preset" size="sm" variant="ghost" tone="danger" @click="remove(t.terrain)">Remove</AppButton>
        </div>
      </li>
    </ul>

    <form v-if="editingKey === NEW" class="space-y-2 border-t border-border pt-3" @submit.prevent="save">
      <TravelTerrainFields v-model:name="form.name" v-model:factor="form.factor" v-model:sink="form.sink" />
      <div class="flex gap-2">
        <AppButton type="submit" size="sm" :disabled="!valid" :loading="saving">Add</AppButton>
        <AppButton size="sm" variant="ghost" @click="editingKey = null">Cancel</AppButton>
      </div>
    </form>
    <AppButton v-else size="sm" variant="outline" @click="startNew">Add a terrain</AppButton>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useResetTravel, useSaveTerrain, useTravel } from "@/composables/locations/useTravel";
import { TERRAIN_PRESETS, type Terrain } from "@/rules/travelSpeed";
import { slugKey, terrainEffectText } from "./travelSettings";
import TravelTerrainFields from "./TravelTerrainFields.vue";

const NEW = "\u0000new";

const { terrains, rows: stored } = useTravel();
const save$ = useSaveTerrain();
const reset$ = useResetTravel("travel_terrains");
const toast = useToast();
const { confirm } = useConfirm();

const rows = computed(() => {
  const overridden = new Set((stored.data.value?.terrains ?? []).map((r) => r.key));
  return terrains.value.map((terrain) => {
    const preset = TERRAIN_PRESETS.some((p) => p.key === terrain.key);
    const changed = preset && overridden.has(terrain.key);
    const sourceText = !preset ? "Your own" : changed ? "Changed from the book" : (terrain.source ?? "A starting point of ours, yours to change");
    return { terrain, preset, changed, sourceText };
  });
});

const editingKey = ref<string | null>(null);
const form = reactive({ name: "", factor: 1, sink: 1 });
const saving = computed(() => save$.isPending.value);
const valid = computed(
  () =>
    form.name.trim().length > 0 &&
    typeof form.factor === "number" && form.factor > 0 && form.factor <= 4 &&
    typeof form.sink === "number" && form.sink > 0 && form.sink <= 1,
);

function edit(t: Terrain) {
  Object.assign(form, { name: t.name, factor: t.factor, sink: t.sink });
  editingKey.value = t.key;
}

function startNew() {
  Object.assign(form, { name: "", factor: 1, sink: 1 });
  editingKey.value = NEW;
}

async function save() {
  if (!valid.value || editingKey.value === null) return;
  const key = editingKey.value === NEW ? slugKey(form.name, terrains.value.map((t) => t.key)) : editingKey.value;
  try {
    await save$.mutateAsync({ key, name: form.name.trim(), factor: form.factor, sink: form.sink });
    editingKey.value = null;
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

async function reset(key: string) {
  try {
    await reset$.mutateAsync(key);
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

async function remove(t: Terrain) {
  if (!(await confirm(`Roads and journeys that go over ${t.name} will read it as open country.`, { title: `Remove ${t.name}?`, confirmLabel: "Remove" }))) return;
  await reset(t.key);
}
</script>
