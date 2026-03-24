<template>
  <div class="flex flex-col gap-4">
    <!-- Breadcrumb -->
    <div v-if="parentLocation || isNew" class="flex items-center gap-1.5 text-xs font-fell text-muted-foreground">
      <RouterLink to="/locations" class="hover:text-foreground transition-colors">Locations</RouterLink>
      <template v-if="parentLocation">
        <span>/</span>
        <RouterLink :to="`/locations/${parentLocation.id}`" class="hover:text-foreground transition-colors">
          {{ parentLocation.name }}
        </RouterLink>
      </template>
      <span>/</span>
      <span class="text-foreground">{{ isNew ? "New Location" : props.location?.name }}</span>
    </div>

    <!-- Action row: type + save + delete -->
    <div class="flex flex-wrap items-center gap-2 justify-end">
      <select
        v-model="locationType"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="(label, value) in LOCATION_TYPE_LABELS" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
      <button
        type="button"
        :disabled="saving || !name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <!-- Sigil + identity fields -->
    <div class="flex gap-5">
      <!-- Sigil -->
      <div class="shrink-0 flex flex-col gap-1.5">
        <div
          class="w-48 h-48 rounded-lg border border-border bg-muted overflow-hidden cursor-pointer hover:border-primary/50 transition-colors relative group"
          @click="triggerImageUpload"
        >
          <FocalImage
            v-if="imageUrl"
            :src="imageUrl"
            :alt="name"
            format="portrait"
            :focal-point="null"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/20">
            <ImageIcon class="h-10 w-10" />
            <span class="font-cinzel text-[10px] tracking-wider">Sigil / Emblem</span>
          </div>
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <ImageIcon class="h-6 w-6 text-white" />
          </div>
        </div>
        <button
          v-if="imageUrl"
          type="button"
          class="font-cinzel text-[10px] text-muted-foreground/50 hover:text-destructive tracking-wider transition-colors text-center w-48"
          @click="imageUrl = null"
        >
          Remove
        </button>
      </div>
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onImageFile" />

      <!-- Name, parent, tags, sub-locations, calendar pins -->
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <input
          v-model="name"
          placeholder="Location name…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <div class="flex items-center gap-2">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1">
            <ChevronUp class="h-3.5 w-3.5" />Parent
          </span>
          <EntityCombobox
            v-model="parentIdStr"
            :options="parentOptions"
            placeholder="— None (top-level) —"
          >
            <template #option="{ opt }">
              <span
                class="inline-block h-2 w-2 rounded-full shrink-0"
                :style="{ backgroundColor: LOCATION_TYPE_COLORS[opt.location_type] }"
              />
              <span class="flex-1 truncate">{{ opt.name }}</span>
              <span class="text-xs text-muted-foreground shrink-0 font-cinzel">{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span>
            </template>
          </EntityCombobox>
        </div>

        <!-- Compact sub-locations -->
        <div v-if="!isNew" class="flex items-start gap-2">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1 pt-1.5">
            <MapPin class="h-3.5 w-3.5" />Child
          </span>
          <div class="flex-1 flex flex-wrap items-center gap-1.5 border border-border rounded-md px-3 py-1.5 min-h-8.5 bg-background relative">
            <span v-if="childrenLoading" class="font-fell text-xs text-muted-foreground italic">Loading…</span>
            <RouterLink
              v-for="child in children"
              :key="child.id"
              :to="`/locations/${child.id}`"
              class="inline-flex items-center gap-1.5 rounded border border-border bg-muted/50 hover:border-primary/50 hover:bg-muted transition-colors px-2 py-0.5"
            >
              <span class="h-1.5 w-1.5 rounded-full shrink-0" :style="{ backgroundColor: LOCATION_TYPE_COLORS[child.location_type] }" />
              <span class="font-cinzel text-xs font-semibold text-foreground">{{ child.name }}</span>
            </RouterLink>
            <!-- Inline child search -->
            <div class="relative ml-auto">
              <input
                v-model="childSearch"
                type="text"
                placeholder="Add child…"
                class="font-cinzel text-xs text-foreground placeholder:text-muted-foreground/50 bg-transparent focus:outline-none w-24 focus:w-36 transition-all"
                @focus="childDropdownOpen = true"
                @blur="onChildBlur"
                @keydown.escape="childDropdownOpen = false"
              />
              <div
                v-if="childDropdownOpen && (childOptions.length || childSearch.trim())"
                class="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-lg overflow-hidden"
              >
                <button
                  v-for="opt in childOptions"
                  :key="opt.id"
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors"
                  @mousedown.prevent="addChild(opt)"
                >
                  <span class="h-1.5 w-1.5 rounded-full shrink-0" :style="{ backgroundColor: LOCATION_TYPE_COLORS[opt.location_type] }" />
                  <span class="font-cinzel text-xs text-foreground truncate flex-1">{{ opt.name }}</span>
                  <span class="font-fell text-[10px] text-muted-foreground shrink-0">{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span>
                </button>
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors border-t border-border text-primary"
                  @mousedown.prevent="createChild"
                >
                  <Plus class="h-3 w-3 shrink-0" />
                  <span class="font-cinzel text-xs truncate flex-1">
                    {{ childSearch.trim() ? `Create "${childSearch.trim()}"` : 'Create new child location' }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-start gap-2">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1 pt-1.5">
            <Tag class="h-3.5 w-3.5" />Tags
          </span>
          <div class="flex-1"><TagInput v-model="tags" /></div>
        </div>

        <!-- Compact calendar pins -->
        <EntityCalendarSection
          compact
          entity-type="location"
          :entity-id="props.location?.id ?? null"
          :entity-name="name || 'Untitled Location'"
        />
      </div>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <!-- Description editor -->
    <div class="flex flex-col gap-1">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
      <RichTextEditor
        v-model="description"
        placeholder="Describe this location…"
        min-height="320px"
      />
    </div>

    <!-- NPCs at this location -->
    <template v-if="!isNew && locationNpcs?.length">
      <div class="flex items-center justify-between mt-2">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          NPCs Here
          <span class="font-fell font-normal text-muted-foreground">({{ locationNpcs.length }})</span>
        </h2>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="npc in locationNpcs"
          :key="npc.id"
          :to="`/npcs/${npc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-3 overflow-hidden"
        >
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ npc.name }}</p>
            <p v-if="npc.occupation || npc.race" class="font-fell text-xs text-muted-foreground italic truncate">
              {{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}
            </p>
          </div>
          <ChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </template>

    <!-- Encounters at this location -->
    <template v-if="!isNew && locationEncounters?.length">
      <div class="flex items-center justify-between mt-2">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          Encounters Here
          <span class="font-fell font-normal text-muted-foreground">({{ locationEncounters.length }})</span>
        </h2>
      </div>
      <div class="flex flex-col gap-2">
        <RouterLink
          v-for="enc in locationEncounters"
          :key="enc.id"
          :to="`/encounters/${enc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors px-4 py-3"
        >
          <span class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate">{{ enc.name }}</span>
          <span v-if="enc.is_finished" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Done</span>
          <ChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { Save, Trash2, ChevronRight, Image as ImageIcon, MapPin, ChevronUp, Tag, Plus } from "lucide-vue-next";
import { useImageUpload } from "@/composables/useImageUpload";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useNpcsByLocation } from "@/composables/useNpcs";
import { useEncountersByLocation } from "@/composables/useEncounters";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import {
  useLocations,
  useAllLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "@/composables/useLocations";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

const props = defineProps<{
  location: Location | null;
  parentId?: string | null;
  initialName?: string;
}>();

const router = useRouter();
const isNew = computed(() => !props.location);

// ── All locations (for parent picker) ─────────────────────────────────────────
const { data: allLocations } = useAllLocations();

// ── Parent picker state ────────────────────────────────────────────────────────
const selectedParentId = ref<string | null>(
  props.location?.parent_id ?? props.parentId ?? null,
);

const parentLocation = computed(() =>
  selectedParentId.value
    ? (allLocations.value?.find((l) => l.id === selectedParentId.value) ?? null)
    : null,
);

// EntityCombobox uses "" for "none"; selectedParentId uses null
const parentIdStr = computed({
  get: () => selectedParentId.value ?? "",
  set: (v: string) => { selectedParentId.value = v || null; },
});

const parentOptions = computed(() =>
  (allLocations.value ?? []).filter((l) => l.id !== props.location?.id),
);

// ── Fetch children (only when editing existing) ────────────────────────────────
const { data: children, isLoading: childrenLoading } = props.location
  ? useLocations(props.location.id)
  : { data: ref([]), isLoading: ref(false) };

// ── Child combobox ─────────────────────────────────────────────────────────────
const { mutateAsync: reparent } = useUpdateLocation();
const childSearch = ref("");
const childDropdownOpen = ref(false);

const childOptions = computed(() => {
  const q = childSearch.value.toLowerCase().trim();
  const childIds = new Set((children.value ?? []).map((c: Location) => c.id));
  return (allLocations.value ?? []).filter((l) =>
    l.id !== props.location?.id &&
    !childIds.has(l.id) &&
    (q === "" || l.name.toLowerCase().includes(q)),
  ).slice(0, 8);
});

async function addChild(loc: Location) {
  childSearch.value = "";
  childDropdownOpen.value = false;
  await reparent({ id: loc.id, update: { parent_id: props.location!.id } });
}

function onChildBlur() {
  setTimeout(() => { childDropdownOpen.value = false; }, 150);
}

function createChild() {
  const query: Record<string, string> = { parent: props.location!.id };
  if (childSearch.value.trim()) query.name = childSearch.value.trim();
  childSearch.value = "";
  childDropdownOpen.value = false;
  router.push({ path: "/locations/new", query });
}

// ── NPCs + Encounters at this location ─────────────────────────────────────────
const { data: locationNpcs } = props.location
  ? useNpcsByLocation(props.location.id)
  : { data: ref([]) };
const { data: locationEncounters } = props.location
  ? useEncountersByLocation(props.location.id)
  : { data: ref([]) };

// ── Form state ─────────────────────────────────────────────────────────────────
const name         = ref(props.location?.name ?? props.initialName ?? "");
const locationType = ref<LocationType>(props.location?.location_type ?? "other");
const tags         = ref<string[]>(props.location?.tags ? [...props.location.tags] : []);
const imageUrl     = ref<string | null>(props.location?.image_url ?? null);
const saving       = ref(false);
const saveError    = ref("");

// ── Image upload ───────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null);
const { upload } = useImageUpload("location-images");

function triggerImageUpload() { fileInput.value?.click(); }

async function onImageFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const url = await upload(file);
  if (url) imageUrl.value = url;
  if (fileInput.value) fileInput.value.value = "";
}

// ── Description ────────────────────────────────────────────────────────────────
const description = ref<string>(props.location?.description ?? "");

// ── CRUD ───────────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateLocation();
const { mutateAsync: update } = useUpdateLocation();
const { mutateAsync: del }    = useDeleteLocation();

function buildPayload() {
  return {
    name:          name.value.trim() || "Unnamed Location",
    location_type: locationType.value,
    description:   description.value,
    notes:         null,
    tags:          tags.value,
    parent_id:     selectedParentId.value,
    image_url:     imageUrl.value,
  };
}

async function save() {
  if (!name.value.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (props.location) {
      await update({ id: props.location.id, update: buildPayload() });
      router.push(`/locations/${props.location.id}`);
    } else {
      const created = await create(buildPayload());
      router.push(`/locations/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.location) return;
  if (!await confirm(`Delete "${props.location.name}"? Sub-locations will also be deleted.`)) return;
  const parentId = props.location.parent_id;
  await del(props.location.id);
  router.push(parentId ? `/locations/${parentId}` : "/locations");
}
</script>

