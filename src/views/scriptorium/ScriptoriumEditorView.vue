<template>
  <PageHeader
    :title="doc?.title || (isNew ? (chosen ? chosen.name : 'New Document') : 'Edit Document')"
    :description="isNew && !chosen ? 'Choose a starting point' : 'Write with the quill of a master scribe'"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- New document: pick a template first, then edit seeded from it. -->
    <TemplateGallery v-else-if="isNew && !chosen" @select="chosen = $event" />

    <template v-else>
      <button
        v-if="isNew"
        type="button"
        class="mb-3 inline-flex items-center gap-1.5 text-label-lg font-semibold text-muted-foreground hover:text-primary transition-colors"
        @click="chosen = null"
      >
        ← Choose a different template
      </button>
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
import { useScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ScriptoriumEditor from "@/components/scriptorium/ScriptoriumEditor.vue";
import TemplateGallery from "@/components/scriptorium/TemplateGallery.vue";
import type { ScriptoriumTemplate } from "@/data/scriptoriumTemplates";

const route = useRoute();
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
