<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-3">
      <h3 class="text-heading-sm text-foreground">Catalogue card, art-free</h3>
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr))">
        <EntityGridCard
          to="/dev/components"
          title="Ancient Red Dragon"
          :plate="false"
          eyebrow="Gargantuan dragon"
          :tab="{ text: '24', label: 'Challenge rating', toneClass: crBg('24') }"
        >
          <template #body="{ artFree }">
            <p v-if="artFree" class="text-caption text-muted-foreground">AC 22 · HP 546</p>
          </template>
          <template #foot="{ artFree }">
            <span v-if="artFree" class="text-caption text-muted-foreground">Monster Manual</span>
          </template>
        </EntityGridCard>
        <EntityGridCard
          to="/dev/components"
          title="Mirelle Ashdown"
          :plate="false"
          eyebrow="Innkeeper"
          badge-text="Ally"
          badge-class="bg-primary"
        >
          <template #body="{ artFree }">
            <p v-if="artFree" class="text-caption text-muted-foreground">The Gilded Stag, Brindle</p>
          </template>
        </EntityGridCard>
      </div>
    </div>

    <div class="flex flex-col gap-3">
      <h3 class="text-heading-sm text-foreground">Ledger: rows with column heads</h3>
      <EntityCollection
        :items="LEDGER_ROWS"
        :item-key="(row) => row.id"
        layout="rows"
        :grid-columns="1"
        :grid-row-estimate="162"
        :row-estimate="41"
        :ledger="LEDGER"
      >
        <template #card="{ item }">
          <span>{{ item.name }}</span>
        </template>
        <template #row="{ item }">
          <EntityListRow
            to="/dev/components"
            :title="item.name"
            :fallback-icon="IconWand"
            :cells="item.cells"
          />
        </template>
      </EntityCollection>
    </div>

    <div class="flex flex-col gap-3">
      <h3 class="text-heading-sm text-foreground">Phone row and phone card</h3>
      <div class="flex max-w-sm flex-col gap-2">
        <EntityMobileCard
          layout="rows"
          to="/dev/components"
          title="Brother Alder"
          subtitle="Hedge priest"
          placeholder="npc"
          badge-text="Ally"
          badge-class="bg-primary"
          location="Brindle"
        />
      </div>
      <div class="grid max-w-sm grid-cols-2 gap-3">
        <EntityMobileCard
          layout="grid"
          to="/dev/components"
          title="Ancient Red Dragon"
          placeholder="monster"
          eyebrow="Gargantuan dragon"
          stat="AC 22 · HP 546"
          :tab="{ text: '24', label: 'Challenge rating', toneClass: crBg('24') }"
        />
        <EntityMobileCard
          layout="grid"
          to="/dev/components"
          title="Goblin"
          placeholder="monster"
          eyebrow="Small humanoid"
          stat="AC 15 · HP 7"
          :tab="{ text: '1/4', label: 'Challenge rating', toneClass: crBg('1/4') }"
        />
      </div>
    </div>

    <div class="flex flex-col gap-3">
      <h3 class="text-heading-sm text-foreground">Skeletons: entries, ledger, and the phone's two</h3>
      <ListSkeleton variant="entries" :count="2" :columns="2" />
      <ListSkeleton variant="ledger" :count="3" />
      <div class="grid max-w-sm gap-3">
        <ListSkeleton variant="rows-text" :count="2" />
        <ListSkeleton variant="cards-text" :count="2" />
      </div>
    </div>

    <div class="flex flex-col gap-3">
      <h3 class="text-heading-sm text-foreground">BookmarkTab: md and sm</h3>
      <div class="flex flex-wrap gap-6">
        <div v-for="size in SIZES" :key="size" class="flex items-start gap-3">
          <span class="w-6 text-eyebrow text-muted-foreground">{{ size }}</span>
          <div v-for="tab in TABS" :key="tab.text" class="relative h-12 w-10">
            <BookmarkTab
              :size="size"
              inline
              :text="tab.text"
              :label="tab.label"
              :tone-class="tab.toneClass"
              :ink="tab.ink"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The low-art pieces (#1179, frame 07) on /dev/components, drawn from sample
 * data with no queries. The ledger and the art-free forms only show with low
 * art on, so this block forces it on for its own subtree through
 * LOW_ART_OVERRIDE; the viewer's stored switch is never touched.
 */
import { provide } from "vue";
import { IconWand } from "@/lib/icons";
import { LOW_ART_OVERRIDE } from "@/composables/useLowArt";
import { crBg } from "@/lib/monsterDisplay";
import { RARITY_BG } from "@/types/item.types";
import BookmarkTab from "@/components/common/entity/BookmarkTab.vue";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import EntityMobileCard from "@/components/common/entity/EntityMobileCard.vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import type { LedgerCell, LedgerColumn } from "@/components/common/list/ledger";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";

provide(LOW_ART_OVERRIDE, true);

const SIZES = ["md", "sm"] as const;

const TABS = [
  { text: "5", label: "Challenge rating", toneClass: crBg("5"), ink: "light" },
  { text: "VR", label: "Rarity", toneClass: RARITY_BG.very_rare, ink: "dark" },
  { text: "LG", label: "Alignment", toneClass: null, ink: "light" },
] as const;

const LEDGER: readonly LedgerColumn[] = [
  { label: "Size and type", track: "minmax(0,10rem)" },
  { label: "CR", track: "3rem" },
  { label: "AC", track: "3rem" },
  { label: "Source", track: "8rem" },
];

const LEDGER_ROWS: { id: string; name: string; cells: LedgerCell[] }[] = [
  {
    id: "dragon",
    name: "Ancient Red Dragon",
    cells: ["Gargantuan dragon", { tab: { text: "24", label: "Challenge rating", toneClass: crBg("24") } }, "22", "Monster Manual"],
  },
  {
    id: "owlbear",
    name: "Owlbear",
    cells: ["Large monstrosity", { tab: { text: "3", label: "Challenge rating", toneClass: crBg("3") } }, "13", "Monster Manual"],
  },
  {
    id: "goblin",
    name: "Goblin",
    cells: ["Small humanoid", { tab: { text: "1/4", label: "Challenge rating", toneClass: crBg("1/4") } }, "15", null],
  },
];
</script>
