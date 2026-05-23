<template>
  <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
    <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">
      Details
    </h2>
    <div class="flex flex-col gap-3">
      <div>
        <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">
          ENCOUNTER NAME
        </label>
        <input
          :value="name"
          type="text"
          placeholder="Name your encounter…"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="$emit('update:name', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div>
        <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">
          DESCRIPTION
        </label>
        <RichTextEditor
          :model-value="description"
          placeholder="Scene-setting notes, terrain, objectives…"
          min-height="120px"
          @update:model-value="$emit('update:description', $event)"
        />
      </div>
      <div>
        <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">
          LOCATION
        </label>
        <EntityCombobox
          :model-value="locationId ?? ''"
          :options="allLocations ?? []"
          placeholder="— no location —"
          @update:model-value="$emit('update:locationId', $event || null)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const {
  name,
  description,
  locationId = null,
  allLocations = null,
} = defineProps<{
  name: string;
  description: string;
  locationId?: string | null;
  allLocations?: { id: string; name: string }[] | null;
}>();

defineEmits<{
  "update:name": [value: string];
  "update:description": [value: string];
  "update:locationId": [value: string | null];
}>();
</script>
