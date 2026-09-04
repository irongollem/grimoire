<template>
  <aside class="lg:w-56 shrink-0 bg-card border border-border rounded-lg p-3 space-y-3">
    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Name
      </label>
      <AppInput
        :model-value="name"
        size="body-xs"
        @update:model-value="$emit('update:name', $event)"
      />
    </div>

    <CampaignScopeField
      :model-value="campaignId"
      @update:model-value="$emit('update:campaignId', $event)"
    />

    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Tile Pack
      </label>
      <div class="space-y-1">
        <AppButton
          v-for="p in bundledPacks"
          :key="p.pack_id"
          variant="menu"
          size="caption"
          block
          :active="currentPackId === p.pack_id"
          @click="$emit('update:currentPackId', p.pack_id)"
        >
          <span class="flex-1 truncate">{{ p.name }}</span>
          <span
            v-if="loadedPackIds.has(p.pack_id)"
            class="text-label shrink-0"
            :class="currentPackId === p.pack_id ? 'text-muted-foreground' : 'text-muted-foreground/50'"
          >v{{ p.pack_version }}</span>
          <svg v-else class="h-3 w-3 shrink-0 animate-spin text-muted-foreground/50" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="40 20" />
          </svg>
        </AppButton>
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
        <AppButton
          v-for="cat in objectCategories"
          :key="cat"
          variant="ghost"
          fill="muted"
          size="caption"
          class="capitalize"
          :active="activeObjectCategory === cat"
          :label="cat.replace('object', '')"
          @click="$emit('update:activeObjectCategory', cat)"
        />
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <span class="text-eyebrow text-muted-foreground w-full">Rotate</span>
        <AppButton
          variant="chip"
          size="xs"
          label="–1°"
          tooltip="–1° ([)"
          @click="$emit('update:stampRotation', (stampRotation + 359) % 360)"
        />
        <AppButton
          variant="chip"
          size="xs"
          label="↺ Q"
          tooltip="Rotate CCW 90° (Q)"
          @click="$emit('update:stampRotation', (stampRotation + 270) % 360)"
        />
        <span class="text-caption text-foreground w-9 text-center">{{ stampRotation }}°</span>
        <AppButton
          variant="chip"
          size="xs"
          label="↻ E"
          tooltip="Rotate CW 90° (E)"
          @click="$emit('update:stampRotation', (stampRotation + 90) % 360)"
        />
        <AppButton
          variant="chip"
          size="xs"
          label="+1°"
          tooltip="+1° (])"
          @click="$emit('update:stampRotation', (stampRotation + 1) % 360)"
        />
      </div>
    </div>

    <!-- Annotation editor -->
    <div v-if="activeTool === 'annotate' && selectedCell">
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Label ({{ selectedCell[0] }}, {{ selectedCell[1] }})
      </label>
      <AppInput
        ref="annotationInputEl"
        :model-value="annotationText"
        placeholder="Enter label…"
        maxlength="32"
        size="body-xs"
        @update:model-value="$emit('update:annotationText', $event)"
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
          <span class="block text-label text-muted-foreground mb-0.5">Note</span>
          <EntityCombobox
            :model-value="linkedNoteId"
            :options="noteOptions"
            placeholder="Search notes…"
            @update:model-value="$emit('update:linkedNoteId', $event)"
          />
        </div>
        <div>
          <span class="block text-label text-muted-foreground mb-0.5">Encounter</span>
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
        <AppButton
          v-for="shape in templateShapes"
          :key="shape.id"
          variant="ghost"
          fill="muted"
          size="caption"
          class="flex-col gap-0.5"
          :active="activeTemplateShape === shape.id"
          @click="$emit('update:activeTemplateShape', shape.id)"
        >
          <span class="text-base leading-none">{{ shape.icon }}</span>
          <span class="font-cinzel text-2xs tracking-wide">{{ shape.label }}</span>
        </AppButton>
      </div>
      <p class="text-caption-sm text-muted-foreground">Click center, drag to size. Walls auto-added.</p>
    </div>

    <!-- Cave brush radius picker -->
    <div v-if="activeTool === 'cave'">
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Brush size
      </label>
      <SegmentedControl
        :model-value="caveRadius"
        :options="CAVE_RADIUS_OPTIONS"
        size="xs"
        block
        class="mb-2"
        @update:model-value="$emit('update:caveRadius', $event)"
      />
      <p class="text-caption-sm text-muted-foreground">Each stroke uses a different noise seed — repaint to vary the organic shape.</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import CampaignScopeField from "@/components/common/CampaignScopeField.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";

const CAVE_RADIUS_OPTIONS = [3, 5, 7, 9].map((size) => ({ value: size, label: String(size) }));

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
  campaignId: string | null;
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
  "update:campaignId": [id: string | null];
  "update:currentPackId": [id: string];
  "update:activeObjectCategory": [cat: string];
  "update:stampRotation": [deg: number];
  "update:annotationText": [text: string];
  "update:linkedNoteId": [id: string];
  "update:linkedEncounterId": [id: string];
  "update:activeTemplateShape": [shape: string];
  "update:caveRadius": [size: number];
}>();

const annotationInputEl = ref<AppInputHandle | null>(null);

defineExpose({ annotationInputEl });
</script>
