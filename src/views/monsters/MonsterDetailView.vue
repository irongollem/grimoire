<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <template v-if="!isNew" #actions>
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
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Pencil, Eye } from "lucide-vue-next";
import { useMonster, getSrdMonster } from "@/composables/useMonsters";
import { useSrdMonsterArt } from "@/composables/useSrdMonsterArt";
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
    ? { ...m, image_url: art.image_url, card_art_url: art.card_art_url, portrait_focal_point: art.portrait_focal_point, card_art_focal_point: art.card_art_focal_point }
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
</script>
