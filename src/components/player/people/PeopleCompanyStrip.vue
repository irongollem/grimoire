<template>
  <HearthSection title="Your company">
    <ul class="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pt-1 pb-2">
      <li v-if="groupPortraitUrl" class="shrink-0 snap-start">
        <button type="button" class="group flex w-32 flex-col gap-1 text-left" @click="emit('openGroup')">
          <span class="relative block h-19 overflow-hidden rounded-sm border border-border bg-muted">
            <FocalImage :src="groupPortraitUrl" alt="Party group portrait" format="landscape" />
          </span>
          <span class="truncate text-caption font-semibold text-foreground">The party</span>
        </button>
      </li>
      <li v-for="tile in tiles" :key="tile.key" class="shrink-0 snap-start">
        <button type="button" class="group flex w-15 flex-col gap-1 text-left" @click="tile.open()">
          <span class="relative block h-19 w-15 overflow-hidden rounded-sm border bg-muted" :class="tile.isOwn ? 'border-primary' : 'border-border'">
            <FocalImage
              :src="tile.src"
              :alt="tile.name"
              format="portrait"
              :focal-point="tile.focalPoint"
              :placeholder="tile.placeholder"
            />
            <span
              v-if="tile.hp !== null"
              class="absolute inset-x-0 bottom-0 h-1 bg-muted"
              role="img"
              :aria-label="`${tile.name} health`"
            >
              <span class="block h-full" :class="tile.hp.color" :style="{ width: `${tile.hp.pct}%` }" />
            </span>
          </span>
          <span class="truncate text-caption font-semibold text-foreground">{{ tile.name }}</span>
          <span v-if="tile.isOwn" class="-mt-1 text-eyebrow font-bold uppercase text-primary">You</span>
        </button>
      </li>
    </ul>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import HearthSection from "@/components/player/hearth/HearthSection.vue";
import type { PartyEntry } from "@/components/player/people/peopleParty";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { formPortrait } from "@/lib/wildshapePortrait";
import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The party at a glance: a slim strip of portrait plates, the viewer's own
 * character marked. Tapping a plate opens the member, companion or group
 * portrait exactly as the full cards used to. A thin health bar shows under a
 * plate only where the viewer may see numeric HP.
 */
const { entries, groupPortraitUrl = null, viewerMemberId, showHp } = defineProps<{
  entries: PartyEntry[];
  groupPortraitUrl?: string | null;
  viewerMemberId: string | null;
  showHp: (entry: PartyEntry) => boolean;
}>();

const emit = defineEmits<{
  openMember: [member: PartyMember];
  openCompanion: [companion: Companion];
  openGroup: [];
}>();

function hpBar(current: number, max: number) {
  const ratio = max > 0 ? current / max : 0;
  const color = ratio < 0.33 ? "bg-destructive" : ratio < 0.66 ? "bg-tone-caution" : "bg-elven-green";
  return { pct: Math.max(0, Math.min(100, ratio * 100)), color };
}

const tiles = computed(() =>
  entries.map((entry) => {
    const hp = showHp(entry) ? hpBar(entry.data.current_hp, entry.data.max_hp) : null;
    if (entry.kind === "member") {
      const member = entry.data;
      const portrait = formPortrait(member, member.wildshape_state);
      return {
        key: `m-${member.id}`,
        name: member.name,
        src: portrait.src,
        focalPoint: portrait.focalPoint,
        placeholder: placeholderUrl(portrait.shaped ? "monster" : "character"),
        isOwn: member.id === viewerMemberId,
        hp,
        open: () => emit("openMember", member),
      };
    }
    const companion = entry.data;
    return {
      key: `c-${companion.id}`,
      name: companion.name,
      src: companion.portrait_url,
      focalPoint: companion.portrait_focal_point ?? null,
      placeholder: placeholderUrl("monster"),
      isOwn: false,
      hp,
      open: () => emit("openCompanion", companion),
    };
  }),
);
</script>
