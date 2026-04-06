<template>
  <PageHeader
    :title="npc?.name ?? 'New NPC'"
    :description="npc ? subtitle : 'Fill in the details below to add a new NPC to your realm'"
  >
    <template v-if="!isNewNpc" #actions>
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
      <NpcSheet v-if="!isEditing && npc" :npc="npc" />
      <NpcDetail v-else :key="id" :npc="isNewNpc ? null : (npc ?? null)" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Pencil, Eye } from "lucide-vue-next";
import { useNpc } from "@/composables/useNpcs";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import NpcDetail from "@/components/npcs/NpcDetail.vue";
import NpcSheet from "@/components/npcs/NpcSheet.vue";

const route = useRoute();
const router = useRouter();

const isNewNpc = computed(() => route.name === "npc-new");
const id = computed(() => (isNewNpc.value ? "" : (route.params.id as string)));
const isEditing = computed(() => isNewNpc.value || route.query.edit === "true");

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}
function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  router.replace({ query: q });
}

const { data: npc, isLoading: npcLoading } = useNpc(id);

// Lock main scroll in view mode so only the right column scrolls
let mainEl: HTMLElement | null = null;
function setMainScroll(lock: boolean) {
  if (mainEl) mainEl.style.overflow = lock ? "hidden" : "";
}
onMounted(() => {
  mainEl = document.querySelector("main");
  setMainScroll(!isEditing.value);
});
watch(isEditing, (editing) => setMainScroll(!editing));
onUnmounted(() => setMainScroll(false));
const isLoading = computed(() => !isNewNpc.value && npcLoading.value);

const subtitle = computed(() => {
  if (!npc.value) return "";
  return [npc.value.race, npc.value.occupation].filter(Boolean).join(" · ");
});
</script>
