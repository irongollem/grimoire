<template>
  <div class="flex flex-col gap-5">
    <!-- Breadcrumb — same pattern as the editor so DMs keep their bearings
         when switching between view and edit modes. -->
    <div
      v-if="ancestors.length"
      class="flex flex-wrap items-center gap-1 text-xs font-fell text-muted-foreground"
    >
      <RouterLink to="/locations" class="hover:text-foreground transition-colors">Locations</RouterLink>
      <template v-for="anc in ancestors" :key="anc.id">
        <span class="opacity-40">/</span>
        <RouterLink :to="`/locations/${anc.id}`" class="hover:text-foreground transition-colors">{{ anc.name }}</RouterLink>
      </template>
      <span class="opacity-40">/</span>
      <span class="text-foreground">{{ location.name }}</span>
    </div>

    <!-- Action bar — Edit + Delete. Edit flips the view wrapper's ?edit=true
         query; delete is DM-dangerous so kept right-aligned separately. -->
    <div class="flex flex-wrap items-center justify-end gap-2">
      <span
        v-if="location.location_type"
        class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize"
      >{{ LOCATION_TYPE_LABELS[location.location_type] }}</span>
      <button
        type="button"
        :disabled="isDeleting"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        @click="onDelete"
      >
        <IconDelete class="h-3.5 w-3.5" />
        Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />
        Edit
      </button>
    </div>

    <!-- Identity: sigil + name + tags.
         Mobile stacks (sigil above name block), desktop is side-by-side. -->
    <div class="flex flex-col gap-4 md:flex-row md:gap-6">
      <div class="w-full max-w-48 mx-auto md:mx-0 md:w-48 md:shrink-0">
        <FocalImage
          :src="location.image_url"
          :alt="location.name"
          format="portrait"
          :lightbox="true"
          placeholder="/assets/placeholders/location.webp"
          class="w-full rounded-lg border border-border overflow-hidden"
        />
      </div>
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <div class="flex flex-col gap-1">
          <h1 class="font-cinzel text-2xl font-bold text-foreground leading-tight">{{ location.name }}</h1>
          <p v-if="location.location_type" class="font-fell text-sm text-muted-foreground italic">
            {{ LOCATION_TYPE_LABELS[location.location_type] }}
          </p>
        </div>
        <div v-if="location.tags?.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in location.tags"
            :key="tag"
            class="font-cinzel text-[10px] tracking-wider bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
          >{{ tag }}</span>
        </div>
      </div>
    </div>

    <!-- Description — DM-facing Tiptap content. -->
    <section v-if="hasDescription" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Description</h2>
      <RichTextViewer :content="location.description" />
    </section>

    <!-- Map -->
    <section v-if="location.map_url" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Map</h2>
      <LocationMap
        :map-url="location.map_url"
        :pins="location.map_pins ?? []"
        :children="mapPinnableChildren"
        mode="view"
        :show-hidden-pins="true"
        @pin-click="onPinClick"
      />
    </section>

    <!-- Sub-locations — read-only list linking into each child. -->
    <section v-if="children?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Sub-locations
        <span class="font-fell font-normal text-muted-foreground">({{ children.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="child in children"
          :key="child.id"
          :to="`/locations/${child.id}`"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[child.location_type] }"
          />
          <span class="font-cinzel text-xs text-foreground truncate max-w-40">{{ child.name }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- Related Locations — non-hierarchical links (trade routes, tunnels, etc.) -->
    <section v-if="relatedLocations.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Related Locations
        <span class="font-fell font-normal text-muted-foreground">({{ relatedLocations.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="rel in relatedLocations"
          :key="rel.id"
          :to="`/locations/${rel.id}`"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[rel.location_type] }"
          />
          <span class="font-cinzel text-xs text-foreground truncate max-w-40">{{ rel.name }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- Store inventory — self-contained editable component. Useful enough
         to keep in view mode so a DM running a shop scene doesn't need to
         enter full-edit just to restock. -->
    <section v-if="isStoreType" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Store</h2>
      <StoreInventory :location-id="location.id" :owner-npc-name="ownerNpcName" />
    </section>

    <!-- People in the Area — NPCs whose location is this or any descendant. -->
    <section v-if="locationNpcs?.length" class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
          People in the Area
          <span class="font-fell font-normal text-muted-foreground">({{ locationNpcs.length }})</span>
        </h2>
        <button
          v-if="locationNpcs.length > 3"
          type="button"
          class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground tracking-wider transition-colors"
          @click="npcsExpanded = !npcsExpanded"
        >
          {{ npcsExpanded ? "Show less" : `Show all ${locationNpcs.length}` }}
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="npc in npcsExpanded ? locationNpcs : locationNpcs.slice(0, 3)"
          :key="npc.id"
          :to="`/npcs/${npc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-3 overflow-hidden"
        >
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ npc.name }}</p>
            <p
              v-if="npc.occupation || npc.race"
              class="font-fell text-xs text-muted-foreground italic truncate"
            >{{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}</p>
            <p
              v-if="npc.location_id && npc.location_id !== location.id"
              class="font-cinzel text-[10px] text-muted-foreground/60 tracking-wide truncate mt-0.5"
            >{{ allLocations?.find((l) => l.id === npc.location_id)?.name ?? "" }}</p>
          </div>
          <IconChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </section>

    <!-- Encounters Here -->
    <section v-if="locationEncounters?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Encounters Here
        <span class="font-fell font-normal text-muted-foreground">({{ locationEncounters.length }})</span>
      </h2>
      <div class="flex flex-col gap-2">
        <RouterLink
          v-for="enc in locationEncounters"
          :key="enc.id"
          :to="`/encounters/${enc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors px-4 py-3"
        >
          <span class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate">{{ enc.name }}</span>
          <span
            v-if="enc.is_finished"
            class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
          >Done</span>
          <IconChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </section>

    <!-- Currently Here — party members with current_location_id = this id.
         Read-only in view mode; moving members happens in edit mode. -->
    <section v-if="membersHere.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Currently Here
        <span class="font-fell font-normal text-muted-foreground">({{ membersHere.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="m in membersHere"
          :key="m.id"
          :to="`/party/${m.id}`"
          class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 hover:border-primary/50 transition-colors"
        >
          <span class="font-cinzel text-xs font-semibold text-foreground">{{ m.name }}</span>
          <span
            v-if="m.class"
            class="font-fell text-[10px] text-muted-foreground italic"
          >{{ m.class }}</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { IconChevronRight, IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import {
  useLocations,
  useAllLocations,
  useDeleteLocation,
  getPinnableDescendants,
} from "@/composables/useLocations";
import { useNpcs, useNpcsByLocations } from "@/composables/useNpcs";
import { useEncountersByLocation } from "@/composables/useEncounters";
import { useParty } from "@/composables/useParty";
import {
  LOCATION_TYPE_LABELS,
  LOCATION_TYPE_COLORS,
  STORE_LOCATION_TYPES,
} from "@/types/location.types";
import type { Location } from "@/types/location.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import StoreInventory from "@/components/locations/StoreInventory.vue";

const props = defineProps<{ location: Location }>();
const route   = useRoute();
const router  = useRouter();
const { confirm } = useConfirm();

// ── Ancestor chain, same as editor ──────────────────────────────────────────
const { data: allLocations } = useAllLocations();
// Loop extracted into a helper to keep `computed` single-return — oxlint's
// `vue/return-in-computed-property` rule reports a false positive when a while
// loop appears inside the getter body.
function buildAncestorChain(parentId: string | null | undefined, all: Location[]): Location[] {
  const chain: Location[] = [];
  if (!parentId) return chain;
  let current = all.find((l) => l.id === parentId);
  while (current && chain.length < 10) {
    chain.unshift(current);
    const nextId = current.parent_id;
    current = nextId ? all.find((l) => l.id === nextId) : undefined;
  }
  return chain;
}
const ancestors = computed(() =>
  buildAncestorChain(props.location.parent_id, allLocations.value ?? []),
);

// ── Children + pinnable descendants (for the map viewer) ────────────────────
const { data: children } = useLocations(props.location.id);
const mapPinnableChildren = computed(() => {
  if (!allLocations.value?.length) return [];
  return getPinnableDescendants(props.location.id, allLocations.value);
});

// ── NPCs + Encounters + Party members ───────────────────────────────────────
function collectDescendantIds(id: string, allLocs: Location[]): string[] {
  const result: string[] = [id];
  for (const loc of allLocs) {
    if (loc.parent_id === id) result.push(...collectDescendantIds(loc.id, allLocs));
  }
  return result;
}

const npcLocationIds = computed(() => {
  if (!allLocations.value?.length) return [props.location.id];
  return collectDescendantIds(props.location.id, allLocations.value);
});

const { data: locationNpcs } = useNpcsByLocations(npcLocationIds);
const { data: locationEncounters } = useEncountersByLocation(props.location.id);
const npcsExpanded = ref(false);

const { data: allPartyMembers } = useParty();
const membersHere = computed(() =>
  (allPartyMembers.value ?? []).filter(
    (m) => m.current_location_id === props.location.id,
  ),
);

// ── Related locations ────────────────────────────────────────────────────────
const relatedLocations = computed<Location[]>(() => {
  const ids = props.location.related_location_ids ?? [];
  if (!ids.length || !allLocations.value?.length) return [];
  return ids
    .map((id) => allLocations.value!.find((l) => l.id === id))
    .filter((l): l is Location => !!l);
});

// ── Misc ────────────────────────────────────────────────────────────────────
const hasDescription = computed(() => {
  const d = props.location.description;
  if (!d) return false;
  // Tiptap empty doc looks like `{"type":"doc","content":[{"type":"paragraph"}]}`
  // so render only when there's actual text content.
  try {
    const doc = JSON.parse(d);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(d).trim().length > 0;
  }
});

const isStoreType = computed(() => STORE_LOCATION_TYPES.has(props.location.location_type));

const { data: allNpcs } = useNpcs();
const ownerNpcName = computed(
  () => allNpcs.value?.find((n) => n.id === props.location.npc_owner_id)?.name ?? null,
);

// ── Delete ──────────────────────────────────────────────────────────────────
const { mutateAsync: deleteLocation } = useDeleteLocation();
const isDeleting = ref(false);

async function onDelete() {
  if (!(await confirm(`Delete "${props.location.name}"? This cannot be undone.`))) return;
  isDeleting.value = true;
  try {
    router.push("/locations");
    await deleteLocation(props.location.id);
  } finally {
    isDeleting.value = false;
  }
}

// Pin click in view mode → navigate to the child location.
function onPinClick(childId: string) {
  router.push(`/locations/${childId}`);
}
</script>
