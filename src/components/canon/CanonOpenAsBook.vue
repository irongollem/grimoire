<template>
  <AppButton variant="outline" size="md" :icon="IconOpenBook" :loading="isStarting" @click="open">Open as a book</AppButton>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { useRouter } from "vue-router";
import { IconOpenBook } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useStartScriptoriumDocument } from "@/scriptorium/composables/useStartScriptoriumDocument";

/** The Canon drawn as the DM's book in the Scriptorium; the new document opens, as it does from the template gallery. */
const router = useRouter();
const toast = useToast();
const { startBookFromCampaign, isStarting } = useStartScriptoriumDocument();

async function open() {
  try {
    const id = await startBookFromCampaign("dm");
    await router.push(`/scriptorium/${id}`);
  } catch (e) {
    toast.error(toast.fromError(e, "Could not draw the book."));
  }
}
</script>
