<template>
  <div class="flex flex-col gap-4">
    <p class="text-body text-muted-foreground italic">
      Start from a finished-looking book, or begin blank — every template is fully editable.
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <button
        v-for="t in templates"
        :key="t.id"
        type="button"
        class="group flex flex-col text-left rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all"
        @click="$emit('select', t)"
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
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded font-cinzel text-[0.5625rem] font-bold tracking-wider uppercase"
            :style="{ backgroundColor: `${accent(t)}22`, color: accent(t) }"
          >
            {{ label(t) }}
          </span>
        </div>

        <div class="flex flex-col gap-1 p-3 border-t border-border">
          <span class="font-cinzel text-sm font-bold text-foreground group-hover:text-primary transition-colors">
            {{ t.name }}
          </span>
          <span class="text-caption text-muted-foreground leading-snug">
            {{ t.description }}
          </span>
        </div>
      </button>

      <!-- Import an existing markdown document as the starting book -->
      <button
        type="button"
        class="group flex flex-col text-left rounded-lg border border-dashed border-border bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all"
        @click="fileInput?.click()"
      >
        <div class="relative h-32 flex items-center justify-center overflow-hidden bg-muted/30">
          <IconUpload class="size-8 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div class="flex flex-col gap-1 p-3 border-t border-border">
          <span class="font-cinzel text-sm font-bold text-foreground group-hover:text-primary transition-colors">
            Import Markdown
          </span>
          <span class="text-caption text-muted-foreground leading-snug">
            Bring an existing .md document — chapters, notes, or a Homebrewery brew — into a styled book.
          </span>
        </div>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        class="hidden"
        @change="onFilePicked"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { SCRIPTORIUM_TEMPLATES, type ScriptoriumTemplate } from "@/data/scriptoriumTemplates";
import { importedMarkdownTemplate } from "@/data/scriptoriumTemplates/importedMarkdown";
import { docTypeColor, docTypeLabel } from "@/lib/scriptorium/editorConstants";
import { IconUpload } from "@/lib/icons";

const templates = SCRIPTORIUM_TEMPLATES;

const emit = defineEmits<{ select: [template: ScriptoriumTemplate] }>();

const accent = (t: ScriptoriumTemplate) => docTypeColor(t.docType);
const label = (t: ScriptoriumTemplate) => docTypeLabel(t.docType);

const fileInput = ref<HTMLInputElement | null>(null);

async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow re-picking the same file after going back
  if (!file) return;
  const markdown = await file.text();
  emit("select", importedMarkdownTemplate(file.name, markdown));
}
</script>
