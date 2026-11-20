<template>
  <div class="flex flex-col gap-4">
    <p class="text-body text-muted-foreground italic">
      Start from a finished-looking book, or begin blank. Every template is fully editable.
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <button
        v-for="t in templates"
        :key="t.id"
        type="button"
        class="group flex flex-col text-left rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all"
        @click="start(t)"
        :disabled="isStarting"
      >
        <!-- Faux page preview, tinted by the document-type accent -->
        <div
          class="relative h-32 flex items-center justify-center overflow-hidden"
          :style="{ background: `linear-gradient(135deg, ${accent(t)}14, ${accent(t)}05)` }"
        >
          <div
            class="w-20 h-24 rounded-sm shadow-md flex flex-col gap-1 p-2 bg-[#f5ece0] border"
            :style="{ borderColor: `${accent(t)}55` }"
          >
            <div class="h-2 rounded-xs" :style="{ background: accent(t) }" />
            <div class="h-1 rounded-xs bg-foreground/15" />
            <div class="h-1 rounded-xs bg-foreground/15 w-3/4" />
            <div class="h-1 rounded-xs bg-foreground/10 w-1/2 mt-1" />
            <div class="h-1 rounded-xs bg-foreground/10 w-2/3" />
          </div>
          <span
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-eyebrow font-bold"
            :style="{ backgroundColor: `${accent(t)}22`, color: accent(t) }"
          >
            {{ label(t) }}
          </span>
        </div>

        <div class="flex flex-col gap-1 p-3 border-t border-border">
          <span class="text-heading-sm font-bold text-foreground group-hover:text-primary transition-colors">
            {{ t.name }}
          </span>
          <span class="text-caption text-muted-foreground leading-snug">
            {{ t.description }}
          </span>
        </div>
      </button>

      <!-- Import an existing markdown document as the starting book -->
      <TemplateGalleryActionCard
        :icon="IconUpload"
        title="Import Markdown"
        blurb="Bring an existing .md document (chapters, notes, or a Homebrewery brew) into a styled book."
        @click="fileInput?.click()"
      />
      <!-- A book drawn from the campaign (#1226 story 8): linked entries, chapter by chapter -->
      <TemplateGalleryActionCard
        v-if="activeCampaignId"
        :icon="IconLibrary"
        title="From this campaign"
        blurb="Draw a book from the campaign's canon, places, folk and powers. Entries are linked, so the book follows the campaign."
        @click="choosingAudience = !choosingAudience"
      />
      <input
        ref="fileInput"
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        class="hidden"
        @change="onFilePicked"
      />
    </div>

    <div
      v-if="choosingAudience && activeCampaignId"
      class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
      data-testid="campaign-book-audience"
    >
      <p class="text-body text-foreground">Who is this book for?</p>
      <p class="text-caption text-muted-foreground">
        The DM's book holds everything, secrets in DM boxes. A players' book holds only what the whole party may read,
        and its preview and PDF print nothing more.
      </p>
      <div class="flex flex-wrap gap-2">
        <AppButton variant="outline" :disabled="isStarting" @click="drawFromCampaign('dm')">For the DM</AppButton>
        <AppButton variant="outline" :disabled="isStarting" @click="drawFromCampaign('players')">For the players</AppButton>
      </div>
    </div>

    <p v-if="error" class="text-body text-destructive" role="alert">{{ error }}</p>
  </div>
  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
/**
 * "New book" (#1115): picking a template creates the book, chapters and all,
 * and says so with `created`; the view opens it. Handouts do not come through
 * here, they start from a paper (NewHandoutPicker).
 */
import { ref } from "vue";
import { SCRIPTORIUM_TEMPLATES, type ScriptoriumTemplate } from "@/scriptorium/data/templates";
import { importedMarkdownTemplate } from "@/scriptorium/data/templates/importedMarkdown";
import { docTypeColor, docTypeLabel } from "@/scriptorium/lib/editorConstants";
import TemplateGalleryActionCard from "./TemplateGalleryActionCard.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconLibrary, IconUpload } from "@/lib/icons";
import { storeToRefs } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import type { BookAudience } from "@/scriptorium/lib/canonBook";
import { useQuota } from "@/composables/billing/useQuota";
import { useStartScriptoriumDocument } from "@/scriptorium/composables/useStartScriptoriumDocument";
import { isQuotaExceeded } from "@/lib/quotaError";

const templates = SCRIPTORIUM_TEMPLATES;

const emit = defineEmits<{ created: [docId: string] }>();

const { startBook, startBookFromCampaign, isStarting } = useStartScriptoriumDocument();
const { activeCampaignId } = storeToRefs(useCampaignStore());
const choosingAudience = ref(false);
const { canCreate } = useQuota("scriptorium_documents");
const showPaywall = ref(false);
const error = ref("");

const accent = (t: ScriptoriumTemplate) => docTypeColor(t.docType);
const label = (t: ScriptoriumTemplate) => docTypeLabel(t.docType);

async function start(template: ScriptoriumTemplate) {
  error.value = "";
  if (!canCreate.value) {
    showPaywall.value = true;
    return;
  }
  try {
    emit("created", await startBook(template));
  } catch (e) {
    if (isQuotaExceeded(e)) showPaywall.value = true;
    else error.value = e instanceof Error ? e.message : "Could not start the book.";
  }
}

async function drawFromCampaign(audience: BookAudience) {
  error.value = "";
  if (!canCreate.value) {
    showPaywall.value = true;
    return;
  }
  try {
    emit("created", await startBookFromCampaign(audience));
  } catch (e) {
    if (isQuotaExceeded(e)) showPaywall.value = true;
    else error.value = e instanceof Error ? e.message : "Could not draw the book.";
  }
}

const fileInput = ref<HTMLInputElement | null>(null);

async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow re-picking the same file after going back
  if (!file) return;
  await start(importedMarkdownTemplate(file.name, await file.text()));
}
</script>
