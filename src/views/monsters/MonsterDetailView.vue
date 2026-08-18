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
        label="Back"
        :icon="IconChevronLeft"
        @click="router.push('/monsters')"
      />

      <MonsterRevealControl v-if="resolvedMonster" :monster="resolvedMonster" />

      <PageHeaderAction
        v-if="!isEditing"
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

</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconChevronLeft, IconEdit } from '@/lib/icons';
import { useResolvedMonster } from "@/composables/useMonsters";
import { useLibraryMonsterArt } from "@/composables/useLibraryMonsterArt";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import MonsterDetail from "@/components/monsters/MonsterDetail.vue";
import MonsterSheet from "@/components/monsters/MonsterSheet.vue";
import MonsterSheetMobile from "@/components/monsters/MonsterSheetMobile.vue";
import MonsterRevealControl from "@/components/monsters/MonsterRevealControl.vue";

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

// Own art (user-uploaded) can override the canonical art already in library_monsters.image_url
const { data: artMap } = useLibraryMonsterArt();
const { data: resolvedData, isLoading: resolvedLoading } = useResolvedMonster(id);
const isLibraryMonster = computed(() => resolvedData.value?.isShared === true);
const libraryMonster = computed(() => {
  if (!isLibraryMonster.value || !resolvedData.value) return null;
  const m = resolvedData.value.monster;
  const art = artMap.value?.[id.value];
  return art ? { ...m, image_url: art.image_url, portrait_focal_point: art.portrait_focal_point } : m;
});

const isLoading = computed(() =>
  !isNew.value && resolvedLoading.value,
);

const resolvedMonster = computed(() => {
  if (isNew.value) return null;
  if (isLibraryMonster.value) return libraryMonster.value;
  return resolvedData.value?.monster ?? null;
});

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
