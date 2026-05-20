<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <!-- Left: image(s) -->
      <div class="flex flex-col gap-3">
        <!-- Tabbed art (identified / mundane) when both exist; otherwise single image -->
        <template v-if="item.image_url && item.mundane_image_url">
          <div class="flex border-b border-border mb-1">
            <button
              v-for="tab in (['identified', 'mundane'] as const)"
              :key="tab"
              class="px-3 py-1.5 font-cinzel text-[11px] font-semibold tracking-wider border-b-2 transition-colors capitalize"
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
            placeholder="/assets/placeholders/item.webp"
            class="h-full"
          />
        </div>
        <!-- Rarity badge -->
        <div
          class="rounded-lg border bg-card p-3 flex flex-col gap-1.5 font-stat text-[15px]"
          :style="{ borderColor: rarityColor + '66' }"
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
              :style="{ color: RARITY_BADGE_COLORS[item.rarity] }"
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
            class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span
          >
        </div>
      </div>

      <!-- Right: details -->
      <div class="flex flex-col gap-4">
        <!-- Arcane focus -->
        <div v-if="item.is_arcane_focus" class="font-stat text-[15px] text-muted-foreground italic">
          Can be used as an arcane focus
        </div>

        <!-- Attunement -->
        <div
          v-if="item.requires_attunement"
          class="font-stat text-[15px] text-primary italic"
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
            class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            Weapon
          </h3>
          <p v-if="item.damage_rolls?.length" class="font-stat text-[15px]">
            {{ item.damage_rolls.map((r) => `${r.dice} ${r.type}`).join(" + ")
            }}<span v-if="item.versatile_damage" class="text-muted-foreground">
              ({{ item.versatile_damage }} two-handed)</span
            >
          </p>
          <p
            v-if="item.weapon_range"
            class="font-stat text-[14px] text-muted-foreground"
          >
            Range: {{ item.weapon_range }}
          </p>
          <p
            v-if="item.properties?.length"
            class="font-stat text-[13px] text-muted-foreground capitalize"
          >
            {{ item.properties.join(", ") }}
          </p>
        </div>

        <!-- Armor -->
        <div
          v-if="item.armor_class"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            Armor Class
          </h3>
          <p class="font-stat text-[15px]">{{ item.armor_class }}</p>
        </div>

        <!-- Charges / Quantity -->
        <div
          v-if="item.charges"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            {{ item.item_type === "ammunition" ? "Quantity" : "Charges" }}
          </h3>
          <p class="font-stat text-[15px]">
            {{ item.charges
            }}<span v-if="item.item_type !== 'ammunition'"> charges</span
            ><span v-if="item.recharge"> · {{ item.recharge }}</span>
          </p>
        </div>

        <!-- Mundane description (pre-identification) — DM only -->
        <div v-if="item.mundane_description" class="flex flex-col gap-1 rounded-lg border border-border bg-card/50 p-3">
          <h3 class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            Mundane Description
            <span class="normal-case font-fell font-normal text-muted-foreground/60"> — shown before identification</span>
          </h3>
          <RichTextViewer :content="item.mundane_description" />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-primary uppercase"
          >
            Description
          </h3>
          <RichTextViewer :content="item.description" />
        </div>

        <!-- Curse (DM always sees it; players never see it from this template view) -->
        <div
          v-if="item.curse_description && !playerView"
          class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3"
        >
          <h3 class="font-cinzel text-xs font-bold tracking-wider text-destructive uppercase">
            Curse
          </h3>
          <RichTextViewer :content="item.curse_description" />
        </div>

        <!-- DM notes (never shown to players) -->
        <div
          v-if="item.dm_notes && !playerView"
          class="rounded-lg border border-amber-700/40 bg-amber-950/10 p-4 flex flex-col gap-2"
        >
          <h3 class="font-cinzel text-xs font-bold tracking-wider text-amber-300/80 uppercase">
            DM Notes
          </h3>
          <RichTextViewer :content="item.dm_notes" />
        </div>

        <div
          v-if="item.source"
          class="font-stat text-[13px] text-muted-foreground italic"
        >
          <a
            v-if="item.source_url"
            :href="item.source_url"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-foreground hover:underline transition-colors"
            >{{ itemSourceLabel(item.source, item.source_title) }}</a
          >
          <span v-else>{{
            itemSourceLabel(item.source, item.source_title)
          }}</span>
        </div>
      </div>
    </div>

    <!-- Held by NPCs / party / shops (DM only) -->
    <div v-if="!playerView && holders?.length" class="flex flex-col gap-2">
      <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Held By
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="h in holders"
          :key="`${h.type}-${h.id}`"
          :to="h.to"
          class="inline-flex items-center gap-1 font-cinzel text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
        >
          <IconUser v-if="h.type === 'npc'" class="h-2.5 w-2.5 shrink-0" />
          <IconParty v-else-if="h.type === 'party_member'" class="h-2.5 w-2.5 shrink-0" />
          <IconShop v-else class="h-2.5 w-2.5 shrink-0" />
          {{ h.name }}<span v-if="h.quantity > 1" class="ml-0.5 text-muted-foreground/60">×{{ h.quantity }}</span>
        </RouterLink>
      </div>
    </div>

    <!-- Contained in loot tables (DM only) -->
    <div v-if="!playerView && containedIn.length" class="flex flex-col gap-2">
      <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Contained In
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="table in containedIn"
          :key="table.id"
          :to="`/loot-tables/${table.id}`"
          class="inline-flex items-center gap-1 font-cinzel text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
        >
          <IconPackage class="h-2.5 w-2.5 shrink-0" />{{ table.name }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconPackage, IconParty, IconShop, IconUser } from '@/lib/icons';
import { RouterLink } from "vue-router";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { useLootTablesByItem } from "@/composables/useLootTables";
import { useItemHolders } from "@/composables/useItemHolders";
import { useCampaigns } from "@/composables/useCampaigns";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
  RARITY_COLORS,
  RARITY_BADGE_COLORS,
  itemSourceLabel,
} from "@/types/item.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{
  item: Item;
  playerView?: boolean;
  priceOverride?: string | null;
}>();

const containedIn = useLootTablesByItem(computed(() => props.item.id));
const { data: holders } = useItemHolders(computed(() => props.item.id));
const { data: allCampaigns } = useCampaigns();

const sheetArtTab = ref<'identified' | 'mundane'>('identified');

const scopeLabel = computed(() => {
  if (!props.item.campaign_id) return "General";
  return allCampaigns.value?.find((c) => c.id === props.item.campaign_id)?.name ?? "Campaign";
});

const rarityColor = computed(
  () => RARITY_COLORS[props.item.rarity] ?? "#888888",
);
const displayCost = computed(
  () => props.priceOverride ?? props.item.cost ?? null,
);

</script>
