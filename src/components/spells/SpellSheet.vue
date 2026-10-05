<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 gap-6" :class="{ 'lg:grid-cols-[18.75rem_1fr]': !compact }">
      <!-- Left: image -->
      <div v-if="!compact" class="flex flex-col gap-3">
        <FocalImage
          :src="spell.image_url"
          :focal-point="spell.image_focal_point"
          format="portrait"
          :lightbox="true"
          :placeholder="placeholderUrl('spell')"
          class="w-full rounded-lg overflow-hidden flex-1 min-h-0 max-h-[80vh]"
        />
        <div
          class="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5 font-stat text-base"
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
              :class="SCHOOL_TEXT[spell.school]"
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
            class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span
          >
        </div>
      </div>

      <!-- Right: details -->
      <div class="flex flex-col gap-4">
        <!-- Compact ("use") presentation: what you need to cast, art as a thumbnail. -->
        <div v-if="compact" class="flex items-start gap-3">
          <dl class="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-stat text-base">
            <dt class="text-muted-foreground">Casting time</dt>
            <dd class="font-semibold">{{ spell.casting_time_custom || spell.casting_time }}</dd>
            <dt class="text-muted-foreground">Range</dt>
            <dd class="font-semibold">{{ spell.range_custom || spell.range }}</dd>
            <dt class="text-muted-foreground">Components</dt>
            <dd class="font-semibold">{{ componentsInWords }}</dd>
            <dt class="text-muted-foreground">Duration</dt>
            <dd class="font-semibold">
              {{ spell.duration_custom || spell.duration }}
              <span v-if="spell.concentration && !/concentration/i.test(spell.duration_custom || spell.duration)" class="ml-1 rounded border border-primary/30 px-1.5 text-label font-normal text-primary">Concentration</span>
              <span v-if="spell.ritual" class="ml-1 rounded border border-border px-1.5 text-label font-normal text-muted-foreground">Can be cast as a ritual</span>
            </dd>
          </dl>
          <!-- FocalImage fills its parent, so the thumbnail's size lives on a wrapper. -->
          <div class="aspect-3/4 w-20 shrink-0 overflow-hidden rounded-lg">
            <FocalImage
              :src="spell.image_url"
              :focal-point="spell.image_focal_point"
              format="portrait"
              :lightbox="true"
              :placeholder="placeholderUrl('spell')"
              :alt="`${spell.name}, enlarge`"
            />
          </div>
        </div>

        <!-- Casting properties -->
        <div
          v-if="!compact"
          class="grid grid-cols-3 gap-2 rounded-lg border border-border bg-card/50 p-3"
        >
          <div class="text-center">
            <p
              class="text-eyebrow text-muted-foreground"
            >
              Casting Time
            </p>
            <p class="font-stat text-base font-semibold">
              {{ spell.casting_time_custom || spell.casting_time }}
            </p>
          </div>
          <div class="text-center">
            <p
              class="text-eyebrow text-muted-foreground"
            >
              Range
            </p>
            <p class="font-stat text-base font-semibold">
              {{ spell.range_custom || spell.range }}
            </p>
          </div>
          <div class="text-center">
            <p
              class="text-eyebrow text-muted-foreground"
            >
              Duration
            </p>
            <p class="font-stat text-base font-semibold">
              {{ spell.duration_custom || spell.duration }}
            </p>
          </div>
        </div>

        <!-- Components + material -->
        <div v-if="!compact" class="font-stat text-base">
          <span class="font-semibold">Components: </span>
          <span>{{ spell.components.join(", ") }}</span>
          <span v-if="spell.material"> ({{ spell.material }})</span>
        </div>

        <!-- Mechanics row -->
        <div v-if="hasMechanics" class="flex flex-wrap gap-3 font-stat text-base">
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
            class="text-label-lg font-bold text-primary uppercase"
          >
            Description
          </h3>
          <RichTextViewer :content="spell.description" />
        </div>

        <!-- Higher levels -->
        <div v-if="spell.higher_levels" class="flex flex-col gap-1">
          <h3
            class="text-label-lg font-bold text-primary uppercase"
          >
            At Higher Levels
          </h3>
          <RichTextViewer :content="spell.higher_levels" />
        </div>

        <!-- Classes + source -->
        <div
          v-if="spell.classes?.length"
          class="font-stat text-sm text-muted-foreground"
        >
          <strong class="font-cinzel tracking-wider">Classes:</strong>
          {{ spell.classes.join(", ") }}
        </div>
        <div
          v-if="spell.source"
          class="font-stat text-sm text-muted-foreground italic"
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

        <!-- Known by party members -->
        <div v-if="!compact && knowers?.length" class="flex flex-col gap-2">
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
            Known By
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="k in knowers"
              :key="k.party_member_id"
              class="inline-flex items-center gap-1 text-label px-2 py-0.5 rounded bg-muted text-muted-foreground"
            >
              <IconParty class="h-2.5 w-2.5 shrink-0" />
              {{ k.name }}
              <span v-if="k.is_prepared" class="text-primary">· prepared</span>
            </span>
          </div>
        </div>

        <!-- Cast by NPCs — reverse lookup on stat_block spellcasting -->
        <div v-if="!compact && npcCasters?.length" class="flex flex-col gap-2">
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
            Cast By
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <RouterLink
              v-for="c in npcCasters"
              :key="c.npc_id"
              :to="`/npcs/${c.npc_id}`"
              class="inline-flex items-center gap-1 text-label px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
            >
              <IconUser class="h-2.5 w-2.5 shrink-0" />
              {{ c.name }}
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconParty, IconUser } from '@/lib/icons';
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { useSpellKnowers } from "@/composables/party/useCharacterSpells";
import { useNpcSpellCasters } from "@/composables/npcs/useNpcs";
import { SCHOOL_TEXT, ATTACK_TYPES, spellSourceLabel } from "@/types/spell.types";
import type { Spell } from "@/types/spell.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const props = defineProps<{
  spell: Spell;
  /**
   * The player's "use" presentation: casting facts first, art as a small
   * thumbnail, no party/NPC cross-references. The DM pages never pass it.
   */
  compact?: boolean;
}>();

const { data: knowers } = useSpellKnowers(computed(() => props.spell.id));
const { data: npcCasters } = useNpcSpellCasters(computed(() => props.spell.id));

const LEVEL_SUFFIXES = ["", "st", "nd", "rd"];
const levelSuffix = computed(() =>
  props.spell.level <= 3 ? LEVEL_SUFFIXES[props.spell.level] : "th",
);

const COMPONENT_WORDS: Record<string, string> = { V: "Verbal", S: "Somatic", M: "Material" };
const componentsInWords = computed(() => {
  const words = props.spell.components.map((c) => COMPONENT_WORDS[c.toUpperCase()] ?? c);
  const line = words.join(", ");
  return props.spell.material ? `${line} (${props.spell.material})` : line;
});

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
