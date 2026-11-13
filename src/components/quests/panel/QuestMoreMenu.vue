<template>
  <MenuPopover label="Quest actions" data-testid="quest-more-menu">
    <template #trigger="{ toggle, open }">
      <AppButton :icon="IconMore" label="More" size="sm" variant="subtle" aria-haspopup="menu" :aria-expanded="open" :loading="sending" @click="toggle" />
    </template>
    <template #default="{ close }">
      <AppButton variant="menu" size="md" block class="rounded-none" role="menuitem" label="Send to Scriptorium" @click="close(false); void sendToScriptorium()" />
      <AppButton variant="menu" size="md" block class="rounded-none" role="menuitem" tone="danger" label="Delete quest" :disabled="deleting" @click="close(false); void removeQuest()" />
    </template>
  </MenuPopover>
  <PaywallModal v-model="showScriptoriumPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useFetchLocation } from "@/composables/locations/useLocations";
import { useFetchNpc } from "@/composables/npcs/useNpcs";
import { useDeleteQuest, useQuestObjectives } from "@/composables/quests/useQuests";
import { useCreateScriptoriumBook } from "@/scriptorium/composables/useScriptorium";
import { bookInsertFromImport, formatQuestForScriptorium } from "@/scriptorium/lib/scriptoriumImport";
import { buildEntityEmbedDocumentJson } from "@/scriptorium/lib/entityEmbeds";
import { IconMore } from "@/lib/icons";
import { isQuotaExceeded } from "@/lib/quotaError";
import type { Quest } from "@/types/quest.types";

const props = defineProps<{ quest: Quest }>();
const router = useRouter();
const { confirm } = useConfirm();
const toast = useToast();
const { data: objectives } = useQuestObjectives(computed(() => props.quest.id));
// The giver and place names are needed once, at click time, so they are read as
// single rows then rather than loading every NPC and place at mount.
const fetchNpc = useFetchNpc();
const fetchLocation = useFetchLocation();
const { mutateAsync: deleteQuest } = useDeleteQuest();
const { mutateAsync: createScriptoriumDocument } = useCreateScriptoriumBook();
const showScriptoriumPaywall = ref(false);
const deleting = ref(false);
const sending = ref(false);

async function removeQuest() {
  if (deleting.value || !(await confirm(`Delete "${props.quest.title || "this quest"}"?`))) return;
  deleting.value = true;
  try {
    await deleteQuest(props.quest.id);
    await router.push("/quests");
  } finally {
    deleting.value = false;
  }
}

async function sendToScriptorium() {
  sending.value = true;
  try {
    const [giverName, locationName] = await Promise.all([
      props.quest.giver_npc_id ? fetchNpc(props.quest.giver_npc_id).then((npc) => npc.name) : null,
      props.quest.location_id ? fetchLocation(props.quest.location_id).then((location) => location.name) : null,
    ]);
    const importData = formatQuestForScriptorium(props.quest, objectives.value ?? [], giverName, locationName);
    // Live link, not a one-time snapshot (#915 story 3). The generated
    // document travels with the quest's own campaign scope (#915 story 1).
    const document = await createScriptoriumDocument({
      book: bookInsertFromImport(importData, props.quest.campaign_id),
      chapters: [{ content: buildEntityEmbedDocumentJson("quest", props.quest.id) }],
    });
    await router.push(`/scriptorium/${document.id}`);
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showScriptoriumPaywall.value = true; return; }
    toast.error(toast.fromError(e));
  } finally {
    sending.value = false;
  }
}
</script>
