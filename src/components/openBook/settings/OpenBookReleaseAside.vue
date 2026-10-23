<template>
  <aside class="flex flex-col gap-7">
    <div class="flex flex-col gap-2 rounded-md border border-border bg-card px-5 py-5">
      <span class="flex items-center gap-2 text-label-lg font-semibold" :class="book.is_open ? 'text-tone-success' : 'text-muted-foreground'">
        <span class="size-2 rotate-45" :class="book.is_open ? 'bg-tone-success' : 'bg-muted-foreground'" aria-hidden="true" />
        {{ statusLabel }}
      </span>
      <a
        v-if="book.is_open"
        :href="`/w/${book.slug}`"
        target="_blank"
        rel="noopener"
        class="text-body text-primary hover:underline"
      >
        {{ host }}/w/{{ book.slug }}
      </a>
      <span v-else class="text-body text-muted-foreground">{{ host }}/w/{{ book.slug }}</span>
      <AppButton
        v-if="!book.is_open && book.live_release_id"
        variant="outline"
        size="sm"
        class="self-start"
        label="Open the book again"
        :loading="setOpen.isPending.value"
        @click="onSetOpen(true)"
      />
    </div>

    <OpenBookReleaseHistory
      :releases="releases"
      :live-id="book.live_release_id"
      :busy="putBack.isPending.value"
      :exporting-id="pdf.releaseId.value"
      :phase-label="phaseLabel"
      :pdf-error="pdf.error.value"
      @put-back="onPutBack"
      @export-pdf="onExportPdf"
    />

    <div class="flex flex-col gap-2">
      <h3 class="text-label-lg font-semibold uppercase text-muted-foreground">When someone shares the link</h3>
      <OpenBookShareCard
        :title="book.title"
        :subtitle="book.subtitle"
        :cover-image-url="book.cover_image_url"
        :leather="book.leather"
        :stats="stats"
        :sessions="sessions"
      />
    </div>

    <div v-if="book.is_open" class="flex flex-col items-start gap-2 border-t border-border pt-4">
      <AppButton
        variant="outline"
        tone="danger"
        label="Close the book"
        :loading="setOpen.isPending.value"
        @click="onClose"
      />
      <span class="text-caption text-muted-foreground">
        The address stops working at once. Your releases are kept, so opening it again takes one click.
      </span>
    </div>
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { usePutBackRelease, useSetOpenBookOpen } from "@/composables/openBook/useOpenBook";
import { PDF_PHASE_LABEL, useOpenBookPdf } from "@/composables/openBook/useOpenBookPdf";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import type { OpenBook, OpenBookRelease, OpenBookSession, OpenBookStats } from "@/types/openBook.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import OpenBookReleaseHistory from "./OpenBookReleaseHistory.vue";
import OpenBookShareCard from "./OpenBookShareCard.vue";

const { book, campaignId } = defineProps<{
  book: OpenBook;
  campaignId: string;
  releases: OpenBookRelease[];
  stats: OpenBookStats | null;
  sessions: OpenBookSession[];
}>();

const host = window.location.host;
const { confirm } = useConfirm();
const toast = useToast();
const setOpen = useSetOpenBookOpen();
const putBack = usePutBackRelease();
const pdf = useOpenBookPdf(() => campaignId);
const error = ref("");

const phaseLabel = computed(() => (pdf.phase.value ? PDF_PHASE_LABEL[pdf.phase.value] : ""));

const statusLabel = computed(() => {
  if (book.is_open) return "Open to the world";
  return book.live_release_id ? "Closed" : "Not released yet";
});

async function onSetOpen(isOpen: boolean) {
  error.value = "";
  try {
    await setOpen.mutateAsync({ campaignId, isOpen });
  } catch (e) {
    error.value = toast.fromError(e, "Could not change the book.");
  }
}

async function onClose() {
  const ok = await confirm("The address stops working at once. Your releases are kept.", {
    title: "Close the book?",
    confirmLabel: "Close the book",
  });
  if (ok) await onSetOpen(false);
}

async function onExportPdf(release: OpenBookRelease) {
  const ok = await pdf.exportRelease(book, release);
  if (ok) toast.success(`The PDF of Release ${release.number} is ready.`);
}

async function onPutBack(releaseId: string) {
  error.value = "";
  try {
    await putBack.mutateAsync({ campaignId, releaseId });
  } catch (e) {
    error.value = toast.fromError(e, "Could not put that release back.");
  }
}
</script>
