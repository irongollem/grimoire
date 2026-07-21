<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="
        !filtered.length &&
        !props.search &&
        props.statusFilter === 'all' &&
        props.relFilter === 'all' &&
        !props.locationFilter &&
        !props.partyMemberFilter
      "
      title="No NPCs yet"
      description="Populate your realm with merchants, villains, sages, and more."
    >
      <template #icon><IconNavNpcs class="h-16 w-16" /></template>
      <template #action>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          @click="handleNew"
        >
          Add your first NPC
        </button>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No NPCs match your filters.
    </p>

    <!-- ── Mobile list (<md): compact rows / gallery ─────────────────────── -->
    <template v-else-if="isMobile">
      <MobileEntityMetaRow
        v-model:layout="layout"
        :shown="filtered.length"
        :total="npcs?.length ?? 0"
        plural="NPCs"
      />
      <div
        :class="layout === 'gallery'
          ? 'grid grid-cols-2 gap-3 pb-2'
          : 'flex flex-col gap-2 pb-2'"
      >
        <EntityMobileCard
          v-for="npc in visibleItems"
          :key="npc.id"
          :layout="layout"
          :to="`/npcs/${npc.id}`"
          :title="getNpcDisplayName(npc) ?? '???'"
          :subtitle="npcSubtitle(npc)"
          :image-url="getNpcDisplayPortrait(npc)"
          :focal-point="getNpcDisplayFocalPoint(npc)"
          placeholder="/assets/placeholders/npc.webp"
          :badge-text="npc.relationship"
          :badge-color="relColor(npc.relationship)"
          :status-color="statusColor(npc.status)"
          :location="npc.location_id ? locationName(npc.location_id) : undefined"
          :shared="isShared(npc)"
        />
      </div>
    </template>

    <!-- ── Desktop grid (≥md): unchanged ─────────────────────────────────── -->
    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <div
        v-for="npc in visibleItems"
        :key="npc.id"
        class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Card link overlay (disabled for locked items) -->
        <RouterLink v-if="!lockedNpcIds.has(npc.id)" :to="`/npcs/${npc.id}`" class="absolute inset-0 z-2" />

        <!-- Locked overlay for over-quota items -->
        <div
          v-if="lockedNpcIds.has(npc.id)"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-sm"
        >
          <IconLock class="h-4 w-4 text-muted-foreground" />
          <p class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground">Locked</p>
          <RouterLink to="/billing" class="font-cinzel text-[0.5625rem] tracking-wider text-primary/80 hover:text-primary transition-colors">
            Upgrade to access
          </RouterLink>
        </div>

        <!-- Thumbnail (landscape) -->
        <div class="relative h-36 bg-muted overflow-hidden shrink-0">
          <FocalImage
            :src="getNpcDisplayPortrait(npc)"
            :alt="getNpcDisplayName(npc) ?? '???'"
            format="landscape"
            :focal-point="getNpcDisplayFocalPoint(npc)"
            placeholder="/assets/placeholders/npc.webp"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <span
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-eyebrow font-bold text-white"
            :style="{ backgroundColor: relColor(npc.relationship) + 'EE' }"
          >
            {{ npc.relationship }}
          </span>
        </div>

        <!-- Info -->
        <div class="p-3 flex flex-col gap-1 flex-1">
          <div class="flex items-start justify-between gap-1">
            <h3
              class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-1 flex-1"
            >
              {{ getNpcDisplayName(npc) ?? '???' }}
            </h3>
            <span
              :title="npc.status"
              class="w-2 h-2 rounded-full shrink-0 mt-1.5"
              :style="{ backgroundColor: statusColor(npc.status) }"
            />
          </div>

          <p
            v-if="npc.race"
            class="font-fell text-xs text-muted-foreground italic truncate"
          >
            {{ npc.race }} - {{ npc.occupation }}
          </p>

          <p
            v-if="npc.location_id"
            class="font-fell text-xs text-muted-foreground truncate"
          >
            📍 {{ locationName(npc.location_id) }}
          </p>

          <div v-if="npc.tags.length" class="flex flex-wrap gap-1 mt-auto pt-1">
            <span
              v-for="tag in npc.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground tracking-wider"
            >
              {{ tag }}
            </span>
            <span
              v-if="npc.tags.length > 3"
              class="font-fell text-2xs text-muted-foreground italic self-center"
            >
              +{{ npc.tags.length - 3 }}
            </span>
          </div>
        </div>

        <!-- Top-left action buttons (Edit + visibility, side by side on hover) -->
        <div class="absolute top-2 left-2 z-10 flex items-center gap-1.5">
          <RouterLink
            :to="`/npcs/${npc.id}?edit=true`"
            class="flex items-center justify-center gap-1 rounded max-md:min-h-11 max-md:px-3 max-md:py-2 px-2 py-1 font-cinzel text-2xs font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit NPC"
          >
            <IconEdit class="max-md:h-4 max-md:w-4 h-3 w-3" />
            Edit
          </RouterLink>
          <button
            type="button"
            class="flex items-center justify-center gap-1 rounded max-md:min-h-11 max-md:min-w-11 max-md:px-3 max-md:py-2 px-2 py-1 font-cinzel text-2xs font-semibold tracking-wider transition-opacity cursor-pointer"
            :class="isShared(npc)
              ? 'text-primary bg-black/60 opacity-100'
              : 'text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100'"
            :title="isShared(npc) ? 'Shared — click to manage' : 'Hidden — click to share'"
            @click.prevent.stop="openPopover(npc, $event)"
          >
            <IconReveal v-if="isShared(npc)" class="max-md:h-4 max-md:w-4 h-3 w-3" />
            <IconHide v-else class="max-md:h-4 max-md:w-4 h-3 w-3" />
          </button>
        </div>
      </div>
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length && !isMobile"
      class="mt-4 font-fell text-xs text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ npcs?.length ?? 0 }} NPCs
    </p>
  </div>

  <!-- Share popover (Teleported to avoid card overflow clipping) -->
  <Teleport to="body">
    <div
      v-if="popoverNpc"
      class="fixed inset-0 z-50"
      @mousedown.self="closePopover"
    >
      <div
        class="absolute bg-card border border-border rounded-lg shadow-xl p-3 w-52 space-y-2"
        :style="popover.style"
        @mousedown.stop
      >
        <p class="font-cinzel text-2xs text-muted-foreground tracking-wider truncate">{{ popoverNpc.name }}</p>

        <!-- Whole party -->
        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs transition-colors"
          :class="isShared(popoverNpc) && (party ?? []).every(m => isMemberVisible(m.id))
            ? 'bg-primary/15 text-primary'
            : 'text-foreground hover:bg-muted/50'"
          @click="setWholeParty"
        >
          <IconParty class="h-3 w-3 shrink-0" />
          Whole party
        </button>

        <!-- Per-player toggles -->
        <div class="space-y-0.5">
          <button
            v-for="member in party"
            :key="member.id"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs transition-colors"
            :class="isMemberVisible(member.id)
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
            @click="toggleMember(member.id)"
          >
            <component
              :is="isMemberVisible(member.id) ? IconReveal : IconHide"
              class="h-3 w-3 shrink-0"
            />
            {{ member.name }}
          </button>
        </div>

        <!-- Field reveal — what the chosen players actually see -->
        <div v-if="isShared(popoverNpc)" class="border-t border-border pt-2 space-y-1">
          <p class="font-cinzel text-[0.5625rem] tracking-widest text-muted-foreground px-1">REVEALED FIELDS</p>
          <label
            v-for="f in NPC_PLAYER_FIELDS"
            :key="f.key"
            class="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted/50"
          >
            <input
              type="checkbox"
              class="accent-primary"
              :checked="isFieldVisible(f.key)"
              @change="toggleField(f.key)"
            />
            <span class="font-fell text-xs text-foreground">{{ f.label }}</span>
          </label>
        </div>

        <!-- Divider + unshare -->
        <div class="border-t border-border pt-1">
          <button
            v-if="isShared(popoverNpc)"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs text-destructive hover:bg-destructive/10 transition-colors"
            @click="unshare"
          >
            <IconHide class="h-3 w-3 shrink-0" />
            Hide from all players
          </button>
          <p v-else class="font-fell text-2xs text-muted-foreground italic px-2">
            Select players above to share.
          </p>
        </div>
      </div>
    </div>
  </Teleport>

  <PaywallModal v-model="showPaywall" resource="npcs" />
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { IconEdit, IconHide, IconLock, IconNavNpcs, IconParty, IconReveal } from '@/lib/icons';
import { useNpcs, useUpdateNpc } from "@/composables/useNpcs";
import { useParty } from "@/composables/useParty";
import { useNpcPcNotesByPartyMember } from "@/composables/useNpcPcNotes";
import { useAllLocations, useLocationTree } from "@/composables/useLocations";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useUiStore } from "@/stores/ui";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint, NPC_PLAYER_FIELDS, type NpcPlayerFieldKey } from "@/lib/npcDisplay";
import { NPC_RELATIONSHIP_COLORS, type Npc, type NpcRelationship, type NpcStatus } from "@/types/npc.types";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const { canCreate, quota: npcQuota } = useQuota("npcs");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/npcs/new");
}

