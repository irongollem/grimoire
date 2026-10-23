<template>
  <div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
    <div class="flex flex-col gap-6">
      <div>
        <span class="text-label-lg uppercase text-muted-foreground">Open Book · {{ book.title }}</span>
        <h2 class="mt-1 text-heading-lg">Release {{ nextNumber }}</h2>
        <p class="mt-1.5 text-body text-muted-foreground">{{ sinceLine }}</p>
      </div>

      <ListSkeleton v-if="isLoading" variant="text" />
      <p v-else-if="loadError" role="alert" class="text-body text-destructive">
        Could not read what the book holds: {{ loadError }}
      </p>
      <template v-else-if="diff">
        <div class="grid gap-8 sm:grid-cols-3">
          <OpenBookDiffColumn title="New" mark-class="bg-tone-success" :groups="groupBySection(diff.added)" empty="Nothing new." />
          <OpenBookDiffColumn title="Revised" mark-class="bg-tone-info" :groups="groupBySection(diff.revised)" empty="Nothing revised." />
          <OpenBookDiffColumn
            title="Taken out"
            mark-class="bg-destructive"
            :groups="groupBySection(diff.removed)"
            empty="Nothing taken out."
            note="These return to your table only."
          />
        </div>
        <p v-if="diffIsEmpty(diff)" class="text-body text-muted-foreground">
          Nothing differs from the live release. Releasing again makes a copy of it.
        </p>
      </template>

      <div class="flex max-w-xl flex-col gap-1">
        <label class="text-label-lg text-muted-foreground" for="open-book-release-note">
          A line for the contents page (optional)
        </label>
        <AppInput id="open-book-release-note" v-model="note" tone="filled" size="body" />
      </div>

      <ProFeatureGate v-if="!isPro || needsPro" message="Releasing an Open Book is part of Pro." />
      <p v-if="releaseError" role="alert" class="text-caption text-destructive">{{ releaseError }}</p>

      <div class="flex flex-wrap items-center gap-3">
        <AppButton
          variant="primary"
          size="lg"
          label="Release to the world"
          :disabled="!isPro || isLoading || diff === null"
          :loading="release.isPending.value"
          @click="onRelease"
        />
        <AppButton variant="ghost" label="Not yet" @click="emit('done')" />
      </div>
    </div>

    <OpenBookReleaseAside :book="book" :campaign-id="campaignId" :releases="releaseList" :stats="preview?.stats ?? null" :sessions="preview?.sessions ?? []" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  useOpenBookPreview,
  useOpenBookReleases,
  useReleaseOpenBook,
  useReleaseSnapshot,
} from "@/composables/openBook/useOpenBookReleases";
import { useToast } from "@/composables/useToast";
import { classifyOpenBookError } from "@/lib/openBook/errors";
import { diffIsEmpty, diffSnapshots, groupBySection } from "@/lib/openBook/releaseDiff";
import type { OpenBook } from "@/types/openBook.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import ProFeatureGate from "@/components/billing/ProFeatureGate.vue";
import OpenBookDiffColumn from "./OpenBookDiffColumn.vue";
import OpenBookReleaseAside from "./OpenBookReleaseAside.vue";
import { formatReleaseDate } from "./releaseDate";

const { book, campaignId } = defineProps<{ book: OpenBook; campaignId: string; isPro: boolean }>();
const emit = defineEmits<{ done: [] }>();

const toast = useToast();
const note = ref("");
const releaseError = ref("");
const needsPro = ref(false);

const previewQuery = useOpenBookPreview(() => campaignId, true);
const preview = previewQuery.data;
const hasLive = computed(() => book.live_release_id !== null);
const liveQuery = useReleaseSnapshot(() => book.live_release_id, true, () => campaignId);
const { data: releases } = useOpenBookReleases(() => campaignId);
const release = useReleaseOpenBook();

const releaseList = computed(() => releases.value ?? []);
const liveRelease = computed(() => releaseList.value.find((r) => r.id === book.live_release_id) ?? null);
const nextNumber = computed(() => (releaseList.value[0]?.number ?? 0) + 1);

const isLoading = computed(() => previewQuery.isPending.value || (hasLive.value && liveQuery.isPending.value));
const loadError = computed(() => {
  const e = previewQuery.error.value ?? liveQuery.error.value;
  return e === null ? "" : toast.fromError(e, "Something went wrong.");
});

const diff = computed(() => {
  const now = previewQuery.data.value;
  if (!now) return null;
  if (hasLive.value && !liveQuery.data.value) return null;
  return diffSnapshots(now, liveQuery.data.value ?? null);
});

const sinceLine = computed(() =>
  liveRelease.value
    ? `What changes for visitors since Release ${liveRelease.value.number}, from ${formatReleaseDate(liveRelease.value.created_at)}.`
    : "This is the first release, so everything in the book is new.",
);

async function onRelease() {
  releaseError.value = "";
  needsPro.value = false;
  try {
    await release.mutateAsync({ campaignId, note: note.value.trim() === "" ? null : note.value.trim() });
    toast.success(`Release ${nextNumber.value} is live.`);
    emit("done");
  } catch (e) {
    if (classifyOpenBookError(e) === "requires_pro") needsPro.value = true;
    else releaseError.value = toast.fromError(e, "Could not release the book.");
  }
}
</script>
