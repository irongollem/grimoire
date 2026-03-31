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
        !props.locationFilter
      "
      title="No NPCs yet"
      description="Populate your realm with merchants, villains, sages, and more."
    >
      <template #action>
        <RouterLink
          to="/npcs/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first NPC
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No NPCs match your filters.
    </p>

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <div
        v-for="npc in visibleItems"
        :key="npc.id"
        class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Card link overlay -->
        <RouterLink :to="`/npcs/${npc.id}`" class="absolute inset-0 z-2" />

        <!-- Thumbnail (landscape) -->
        <div class="relative h-36 bg-muted overflow-hidden shrink-0">
          <FocalImage
            v-if="npc.portrait_url"
            :src="npc.portrait_url"
            :alt="npc.name"
            format="landscape"
            :focal-point="npc.portrait_focal_point"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-3xl font-cinzel font-bold"
            :style="{
              backgroundColor: relColor(npc.relationship) + '22',
              color: relColor(npc.relationship),
            }"
          >
            {{ initials(npc.name) }}
          </div>
          <span
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-cinzel font-bold tracking-wider uppercase text-white"
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
              {{ npc.name }}
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
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >
              {{ tag }}
            </span>
            <span
              v-if="npc.tags.length > 3"
              class="font-fell text-[10px] text-muted-foreground italic self-center"
            >
              +{{ npc.tags.length - 3 }}
            </span>
          </div>
        </div>

        <!-- Top-left action buttons (Edit + visibility, side by side on hover) -->
        <div class="absolute top-2 left-2 z-10 flex items-center gap-1.5">
          <RouterLink
            :to="`/npcs/${npc.id}?edit=true`"
            class="flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit NPC"
          >
            <Pencil class="h-3 w-3" />
            Edit
          </RouterLink>
          <button
            type="button"
            class="flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider transition-opacity cursor-pointer"
            :class="isShared(npc)
              ? 'text-primary bg-black/60 opacity-100'
              : 'text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100'"
            :title="isShared(npc) ? 'Shared — click to manage' : 'Hidden — click to share'"
            @click.prevent.stop="openPopover(npc, $event)"
          >
            <Eye v-if="isShared(npc)" class="h-3 w-3" />
            <EyeOff v-else class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length"
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
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider truncate">{{ popoverNpc.name }}</p>

        <!-- Whole party -->
        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs transition-colors"
          :class="isShared(popoverNpc) && (party ?? []).every(m => isMemberVisible(m.id))
            ? 'bg-primary/15 text-primary'
            : 'text-foreground hover:bg-muted/50'"
          @click="setWholeParty"
        >
          <Users class="h-3 w-3 shrink-0" />
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
              :is="isMemberVisible(member.id) ? Eye : EyeOff"
              class="h-3 w-3 shrink-0"
            />
            {{ member.name }}
          </button>
        </div>

        <!-- Divider + unshare -->
        <div class="border-t border-border pt-1">
          <button
            v-if="isShared(popoverNpc)"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs text-destructive hover:bg-destructive/10 transition-colors"
            @click="unshare"
          >
            <EyeOff class="h-3 w-3 shrink-0" />
            Hide from all players
          </button>
          <p v-else class="font-fell text-[10px] text-muted-foreground italic px-2">
            Select players above to share.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { Pencil, Eye, EyeOff, Users } from "lucide-vue-next";
import { useNpcs, useUpdateNpc } from "@/composables/useNpcs";
import { useParty } from "@/composables/useParty";
import { useAllLocations, useLocationTree } from "@/composables/useLocations";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";

const props = defineProps<{
  search: string;
  statusFilter: string;
  relFilter: string;
  locationFilter: string;
  sortBy: "name" | "location";
}>();

const { data: npcs, isLoading } = useNpcs();
const { data: party } = useParty();
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

const { visibleItems, sentinelRef } = useInfiniteScroll(filtered);

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const REL_COLORS: Record<NpcRelationship, string> = {
  ally: "#2563eb",
  neutral: "#6b7280",
  enemy: "#dc2626",
  unknown: "#9333ea",
};
const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e",
  dead: "#ef4444",
  missing: "#f59e0b",
  unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) {
  return REL_COLORS[rel] ?? "#6b7280";
}
function statusColor(s: NpcStatus) {
  return STATUS_COLORS[s] ?? "#6b7280";
}

// ── Sharing ───────────────────────────────────────────────────────────────────

function isShared(npc: Npc): boolean {
  return Array.isArray(npc.player_visible_to) && npc.player_visible_to.length > 0;
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

function setWholeParty() {
  const npc = popoverNpc.value;
  if (!npc) return;
  updateNpc({ id: npc.id, update: { player_visible_to: [...new Set(allPartyIds())] } });
}

function toggleMember(memberId: string) {
  const npc = popoverNpc.value;
  if (!npc) return;
  const current = [...(npc.player_visible_to ?? [])];
  const idx = current.indexOf(memberId);
  const next = idx === -1 ? [...current, memberId] : current.filter((id) => id !== memberId);
  updateNpc({ id: npc.id, update: { player_visible_to: next.length === 0 ? null : next } });
}

function unshare() {
  const npc = popoverNpc.value;
  if (!npc) return;
  updateNpc({ id: npc.id, update: { player_visible_to: null } });
  closePopover();
}
</script>
