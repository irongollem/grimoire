<template>
  <!-- Mobile read view (<md): standalone scrollable layer with its own app bar.
       Desktop and all edit modes fall through to the PageHeader block below,
       which is unchanged. -->
  <NpcDetailMobile v-if="showMobileRead && npc" :npc="npc" />

  <!-- Mobile edit view (<md): NpcDetail renders its own NpcEditMobile layer
       (app bar + stacked cards + save bar). It does not need the PageHeader
       chrome, so we render NpcDetail directly. -->
  <NpcDetail
    v-else-if="showMobileEdit"
    :key="id"
    :npc="isNewNpc ? null : (npc ?? null)"
  />

  <PageHeader
    v-else
    :title="displayName"
    :description="npc ? subtitle : 'Fill in the details below to add a new NPC to your realm'"
  >
    <template #actions>
      <!-- View / Edit toggle (existing NPCs only) -->
      <template v-if="!isNewNpc">
        <PageHeaderAction
          v-if="!isEditing"
          label="Edit"
          :icon="IconEdit"
          @click="startEditing"
        />
        <PageHeaderAction
          v-else
          label="View"
          :icon="IconDocument"
          @click="stopEditing"
        />
      </template>

      <!-- Edit-mode actions (only when editing and NpcDetail is mounted) -->
      <template v-if="isEditing && npcDetail">
        <PageHeaderAction
          v-if="npc?.id"
          label="Delete"
          :icon="IconDelete"
          variant="destructive"
          @click="npcDetail.confirmDelete()"
        />
        <PageHeaderAction
          v-if="npc?.id"
          :label="npcDetail.isSendingToScriptorium ? 'Exporting…' : 'Scriptorium'"
          :tooltip="npcDetail.isSendingToScriptorium ? 'Exporting…' : 'Send to Scriptorium'"
          :disabled="npcDetail.isSendingToScriptorium"
          :icon="IconScrollText"
          @click="npcDetail.sendToScriptorium()"
        />
        <PlayerVisibilityToggle
          v-if="npc?.id"
          :visible-to="npcDetail.form.player_visible_to"
          @update:visible-to="npcDetail.form.player_visible_to = $event"
        />
        <PageHeaderAction
          v-if="npc?.id && (npcDetail.form.disguise_name || npcDetail.form.disguise_portrait_url)"
          :label="npcDetail.form.is_revealed ? 'Revealed' : 'Concealed'"
          :tooltip="npcDetail.form.is_revealed ? 'Revealed' : 'Concealed'"
          :icon="npcDetail.form.is_revealed ? IconReveal : IconHide"
          @click="npcDetail.form.is_revealed = !npcDetail.form.is_revealed"
        />
        <PageHeaderAction
          v-if="npcDetail.isAiEnabled"
          label="Generate"
          :icon="IconGenerate"
          @click="npcDetail.showGenerateDialog = true"
        />
        <!-- form= attribute submits the NpcDetail form from outside it -->
        <PageHeaderAction
          type="submit"
          form="npc-detail-form"
          :disabled="npcDetail.isSaving"
          :label="npcDetail.isSaving ? 'Saving…' : (npc?.id ? 'Save Changes' : 'Create NPC')"
          :mobile-label="npcDetail.isSaving ? 'Saving…' : (npc?.id ? 'Save' : 'Create')"
          variant="primary"
          :collapse-label-on-mobile="false"
        />
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
import { useMediaQuery } from "@vueuse/core";
import { IconDelete, IconDocument, IconEdit, IconGenerate, IconHide, IconReveal, IconScrollText } from '@/lib/icons';
import { useNpc } from "@/composables/useNpcs";
import { useRecentNpcs } from "@/composables/useRecentNpcs";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import NpcDetail from "@/components/npcs/NpcDetail.vue";
import NpcSheet from "@/components/npcs/NpcSheet.vue";
import NpcDetailMobile from "@/components/npcs/NpcDetailMobile.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";

const route = useRoute();
const router = useRouter();

const isNewNpc = computed(() => route.name === "npc-new");
const id = computed(() => (isNewNpc.value ? "" : (route.params.id as string)));
const isEditing = computed(() => isNewNpc.value || route.query.edit === "true");

// Mobile-only layers (<md). Desktop keeps the existing PageHeader +
// NpcSheet/NpcDetail chrome, byte-identical to before.
const isMobile = useMediaQuery("(max-width: 767px)");
const showMobileRead = computed(() => isMobile.value && !isEditing.value && !isNewNpc.value);
// Mobile edit: new NPC, or existing NPC opened with ?edit=true. NpcDetail owns
// its own mobile chrome (NpcEditMobile), so no PageHeader here.
const showMobileEdit = computed(() => isMobile.value && isEditing.value && !isLoading.value);

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
