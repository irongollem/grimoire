<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-4">
    <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Features per Level</h2>
    <p class="font-fell text-sm text-muted-foreground">
      Select features from the
      <RouterLink to="/features" class="text-primary hover:underline">Abilities compendium</RouterLink>
      to grant at each level. Create custom features there first if needed.
    </p>

    <div v-if="populatedLevels.length > 0" class="space-y-3">
      <div v-for="lvl in populatedLevels" :key="lvl" class="flex items-start gap-3">
        <span class="text-label-lg text-primary w-8 pt-2 shrink-0">{{ lvl }}</span>
        <div class="flex-1 min-w-0 space-y-2">
          <div v-if="(features[lvl.toString()] ?? []).length > 0" class="flex flex-wrap gap-1.5">
            <span
              v-for="fid in features[lvl.toString()]"
              :key="fid"
              class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-fell text-xs text-primary"
            >
              {{ featureNameById(fid) }}
              <button
                type="button"
                class="ml-0.5 text-primary/60 hover:text-destructive transition-colors leading-none"
                @click="removeFeatureFromLevel(lvl, fid)"
              >×</button>
            </span>
          </div>
          <EntityCombobox
            model-value=""
            :options="availableFeaturesForLevel(lvl)"
            placeholder="Add feature…"
            @update:model-value="(fid) => fid && addFeatureToLevel(lvl, fid)"
          />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <select
        v-model="addFeatureLevel"
        class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="" disabled>Level…</option>
        <option v-for="n in 20" :key="n" :value="n">{{ n }}</option>
      </select>
      <button
        type="button"
        :disabled="!addFeatureLevel || populatedLevels.includes(Number(addFeatureLevel))"
        class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
        @click="addLevel"
      >
        <IconAdd class="h-3 w-3" />
        Add level
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { IconAdd } from "@/lib/icons";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const { features, allFeatureOptions } = defineProps<{
  features: Record<string, string[]>;
  allFeatureOptions: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  "update:features": [value: Record<string, string[]>];
}>();

const populatedLevels = computed<number[]>(() =>
  Object.keys(features).map(Number).sort((a, b) => a - b),
);

const addFeatureLevel = ref<number | "">("");

function featureNameById(featureId: string): string {
  return allFeatureOptions.find(f => f.id === featureId)?.name ?? featureId;
}

function availableFeaturesForLevel(level: number) {
  const selected = new Set(features[level.toString()] ?? []);
  return allFeatureOptions.filter(f => !selected.has(f.id));
}

function addFeatureToLevel(level: number, featureId: string) {
  const key = level.toString();
  const current = features[key] ?? [];
  if (!current.includes(featureId)) {
    emit("update:features", { ...features, [key]: [...current, featureId] });
  }
}

function removeFeatureFromLevel(level: number, featureId: string) {
  const key = level.toString();
  const next = (features[key] ?? []).filter(id => id !== featureId);
  if (next.length === 0) {
    const copy = { ...features };
    delete copy[key];
    emit("update:features", copy);
  } else {
    emit("update:features", { ...features, [key]: next });
  }
}

function addLevel() {
  if (!addFeatureLevel.value) return;
  const key = addFeatureLevel.value.toString();
  if (features[key] === undefined) {
    emit("update:features", { ...features, [key]: [] });
  }
  addFeatureLevel.value = "";
}
</script>
