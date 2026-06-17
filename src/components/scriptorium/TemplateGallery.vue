<template>
  <div class="flex flex-col gap-4">
    <p class="font-fell text-sm text-muted-foreground italic">
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
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded font-cinzel text-[9px] font-bold tracking-wider uppercase"
            :style="{ backgroundColor: `${accent(t)}22`, color: accent(t) }"
          >
            {{ label(t) }}
          </span>
        </div>

        <div class="flex flex-col gap-1 p-3 border-t border-border">
          <span class="font-cinzel text-sm font-bold text-foreground group-hover:text-primary transition-colors">
            {{ t.name }}
          </span>
          <span class="font-fell text-xs text-muted-foreground leading-snug">
            {{ t.description }}
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SCRIPTORIUM_TEMPLATES, type ScriptoriumTemplate } from "@/data/scriptoriumTemplates";
import { docTypeColor, docTypeLabel } from "@/lib/scriptorium/editorConstants";

const templates = SCRIPTORIUM_TEMPLATES;

defineEmits<{ select: [template: ScriptoriumTemplate] }>();

const accent = (t: ScriptoriumTemplate) => docTypeColor(t.docType);
const label = (t: ScriptoriumTemplate) => docTypeLabel(t.docType);
</script>
