<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Resource Pools</h2>
      <AppButton variant="outline" size="xs" label="Add resource" @click="addResource">
        <template #icon><IconAdd class="h-3 w-3" /></template>
      </AppButton>
    </div>
    <p class="text-body text-muted-foreground">
      Tracked pools (uses, charges, etc.) shown on the character sheet.
    </p>

    <div v-if="resources.length === 0" class="text-body text-muted-foreground italic">No resource pools defined.</div>

    <div v-for="(res, i) in resources" :key="i" class="rounded-md border border-border p-3 space-y-3 relative">
      <AppButton
        variant="ghost"
        tone="danger"
        size="icon-xs"
        :icon="IconClose"
        class="absolute top-2 right-2"
        @click="removeResource(i)"
      />

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">KEY</label>
          <AppInput
            v-model="resourceField(i, 'key').value"
            placeholder="e.g. grit_points"
            tone="muted"
            size="body-xs"
          />
        </div>
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">LABEL</label>
          <AppInput
            v-model="resourceField(i, 'label').value"
            placeholder="e.g. Grit Points"
            tone="muted"
            size="body-xs"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">RECHARGES ON</label>
          <AppSelect v-model="resourceField(i, 'rest').value" tone="muted" size="body-xs" weight="normal" block>
            <option value="short">Short Rest</option>
            <option value="long">Long Rest</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">SCALING</label>
          <AppSelect v-model="resourceField(i, 'scaling').value" tone="muted" size="body-xs" weight="normal" block>
            <option value="fixed">Fixed value</option>
            <option value="per_level">Per class level</option>
            <option value="table">Custom table (20 values)</option>
          </AppSelect>
        </div>
      </div>

      <div v-if="res.scaling === 'fixed'">
        <label class="block text-eyebrow text-muted-foreground mb-1">VALUE</label>
        <AppInput
          v-model.number="resourceField(i, 'fixed_value').value"
          type="number" min="0" placeholder="e.g. 1"
          tone="muted"
          size="body-xs"
        />
      </div>

      <div v-if="res.scaling === 'table'">
        <label class="block text-eyebrow text-muted-foreground mb-1.5">VALUES PER LEVEL (1–20)</label>
        <div class="grid grid-cols-5 gap-1.5">
          <div v-for="n in 20" :key="n" class="space-y-0.5">
            <span class="block font-cinzel text-2xs text-muted-foreground text-center">{{ n }}</span>
            <input :value="(res.table_values ?? [])[n - 1] ?? ''" type="number" min="0"
              class="w-full bg-muted/40 border border-border rounded px-1.5 py-1 text-caption text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              @input="setTableValue(i, n - 1, ($event.target as HTMLInputElement).valueAsNumber)" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconClose } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import type { CustomResource, ResourceScaling } from "@/levelup/customTypes";

const { resources } = defineProps<{
  resources: CustomResource[];
}>();

const emit = defineEmits<{
  "update:resources": [value: CustomResource[]];
}>();

function addResource() {
  emit("update:resources", [...resources, { key: "", label: "", rest: "long", scaling: "fixed" as ResourceScaling, fixed_value: 1 }]);
}

function removeResource(i: number) {
  emit("update:resources", resources.filter((_, idx) => idx !== i));
}

function updateResource<K extends keyof CustomResource>(i: number, field: K, value: CustomResource[K]) {
  const next = resources.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
  emit("update:resources", next);
}

// Per-field writable proxy that routes an AppInput/AppSelect v-model through
// updateResource() rather than mutating the (immutable, emit-driven) `resources`
// prop directly — mirrors CustomClassStepsEditor's stepField().
function resourceField<K extends keyof CustomResource>(i: number, field: K) {
  return computed<CustomResource[K]>({
    get: () => resources[i][field],
    set: (value) => updateResource(i, field, value),
  });
}

function setTableValue(i: number, idx: number, value: number) {
  const res = resources[i];
  if (!res) return;
  const arr = [...(res.table_values ?? Array(20).fill(0))];
  arr[idx] = isNaN(value) ? 0 : value;
  updateResource(i, "table_values", arr);
}
</script>
