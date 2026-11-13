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
    :placeholder="placeholderUrl('monster')"
    :locked="locked"
    :accent-class="challengeClass"
    :eyebrow="`${monster.size} ${monster.monster_type}`"
    :tab="crTab"
  >
    <template #body="{ artFree }">
      <!-- Art-free (#1179, frame 05): the card draws the name, the CR hangs as its tab and the
           book sits in the foot, so what is left is the one stat line. -->
      <p v-if="artFree" class="text-label-lg text-muted-foreground">{{ statLine }}</p>
      <div v-if="!artFree" class="flex items-start justify-between gap-2">
        <h3 class="line-clamp-1 flex-1 text-heading-xs leading-tight font-bold text-foreground">
          {{ monster.name }}
        </h3>
        <div class="flex shrink-0 items-center gap-1">
          <SourceBadge :source="monster.source" :title="monster.source_title" class="max-w-22 truncate" />
          <span
            class="min-w-8 rounded px-1.5 py-0.5 text-center text-label font-bold text-white"
            :class="challengeClass"
          >
            CR {{ crText(monster.challenge_rating) }}
          </span>
        </div>
      </div>

      <p v-if="!artFree" class="text-caption text-muted-foreground capitalize italic">
        {{ monster.size }} {{ monster.monster_type }}
      </p>

      <div v-if="!artFree" class="flex gap-3 text-label-lg text-muted-foreground">
        <span v-if="monster.armor_class !== null"><span class="font-bold text-foreground">AC</span> {{ monster.armor_class }}</span>
        <span>
          <span class="font-bold text-foreground">HP</span>
          {{ formatHitPoints(monster.hit_points) }}
        </span>
      </div>

      <TagChips v-if="!artFree" :tags="monster.tags" :max="3" class="mt-auto" />
    </template>

    <template #foot>
      <div class="flex flex-wrap items-center gap-1">
        <SourceBadge :source="monster.source" :title="monster.source_title" class="max-w-full truncate" />
        <TagChips :tags="monster.tags" :max="2" />
      </div>
    </template>

    <!--
      Same corner and order as the NPC card. Edit is a custom-monster action and
      is absent on library rows, so the reveal shifts left there rather than
      sitting in a different corner — a DM should not have to look in two places
      for the same control depending on which grid they are in.
    -->
    <template #actions-start="{ artFree }">
      <AppButton
        v-if="!monster.is_shared"
        variant="ghost"
        size="icon-xs"
        :class="artFree ? undefined : [CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
        :icon="IconEdit"
        :to="`/monsters/${monster.id}?edit=true`"
        tooltip="Edit monster"
        aria-label="Edit monster"
      />
      <div @click.prevent.stop>
        <MonsterRevealControl :monster="monster" :form="artFree ? 'inline' : 'overlay'" />
      </div>
    </template>
  </EntityGridCard>
</template>

<script setup lang="ts">
import TagChips from "@/components/common/TagChips.vue";
import SourceBadge from "@/components/common/entity/SourceBadge.vue";
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/controls/appButtonVariants";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import MonsterRevealControl from "@/components/monsters/MonsterRevealControl.vue";
import { IconEdit } from "@/lib/icons";
import { crBg, crTabFor, crText, monsterStatLine } from "@/lib/monsterDisplay";
import { formatHitPoints } from "@/lib/utils";
import type { MonsterBrowseRow } from "@/types/monster.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const { monster } = defineProps<{
  monster: MonsterBrowseRow;
  locked?: boolean;
}>();

const challengeClass = computed(() => crBg(monster.challenge_rating));

const crTab = computed(() => crTabFor(monster.challenge_rating));
const statLine = computed(() => monsterStatLine(monster));
</script>
