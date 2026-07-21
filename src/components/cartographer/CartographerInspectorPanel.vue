<template>
  <aside class="lg:w-56 shrink-0 bg-card border border-border rounded-lg p-3 space-y-3">
    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Name
      </label>
      <input
        :value="name"
        type="text"
        class="w-full bg-background border border-border rounded-md px-2 py-1 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:name', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Tile Pack
      </label>
      <div class="space-y-1">
        <button
          v-for="p in bundledPacks"
          :key="p.pack_id"
          type="button"
          class="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-caption text-left transition-colors"
          :class="currentPackId === p.pack_id
            ? 'bg-primary/15 text-foreground ring-1 ring-inset ring-primary/40'
            : 'hover:bg-muted text-muted-foreground'"
          @click="$emit('update:currentPackId', p.pack_id)"
        >
          <span class="flex-1 truncate">{{ p.name }}</span>
          <span
            v-if="loadedPackIds.has(p.pack_id)"
            class="font-cinzel text-[0.5625rem] tracking-wider shrink-0"
            :class="currentPackId === p.pack_id ? 'text-muted-foreground' : 'text-muted-foreground/50'"
          >v{{ p.pack_version }}</span>
          <svg v-else class="h-3 w-3 shrink-0 animate-spin text-muted-foreground/50" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="40 20" />
          </svg>
        </button>
      </div>
      <p
        v-if="packValidationMissing > 0"
        class="text-caption-sm text-amber-500 mt-1.5"
      >
        {{ packValidationMissing }} slot(s) missing — using placeholders.
      </p>
    </div>

    <p class="text-caption-sm text-muted-foreground italic leading-relaxed">
      Switching packs changes future strokes only — existing cells keep their stored pack.
    </p>

    <!-- Object stamp picker -->
    <div v-if="activeTool === 'stamp'">
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Object
      </label>
      <div class="grid grid-cols-3 gap-1 mb-2">
        <button
          v-for="cat in objectCategories"
          :key="cat"
          type="button"
          class="flex flex-col items-center gap-0.5 rounded-md py-1.5 px-1 text-caption-sm transition-colors capitalize"
          :class="activeObjectCategory === cat
            ? 'bg-primary/15 text-foreground ring-1 ring-inset ring-primary/40'
            : 'hover:bg-muted text-muted-foreground'"
          @click="$emit('update:activeObjectCategory', cat)"
        >{{ cat.replace('object', '') }}</button>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <span class="font-cinzel text-[0.5625rem] tracking-wider text-muted-foreground uppercase w-full">Rotate</span>
        <button
          type="button"
          title="–1° ([)"
          class="rounded px-1.5 py-0.5 font-cinzel text-[0.5625rem] bg-muted hover:bg-muted/80 text-foreground"
          @click="$emit('update:stampRotation', (stampRotation + 359) % 360)"
        >–1°</button>
        <button
          type="button"
          title="Rotate CCW 90° (Q)"
          class="rounded px-1.5 py-0.5 font-cinzel text-[0.5625rem] bg-muted hover:bg-muted/80 text-foreground"
          @click="$emit('update:stampRotation', (stampRotation + 270) % 360)"
        >↺ Q</button>
        <span class="text-caption text-foreground w-9 text-center">{{ stampRotation }}°</span>
        <button
          type="button"
          title="Rotate CW 90° (E)"
          class="rounded px-1.5 py-0.5 font-cinzel text-[0.5625rem] bg-muted hover:bg-muted/80 text-foreground"
          @click="$emit('update:stampRotation', (stampRotation + 90) % 360)"
        >↻ E</button>
        <button
          type="button"
          title="+1° (])"
          class="rounded px-1.5 py-0.5 font-cinzel text-[0.5625rem] bg-muted hover:bg-muted/80 text-foreground"
          @click="$emit('update:stampRotation', (stampRotation + 1) % 360)"
        >+1°</button>
      </div>
    </div>

    <!-- Annotation editor -->
    <div v-if="activeTool === 'annotate' && selectedCell">
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Label ({{ selectedCell[0] }}, {{ selectedCell[1] }})
      </label>
      <input
        ref="annotationInputEl"
        :value="annotationText"
        type="text"
        placeholder="Enter label…"
        maxlength="32"
        class="w-full bg-background border border-border rounded-md px-2 py-1 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:annotationText', ($event.target as HTMLInputElement).value)"
      />
      <p class="text-caption-sm text-muted-foreground mt-1">Click a cell to select it.</p>
    </div>
    <div v-else-if="activeTool === 'annotate'">
      <p class="text-caption-sm text-muted-foreground italic">Click a cell to add a label.</p>
    </div>

    <!-- Entity link inspector -->
    <div v-if="activeTool === 'link' && selectedCell">
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Links ({{ selectedCell[0] }}, {{ selectedCell[1] }})
      </label>
      <div class="space-y-2">
        <div>
          <span class="block font-cinzel text-[0.5625rem] tracking-wider text-muted-foreground mb-0.5">Note</span>
          <EntityCombobox
            :model-value="linkedNoteId"
            :options="noteOptions"
            placeholder="Search notes…"
            @update:model-value="$emit('update:linkedNoteId', $event)"
          />
        </div>
        <div>
          <span class="block font-cinzel text-[0.5625rem] tracking-wider text-muted-foreground mb-0.5">Encounter</span>
          <EntityCombobox
            :model-value="linkedEncounterId"
            :options="encounterOptions"
            placeholder="Search encounters…"
            @update:model-value="$emit('update:linkedEncounterId', $event)"
          />
        </div>
      </div>
    </div>
    <div v-else-if="activeTool === 'link'">
      <p class="text-caption-sm text-muted-foreground italic">Click a cell to attach entities.</p>
    </div>

    <!-- Room template shape picker -->
    <div v-if="activeTool === 'template'">
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Shape
      </label>
      <div class="grid grid-cols-3 gap-1 mb-2">
        <button
          v-for="shape in templateShapes"
          :key="shape.id"
          type="button"
          class="flex flex-col items-center gap-0.5 rounded-md py-1.5 px-1 text-caption transition-colors"
          :class="activeTemplateShape === shape.id
            ? 'bg-primary/15 text-foreground ring-1 ring-inset ring-primary/40'
            : 'hover:bg-muted text-muted-foreground'"
          @click="$emit('update:activeTemplateShape', shape.id)"
        >
          <span class="text-base leading-none">{{ shape.icon }}</span>
          <span class="font-cinzel text-[0.5625rem] tracking-wide">{{ shape.label }}</span>
        </button>
      </div>
      <p class="text-caption-sm text-muted-foreground">Click center, drag to size. Walls auto-added.</p>
    </div>

    <!-- Cave brush radius picker -->
    <div v-if="activeTool === 'cave'">
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Brush size
      </label>
      <div class="flex gap-1 mb-2">
        <button
          v-for="size in [3, 5, 7, 9]"
          :key="size"
          type="button"
          class="flex-1 rounded-md py-1 font-cinzel text-2xs font-semibold transition-colors"
          :class="caveRadius === size
            ? 'bg-primary/15 text-foreground ring-1 ring-inset ring-primary/40'
            : 'hover:bg-muted text-muted-foreground'"
          @click="$emit('update:caveRadius', size)"
        >{{ size }}</button>
      </div>
      <p class="text-caption-sm text-muted-foreground">Each stroke uses a different noise seed — repaint to vary the organic shape.</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

