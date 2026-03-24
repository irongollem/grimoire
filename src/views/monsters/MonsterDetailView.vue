<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <MonsterDetail v-else :monster="resolvedMonster" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useMonster, getSrdMonster } from "@/composables/useMonsters";
import { useSrdMonsterArt } from "@/composables/useSrdMonsterArt";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import MonsterDetail from "@/components/monsters/MonsterDetail.vue";

const route = useRoute();
const isNew = computed(() => route.name === "monster-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));
const isSrdId = computed(() => id.value.startsWith("srd_"));

const { data: artMap } = useSrdMonsterArt();
const srdMonster = computed(() => {
  if (!isSrdId.value) return null;
  const m = getSrdMonster(id.value);
  if (!m) return null;
  const art = artMap.value?.[id.value];
  return art
    ? { ...m, image_url: art.image_url, card_art_url: art.card_art_url, portrait_focal_point: art.portrait_focal_point, card_art_focal_point: art.card_art_focal_point }
    : m;
});
const { data: dbMonster, isLoading: dbLoading } = useMonster(
  isSrdId.value ? "" : id.value,
);

const isLoading = computed(() => !isNew.value && !isSrdId.value && dbLoading.value);

const resolvedMonster = computed(() => {
  if (isNew.value) return null;
  if (isSrdId.value) return srdMonster.value;
  return dbMonster.value ?? null;
});

const pageTitle = computed(() => {
  if (isNew.value) return "New Monster";
  const m = resolvedMonster.value;
  return m?.name ?? "Loading…";
});

const pageDescription = computed(() => {
  const m = resolvedMonster.value;
  if (!m) return "";
  return `${m.size} ${m.monster_type} · CR ${m.stat_block.challenge_rating}${m.is_srd ? " · SRD 5.1" : ""}`;
});
</script>
