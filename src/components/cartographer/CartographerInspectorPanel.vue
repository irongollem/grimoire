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
          <BannerLoader v-else class="h-3" />
        </AppButton>
      </div>
      <p
        v-if="packValidationMissing > 0"
        class="text-caption-sm text-ink-caution mt-1.5"
      >
        {{ packValidationMissing }} slot(s) missing. Using placeholders.
      </p>
    </div>

    <p class="text-caption-sm text-muted-foreground italic leading-relaxed">
      Switching packs changes future strokes only. Existing cells keep their stored pack.
    </p>

    <!-- Select tool: a read-only summary of what's in the selected cell. -->
    <div v-if="activeTool === 'select'">
      <template v-if="selectedCell">
        <label class="block text-eyebrow text-muted-foreground mb-1">
          Cell ({{ selectedCell[0] }}, {{ selectedCell[1] }})
        </label>
        <dl class="space-y-1.5 text-caption">
          <div class="flex items-center justify-between">
            <dt class="text-muted-foreground">Floor</dt>
            <dd class="text-foreground">{{ selectedCellFloor ? "Yes" : "No" }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-muted-foreground">Solid block</dt>
            <dd class="text-foreground">{{ selectedCellSolid ? "Yes" : "No" }}</dd>
          </div>
          <div v-if="selectedCellEdges.length">
            <dt class="text-muted-foreground mb-0.5">Edges</dt>
            <dd v-for="e in selectedCellEdges" :key="e.side" class="flex items-center justify-between">
              <span>{{ e.side }}</span>
              <span class="text-foreground">{{ edgeKindLabel(e.kind) }}</span>
            </dd>
          </div>
          <div v-if="selectedCellObjectCategory" class="flex items-center justify-between">
            <dt class="text-muted-foreground">Object</dt>
            <dd class="text-foreground capitalize">{{ objectCategoryLabel(selectedCellObjectCategory) }}</dd>
          </div>
          <div v-if="annotationText" class="flex items-center justify-between">
            <dt class="text-muted-foreground">Label</dt>
            <dd class="text-foreground">{{ annotationText }}</dd>
          </div>
          <div v-if="selectedCellLinkedNames.length">
            <dt class="text-muted-foreground mb-0.5">Linked</dt>
            <dd v-for="linkName in selectedCellLinkedNames" :key="linkName">{{ linkName }}</dd>
          </div>
        </dl>
      </template>
      <p v-else class="text-caption-sm text-muted-foreground italic">
        Click a cell to see what is in it. Drag to move the map.
      </p>
    </div>

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
        <!--
          #804: a cell can carry a trap or feature, and now draws its glyph —
          but nothing could set either until this. `CellMetadata` has held both
          fields since the Cartographer shipped while only note and encounter
          were ever wired, so the renderer had no way to be reached.
        -->
        <div>
          <span class="block text-label text-muted-foreground mb-0.5">Trap</span>
          <EntityCombobox
            :model-value="linkedTrapId"
            :options="trapOptions"
            placeholder="Search traps…"
            @update:model-value="$emit('update:linkedTrapId', $event)"
          />
        </div>
        <div>
          <span class="block text-label text-muted-foreground mb-0.5">Feature</span>
          <EntityCombobox
            :model-value="linkedFeatureId"
            :options="featureOptions"
            placeholder="Search features…"
            @update:model-value="$emit('update:linkedFeatureId', $event)"
          />
        </div>
      </div>
    </div>
    <div v-else-if="activeTool === 'link'">
      <p class="text-caption-sm text-muted-foreground italic">Click a cell to attach entities.</p>
    </div>

    <!-- Space tool: no cell-level options — the real inspector is the rail's Structure panel -->
    <div v-if="activeTool === 'space'">
      <p class="text-caption-sm text-muted-foreground italic">
        Click a floor region to claim it. Its name, ways out and links show in the Spaces panel below the canvas.
      </p>
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
      <p class="text-caption-sm text-muted-foreground">Each stroke uses a different noise seed. Repaint to vary the organic shape.</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
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

interface SelectedCellEdge {
  side: "N" | "E" | "S" | "W";
  kind: "wall" | "doorClosed" | "doorOpen";
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
  /** Select tool — a read-only summary of the selected cell. */
  selectedCellFloor: boolean;
  selectedCellSolid: boolean;
  selectedCellEdges: SelectedCellEdge[];
  selectedCellObjectCategory: string | null;
  selectedCellLinkedNames: string[];
  annotationText: string;
  linkedNoteId: string;
  linkedEncounterId: string;
  linkedTrapId: string;
  linkedFeatureId: string;
  noteOptions: EntityOption[];
  encounterOptions: EntityOption[];
  trapOptions: EntityOption[];
  featureOptions: EntityOption[];
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
  "update:linkedTrapId": [id: string];
  "update:linkedFeatureId": [id: string];
  "update:activeTemplateShape": [shape: string];
  "update:caveRadius": [size: number];
}>();

const annotationInputEl = ref<AppInputHandle | null>(null);

defineExpose({ annotationInputEl });

const EDGE_KIND_LABEL: Record<SelectedCellEdge["kind"], string> = {
  wall: "Wall",
  doorClosed: "Closed door",
  doorOpen: "Open door",
};
function edgeKindLabel(kind: SelectedCellEdge["kind"]): string {
  return EDGE_KIND_LABEL[kind];
}

/** "objectChest" -> "Chest" — same trick the object-stamp picker above uses
 *  on its button labels (`cat.replace('object', '')`, styled `capitalize`). */
function objectCategoryLabel(category: string): string {
  return category.replace("object", "");
}
</script>
