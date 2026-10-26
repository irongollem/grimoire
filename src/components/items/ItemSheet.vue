<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 lg:grid-cols-[18.75rem_1fr] gap-6">
      <!-- Left: image(s) -->
      <div class="flex flex-col gap-3">
        <!-- Tabbed art (identified / mundane) when both exist; otherwise single image -->
        <template v-if="item.image_url && item.mundane_image_url">
          <div class="flex border-b border-border mb-1">
            <button
              v-for="tab in (['identified', 'mundane'] as const)"
              :key="tab"
              class="px-3 py-1.5 text-label-lg font-semibold border-b-2 transition-colors capitalize"
              :class="sheetArtTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'"
              @click="sheetArtTab = tab"
            >{{ tab }}</button>
          </div>
          <div class="w-full rounded-lg overflow-hidden" style="aspect-ratio: 2/3; max-height: 75vh">
            <FocalImage
              :src="sheetArtTab === 'identified' ? item.image_url : item.mundane_image_url"
              :focal-point="sheetArtTab === 'identified' ? item.image_focal_point : item.mundane_image_focal_point"
              format="portrait"
              :lightbox="true"
              class="h-full"
              ai-badge="right"
            />
          </div>
        </template>
        <div
          v-else
          class="w-full rounded-lg overflow-hidden"
          style="aspect-ratio: 2/3; max-height: 75vh"
        >
          <FocalImage
            :src="item.image_url"
            :focal-point="item.image_focal_point"
            format="portrait"
            :lightbox="true"
            :placeholder="placeholderUrl('item')"
            class="h-full"
            ai-badge="right"
          />
        </div>
        <!-- Rarity badge -->
        <div
          class="rounded-lg border bg-card p-3 flex flex-col gap-1.5 font-stat text-base"
          :style="{ borderColor: rarityTint }"
        >
          <div class="flex justify-between">
            <span class="text-muted-foreground">Type</span>
            <span class="font-bold">{{
              ITEM_TYPE_LABELS[item.item_type]
            }}</span>
          </div>
          <div v-if="item.subtype" class="flex justify-between">
            <span class="text-muted-foreground">Subtype</span>
            <span class="font-bold">{{ item.subtype }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Rarity</span>
            <span
              class="font-bold"
              :class="RARITY_TEXT[item.rarity]"
              >{{ ITEM_RARITY_LABELS[item.rarity] }}</span
            >
          </div>
          <div v-if="item.weight" class="flex justify-between">
            <span class="text-muted-foreground">Weight</span>
            <span>{{ item.weight }}</span>
          </div>
          <div v-if="displayCost" class="flex justify-between">
            <span class="text-muted-foreground">Cost</span>
            <span>{{ displayCost }}</span>
          </div>
          <div v-if="!playerView" class="flex justify-between">
            <span class="text-muted-foreground">Scope</span>
            <span class="font-bold">{{ scopeLabel }}</span>
          </div>
        </div>
        <div v-if="item.tags?.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in item.tags"
            :key="tag"
            class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span
          >
        </div>
      </div>

      <!-- Right: details -->
      <div class="flex flex-col gap-4">
        <!-- Arcane focus -->
        <div v-if="item.is_arcane_focus" class="font-stat text-base text-muted-foreground italic">
          Can be used as an arcane focus
        </div>

        <!-- Attunement -->
        <div
          v-if="item.requires_attunement"
          class="font-stat text-base text-primary italic"
        >
          Requires attunement
          <span v-if="item.attunement_requirements"
            >- {{ item.attunement_requirements }}</span
          >
        </div>

        <!-- Weapon stats -->
        <div
          v-if="item.damage_rolls?.length || item.weapon_range"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="text-eyebrow font-bold text-muted-foreground"
          >
            Weapon
          </h3>
          <p v-if="item.damage_rolls?.length" class="font-stat text-base">
            {{ item.damage_rolls.map((r) => `${r.dice} ${r.type}`).join(" + ")
            }}<span v-if="item.versatile_damage" class="text-muted-foreground">
              ({{ item.versatile_damage }} two-handed)</span
            >
          </p>
          <p
            v-if="item.weapon_range"
            class="font-stat text-sm text-muted-foreground"
          >
            Range: {{ item.weapon_range }}
          </p>
          <p
            v-if="item.properties?.length"
            class="font-stat text-sm text-muted-foreground capitalize"
          >
            {{ item.properties.join(", ") }}
          </p>
          <!-- Weapon mastery — 2024 campaigns only (gate is internal to the badge) -->
          <WeaponMasteryBadge :mastery="item.mastery" variant="block" />
        </div>

        <!-- Armor -->
        <div
          v-if="item.armor_class"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="text-eyebrow font-bold text-muted-foreground"
          >
            Armor Class
          </h3>
          <p class="font-stat text-base">{{ item.armor_class }}</p>
        </div>

        <!-- Charges / Quantity -->
        <div
          v-if="item.charges"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="text-eyebrow font-bold text-muted-foreground"
          >
            {{ item.item_type === "ammunition" ? "Quantity" : "Charges" }}
          </h3>
          <p class="font-stat text-base">
            {{ item.charges
            }}<span v-if="item.item_type !== 'ammunition'"> charges</span
            ><span v-if="item.recharge"> · {{ item.recharge }}</span>
          </p>
        </div>

        <!-- Mundane description (pre-identification) — DM only -->
        <div v-if="item.mundane_description" class="flex flex-col gap-1 rounded-lg border border-border bg-card/50 p-3">
          <h3 class="text-eyebrow font-bold text-muted-foreground">
            Mundane Description
            <span class="normal-case font-fell font-normal text-muted-foreground/60">(shown before identification)</span>
          </h3>
          <RichTextViewer :content="item.mundane_description" />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <h3
            class="text-label-lg font-bold text-primary uppercase"
          >
            Description
          </h3>
          <RichTextViewer :content="item.description" />
        </div>

        <!-- Written contents + player entries -->
        <ItemDocumentSection
          :item="item"
          :campaign-id="activeCampaignId"
          :can-write-entries="canWriteEntries"
          :author-party-member-id="authorPartyMemberId"
          :can-moderate="!playerView"
        />

        <!-- Curse (DM always sees it; players never see it from this template view) -->
        <div
          v-if="item.curse_description && !playerView"
          class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3"
        >
          <h3 class="text-label-lg font-bold text-destructive uppercase">
            Curse
          </h3>
          <RichTextViewer :content="item.curse_description" />
        </div>

        <div
          v-if="sourceLabel"
          class="font-stat text-sm text-muted-foreground italic"
        >
          <a
            v-if="item.source_url"
            :href="item.source_url"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-foreground hover:underline transition-colors"
            >{{ sourceLabel }}</a
          >
          <span v-else>{{ sourceLabel }}</span>
        </div>
      </div>
    </div>

    <!-- Who carries it, who seeks it, whose relic it is (DM only; #1084). A library item has no row to tie to. -->
    <ConnectionsSection
      v-if="!playerView && isUuid(item.id)"
      :subject="{ kind: 'item', id: item.id }"
      :subject-name="item.name"
    />

    <!-- Contained in loot tables (DM only) -->
    <div v-if="!playerView && containedIn.length" class="flex flex-col gap-2">
      <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
        Contained In
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="table in containedIn"
          :key="table.id"
          :to="`/loot-tables/${table.id}`"
          class="inline-flex items-center gap-1 text-label px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
        >
          <IconPackage class="h-2.5 w-2.5 shrink-0" />{{ table.name }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { IconPackage } from '@/lib/icons';
import { RouterLink } from "vue-router";
import FocalImage from "@/components/common/media/FocalImage.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import WeaponMasteryBadge from "@/components/items/WeaponMasteryBadge.vue";
import ItemDocumentSection from "@/components/items/ItemDocumentSection.vue";
import { useLootTablesByItem } from "@/composables/dungeon-features/useLootTables";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import { isUuid } from "@/lib/library/contentIdentity";
import { useDmCampaigns } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
  RARITY_SURFACE_VAR,
  RARITY_TEXT,
} from "@/types/item.types";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { Item } from "@/types/item.types";

const props = defineProps<{
  item: Item;
  playerView?: boolean;
  priceOverride?: string | null;
}>();

// Library items name their book by source_document_key; their `source` is only 'srd' or null.
const { labelFor } = useSourceTitles();
const sourceLabel = computed(() =>
  labelFor(props.item.source_document_key ?? props.item.source, props.item.source_title),
);

const containedIn = useLootTablesByItem(computed(() => props.item.id));
const { data: allCampaigns } = useDmCampaigns();

const sheetArtTab = ref<'identified' | 'mundane'>('identified');

// ── Written contents + entries ───────────────────────────────────────────────
const { activeCampaignId } = storeToRefs(useCampaignStore());
const auth = useAuthStore();
const canWriteEntries = computed(
  () => !props.playerView || props.item.content_player_writable,
);
const authorPartyMemberId = computed(
  () => (props.playerView ? auth.linkedPartyMemberId : null),
);

const scopeLabel = computed(() => {
  if (!props.item.campaign_id) return "General";
  return allCampaigns.value?.find((c) => c.id === props.item.campaign_id)?.name ?? "Campaign";
});

/** Border tint from the ramp token. `color-mix` rather than an appended hex
 *  alpha, which only worked while these were hex literals (#744). */
const rarityTint = computed(
  () => `color-mix(in oklab, ${RARITY_SURFACE_VAR[props.item.rarity]} 40%, transparent)`,
);
const displayCost = computed(
  () => props.priceOverride ?? props.item.cost ?? null,
);

</script>
