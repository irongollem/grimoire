<template>
  <nav
    aria-label="Map tools"
    class="flex shrink-0 flex-row items-stretch gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 lg:w-16 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden"
  >
    <!-- Families, not tools: a family button is an icon over a short word with its key in the
         corner, and picking it arms the tool you last used in it. The family's other tools are
         in the options slip over the canvas. Beside the canvas rather than over it, so no tool
         ever covers the map; below lg it lies down as a toolbar where a thumb reaches it. -->
    <template v-for="family in families" :key="family.id">
      <span
        v-if="family.dividerBefore"
        class="mx-0.5 w-px shrink-0 self-stretch bg-border lg:mx-0 lg:my-1 lg:h-px lg:w-auto lg:self-auto"
        aria-hidden="true"
      ></span>
      <AppButton
        variant="tool"
        size="tile"
        icon-size="lg"
        class="shrink-0 lg:w-full lg:min-w-0"
        :icon="family.icon"
        :active="isActive(family)"
        :aria-pressed="isActive(family)"
        :aria-label="family.label"
        :tooltip="familyTitle(family)"
        @click="pick(family)"
      >
        <span class="leading-none">{{ family.label }}</span>
        <KeyCap v-if="familyKey(family)" corner>{{ familyKey(family) }}</KeyCap>
      </AppButton>
    </template>

    <!-- The tile sets, like Photoshop's two colour swatches at the foot of its toolbar: they are
         not tools, they are what the tools paint with. The active set sits on top, the second
         set underneath; X trades them. Absent on layers that paint no tiles. -->
    <template v-if="tileSet">
      <span
        class="mx-0.5 w-px shrink-0 self-stretch bg-border lg:mx-0 lg:my-1 lg:h-px lg:w-auto lg:self-auto"
        aria-hidden="true"
      ></span>
      <div class="relative my-auto h-11 w-11 shrink-0 lg:mx-auto lg:my-1">
        <div v-if="tileSet.secondPackId !== null" class="absolute bottom-0 right-0 z-0">
          <CartographerPopover label="Second tile set" width-class="w-56" along-rail>
            <template #trigger="{ open, toggle }">
              <AppButton
                variant="ghost"
                size="icon-sm"
                class="h-7 w-7 min-w-0 rounded-md p-0"
                :active="open"
                aria-haspopup="dialog"
                :aria-expanded="open"
                aria-label="Second tile set"
                @click="toggle"
              >
                <CartographerPackSwatch :runtime="tileSet.runtimes.get(tileSet.secondPackId) ?? null" size="lg" />
              </AppButton>
            </template>
            <template #default="{ close }">
              <CartographerTileSetList
                :packs="tileSet.packs"
                :current-pack-id="tileSet.secondPackId"
                :runtimes="tileSet.runtimes"
                :validation-missing="0"
                @select="emit('update:secondPackId', $event); close()"
              />
            </template>
          </CartographerPopover>
        </div>
        <div class="absolute left-0 top-0 z-10">
          <CartographerPopover label="Tile set" width-class="w-56" along-rail>
            <template #trigger="{ open, toggle }">
              <AppButton
                variant="ghost"
                size="icon-sm"
                class="h-7 w-7 min-w-0 rounded-md bg-card p-0 ring-2 ring-primary"
                :active="open"
                aria-haspopup="dialog"
                :aria-expanded="open"
                aria-label="Tile set"
                @click="toggle"
              >
                <CartographerPackSwatch :runtime="tileSet.runtimes.get(tileSet.currentPackId) ?? null" size="lg" />
              </AppButton>
            </template>
            <template #default="{ close }">
              <CartographerTileSetList
                :packs="tileSet.packs"
                :current-pack-id="tileSet.currentPackId"
                :runtimes="tileSet.runtimes"
                :validation-missing="tileSet.validationMissing"
                @select="emit('update:currentPackId', $event); close()"
              />
            </template>
          </CartographerPopover>
        </div>
        <!-- Inside the group's top-right corner, the one spot neither square covers: the swap, labelled with
             its key the way every tool is. -->
        <div v-if="tileSet.secondPackId !== null" class="absolute right-0 top-0 h-4 w-4">
          <AppButton
            variant="ghost"
            size="icon-xs"
            class="h-full w-full min-w-0 p-0"
            aria-label="Swap tile sets"
            tooltip="Swap the two tile sets (X)"
            @click="emit('swapTileSets')"
          />
          <KeyCap corner class="pointer-events-none">X</KeyCap>
        </div>
      </div>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { reactive, watch, type Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import KeyCap from "@/components/common/controls/KeyCap.vue";
import CartographerPackSwatch from "@/components/cartographer/CartographerPackSwatch.vue";
import CartographerPopover from "@/components/cartographer/CartographerPopover.vue";
import CartographerTileSetList, { type TileSetChoice } from "@/components/cartographer/CartographerTileSetList.vue";
import type { TilePackRuntime } from "@/cartographer/packLoader";

export interface RailTool {
  id: string;
  label: string;
  icon: Component;
  /** Single key that activates the tool (lowercase, no modifiers). */
  shortcut?: string;
  disabled?: boolean;
}

export interface RailFamily {
  id: string;
  label: string;
  icon: Component;
  /** In slip order; the first is the family's default and gives it its key. */
  tools: RailTool[];
  /** A rule above this family (Erase stands apart from the drawing families). */
  dividerBefore?: boolean;
}

export interface RailTileSet {
  packs: readonly TileSetChoice[];
  currentPackId: string;
  /** The set one swap away; null when only one is on offer. */
  secondPackId: string | null;
  runtimes: ReadonlyMap<string, TilePackRuntime>;
  validationMissing: number;
}

const { families, activeTool, tileSet } = defineProps<{
  families: RailFamily[];
  activeTool: string;
  /** The tile set swatch at the foot; left out on layers that paint no tiles. */
  tileSet?: RailTileSet;
}>();

const emit = defineEmits<{
  "update:activeTool": [tool: string];
  "update:currentPackId": [id: string];
  "update:secondPackId": [id: string];
  swapTileSets: [];
}>();


// The tool last armed in each family. A key press or a slip button changes `activeTool`
// from outside, so this follows the prop rather than the clicks it saw itself.
const lastTool = reactive<Record<string, string>>({});
watch(
  () => activeTool,
  (tool) => {
    const owner = families.find((f) => f.tools.some((t) => t.id === tool));
    if (owner) lastTool[owner.id] = tool;
  },
  { immediate: true },
);

function isActive(family: RailFamily): boolean {
  return family.tools.some((t) => t.id === activeTool);
}

function pick(family: RailFamily): void {
  // Only a remembered tool this family still holds counts: the Plan's rail reuses an id
  // ("erase") the Drawing's rail also had, with different tools inside.
  const remembered = family.tools.find((t) => t.id === lastTool[family.id] && !t.disabled);
  const target = remembered ?? family.tools.find((t) => !t.disabled);
  if (target) emit("update:activeTool", target.id);
}

function familyKey(family: RailFamily): string | undefined {
  return family.tools[0]?.shortcut?.toUpperCase();
}

function familyTitle(family: RailFamily): string {
  const key = familyKey(family);
  return key ? `${family.label} (${key})` : family.label;
}
</script>
