<template>
  <div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
    <div class="flex flex-col gap-7">
      <OpenBookFormStep :n="1" label="Address">
        <div class="flex max-w-lg items-center gap-2">
          <span class="shrink-0 text-body text-muted-foreground">{{ ORIGIN_LABEL }}/w/</span>
          <AppInput v-model="draft.slug" tone="filled" size="body" aria-label="Address" class="flex-1" />
        </div>
        <p v-if="slugError" role="alert" class="text-caption text-destructive">{{ slugError }}</p>
        <p v-else-if="!slugValid" class="text-caption text-destructive">
          Use 1 to 48 lowercase letters, numbers and hyphens, not starting or ending with a hyphen.
        </p>
      </OpenBookFormStep>

      <OpenBookFormStep :n="2" label="Cover">
        <div class="grid max-w-xl gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-label-lg text-muted-foreground" for="open-book-title">Title</label>
            <AppInput id="open-book-title" v-model="draft.title" tone="filled" size="body" />
          </div>
          <div>
            <label class="mb-1 block text-label-lg text-muted-foreground" for="open-book-subtitle">
              Line under the title
            </label>
            <AppInput id="open-book-subtitle" v-model="subtitle" tone="filled" size="body" />
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <span class="w-[4.5rem] text-label-lg text-muted-foreground">Art</span>
          <SegmentedControl v-model="draft.cover_art" :options="ART_OPTIONS" variant="outline" size="sm" />
        </div>
        <div v-if="draft.cover_art !== 'tooled'" class="max-w-xs sm:ml-[5.5rem]">
          <ImageUpload
            v-model="draft.cover_image_url"
            bucket="chronicle"
            aspect="portrait"
            placeholder="Drop a portrait image, at least 1200 × 1650. The title sits on a leather label over it."
          />
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <span class="w-[4.5rem] text-label-lg text-muted-foreground">Leather</span>
          <!-- A swatch whose texture is the state, like the app's colour pips (see appButtonVariants.ts): no AppButton variant draws a fill. -->
          <div class="flex gap-3" role="group" aria-label="Leather">
            <button
              v-for="id in OPEN_BOOK_LEATHERS"
              :key="id"
              type="button"
              :aria-label="LEATHERS[id].label"
              :aria-pressed="draft.leather === id"
              class="size-11 rounded-sm"
              :class="draft.leather === id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'ring-1 ring-border'"
              :style="leatherBackground(id, '6rem')"
              @click="draft.leather = id"
            />
          </div>
        </div>
      </OpenBookFormStep>

      <OpenBookFormStep :n="3" label="What goes in">
        <template #aside>
          <AppButton variant="link" size="sm" label="Choose entries…" @click="pickerOpen = true" />
        </template>
        <OpenBookToggleRow
          v-model="draft.include_shared"
          label="Everything the whole party can see"
          hint="On by default, and new reveals join the next release by themselves. Take out what you want to keep to the table."
        />
        <OpenBookChapterList v-model="draft.chapters" :stats="preview?.stats ?? null" />
      </OpenBookFormStep>

      <OpenBookFormStep :n="4" label="Readers">
        <OpenBookToggleRow
          v-model="draft.allow_pdf"
          label="Let readers download a PDF"
          :hint="pdfHint"
        />
        <OpenBookToggleRow
          v-model="draft.indexable"
          label="Findable by search engines"
          hint="Off keeps the book to people you give the address."
        />
      </OpenBookFormStep>

      <div class="flex flex-col gap-2 sm:pl-[3.25rem]">
        <AutosaveStatus
          :status="autosave.status.value"
          :error="autosave.saveError.value"
          paused-label="Autosave paused until the address and title are valid"
        />
        <ProFeatureGate v-if="!isPro" message="Releasing an Open Book is part of Pro. Your settings are kept." />
        <div class="flex flex-wrap items-center gap-3">
          <AppButton variant="primary" label="Review and release" :disabled="!isPro || !slugValid" @click="onReview" />
          <AppButton
            v-if="book.is_open"
            variant="outline"
            label="Preview the book"
            :icon="IconExternalLink"
            :href="`/w/${book.slug}`"
            target="_blank"
            rel="noopener"
          />
          <template v-else>
            <AppButton variant="outline" label="Preview the book" disabled />
            <span class="text-caption text-muted-foreground">Release once to see it as visitors will.</span>
          </template>
        </div>
      </div>
    </div>

    <aside class="flex flex-col gap-6">
      <OpenBookCoverPreview
        :title="draft.title"
        :cover-art="draft.cover_art"
        :cover-image-url="draft.cover_image_url"
        :leather="draft.leather"
      />
      <OpenBookNeverPrinted />
    </aside>

    <AppModal :open="pickerOpen" size="lg" label="Choose entries" @close="pickerOpen = false">
      <OpenBookEntryPicker :campaign-id="campaignId" @close="pickerOpen = false" />
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useAutosave } from "@/composables/useAutosave";
import { useSaveOpenBook } from "@/composables/openBook/useOpenBook";
import { useOpenBookPreview, useOpenBookReleases } from "@/composables/openBook/useOpenBookReleases";
import { classifyOpenBookError } from "@/lib/openBook/errors";
import { isValidOpenBookSlug } from "@/lib/openBook/slug";
import { IconExternalLink } from "@/lib/icons";
import { OPEN_BOOK_LEATHERS, type OpenBook, type OpenBookCoverArt } from "@/types/openBook.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import ProFeatureGate from "@/components/billing/ProFeatureGate.vue";
import OpenBookChapterList from "./OpenBookChapterList.vue";
import OpenBookCoverPreview from "./OpenBookCoverPreview.vue";
import OpenBookEntryPicker from "./OpenBookEntryPicker.vue";
import OpenBookFormStep from "./OpenBookFormStep.vue";
import OpenBookNeverPrinted from "./OpenBookNeverPrinted.vue";
import OpenBookToggleRow from "./OpenBookToggleRow.vue";
import { LEATHERS, leatherBackground } from "@/lib/openBook/leather";
import { bookToDraft, draftCanSave, draftsEqual } from "./openBookDraft";

