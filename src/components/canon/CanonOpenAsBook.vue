<template>
  <AppButton variant="outline" size="md" :icon="IconOpenBook" :loading="isStarting" @click="open">Open as a book</AppButton>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { useRouter } from "vue-router";
import { IconOpenBook } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { useStartScriptoriumDocument } from "@/scriptorium/composables/useStartScriptoriumDocument";
import { useScriptoriumDocuments } from "@/scriptorium/composables/useScriptorium";
import { campaignBookTitle } from "@/scriptorium/lib/canonBook";

/**
 * The Canon drawn as the DM's book in the Scriptorium. A document records no origin, so the book this campaign drew
 * before is recognised by what drawing writes: this campaign, a book, a custom type and the DM's-book title. The
 * newest such book opens; only when there is none is one drawn. (A book the DM renamed is not recognised and is drawn
 * again.)
 */
const router = useRouter();
const toast = useToast();
const campaignStore = useCampaignStore();
const { startBookFromCampaign, isStarting } = useStartScriptoriumDocument();
const documents = useScriptoriumDocuments();

async function open() {
  try {
    const campaignId = campaignStore.activeCampaignId;
    const name = campaignStore.activeCampaign?.name;
    // Read the list before deciding: drawing a second book because the list had not arrived is the bug.
    const list = documents.data.value ?? (await documents.refetch()).data;
    if (!list) throw new Error("Could not look for the campaign's book.");
    const title = name ? campaignBookTitle(name, "dm") : null;
    const existing = list
      .filter((d) => d.campaign_id === campaignId && d.kind === "book" && d.doc_type === "custom" && d.title === title)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const id = existing ? existing.id : await startBookFromCampaign("dm");
    await router.push(`/scriptorium/${id}`);
  } catch (e) {
    toast.error(toast.fromError(e, "Could not draw the book."));
  }
}
</script>
