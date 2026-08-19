<template>
  <!-- Parent picker -->
  <div class="flex items-center gap-2">
    <span
      class="text-label-lg font-semibold text-muted-foreground shrink-0 w-16 flex items-center gap-1"
    >
      <IconChevronUp class="h-3.5 w-3.5" />Parent
    </span>
    <EntityCombobox
      :model-value="parentIdStr"
      :options="parentOptions"
      placeholder="— None (top-level) —"
      @update:model-value="$emit('update:parentId', $event || null)"
    >
      <template #option="{ opt }">
        <span
          class="inline-block h-2 w-2 rounded-full shrink-0"
          :style="{
            backgroundColor: LOCATION_TYPE_COLORS[opt.location_type],
          }"
        />
        <span class="flex-1 truncate">{{ opt.name }}</span>
        <span
          class="text-xs text-muted-foreground shrink-0 font-cinzel"
          >{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span
        >
      </template>
    </EntityCombobox>
  </div>

  <!-- Compact sub-locations -->
  <div v-if="!isNew" class="flex items-start gap-2">
    <span
      class="text-label-lg font-semibold text-muted-foreground shrink-0 w-16 flex items-center gap-1 pt-1.5"
    >
      <IconLocation class="h-3.5 w-3.5" />Child
    </span>
    <div
      class="flex-1 flex flex-wrap items-center gap-1.5 border border-border rounded-md px-3 py-1.5 min-h-8.5 bg-background relative"
    >
      <span
        v-if="childrenLoading"
        class="text-caption text-muted-foreground italic"
        >Loading…</span
      >
      <AppButton
        v-for="child in children"
        :key="child.id"
        :to="`/locations/${child.id}`"
        variant="subtle"
        fill="muted"
        size="xs"
        class="bg-muted/50 max-w-full min-w-0"
      >
        <span
          class="h-1.5 w-1.5 rounded-full shrink-0"
          :style="{
            backgroundColor: LOCATION_TYPE_COLORS[child.location_type],
          }"
        />
        <span
          class="font-cinzel text-xs font-semibold text-foreground truncate"
          >{{ child.name }}</span
        >
      </AppButton>
      <!-- Inline child search -->
      <div class="relative ml-auto">
        <AppInput
          v-model="childSearch"
          tone="bare"
          size="sm"
          :block="false"
          placeholder="Add child…"
          class="placeholder:text-muted-foreground/50 w-24 focus:w-36 transition-all"
          @focus="childDropdownOpen = true"
          @blur="onChildBlur"
          @keydown.escape="childDropdownOpen = false"
        />
        <div
          v-if="
            childDropdownOpen &&
            (childOptions.length || childSearch.trim())
          "
          class="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-lg overflow-hidden"
        >
          <AppButton
            v-for="opt in childOptions"
            :key="opt.id"
            variant="menu"
            size="body"
            block
            @mousedown.prevent="addChild(opt)"
          >
            <span
              class="h-1.5 w-1.5 rounded-full shrink-0"
              :style="{
                backgroundColor: LOCATION_TYPE_COLORS[opt.location_type],
              }"
            />
            <span
              class="font-cinzel text-xs text-foreground truncate flex-1"
              >{{ opt.name }}</span
            >
            <span
              class="text-caption-sm text-muted-foreground shrink-0"
              >{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span
            >
          </AppButton>
          <AppButton
            variant="menu"
            size="body"
            block
            class="border-t border-border"
            @mousedown.prevent="$emit('create-child', childSearch.trim())"
          >
            <IconAdd class="h-3 w-3 shrink-0 text-primary" />
            <span class="font-cinzel text-xs truncate flex-1 text-primary">
              {{
                childSearch.trim()
                  ? `Create "${childSearch.trim()}"`
                  : "Create new child location"
              }}
            </span>
          </AppButton>
        </div>
      </div>
    </div>
  </div>

  <!-- Related locations (non-hierarchical links) -->
  <div v-if="!isNew" class="flex items-start gap-2">
    <span
      class="text-label-lg font-semibold text-muted-foreground shrink-0 w-16 flex items-center gap-1 pt-1.5"
    >
      <IconLink class="h-3.5 w-3.5" />Related
    </span>
    <div
      class="flex-1 flex flex-wrap items-center gap-1.5 border border-border rounded-md px-3 py-1.5 min-h-8.5 bg-background relative"
    >
      <AppButton
        v-for="relId in relatedLocationIds"
        :key="relId"
        variant="subtle"
        fill="muted"
        tone="danger"
        size="xs"
        class="group bg-muted/50 max-w-full min-w-0"
        :tooltip="`Remove ${relatedLocationMap.get(relId)?.name ?? relId}`"
        @click="$emit('update:relatedLocationIds', relatedLocationIds.filter((id) => id !== relId))"
      >
        <span
          v-if="relatedLocationMap.get(relId)"
          class="h-1.5 w-1.5 rounded-full shrink-0"
          :style="{ backgroundColor: LOCATION_TYPE_COLORS[relatedLocationMap.get(relId)!.location_type] }"
        />
        <span class="font-cinzel text-xs font-semibold text-foreground truncate">
          {{ relatedLocationMap.get(relId)?.name ?? relId }}
        </span>
        <IconClose class="h-2.5 w-2.5 text-muted-foreground group-hover:text-destructive shrink-0" />
      </AppButton>
      <!-- Inline related search -->
      <div class="relative ml-auto">
        <AppInput
          v-model="relatedSearch"
          tone="bare"
          size="sm"
          :block="false"
          placeholder="Add related…"
          class="placeholder:text-muted-foreground/50 w-24 focus:w-36 transition-all"
          @focus="relatedDropdownOpen = true"
          @blur="onRelatedBlur"
          @keydown.escape="relatedDropdownOpen = false"
        />
        <div
          v-if="relatedDropdownOpen && relatedOptions.length"
          class="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-lg overflow-hidden"
        >
          <AppButton
            v-for="opt in relatedOptions"
            :key="opt.id"
            variant="menu"
            size="body"
            block
            @mousedown.prevent="addRelated(opt)"
          >
            <span
              class="h-1.5 w-1.5 rounded-full shrink-0"
              :style="{ backgroundColor: LOCATION_TYPE_COLORS[opt.location_type] }"
            />
            <span class="font-cinzel text-xs text-foreground truncate flex-1">{{ opt.name }}</span>
            <span class="text-caption-sm text-muted-foreground shrink-0">{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span>
          </AppButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IconAdd, IconChevronUp, IconClose, IconLink, IconLocation } from '@/lib/icons';
import AppButton from '@/components/common/AppButton.vue';
import AppInput from '@/components/common/AppInput.vue';
import EntityCombobox from '@/components/common/EntityCombobox.vue';
import { useLocations, useUpdateLocation } from '@/composables/useLocations';
import {
  LOCATION_TYPE_LABELS,
  LOCATION_TYPE_COLORS,
} from '@/types/location.types';
import type { Location } from '@/types/location.types';

const {
  locationId = null,
  parentId = null,
  parentOptions,
  allLocations,
  relatedLocationIds,
  isNew = false,
} = defineProps<{
  locationId: string | null;
  parentId: string | null;
  parentOptions: Location[];
  allLocations: Location[];
  relatedLocationIds: string[];
  isNew?: boolean;
}>();

const emit = defineEmits<{
  'update:parentId': [value: string | null];
  'update:relatedLocationIds': [value: string[]];
  'create-child': [name: string];
}>();


// ── Parent combobox bridge ─────────────────────────────────────────────────────
const parentIdStr = computed(() => parentId ?? '');

// ── Children (direct) ─────────────────────────────────────────────────────────
const { data: children, isLoading: childrenLoading } = locationId
  ? useLocations(locationId)
  : { data: ref<Location[]>([]), isLoading: ref(false) };

// ── Child combobox ─────────────────────────────────────────────────────────────
const { mutateAsync: reparent } = useUpdateLocation();
const childSearch = ref('');
const childDropdownOpen = ref(false);

const childOptions = computed(() => {
  const q = childSearch.value.toLowerCase().trim();
  const childIds = new Set((children.value ?? []).map((c: Location) => c.id));
  return allLocations
    .filter(
      (l) =>
        l.id !== locationId &&
        !childIds.has(l.id) &&
        (q === '' || l.name.toLowerCase().includes(q)),
    )
    .slice(0, 8);
});

async function addChild(loc: Location) {
  childSearch.value = '';
  childDropdownOpen.value = false;
  await reparent({ id: loc.id, update: { parent_id: locationId! } });
}

function onChildBlur() {
  setTimeout(() => {
    childDropdownOpen.value = false;
  }, 150);
}

// ── Related locations ──────────────────────────────────────────────────────────
const relatedLocationMap = computed<Map<string, Location>>(() => {
  const m = new Map<string, Location>();
  for (const loc of allLocations) m.set(loc.id, loc);
  return m;
});

const relatedSearch = ref('');
const relatedDropdownOpen = ref(false);

const relatedOptions = computed(() => {
  const q = relatedSearch.value.toLowerCase().trim();
  const excluded = new Set([locationId ?? '', ...relatedLocationIds]);
  return allLocations
    .filter((l) => !excluded.has(l.id) && (q === '' || l.name.toLowerCase().includes(q)))
    .slice(0, 8);
});

function addRelated(loc: Location) {
  relatedSearch.value = '';
  relatedDropdownOpen.value = false;
  if (!relatedLocationIds.includes(loc.id)) {
    emit('update:relatedLocationIds', [...relatedLocationIds, loc.id]);
  }
}

function onRelatedBlur() {
  setTimeout(() => { relatedDropdownOpen.value = false; }, 150);
}
</script>
