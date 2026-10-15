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
              <span class="text-foreground">{{ edgeKindLabel(e.kind, e.decal) }}</span>
            </dd>
          </div>
          <div v-if="selectedCellObjectCategory" class="flex items-center justify-between">
            <dt class="text-muted-foreground">Object</dt>
            <dd class="text-foreground">{{ stampLabel(manifest, selectedCellObjectCategory) }}</dd>
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

    <!-- Terrain: water drawn in place of the floor -->
    <div v-if="activeTool === 'terrain'">
      <p class="text-caption-sm text-muted-foreground">
        Paint water over the floor; a cell with no floor gets one. Alt erases the water and keeps the floor.
      </p>
    </div>

    <!-- Wall kinds: what the wall tool paints, or the decal it sets on a wall -->
    <div v-if="activeTool === 'wall'">
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Edge
      </label>
      <SegmentedControl
        :model-value="activeWallKind"
        :options="WALL_KINDS"
        size="xs"
        block
        wrap
        class="mb-2"
        @update:model-value="$emit('update:activeWallKind', $event)"
      />
      <template v-if="activeWallKind === 'decal'">
        <div v-if="wallDecalCount > 0" class="grid grid-cols-1 gap-1 mb-2">
          <AppButton
            v-for="i in wallDecalCount"
            :key="i"
            variant="ghost"
            fill="muted"
            size="caption"
            :active="activeWallDecal === i - 1"
            :label="decalLabel(manifest, i - 1)"
            @click="$emit('update:activeWallDecal', i - 1)"
          />
        </div>
        <p v-else class="text-caption-sm text-muted-foreground italic mb-2">This pack has no wall decals.</p>
        <p class="text-caption-sm text-muted-foreground">Click a wall to dress it. Alt removes the decal.</p>
      </template>
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
          :active="activeObjectCategory === cat"
          :label="stampLabel(manifest, cat)"
          @click="$emit('update:activeObjectCategory', cat)"
        />
      </div>
      <RotationControl :model-value="stampRotation" @update:model-value="$emit('update:stampRotation', $event)" />
    </div>

    <!-- Dressing: props placed at any angle (epic #1062) -->
    <CartographerDressingPanel
      v-if="activeTool === 'dressing'"
      :brush-id="dressingBrushId"
      :brush-rotation="dressingRotation"
      :selected="selectedDressing"
      @update:brush-id="$emit('update:dressingBrushId', $event)"
      @update:brush-rotation="$emit('update:dressingRotation', $event)"
      @rotate-selected="$emit('rotateSelectedDressing', $event)"
      @delete-selected="$emit('deleteSelectedDressing')"
    />

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
          <span class="text-label">{{ shape.label }}</span>
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
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CampaignScopeField from "@/components/common/entity/CampaignScopeField.vue";
import CartographerDressingPanel from "@/components/cartographer/CartographerDressingPanel.vue";
import RotationControl from "@/components/cartographer/RotationControl.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import type { EdgeSegType } from "@/types/dungeonMap.types";
import type { PackCategory, TilePackManifest } from "@/cartographer/packSchema";
import { decalLabel, stampLabel, type StampCategory } from "@/cartographer/stampCategories";
import { WALL_KINDS, type WallKind } from "@/cartographer/wallKinds";

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
  kind: EdgeSegType;
  /** A `wallDecal` variant dressing a wall edge. */
  decal?: number;
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
  objectCategories: readonly StampCategory[];
  stampRotation: number;
  /** The active pack's manifest: its `labels` name stamps and decals. Null until a pack loads. */
  manifest: Pick<TilePackManifest, "labels"> | null;
  /** Wall tool: the kind it paints, and the decal variant the Decal kind sets. */
  activeWallKind: WallKind;
  activeWallDecal: number;
  wallDecalCount: number;
  /** Dressing tool: the armed prop, the rotation a new one gets, and the selected placed prop. */
  dressingBrushId: string | null;
  dressingRotation: number;
  selectedDressing: { name: string; rotation: number } | null;
  selectedCell: [number, number] | null;
  /** Select tool — a read-only summary of the selected cell. */
  selectedCellFloor: boolean;
  selectedCellSolid: boolean;
  selectedCellEdges: SelectedCellEdge[];
  selectedCellObjectCategory: PackCategory | null;
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
  "update:activeObjectCategory": [cat: StampCategory];
  "update:stampRotation": [deg: number];
  "update:activeWallKind": [kind: WallKind];
  "update:activeWallDecal": [variant: number];
  "update:dressingBrushId": [id: string | null];
  "update:dressingRotation": [deg: number];
  rotateSelectedDressing: [deg: number];
  deleteSelectedDressing: [];
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
  grate: "Grate",
  sluice: "Sluice gate",
};
function edgeKindLabel(kind: SelectedCellEdge["kind"], decal: number | undefined): string {
  return decal === undefined ? EDGE_KIND_LABEL[kind] : `${EDGE_KIND_LABEL[kind]} (decal)`;
}
</script>
