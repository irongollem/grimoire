<template>
  <AppButton variant="outline" size="md" :icon="IconOpenBook" :loading="isStarting" label="Open as a book" collapse-label-on-mobile collapse-below="header" @click="open" />
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { useRouter } from "vue-router";
import { IconOpenBook } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { useStartScriptoriumDocument } from "@/scriptorium/composables/useStartScriptoriumDocument";
import { useScriptoriumDocuments } from "@/scriptorium/composables/useScriptorium";

/**
 * The Canon drawn as the DM's book in the Scriptorium. The book this campaign drew before says so itself
 * (`drawn_from = 'canon'`), so a renamed book is found again: this campaign's, the DM's (not the players' copy), a book.
 * The newest such book opens; only when there is none is one drawn.
 */
const router = useRouter();
const toast = useToast();
const campaignStore = useCampaignStore();
const { startBookFromCampaign, isStarting } = useStartScriptoriumDocument();
const documents = useScriptoriumDocuments();

async function open() {
  try {
    const campaignId = campaignStore.activeCampaignId;
    // Read the list before deciding: drawing a second book because the list had not arrived is the bug.
    const list = documents.data.value ?? (await documents.refetch()).data;
    if (!list) throw new Error("Could not look for the campaign's book.");
    const existing = list
      .filter((d) => d.campaign_id === campaignId && d.kind === "book" && d.doc_type === "custom" && d.audience === "dm" && d.drawn_from === "canon")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const id = existing ? existing.id : await startBookFromCampaign("dm");
    await router.push(`/scriptorium/${id}`);
  } catch (e) {
    toast.error(toast.fromError(e, "Could not draw the book."));
  }
}
</script>
