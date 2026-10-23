<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="font-cinzel text-heading-lg">Open Book</h2>
      <p class="mt-2 max-w-2xl text-body text-muted-foreground">
        Bind what your table has found into a book anyone can read, at an address you choose. Nothing is open until
        you release it, and you can close the book at any moment.
      </p>
    </div>

    <ListSkeleton v-if="isPending" variant="text" />
    <p v-else-if="error" role="alert" class="text-body text-destructive">Could not load the Open Book settings.</p>
    <template v-else-if="campaignId">
      <div v-if="!book" class="flex max-w-xl flex-col items-start gap-3 rounded-md border border-border bg-card p-5">
        <p class="text-body">This campaign has no Open Book yet. Setting it up creates the settings; nothing goes public.</p>
        <p v-if="setupError" role="alert" class="text-caption text-destructive">{{ setupError }}</p>
        <AppButton
          variant="primary"
          label="Set up the Open Book"
          :loading="save.isPending.value"
          @click="setUp"
        />
      </div>
      <OpenBookReleaseReview
        v-else-if="reviewing"
        :key="`review-${campaignId}`"
        :book="book"
        :campaign-id="campaignId"
        :is-pro="isPro"
        @done="reviewing = false"
      />
      <OpenBookSettingsForm
        v-else
        :key="campaignId"
        :book="book"
        :campaign-id="campaignId"
        :is-pro="isPro"
        @review="reviewing = true"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useOpenBook, useSaveOpenBook } from "@/composables/openBook/useOpenBook";
import { useToast } from "@/composables/useToast";
import { classifyOpenBookError } from "@/lib/openBook/errors";
import { slugifyOpenBookTitle } from "@/lib/openBook/slug";
import AppButton from "@/components/common/controls/AppButton.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import OpenBookReleaseReview from "@/components/openBook/settings/OpenBookReleaseReview.vue";
import OpenBookSettingsForm from "@/components/openBook/settings/OpenBookSettingsForm.vue";

const campaignStore = useCampaignStore();
const { activeCampaignId: campaignId } = storeToRefs(campaignStore);
const { isPro } = useSubscription();
const toast = useToast();

const { data: book, isPending, error } = useOpenBook(campaignId);
const save = useSaveOpenBook();
const reviewing = ref(false);
const setupError = ref("");

/** The one explicit save: there is no row to autosave into until it exists. */
async function setUp() {
  const id = campaignId.value;
  const name = campaignStore.activeCampaign?.name;
  if (!id || !name) return;
  setupError.value = "";
  const base = slugifyOpenBookTitle(name) || "book";
  try {
    await save.mutateAsync({ campaignId: id, settings: { slug: base, title: name } });
  } catch (e) {
    if (classifyOpenBookError(e) === "slug_taken") {
      // Another campaign took the plain slug; a short suffix keeps the first save one click.
      const suffix = Math.random().toString(36).slice(2, 6);
      try {
        await save.mutateAsync({ campaignId: id, settings: { slug: `${base.slice(0, 43)}-${suffix}`, title: name } });
        return;
      } catch (retry) {
        setupError.value = toast.fromError(retry, "Could not set up the Open Book.");
        return;
      }
    }
    setupError.value = toast.fromError(e, "Could not set up the Open Book.");
  }
}
</script>
