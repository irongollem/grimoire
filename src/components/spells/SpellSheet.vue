<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <!-- Left: image -->
      <div class="flex flex-col gap-3 lg:sticky lg:top-6">
        <FocalImage
          v-if="spell.image_url"
          :src="spell.image_url"
          :focal-point="spell.image_focal_point"
          format="portrait"
          class="w-full rounded-lg overflow-hidden flex-1 min-h-0 max-h-[80vh]"
        />
        <div
          class="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5 font-stat text-[15px]"
        >
          <div class="flex justify-between">
            <span class="text-muted-foreground">Level</span>
            <span class="font-bold">{{
              spell.level === 0 ? "Cantrip" : `${spell.level}${levelSuffix}`
            }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">School</span>
            <span
              class="font-bold capitalize"
              :style="{ color: SCHOOL_COLORS[spell.school] }"
              >{{ spell.school }}</span
            >
          </div>
          <div v-if="spell.ritual" class="flex justify-between">
            <span class="text-muted-foreground">Ritual</span>
            <span class="font-bold text-primary">Yes</span>
          </div>
          <div v-if="spell.concentration" class="flex justify-between">
            <span class="text-muted-foreground">Concentration</span>
            <span class="font-bold text-primary">Yes</span>
          </div>
        </div>
        <div v-if="spell.tags?.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in spell.tags"
            :key="tag"
            class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span
          >
        </div>
      </div>

      <!-- Right: details -->
      <div class="flex flex-col gap-4">
        <!-- Casting properties -->
        <div
          class="grid grid-cols-3 gap-2 rounded-lg border border-border bg-card/50 p-3"
        >
          <div class="text-center">
            <p
              class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase"
            >
              Casting Time
            </p>
            <p class="font-stat text-[15px] font-semibold">
              {{ spell.casting_time_custom || spell.casting_time }}
            </p>
          </div>
          <div class="text-center">
            <p
              class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase"
            >
              Range
            </p>
            <p class="font-stat text-[15px] font-semibold">
              {{ spell.range_custom || spell.range }}
            </p>
          </div>
          <div class="text-center">
            <p
              class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase"
            >
              Duration
            </p>
            <p class="font-stat text-[15px] font-semibold">
              {{ spell.duration_custom || spell.duration }}
            </p>
          </div>
        </div>

        <!-- Components + material -->
        <div class="font-stat text-[15px]">
          <span class="font-semibold">Components: </span>
          <span>{{ spell.components.join(", ") }}</span>
          <span v-if="spell.material"> ({{ spell.material }})</span>
        </div>

        <!-- Mechanics row -->
        <div v-if="hasMechanics" class="flex flex-wrap gap-3 font-stat text-[15px]">
          <span v-if="spell.attack_type"
            ><strong>Attack:</strong> {{ attackTypeLabel }}</span
          >
          <span v-if="spell.save_attribute"
            ><strong>Save:</strong> {{ spell.save_attribute }}</span
          >
          <span v-if="damageRollsLine"
            ><strong>Damage:</strong> {{ damageRollsLine }}</span
          >
          <span v-if="spell.aoe_shape"
            ><strong>AoE:</strong> {{ spell.aoe_size }}
            {{ spell.aoe_shape }}</span
          >
          <span v-if="spell.condition_inflicted"
            ><strong>Condition:</strong> {{ spell.condition_inflicted }}</span
          >
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-primary uppercase"
          >
            Description
          </h3>
          <RichTextViewer :content="spell.description" />
        </div>

        <!-- Higher levels -->
        <div v-if="spell.higher_levels" class="flex flex-col gap-1">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-primary uppercase"
          >
            At Higher Levels
          </h3>
          <RichTextViewer :content="spell.higher_levels" />
        </div>

        <!-- Classes + source -->
        <div
          v-if="spell.classes?.length"
          class="font-stat text-[13px] text-muted-foreground"
        >
          <strong class="font-cinzel tracking-wider">Classes:</strong>
          {{ spell.classes.join(", ") }}
        </div>
        <div
          v-if="spell.source"
          class="font-stat text-[13px] text-muted-foreground italic"
        >
          <a
            v-if="spell.source_url"
            :href="spell.source_url"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-foreground hover:underline transition-colors"
          >{{ spellSourceLabel(spell.source, spell.source_title) }}</a>
          <span v-else>{{ spellSourceLabel(spell.source, spell.source_title) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { SCHOOL_COLORS, ATTACK_TYPES, spellSourceLabel } from "@/types/spell.types";
import type { Spell } from "@/types/spell.types";

const props = defineProps<{ spell: Spell }>();

const LEVEL_SUFFIXES = ["", "st", "nd", "rd"];
const levelSuffix = computed(() =>
  props.spell.level <= 3 ? LEVEL_SUFFIXES[props.spell.level] : "th",
);

const attackTypeLabel = computed(
  () =>
    ATTACK_TYPES.find((a) => a.value === props.spell.attack_type)?.label ??
    props.spell.attack_type,
);

const damageRollsLine = computed(
  () =>
    props.spell.damage_rolls?.map((r) => `${r.dice} ${r.type}`).join(" + ") ??
    "",
);

const hasMechanics = computed(
  () =>
    props.spell.attack_type ||
    props.spell.damage_rolls?.length ||
    props.spell.aoe_shape ||
    props.spell.condition_inflicted,
);
</script>
