<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <template v-if="!isNew" #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        @click="router.push('/monsters')"
      >
        <ChevronLeft class="h-3.5 w-3.5" />
        Back
      </button>

      <!-- Visibility toggle -->
      <button
        v-if="resolvedMonster"
        ref="visBtn"
        type="button"
        :title="isDiscovered ? 'Shared with players — click to manage' : 'Hidden from players — click to share'"
        class="inline-flex items-center rounded-md border px-2.5 py-2 transition-colors"
        :class="isDiscovered
          ? 'border-primary/50 text-primary hover:bg-primary/10'
          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'"
        @click="openVisPopover"
      >
        <Eye v-if="isDiscovered" class="h-3.5 w-3.5" />
        <EyeOff v-else class="h-3.5 w-3.5" />
      </button>

      <button
        v-if="!isEditing"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        @click="startEditing"
      >
        <Pencil class="h-3.5 w-3.5" />
        Edit
      </button>
      <button
        v-else
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        @click="stopEditing"
      >
        <Eye class="h-3.5 w-3.5" />
        View
      </button>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else>
      <MonsterSheet v-if="!isEditing && resolvedMonster" :monster="resolvedMonster" />
      <MonsterDetail v-else :monster="resolvedMonster" />
    </template>
  </PageHeader>

  <!-- Visibility popover -->
  <Teleport to="body">
    <div v-if="visPopoverOpen" class="fixed inset-0 z-50" @mousedown.self="visPopoverOpen = false">
      <div
        class="absolute bg-card border border-border rounded-lg shadow-xl p-3 w-52 space-y-2"
        :style="visPopoverStyle"
        @mousedown.stop
      >
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider truncate">
          {{ resolvedMonster?.name }}
        </p>

        <!-- Whole party -->
        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs transition-colors"
          :class="currentDiscovery && allPartyIds.every(id => isMemberVisible(id))
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
            <component :is="isMemberVisible(member.id) ? Eye : EyeOff" class="h-3 w-3 shrink-0" />
            {{ member.name }}
          </button>
        </div>

        <!-- Reveal stats -->
        <div v-if="currentDiscovery" class="border-t border-border pt-1">
          <button
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs transition-colors"
            :class="currentDiscovery.reveal_stats
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
            @click="updateStats({ id: currentDiscovery.id, revealStats: !currentDiscovery.reveal_stats })"
          >
            <BarChart2 class="h-3 w-3 shrink-0" />
            {{ currentDiscovery.reveal_stats ? 'Stats visible' : 'Stats hidden' }}
          </button>
        </div>

        <!-- Unshare -->
        <div class="border-t border-border pt-1">
          <button
            v-if="currentDiscovery"
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
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Pencil, Eye, EyeOff, ChevronLeft, Users, BarChart2 } from "lucide-vue-next";
import { useMonster, getSrdMonster } from "@/composables/useMonsters";
import { useSrdMonsterArt } from "@/composables/useSrdMonsterArt";
import { useMonsterVisibility } from "@/composables/useMonsterVisibility";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import MonsterDetail from "@/components/monsters/MonsterDetail.vue";
import MonsterSheet from "@/components/monsters/MonsterSheet.vue";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "monster-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));
const isSrdId = computed(() => id.value.startsWith("srd_"));
const isEditing = computed(() => isNew.value || route.query.edit === "true");

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}
function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  router.replace({ query: q });
}

const { data: artMap } = useSrdMonsterArt();
const srdMonster = computed(() => {
  if (!isSrdId.value) return null;
  const m = getSrdMonster(id.value);
  if (!m) return null;
  const art = artMap.value?.[id.value];
  return art
    ? { ...m, image_url: art.image_url, portrait_focal_point: art.portrait_focal_point }
    : m;
});
const dbMonsterId = computed(() => isSrdId.value ? "" : id.value);
const { data: dbMonster, isLoading: dbLoading } = useMonster(dbMonsterId);

const isLoading = computed(() => !isNew.value && !isSrdId.value && dbLoading.value);

const resolvedMonster = computed(() => {
  if (isNew.value) return null;
  if (isSrdId.value) return srdMonster.value;
  return dbMonster.value ?? null;
});

const pageTitle = computed(() => {
  if (isNew.value) return "New Monster";
  return resolvedMonster.value?.name ?? "Loading…";
});

const pageDescription = computed(() => {
  const m = resolvedMonster.value;
  if (!m) return "";
  return `${m.size} ${m.monster_type} · CR ${m.stat_block.challenge_rating}${m.is_srd ? " · SRD 5.1" : ""}`;
});

// ── Visibility / discovery ────────────────────────────────────────────────────

const {
  party,
  currentDiscovery,
  isDiscovered,
  allPartyIds,
  isMemberVisible,
  setWholeParty,
  toggleMember,
  unshare: doUnshare,
  updateStats,
} = useMonsterVisibility(resolvedMonster);

// ── Popover ───────────────────────────────────────────────────────────────────

const visBtn = ref<HTMLElement | null>(null);
const visPopoverOpen = ref(false);
const visPopoverStyle = ref("");

function openVisPopover() {
  const rect = visBtn.value?.getBoundingClientRect();
  if (rect) {
    visPopoverStyle.value = `top:${rect.bottom + 4}px;right:${window.innerWidth - rect.right}px`;
  }
  visPopoverOpen.value = true;
}

function unshare() {
  doUnshare();
  visPopoverOpen.value = false;
}
</script>
