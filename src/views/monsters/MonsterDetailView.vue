<template>
  <!-- Mobile read view (<md): standalone scrollable layer with its own app bar.
       Desktop and all edit modes fall through to the PageHeader block below,
       which is unchanged. -->
  <MonsterSheetMobile v-if="showMobileRead && resolvedMonster" :monster="resolvedMonster" />

  <!-- Mobile edit view (<md): MonsterDetail renders its own MonsterEditMobile
       layer (app bar + stacked cards + save bar). It does not need the
       PageHeader chrome, so we render MonsterDetail directly. -->
  <MonsterDetail
    v-else-if="showMobileEdit"
    :key="id"
    :monster="isNew ? null : resolvedMonster"
  />

  <PageHeader v-else :title="pageTitle" :description="pageDescription">
    <template v-if="!isNew" #actions>
      <PageHeaderAction
        type="button"
        label="Back"
        :icon="IconChevronLeft"
        @click="router.push('/monsters')"
      />

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
        <IconReveal v-if="isDiscovered" class="h-3.5 w-3.5" />
        <IconHide v-else class="h-3.5 w-3.5" />
      </button>

      <PageHeaderAction
        v-if="!isEditing"
        type="button"
        label="Edit"
        :icon="IconEdit"
        @click="startEditing"
      />
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
        <p class="text-label text-muted-foreground truncate">
          {{ resolvedMonster?.name }}
        </p>

        <!-- Whole party -->
        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-caption transition-colors"
          :class="currentDiscovery && allPartyIds.every(id => isMemberVisible(id))
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
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-caption transition-colors"
            :class="isMemberVisible(member.id)
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
            @click="toggleMember(member.id)"
          >
            <component :is="isMemberVisible(member.id) ? IconReveal : IconHide" class="h-3 w-3 shrink-0" />
            {{ member.name }}
          </button>
        </div>

        <!-- Reveal stats -->
        <div v-if="currentDiscovery" class="border-t border-border pt-1">
          <button
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-caption transition-colors"
            :class="currentDiscovery.reveal_stats
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
            @click="updateStats({ id: currentDiscovery.id, revealStats: !currentDiscovery.reveal_stats })"
          >
            <IconChart class="h-3 w-3 shrink-0" />
            {{ currentDiscovery.reveal_stats ? 'Stats visible' : 'Stats hidden' }}
          </button>
        </div>

        <!-- Unshare -->
        <div class="border-t border-border pt-1">
          <button
            v-if="currentDiscovery"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-caption text-destructive hover:bg-destructive/10 transition-colors"
            @click="unshare"
          >
            <IconHide class="h-3 w-3 shrink-0" />
            Hide from all players
          </button>
          <p v-else class="text-caption-sm text-muted-foreground italic px-2">
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
import { useMediaQuery } from "@vueuse/core";
import { IconChart, IconChevronLeft, IconEdit, IconHide, IconParty, IconReveal } from '@/lib/icons';
import { useResolvedMonster } from "@/composables/useMonsters";
import { useSrdMonsterArt } from "@/composables/useSrdMonsterArt";
import { useMonsterVisibility } from "@/composables/useMonsterVisibility";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import MonsterDetail from "@/components/monsters/MonsterDetail.vue";
import MonsterSheet from "@/components/monsters/MonsterSheet.vue";
import MonsterSheetMobile from "@/components/monsters/MonsterSheetMobile.vue";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "monster-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));
const isEditing = computed(() => isNew.value || route.query.edit === "true");

// Mobile-only layers (<md). Desktop keeps the existing PageHeader +
// MonsterSheet/MonsterDetail chrome, byte-identical to before.
const isMobile = useMediaQuery("(max-width: 767px)");
const showMobileRead = computed(() => isMobile.value && !isEditing.value && !isNew.value);
// Mobile edit: new monster, or existing monster opened with ?edit=true.
// MonsterDetail owns its own mobile chrome (MonsterEditMobile), so no PageHeader.
const showMobileEdit = computed(() => isMobile.value && isEditing.value && !isLoading.value);

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}

// Own art (user-uploaded) can override the canonical art already in srd_monsters.image_url
const { data: artMap } = useSrdMonsterArt();
const { data: resolvedData, isLoading: resolvedLoading } = useResolvedMonster(id);
const isSrdId = computed(() => resolvedData.value?.isShared === true);
const srdMonster = computed(() => {
  if (!isSrdId.value || !resolvedData.value) return null;
  const m = resolvedData.value.monster;
  const art = artMap.value?.[id.value];
  return art ? { ...m, image_url: art.image_url, portrait_focal_point: art.portrait_focal_point } : m;
});

const isLoading = computed(() =>
  !isNew.value && resolvedLoading.value,
);

const resolvedMonster = computed(() => {
  if (isNew.value) return null;
  if (isSrdId.value) return srdMonster.value;
  return resolvedData.value?.monster ?? null;
});

const pageTitle = computed(() => {
  if (isNew.value) return "New Monster";
  return resolvedMonster.value?.name ?? "Loading…";
});

const pageDescription = computed(() => {
  const m = resolvedMonster.value;
  if (!m) return "";
  const sourceLabel = m.is_srd ? ` · ${m.source_title ?? m.source ?? "Reference"}` : "";
  return `${m.size} ${m.monster_type} · CR ${m.stat_block.challenge_rating}${sourceLabel}`;
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
