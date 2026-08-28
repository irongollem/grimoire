<template>
  <!--
    One monster, in whichever form the situation calls for — the same four
    branches as `NpcDetailView`, in the same reading order, for the same
    reasons. Reading on tablet and up is a modal over the bestiary, which stays
    mounted behind it; editing is a commitment and keeps the full page at every
    width; phones keep their takeover for both. See `useDetailModal`.
  -->
  <MonsterDetailModal v-if="asModal" :id="id" @close="close" />

  <MonsterSheetMobile v-else-if="showMobileRead && resolvedMonster" :monster="resolvedMonster" />

  <!-- Mobile edit (<md): MonsterDetail renders its own MonsterEditMobile layer
       (app bar + stacked cards + save bar), so it needs no PageHeader chrome. -->
  <MonsterDetail
    v-else-if="showMobileEdit"
    :key="id"
    :monster="isNew ? null : resolvedMonster"
  />

  <!-- Desktop edit, and the new-monster form at every width. -->
  <PageHeader v-else-if="showDesktopEdit" :title="pageTitle" :description="pageDescription">
    <template v-if="!isNew" #actions>
      <!-- Back to reading — the modal over the bestiary on desktop, the
           full-screen sheet on a phone. -->
      <PageHeaderAction label="View" :icon="IconDocument" @click="stopEditing" />
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <MonsterDetail v-else :monster="resolvedMonster" />
  </PageHeader>

  <!-- Reading on a phone, before the row has arrived. Every other branch owns
       its own loading state; this one has no chrome to hang it on. -->
  <div v-else class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconDocument } from '@/lib/icons';
import { useMonsterWithArt } from "@/composables/monsters/useMonsters";
import { useDetailModal } from "@/composables/useDetailModal";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import MonsterDetail from "@/components/monsters/MonsterDetail.vue";
import MonsterDetailModal from "@/components/monsters/MonsterDetailModal.vue";
import MonsterSheetMobile from "@/components/monsters/MonsterSheetMobile.vue";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "monster-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

// The same reasoning MonstersView uses to decide whether to keep drawing the
// grid, so the two cannot disagree about which one the user is looking at.
const { asModal, close } = useDetailModal("/monsters");

// Broader than the composable's `?edit=true` test, because /monsters/new is an
// edit screen without ever saying so in the query. That route is not nested
// under the list, so `asModal` is false there regardless.
const isEditing = computed(() => isNew.value || route.query.edit === "true");

const isMobile = useMediaQuery("(max-width: 767px)");
const showMobileRead = computed(() => isMobile.value && !isEditing.value && !isNew.value);
// MonsterDetail owns its own mobile chrome (MonsterEditMobile), so no PageHeader.
const showMobileEdit = computed(() => isMobile.value && isEditing.value && !isLoading.value);
const showDesktopEdit = computed(() => !isMobile.value && isEditing.value);

function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  void router.replace({ query: q });
}

// The DM's own upload over the canonical library art — the same resolution the
// modal needs, so it lives in the composable rather than in both.
const { monster: withArt, isLoading: resolvedLoading } = useMonsterWithArt(id);

const isLoading = computed(() => !isNew.value && resolvedLoading.value);

const resolvedMonster = computed(() => (isNew.value ? null : withArt.value));

const pageTitle = computed(() => {
  if (isNew.value) return "New Monster";
  return resolvedMonster.value?.name ?? "Loading…";
});

const pageDescription = computed(() => {
  const m = resolvedMonster.value;
  if (!m) return "";
  const sourceLabel = m.is_shared ? ` · ${m.source_title ?? m.source ?? "Reference"}` : "";
  return `${m.size} ${m.monster_type} · CR ${m.stat_block.challenge_rating}${sourceLabel}`;
});
</script>