const { book, campaignId } = defineProps<{ book: OpenBook; campaignId: string; isPro: boolean }>();
const emit = defineEmits<{ review: [] }>();

const ORIGIN_LABEL = window.location.host;
const ART_OPTIONS: { value: OpenBookCoverArt; label: string }[] = [
  { value: "tooled", label: "Tooled only" },
  { value: "plate", label: "Framed plate" },
  { value: "full", label: "Full cover" },
];

const draft = reactive(bookToDraft(book));
const pickerOpen = ref(false);
const slugError = ref("");
const slugValid = computed(() => isValidOpenBookSlug(draft.slug));
const subtitle = computed({
  get: () => (draft.subtitle === null ? "" : draft.subtitle),
  set: (value: string) => {
    draft.subtitle = value === "" ? null : value;
  },
});

watch(() => draft.slug, () => {
  slugError.value = "";
});

// Counts beside the chapters come from what a release made now would hold.
const { data: preview } = useOpenBookPreview(() => campaignId, true);

// A reader's download is the live release's PDF, which the owner exports from the release list.
const { data: releases } = useOpenBookReleases(() => campaignId);
const pdfHint = computed(() => {
  const live = (releases.value ?? []).find((r) => r.id === book.live_release_id);
  return draft.allow_pdf && live && live.pdf_url === null
    ? "Export the PDF for readers to download it: it is under Releases, in Review and release."
    : "Each release is also set as a printable book, with the same pages.";
});

const { mutateAsync: saveBook } = useSaveOpenBook();

const autosave = useAutosave({
  draft,
  initial: () => bookToDraft(book),
  equal: draftsEqual,
  canSave: () => draftCanSave(draft),
  delay: 1000,
  errorMessage: "Could not save the book's settings",
  save: async (snapshot) => {
    try {
      await saveBook({ campaignId, settings: snapshot });
    } catch (error) {
      if (classifyOpenBookError(error) === "slug_taken") {
        slugError.value = "That address is taken. Choose another.";
        throw new Error("That address is taken");
      }
      throw error;
    }
  },
});

/** Flush the edits, then hand over to the review; a failed save keeps the form in view. */
async function onReview() {
  await autosave.saveNow();
  if (!autosave.dirty.value) emit("review");
}
</script>
