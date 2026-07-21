<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Resource Pools</h2>
      <button type="button"
        class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-cinzel text-2xs tracking-wider text-foreground hover:bg-muted/40 transition-colors"
        @click="addResource">
        <IconAdd class="h-3 w-3" />
        Add resource
      </button>
    </div>
    <p class="font-fell text-sm text-muted-foreground">
      Tracked pools (uses, charges, etc.) shown on the character sheet.
    </p>

    <div v-if="resources.length === 0" class="font-fell text-sm text-muted-foreground italic">No resource pools defined.</div>

    <div v-for="(res, i) in resources" :key="i" class="rounded-md border border-border p-3 space-y-3 relative">
      <button type="button" class="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors" @click="removeResource(i)">
        <IconClose class="h-3.5 w-3.5" />
      </button>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1">KEY</label>
          <input :value="res.key" placeholder="e.g. grit_points"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="updateResource(i, 'key', ($event.target as HTMLInputElement).value)" />
        </div>
        <div>
          <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1">LABEL</label>
          <input :value="res.label" placeholder="e.g. Grit Points"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="updateResource(i, 'label', ($event.target as HTMLInputElement).value)" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1">RECHARGES ON</label>
          <select :value="res.rest" class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="updateResource(i, 'rest', ($event.target as HTMLSelectElement).value as 'short' | 'long')">
            <option value="short">Short Rest</option>
            <option value="long">Long Rest</option>
          </select>
        </div>
        <div>
          <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1">SCALING</label>
          <select :value="res.scaling" class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="updateResource(i, 'scaling', ($event.target as HTMLSelectElement).value as 'fixed' | 'per_level' | 'table')">
            <option value="fixed">Fixed value</option>
            <option value="per_level">Per class level</option>
            <option value="table">Custom table (20 values)</option>
          </select>
        </div>
      </div>

      <div v-if="res.scaling === 'fixed'">
        <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1">VALUE</label>
        <input :value="res.fixed_value" type="number" min="0" placeholder="e.g. 1"
          class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="updateResource(i, 'fixed_value', Number(($event.target as HTMLInputElement).value))" />
      </div>

      <div v-if="res.scaling === 'table'">
        <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1.5">VALUES PER LEVEL (1–20)</label>
        <div class="grid grid-cols-5 gap-1.5">
          <div v-for="n in 20" :key="n" class="space-y-0.5">
            <span class="block font-cinzel text-[0.5625rem] text-muted-foreground text-center">{{ n }}</span>
            <input :value="(res.table_values ?? [])[n - 1] ?? ''" type="number" min="0"
              class="w-full bg-muted/40 border border-border rounded px-1.5 py-1 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              @input="setTableValue(i, n - 1, ($event.target as HTMLInputElement).valueAsNumber)" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IconAdd, IconClose } from "@/lib/icons";
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

function setTableValue(i: number, idx: number, value: number) {
  const res = resources[i];
  if (!res) return;
  const arr = [...(res.table_values ?? Array(20).fill(0))];
  arr[idx] = isNaN(value) ? 0 : value;
  updateResource(i, "table_values", arr);
}
</script>
