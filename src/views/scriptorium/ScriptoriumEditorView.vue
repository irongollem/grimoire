<template>
  <!--
    Scriptorium on a phone is a reader, not the desktop galley shrunk down
    (#915 story 7): below md, /scriptorium/:id shows ScriptoriumReader and
    /scriptorium/new explains that writing needs more room. Both routes carry
    `fullscreenMobile` (see routes.ts) so this owns the whole phone screen —
    no app top bar or bottom nav to double up against.
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

    <ScriptoriumReader v-else-if="doc" :document="doc">
      <!-- A DM mid-session hands a handout out from their phone (#970). -->
      <template #actions>
        <HandoutShareControl :handout="doc" form="phone" />
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

  <PageHeader
    v-else
    :title="doc?.title || (isNew ? (chosen ? chosen.name : 'New Document') : 'Edit Document')"
    :description="isNew && !chosen ? 'Choose a starting point' : 'Write with the quill of a master scribe'"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- New document: pick a template first, then edit seeded from it. -->
    <TemplateGallery v-else-if="isNew && !chosen" @select="chosen = $event" />

    <template v-else>
      <AppButton
        v-if="isNew"
        variant="link"
        size="sm"
        class="mb-3"
        :icon="IconChevronLeft"
        icon-size="sm"
        label="Choose a different template"
        @click="chosen = null"
      />
      <ScriptoriumEditor
        :key="isNew ? (chosen?.id ?? 'new') : id || 'new'"
        :doc="isNew ? null : (doc ?? null)"
        :seed="seed"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useBelow } from "@/composables/useBreakpoint";
import { useScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import PageHeader from "@/components/common/list/PageHeader.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import HandoutShareControl from "@/components/scriptorium/HandoutShareControl.vue";
import ScriptoriumEditor from "@/components/scriptorium/ScriptoriumEditor.vue";
import ScriptoriumReader from "@/components/scriptorium/ScriptoriumReader.vue";
import TemplateGallery from "@/components/scriptorium/TemplateGallery.vue";
import { IconChevronLeft, IconMonitor, IconWarning } from "@/lib/icons";
import type { ScriptoriumTemplate } from "@/data/scriptoriumTemplates";

const route = useRoute();
const isMobile = useBelow("md");
const isNew = computed(() => route.name === "scriptorium-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: doc, isLoading: docLoading } = useScriptoriumDocument(id);

const isLoading = computed(() => !isNew.value && docLoading.value);

// Chosen gallery template (new documents only).
const chosen = ref<ScriptoriumTemplate | null>(null);

const seed = computed(() =>
  isNew.value && chosen.value
    ? {
        docType: chosen.value.docType,
        content: chosen.value.build(),
        settings: chosen.value.settings,
      }
    : null,
);
</script>
