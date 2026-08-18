<template>
  <!--
    One monster in the desktop bestiary grid. Was ~70 lines inline in
    `MonsterList`'s `v-for`, sharing a byte-identical shell with the NPC card
    that nothing enforced.
  -->
  <EntityGridCard
    :to="`/monsters/${monster.id}`"
    :title="monster.name"
    :image-url="monster.image_url"
    :focal-point="monster.portrait_focal_point"
    placeholder="/assets/placeholders/monster.webp"
    :locked="locked"
    :accent-color="challengeColor"
  >
    <template #body>
      <div class="flex items-start justify-between gap-2">
        <h3 class="line-clamp-1 flex-1 font-cinzel text-sm leading-tight font-bold text-foreground">
          {{ monster.name }}
        </h3>
        <div class="flex shrink-0 items-center gap-1">
          <span
            v-if="monster.is_shared"
            :title="sourceLabel"
            class="max-w-22 truncate rounded border border-border bg-muted px-1 py-0.5 text-label font-bold text-muted-foreground"
          >
            {{ sourceLabel }}
          </span>
          <span
            class="min-w-8 rounded px-1.5 py-0.5 text-center text-label font-bold text-white"
            :style="{ backgroundColor: challengeColor }"
          >
            CR {{ crText(monster.stat_block.challenge_rating) }}
          </span>
        </div>
      </div>

      <p class="text-caption text-muted-foreground capitalize italic">
        {{ monster.size }} {{ monster.monster_type }}
      </p>

      <div class="flex gap-3 font-cinzel text-xs text-muted-foreground">
        <span><span class="font-bold text-foreground">AC</span> {{ monster.stat_block.armor_class }}</span>
        <span>
          <span class="font-bold text-foreground">HP</span>
          {{ formatHitPoints(monster.stat_block.hit_points) }}
        </span>
      </div>

      <div v-if="monster.tags.length" class="mt-auto flex flex-wrap gap-1">
        <span
          v-for="tag in monster.tags.slice(0, 3)"
          :key="tag"
          class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>
    </template>

    <!--
      Same corner and order as the NPC card. Edit is a custom-monster action and
      is absent on library rows, so the reveal shifts left there rather than
      sitting in a different corner — a DM should not have to look in two places
      for the same control depending on which grid they are in.
    -->
    <template #actions-start>
      <AppButton
        v-if="!monster.is_shared"
        variant="ghost"
        size="icon-xs"
        :class="[CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
        :icon="IconEdit"
        :to="`/monsters/${monster.id}?edit=true`"
        tooltip="Edit monster"
        aria-label="Edit monster"
      />
      <div @click.prevent.stop>
        <MonsterRevealControl :monster="monster" form="overlay" />
      </div>
    </template>
  </EntityGridCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/appButtonVariants";
import EntityGridCard from "@/components/common/EntityGridCard.vue";
import MonsterRevealControl from "@/components/monsters/MonsterRevealControl.vue";
import { IconEdit } from "@/lib/icons";
import { crColor, crText } from "@/lib/monsterDisplay";
import { formatHitPoints } from "@/lib/utils";
import type { Monster } from "@/types/monster.types";

const { monster } = defineProps<{
  monster: Monster;
  locked?: boolean;
}>();

const challengeColor = computed(() => crColor(monster.stat_block.challenge_rating));
const sourceLabel = computed(() => monster.source_title ?? monster.source ?? "Reference");
</script>
