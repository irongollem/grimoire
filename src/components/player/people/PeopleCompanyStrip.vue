<template>
  <HearthSection title="Your company">
    <!-- Adding a companion adds to this row, so its "+" ends this row's rubric. -->
    <template v-if="canAdd" #end>
      <AppButton
        variant="link"
        size="icon-xs"
        :icon="IconAdd"
        icon-size="md"
        tooltip="Add companion"
        class="-my-1 shrink-0"
        @click="emit('add')"
      />
    </template>
    <!-- A strip that scrolls on a phone; from md up a grid whose plates share
         the width, so the company never sits packed against the left edge. -->
    <ul
      class="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pt-1 pb-2 md:mx-0 md:grid md:overflow-visible md:p-0"
      :class="spread ? 'md:grid-cols-[repeat(auto-fit,minmax(5.5rem,10rem))] md:gap-4' : 'md:grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))]'"
    >
      <li v-if="groupPortraitUrl && !lowArt" class="shrink-0 snap-start md:col-span-2">
        <button type="button" class="group flex w-32 flex-col gap-1 text-left md:w-full" @click="emit('openGroup')">
          <span class="relative block h-19 overflow-hidden rounded-sm border border-border bg-muted" :class="plateHeight">
            <FocalImage :src="groupPortraitUrl" alt="Party group portrait" format="landscape" record />
          </span>
          <span class="truncate text-caption font-semibold text-foreground">The party</span>
        </button>
      </li>
      <li v-for="tile in tiles" :key="tile.key" class="shrink-0 snap-start">
        <button type="button" class="group flex w-15 flex-col gap-1 text-left md:w-full" @click="tile.open()">
          <span class="relative block h-19 w-15 overflow-hidden rounded-sm border bg-muted md:w-full" :class="[tile.isOwn ? 'border-primary' : 'border-border', plateHeight]">
            <FocalImage
              :src="tile.src"
              :alt="tile.name"
              format="portrait"
              :focal-point="tile.focalPoint"
              :placeholder="tile.placeholder"
              record
            />
            <!-- Low art: the initial stands where the portrait was (#1179). -->
            <span
              v-if="lowArt"
              class="absolute inset-0 flex items-center justify-center text-heading font-bold text-muted-foreground"
              aria-hidden="true"
            >{{ tile.name.charAt(0) }}</span>
            <span
              v-if="tile.hp !== null"
              class="absolute inset-x-0 bottom-0 h-1 bg-muted"
              role="img"
              :aria-label="`${tile.name} health`"
            >
              <span class="block h-full" :class="tile.hp.color" :style="{ width: `${tile.hp.pct}%` }" />
            </span>
          </span>
          <!-- w-full: a flex item keeps its content width, so without it `truncate` never cuts and names run into each other. -->
          <span class="w-full truncate text-caption font-semibold text-foreground">{{ tile.name }}</span>
          <span v-if="tile.isOwn" class="-mt-1 text-eyebrow font-bold uppercase text-primary">You</span>
        </button>
      </li>
    </ul>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { IconAdd } from "@/lib/icons";
import { useLowArt } from "@/composables/useLowArt";
import HearthSection from "@/components/player/hearth/HearthSection.vue";
import type { PartyEntry } from "@/components/player/people/peopleParty";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useFormPortraits } from "@/composables/party/useFormPortraits";
import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The party at a glance: a slim strip of portrait plates, the viewer's own
 * character marked. Tapping a plate opens the member, companion or group
 * portrait exactly as the full cards used to. A thin health bar shows under a
 * plate only where the viewer may see numeric HP.
 */
const { entries, groupPortraitUrl = null, viewerMemberId, showHp, spread = false, canAdd = false } = defineProps<{
  entries: PartyEntry[];
  groupPortraitUrl?: string | null;
  viewerMemberId: string | null;
  showHp: (entry: PartyEntry) => boolean;
  /** The company has its row to itself (nobody is new), so its plates grow. */
  spread?: boolean;
  /** The viewer plays a character here, so they may add a companion to the company. */
  canAdd?: boolean;
}>();

const { lowArt } = useLowArt();
const plateHeight = computed(() => (spread ? "md:h-36" : "md:h-28"));

const emit = defineEmits<{
  openMember: [member: PartyMember];
  openCompanion: [companion: Companion];
  openGroup: [];
  add: [];
}>();

function hpBar(current: number, max: number) {
  const ratio = max > 0 ? current / max : 0;
  const color = ratio < 0.33 ? "bg-destructive" : ratio < 0.66 ? "bg-tone-caution" : "bg-elven-green";
  return { pct: Math.max(0, Math.min(100, ratio * 100)), color };
}

const portraitOf = useFormPortraits(() => entries.map((e) => (e.kind === "member" ? e.data.wildshape_state : null)));

const tiles = computed(() =>
  entries.map((entry) => {
    const hp = showHp(entry) ? hpBar(entry.data.current_hp, entry.data.max_hp) : null;
    if (entry.kind === "member") {
      const member = entry.data;
      const portrait = portraitOf(member, member.wildshape_state);
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