const props = defineProps<{
  search: string;
  statusFilter: string;
  relFilter: string;
  locationFilter: string;
  partyMemberFilter: string;
  sortBy: "name" | "location";
}>();

const { data: npcs, isLoading } = useNpcs();
const { data: party } = useParty();
const { sendNarrativeEvent } = useCampaignMessages();
const ui = useUiStore();
const isMobile = useMediaQuery("(max-width: 767px)");
const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => { ui.entityListLayout = v; },
});

const { data: connectedNpcIds } = useNpcPcNotesByPartyMember(computed(() => props.partyMemberFilter));
const { mutate: updateNpc } = useUpdateNpc();
const { data: allLocations } = useAllLocations();
const { locationOptions, getDescendantIds } = useLocationTree();

const locationMap = computed(() => {
  const m = new Map<string, string>();
  for (const loc of allLocations.value ?? []) m.set(loc.id, loc.name);
  return m;
});

const locationOrder = computed(() => {
  const m = new Map<string, number>();
  locationOptions.value.forEach((loc, i) => m.set(loc.id, i));
  return m;
});

function locationName(id: string) {
  return locationMap.value.get(id) ?? "Unknown";
}

const filtered = computed(() => {
  let list = npcs.value ?? [];
  if (props.search.trim()) {
    const q = props.search.trim().toLowerCase();
    list = list.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.disguise_name?.toLowerCase().includes(q) ||
        n.race?.toLowerCase().includes(q) ||
        n.occupation?.toLowerCase().includes(q) ||
        (n.location_id
          ? locationMap.value.get(n.location_id)?.toLowerCase().includes(q)
          : false) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (props.statusFilter !== "all")
    list = list.filter((n) => n.status === props.statusFilter);
  if (props.relFilter !== "all")
    list = list.filter((n) => n.relationship === props.relFilter);
  if (props.locationFilter) {
    const locationIds = getDescendantIds(props.locationFilter);
    list = list.filter((n) => n.location_id && locationIds.has(n.location_id));
  }
  if (props.partyMemberFilter) {
    const ids = connectedNpcIds.value ?? new Set<string>();
    list = list.filter((n) => ids.has(n.id));
  }
  if (props.sortBy === "location") {
    const order = locationOrder.value;
    list = [...list].sort((a, b) => {
      const ai = a.location_id
        ? (order.get(a.location_id) ?? Infinity)
        : Infinity;
      const bi = b.location_id
        ? (order.get(b.location_id) ?? Infinity)
        : Infinity;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  } else {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
});

const { savedCount, linkCount } = useScrollRestore("npcs");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

const lockedNpcIds = computed((): Set<string> => {
  const q = npcQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const sorted = [...(npcs.value ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map((n) => n.id));
});


const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e",
  dead: "#ef4444",
  missing: "#f59e0b",
  unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) {
  return NPC_RELATIONSHIP_COLORS[rel] ?? "#6b7280";
}
function statusColor(s: NpcStatus) {
  return STATUS_COLORS[s] ?? "#6b7280";
}

// Mobile-card subtitle — mirrors the desktop "{race} - {occupation}" line,
// gracefully collapsing when one half is missing.
function npcSubtitle(npc: Npc): string | undefined {
  const parts = [npc.race, npc.occupation].filter(Boolean) as string[];
  return parts.length ? parts.join(" - ") : undefined;
}

// ── Sharing ───────────────────────────────────────────────────────────────────

function isShared(npc: Npc): boolean {
  return (npc.player_visible_to?.length ?? 0) > 0;
}

const popover = reactive<{ npcId: string | null; style: string }>({
  npcId: null,
  style: "",
});

const popoverNpc = computed(() =>
  popover.npcId ? (npcs.value?.find((n) => n.id === popover.npcId) ?? null) : null,
);

function openPopover(npc: Npc, event: MouseEvent) {
  popover.npcId = npc.id;
  const btn = event.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  const top = rect.bottom + 4;
  const right = window.innerWidth - rect.right;
  popover.style = `top:${top}px;right:${right}px`;
}

function closePopover() { popover.npcId = null; }

function isMemberVisible(memberId: string): boolean {
  const npc = popoverNpc.value;
  if (!npc) return false;
  return Array.isArray(npc.player_visible_to) && npc.player_visible_to.includes(memberId);
}

function allPartyIds(): string[] {
  return party.value?.map((m) => m.id) ?? [];
}

// Without any fields revealed, sharing an NPC is a no-op for the player.
// Pre-fill name + portrait on first reveal so the toggle is immediately useful.
const DEFAULT_FIELDS: NpcPlayerFieldKey[] = ["name", "portrait"];
function fieldsForFirstReveal(npc: Npc): string[] {
  return (npc.player_visible_fields?.length ?? 0) > 0
    ? npc.player_visible_fields
    : [...DEFAULT_FIELDS];
}

function setWholeParty() {
  const npc = popoverNpc.value;
  if (!npc) return;
  const wasHidden = !isShared(npc);
  updateNpc({
    id: npc.id,
    update: {
      player_visible_to: [...new Set(allPartyIds())],
      player_visible_fields: fieldsForFirstReveal(npc),
    },
  });
  if (wasHidden && ui.dmMode === "play") {
    void sendNarrativeEvent(`The party encounters ${npc.name}.`, npc.id);
  }
}

function toggleMember(memberId: string) {
  const npc = popoverNpc.value;
  if (!npc) return;
  const current = [...npc.player_visible_to];
  const idx = current.indexOf(memberId);
  const next = idx === -1 ? [...current, memberId] : current.filter((id) => id !== memberId);
  updateNpc({
    id: npc.id,
    update: {
      player_visible_to: next,
      player_visible_fields: next.length > 0 ? fieldsForFirstReveal(npc) : npc.player_visible_fields,
    },
  });
  if (idx === -1 && ui.dmMode === "play") {
    const memberName = party.value?.find((m) => m.id === memberId)?.name;
    const who = memberName ?? "A party member";
    void sendNarrativeEvent(`${who} encounters ${npc.name}.`, npc.id);
  }
}

function unshare() {
  const npc = popoverNpc.value;
  if (!npc) return;
  updateNpc({ id: npc.id, update: { player_visible_to: [] } });
  closePopover();
}

function isFieldVisible(key: string): boolean {
  const npc = popoverNpc.value;
  return !!npc && (npc.player_visible_fields?.includes(key) ?? false);
}

function toggleField(key: string) {
  const npc = popoverNpc.value;
  if (!npc) return;
  const set = new Set(npc.player_visible_fields ?? []);
  if (set.has(key)) set.delete(key); else set.add(key);
  updateNpc({ id: npc.id, update: { player_visible_fields: Array.from(set) } });
}
</script>
