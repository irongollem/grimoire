<template>
  <PageHeader
    :title="displayName"
    :description="npc ? subtitle : 'Fill in the details below to add a new NPC to your realm'"
  >
    <template #actions>
      <!-- View / Edit toggle (existing NPCs only) -->
      <template v-if="!isNewNpc">
        <button
          v-if="!isEditing"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          @click="startEditing"
        >
          <IconEdit class="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          @click="stopEditing"
        >
          <IconReveal class="h-3.5 w-3.5" />
          View
        </button>
      </template>

      <!-- Edit-mode actions (only when editing and NpcDetail is mounted) -->
      <template v-if="isEditing && npcDetail">
        <button
          v-if="npc?.id"
          type="button"
          class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 transition-colors"
          @click="npcDetail.confirmDelete()"
        >
          Delete
        </button>
        <button
          v-if="npc?.id"
          type="button"
          :disabled="npcDetail.isSendingToScriptorium"
          class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
          @click="npcDetail.sendToScriptorium()"
        >
          <IconScrollText class="h-3.5 w-3.5" />
          {{ npcDetail.isSendingToScriptorium ? 'Exporting…' : 'Scriptorium' }}
        </button>
        <PlayerVisibilityToggle
          v-if="npc?.id"
          class="hidden sm:flex"
          :visible-to="npcDetail.form.player_visible_to"
          @update:visible-to="npcDetail.form.player_visible_to = $event"
        />
        <button
          v-if="npc?.id && (npcDetail.form.disguise_name || npcDetail.form.disguise_portrait_url)"
          type="button"
          class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 font-cinzel text-[10px] font-semibold tracking-wider rounded border transition-colors"
          :class="npcDetail.form.is_revealed
            ? 'border-amber-500/50 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
            : 'border-border text-muted-foreground hover:border-foreground/40'"
          @click="npcDetail.form.is_revealed = !npcDetail.form.is_revealed"
        >{{ npcDetail.form.is_revealed ? '✦ Revealed' : '◈ Concealed' }}</button>
        <button
          v-if="npcDetail.isAiEnabled"
          type="button"
          class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider border border-primary/40 text-primary rounded-md hover:bg-primary/10 transition-colors"
          @click="npcDetail.showGenerateDialog = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Generate
        </button>
        <!-- form= attribute submits the NpcDetail form from outside it -->
        <button
          type="submit"
          form="npc-detail-form"
          :disabled="npcDetail.isSaving"
          class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {{ npcDetail.isSaving ? 'Saving…' : (npc?.id ? 'Save Changes' : 'Create NPC') }}
        </button>
      </template>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else>
      <NpcSheet v-if="!isEditing && npc" :npc="npc" />
      <NpcDetail
        v-else
        :key="id"
        ref="npcDetail"
        :npc="isNewNpc ? null : (npc ?? null)"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconEdit, IconGenerate, IconReveal, IconScrollText } from '@/lib/icons';
import { useNpc } from "@/composables/useNpcs";
import { useRecentNpcs } from "@/composables/useRecentNpcs";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import NpcDetail from "@/components/npcs/NpcDetail.vue";
import NpcSheet from "@/components/npcs/NpcSheet.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";

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
const { recordVisit } = useRecentNpcs();
watch(id, (npcId) => { if (npcId) recordVisit(npcId); }, { immediate: true });
const isLoading = computed(() => !isNewNpc.value && npcLoading.value);

// Template ref to NpcDetail — gives access to its exposed state/methods
const npcDetail = ref<InstanceType<typeof NpcDetail> | null>(null);

const subtitle = computed(() => {
  if (!npc.value) return "";
  return [npc.value.race, npc.value.occupation].filter(Boolean).join(" · ");
});

const displayName = computed(() => {
  if (!npc.value) return "New NPC";
  const concealed = !!(npc.value.disguise_name || npc.value.disguise_portrait_url) && !npc.value.is_revealed;
  return concealed && npc.value.disguise_name ? npc.value.disguise_name : npc.value.name;
});
</script>
