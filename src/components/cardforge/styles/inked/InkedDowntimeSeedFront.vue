<template>
  <InkedShell :tarot :accent="accentForDowntimeSeed(data)">
    <!-- An outcome card is drawn from a face-down stack, so EVERYTHING it says
         must be on this one face. The back is a shared archetype back and carries
         no per-seed information at all — otherwise the deck is transparent and
         cannot be shuffled. -->
    <div class="ik-art">
      <FocalImage v-if="portrait" :src="portrait" format="portrait" print />
      <!-- Note seeds have no art (`notes` has no image column) — the archetype's
           glyph face stands in, exactly as the app does. -->
      <div v-else class="ik-art-ph" :style="{ '--glyph-bg': accent }">
        <span class="ik-art-glyph">{{ glyph }}</span>
      </div>
      <div class="ik-art-scrim" />
      <div class="ik-tag">{{ typeTag }}</div>
    </div>

    <div class="ik-body">
      <div class="ik-name">{{ data.title }}</div>
      <div class="ik-vignette ik-fade">{{ data.vignette }}</div>

      <div v-if="effects.length" class="ik-effects">
        <span v-for="(e, i) in effects" :key="i" class="ik-effect">
          <em>{{ e.kind }}</em> {{ e.text }}
        </span>
      </div>

      <div class="ik-yield">
        <em>Yields</em> {{ rewardNoun.toLowerCase() }} — {{ rewardName }}
      </div>
    </div>
  </InkedShell>
</template>

<script setup lang="ts">
import type { DowntimeSeed } from "@/types/downtime.types";
import FocalImage from "@/components/common/FocalImage.vue";
import InkedShell from "./InkedShell.vue";
import { accentForDowntimeSeed } from "../tokens.shared";
import { useDowntimeSeedCardData } from "@/composables/useDowntimeSeedCardData";

const { data, tarot } = defineProps<{ data: DowntimeSeed; tarot?: boolean }>();

const { portrait, accent, glyph, rewardName, rewardNoun, typeTag, effects } =
  useDowntimeSeedCardData(() => data);
</script>

<style scoped>
/* Art is a band, not a full bleed: the prose has to fit under it. */
.ik-art { position: relative; height: 42%; flex-shrink: 0; overflow: hidden; }
.ik-art :deep(> div) { width: 100%; height: 100%; }
.ik-art :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.ik-art-ph {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, color-mix(in srgb, var(--glyph-bg) 85%, #000), color-mix(in srgb, var(--glyph-bg) 25%, #000));
}
.ik-art-glyph { font-size: 40px; line-height: 1; opacity: 0.85; }
.ik-art-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.9) 100%);
}
.ik-tag {
  position: absolute; top: 6px; left: 7px; z-index: 2;
  background: var(--acc-tag); color: var(--acc-text);
  font-family: "Cinzel", serif; font-size: 5.5px; font-weight: 700;
  letter-spacing: 0.1em; padding: 2px 6px; border-radius: 2px;
  text-transform: uppercase;
  max-width: calc(100% - 14px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.ik-body {
  flex: 1; min-height: 0; overflow: hidden;
  padding: 6px 9px 8px; display: flex; flex-direction: column; gap: 3px;
}
.ik-name {
  font-family: "UnifrakturCook", "Cinzel", serif; font-size: 13px; font-weight: 700;
  line-height: 1.05; flex-shrink: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.ik-vignette {
  flex: 1; min-height: 0; overflow: hidden;
  font-family: "Cardo", serif; font-size: 6.5px; line-height: 1.32;
  color: var(--ik-text-sub); text-wrap: pretty;
}
.ik-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 10px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 10px), transparent);
}
.ik-effects {
  flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 3px 8px;
  border-top: 1px solid var(--acc-line); padding-top: 3px;
}
.ik-effect {
  font-family: "Cardo", serif; font-size: 6.5px; color: var(--ik-text-sub);
  display: inline-flex; align-items: baseline; gap: 2px;
}
.ik-effect em {
  font-style: normal; font-family: "Cinzel", serif; font-size: 5px; font-weight: 700;
  color: var(--acc-text); letter-spacing: 0.06em; text-transform: uppercase;
}
.ik-yield {
  flex-shrink: 0; font-family: "Cardo", serif; font-size: 6px; font-style: italic;
  color: var(--ik-text-muted);
  border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ik-yield em {
  font-style: normal; font-family: "Cinzel", serif; font-size: 5px; font-weight: 700;
  color: var(--acc-text); letter-spacing: 0.06em; text-transform: uppercase;
}
</style>
