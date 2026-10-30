<template>
  <!--
    Scriptorium on a phone is a reader, not the desktop editor shrunk down
    (#915 story 7): below md, /scriptorium/:id shows ScriptoriumReader, one
    chapter at a time, and /scriptorium/new explains that writing needs more
    room. Both routes carry `fullscreenMobile` (see routes.ts) so this owns the
    whole phone screen.
  -->
  <template v-if="isMobile">
    <div v-if="isNew" class="flex h-full flex-col items-center justify-center px-4 py-16">
      <EmptyState
        title="Writing needs more room"
        description="The page layout, art placement and formatting tools need a wider screen than a phone gives them. Open Scriptorium on a tablet or desktop to write or edit a document. Your existing documents are still here to read."
      >
        <template #icon><IconMonitor class="h-16 w-16" /></template>
        <template #action>
          <AppButton variant="primary" size="lg" label="Back to Scriptorium" to="/scriptorium" />
        </template>
      </EmptyState>
    </div>

    <ScriptoriumReader
      v-else-if="doc"
      :book="doc"
      :chapters="readerChapters"
      :chapter="readerChapter"
      :loading="chapterLoading"
      @select-chapter="readerChapterId = $event"
    >
      <!-- A DM mid-session hands a handout out from their phone (#970). -->
      <template #actions>
        <HandoutShareControl :handout="doc" />
      </template>
    </ScriptoriumReader>

    <div v-else class="flex h-full flex-col items-center justify-center px-4 py-16">
      <LoadingSpinner v-if="isLoading" />
      <EmptyState
        v-else
        title="This document could not be read"
        description="It may have been deleted, or you may not have access to it."
      >
        <template #icon><IconWarning class="h-16 w-16" /></template>
        <template #action>
          <AppButton variant="primary" size="lg" label="Back to Scriptorium" to="/scriptorium" />
        </template>
      </EmptyState>
    </div>
  </template>

  <!-- New: pick a starting point; the gallery makes the book and says which one. -->
  <PageHeader v-else-if="isNew" title="New Document" description="Choose a starting point">
    <TemplateGallery @created="onCreated" />
  </PageHeader>

  <div v-else-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>

  <ScriptoriumBookEditor v-else-if="doc" :key="doc.id" :doc="doc" />

  <div v-else class="flex h-full flex-col items-center justify-center px-4 py-16">
    <EmptyState
      title="This document could not be found"
      description="It may have been deleted, or you may not have access to it."
    >
      <template #icon><IconWarning class="h-16 w-16" /></template>
      <template #action>
        <AppButton variant="primary" size="lg" label="Back to Scriptorium" to="/scriptorium" />
      </template>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useBelow } from "@/composables/useBreakpoint";
import { useScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import { useBookChapterList, useScriptoriumChapter } from "@/composables/scriptorium/useScriptoriumChapters";
import PageHeader from "@/components/common/list/PageHeader.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import HandoutShareControl from "@/components/scriptorium/HandoutShareControl.vue";
import ScriptoriumBookEditor from "@/components/scriptorium/ScriptoriumBookEditor.vue";
import ScriptoriumReader from "@/components/scriptorium/ScriptoriumReader.vue";
import TemplateGallery from "@/components/scriptorium/TemplateGallery.vue";
import { IconMonitor, IconWarning } from "@/lib/icons";

const route = useRoute();
const router = useRouter();
const isMobile = useBelow("md");
const isNew = computed(() => route.name === "scriptorium-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: doc, isLoading: docLoading } = useScriptoriumDocument(id);
const isLoading = computed(() => !isNew.value && docLoading.value);

/** A new book exists as soon as the gallery makes it: open it. */
function onCreated(docId: string) {
  void router.push(`/scriptorium/${docId}`);
}

// The phone reader: the chapter list, and one chapter's body at a time.
const { data: chapterList } = useBookChapterList(id);
const readerChapters = computed(() => (chapterList.value ?? []).map(({ id: chapterId, title }) => ({ id: chapterId, title })));
const readerChapterId = ref("");
watch(
  readerChapters,
  (list) => {
    if (list.length > 0 && !list.some((c) => c.id === readerChapterId.value)) readerChapterId.value = list[0].id;
  },
  { immediate: true },
);
const { data: openChapter, isLoading: chapterLoading } = useScriptoriumChapter(readerChapterId);
const readerChapter = computed(() =>
  openChapter.value && openChapter.value.id === readerChapterId.value
    ? { id: openChapter.value.id, title: openChapter.value.title, content: openChapter.value.content }
    : null,
);
</script>