interface BundledPack {
  pack_id: string;
  pack_version: number;
  name: string;
}

interface TemplateShape {
  id: string;
  label: string;
  icon: string;
}

interface EntityOption {
  id: string;
  name: string;
}

defineProps<{
  name: string;
  currentPackId: string;
  bundledPacks: readonly BundledPack[];
  loadedPackIds: Set<string>;
  packValidationMissing: number;
  activeTool: string;
  activeObjectCategory: string;
  objectCategories: readonly string[];
  stampRotation: number;
  selectedCell: [number, number] | null;
  annotationText: string;
  linkedNoteId: string;
  linkedEncounterId: string;
  noteOptions: EntityOption[];
  encounterOptions: EntityOption[];
  activeTemplateShape: string;
  templateShapes: TemplateShape[];
  caveRadius: number;
}>();

defineEmits<{
  "update:name": [value: string];
  "update:currentPackId": [id: string];
  "update:activeObjectCategory": [cat: string];
  "update:stampRotation": [deg: number];
  "update:annotationText": [text: string];
  "update:linkedNoteId": [id: string];
  "update:linkedEncounterId": [id: string];
  "update:activeTemplateShape": [shape: string];
  "update:caveRadius": [size: number];
}>();

const annotationInputEl = ref<HTMLInputElement | null>(null);

defineExpose({ annotationInputEl });
</script>
