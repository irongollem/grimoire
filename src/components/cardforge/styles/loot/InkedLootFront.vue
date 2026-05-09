<template>
  <div class="lf-shell" :class="{ tarot }" :style="cssVars">
    <!-- Full-bleed art -->
    <div class="lf-art">
      <FocalImage
        v-if="portrait"
        :src="portrait"
        format="portrait"
        :focal-point="data.image_focal_point"
        print
      />
      <div v-else class="lf-art-ph">
        <span class="lf-art-glyph">
          {{ (data.item_type ?? "I").charAt(0).toUpperCase() }}
        </span>
      </div>
    </div>

    <!-- Scrim: image fades behind text from ~45% downward -->
    <div class="lf-scrim" />

    <!-- Header overlaps top of art -->
    <div class="lf-top">
      <div class="lf-tag">{{ typeTag }}</div>
      <div v-if="data.cost" class="lf-cost">{{ data.cost }}</div>
    </div>

    <!-- Content sits on the scrim — name leads, then everything from the back -->
    <div class="lf-bottom">
      <div class="lf-name">{{ data.name }}</div>
      <div class="lf-sub">{{ typeLine }}</div>

      <div v-if="metaRows.length" class="lf-meta">
        <div v-for="row in metaRows" :key="row.label" class="lf-meta-row">
          <span class="lf-meta-key">{{ row.label }}</span>
          <span class="lf-meta-val">{{ row.value }}</span>
        </div>
      </div>

      <div v-if="descriptionText" class="lf-desc">
        {{ descriptionText }}
      </div>

      <div v-if="data.attunement_requirements" class="lf-flavor">
        Attunement: {{ truncate(data.attunement_requirements, tarot ? 90 : 60) }}
      </div>
    </div>

    <div class="lf-wm">DUNGEON GRIMOIRE</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Item } from "@/types/item.types";
import FocalImage from "@/components/common/FocalImage.vue";
import { extractTiptapText } from "@/lib/utils";
import { accentForItem, paper } from "../tokens.shared";
import { useItemCardData } from "@/composables/useItemCardData";

const { data, tarot = false } = defineProps<{ data: Item; tarot?: boolean }>();

const { portrait, typeTag, typeLine, metaRows, truncate } = useItemCardData(
  () => data,
);

const accent = computed(() => accentForItem(data));

const cssVars = computed(() => ({
  "--acc-tag": accent.value.tag,
  "--acc-line": accent.value.line,
  "--acc-text": accent.value.text,
  "--lf-bg": "#0c0a08",
  "--lf-text": paper.cream,
  "--lf-text-sub": paper.dim,
  "--lf-text-muted": paper.faint,
}));

const descriptionText = computed(() =>
  extractTiptapText(data.description, tarot ? 400 : 320),
);
</script>

<style scoped>
.lf-shell {
  position: relative;
  width: 200px;
  height: 280px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--lf-bg);
  box-shadow:
    0 8px 22px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(0, 0, 0, 0.5);
  flex-shrink: 0;
  font-family: "Cardo", serif;
  color: var(--lf-text);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.lf-shell.tarot {
  width: 222px;
  height: 381px;
}

/* Full-bleed art covers the entire card; scrim handles readability */
.lf-art {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.lf-art-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--acc-line) 60%, var(--lf-bg)),
    var(--lf-bg)
  );
}
.lf-art-glyph {
  font-family: "Cinzel", serif;
  font-size: 60px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.12);
}

/* Scrim: top is transparent (image fully visible), middle feathers,
 * bottom is solid bg so text reads cleanly. */
.lf-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    180deg,
    rgba(12, 10, 8, 0.65) 0%,
    rgba(12, 10, 8, 0) 12%,
    rgba(12, 10, 8, 0) 38%,
    rgba(12, 10, 8, 0.85) 55%,
    var(--lf-bg) 70%,
    var(--lf-bg) 100%
  );
}

/* Header pinned to the very top, sits above the scrim */
.lf-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 7px;
}
.lf-tag {
  background: var(--acc-tag);
  color: var(--acc-text);
  font-family: "Cinzel", serif;
  font-size: 6px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 2px 6px;
  border-radius: 2px;
  text-transform: uppercase;
  flex-shrink: 0;
}
.lf-cost {
  background: rgba(0, 0, 0, 0.6);
  color: var(--acc-text);
  font-family: "Cinzel", serif;
  font-size: 6.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 2px;
  border: 1px solid color-mix(in srgb, var(--acc-line) 50%, transparent);
  flex-shrink: 0;
}

/* Bottom content area — sits on the solid part of the scrim */
.lf-bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 50%; /* art shows through top half via the transparent scrim */
  z-index: 2;
  padding: 0 9px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.lf-shell.tarot .lf-bottom {
  top: 52%;
}

.lf-name {
  font-family: "UnifrakturCook", "Cinzel", serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.05;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.95);
  flex-shrink: 0;
}
.lf-shell.tarot .lf-name {
  font-size: 19px;
}
.lf-sub {
  font-family: "Cardo", serif;
  font-size: 7.5px;
  font-style: italic;
  color: var(--lf-text-sub);
  text-transform: capitalize;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

/* Meta rows */
.lf-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-top: 1px solid color-mix(in srgb, var(--acc-line) 50%, transparent);
  padding-top: 3px;
  flex-shrink: 0;
}
.lf-meta-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.lf-meta-key {
  font-family: "Cinzel", serif;
  font-size: 5.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--acc-text);
  flex-shrink: 0;
  width: 36px;
}
.lf-meta-val {
  font-family: "Cardo", serif;
  font-size: 7px;
  color: var(--lf-text-sub);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Description fills remaining vertical space */
.lf-desc {
  flex: 1;
  overflow: hidden;
  font-family: "Cardo", serif;
  font-size: 7.5px;
  line-height: 1.3;
  color: var(--lf-text-sub);
  text-wrap: pretty;
  margin-top: 3px;
  border-top: 1px solid color-mix(in srgb, var(--acc-line) 30%, transparent);
  padding-top: 3px;
}

.lf-flavor {
  font-family: "Cardo", serif;
  font-style: italic;
  font-size: 6.5px;
  color: var(--lf-text-muted);
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 3px;
  flex-shrink: 0;
}

.lf-wm {
  position: absolute;
  bottom: 2px;
  left: 0;
  right: 0;
  z-index: 10;
  text-align: center;
  font-family: "Cinzel", serif;
  font-size: 4.5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--lf-text-muted);
  opacity: 0.5;
  pointer-events: none;
}
</style>
