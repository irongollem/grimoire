<template>
  <AppModal :open="show" size="lg" panel-class="h-[min(37.5rem,90vh)]" @close="$emit('close')">
    <ModalHeader title="Insert Asset" closeable @close="$emit('close')" />

    <!-- Tabs -->
    <div class="flex shrink-0 flex-wrap gap-1 border-b border-border px-4 pb-2 pt-2">
      <AppButton
        v-for="tab in tabsWithCount"
        :key="tab.key"
        variant="ghost"
        size="sm"
        :icon="tab.icon"
        :active="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.count !== null" class="font-fell text-muted-foreground">({{ tab.count }})</span>
      </AppButton>
    </div>

    <!-- Search -->
    <div class="px-4 pt-3 pb-2 shrink-0">
      <AppInput
        v-model="search"
        type="search"
        tone="filled"
        size="body"
        placeholder="Filter by name…"
      />
    </div>

    <!-- List -->
    <div class="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
      <div
        v-if="isLoading"
        class="flex items-center justify-center py-12 text-muted-foreground text-body italic"
      >
        Loading…
      </div>

      <div
        v-else-if="filteredItems.length === 0"
        class="flex items-center justify-center py-12 text-muted-foreground text-body italic"
      >
        {{ search ? "No matches found." : "No assets yet." }}
      </div>

      <div v-else class="space-y-1.5 pt-1">
        <AppButton
          v-for="item in filteredItems"
          :key="item.id"
          variant="subtle"
          fill="muted"
          block
          class="group justify-between gap-3 py-2.5 rounded-lg text-left"
          @click="insertItem(item)"
        >
          <div class="min-w-0">
            <p class="text-heading-xs font-semibold text-foreground truncate">
              {{ item.name }}
            </p>
            <p
              v-if="item.subtitle"
              class="text-caption text-muted-foreground italic truncate"
            >
              {{ item.subtitle }}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span
              v-if="item.badge"
              class="px-2 py-0.5 rounded text-label font-bold capitalize"
              :style="{
                backgroundColor: `color-mix(in oklab, ${item.badge.color} 13%, transparent)`,
                color: item.badge.color,
                border: `1px solid color-mix(in oklab, ${item.badge.color} 27%, transparent)`,
              }"
            >
              {{ item.badge.label }}
            </span>
            <span
              class="text-label text-muted-foreground group-hover:text-primary transition-colors"
            >
              Insert →
            </span>
          </div>
        </AppButton>
      </div>
    </div>

    <!-- Footer hint -->
    <div class="px-4 py-2.5 border-t border-border shrink-0 bg-muted/30">
      <p class="text-caption text-muted-foreground italic">
        Assets are appended as a new page at the end of your document.
      </p>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import {
  IconFaction,
  IconGenerate,
  IconLocation,
  IconMonster,
  IconNavCodex,
  IconNavPantheon,
  IconParty,
  IconSpecies,
} from "@/lib/icons";
import type { Editor } from "@tiptap/core";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useSpellIndex } from "@/composables/spells/useSpellIndex";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllDeities } from "@/composables/deities/useDeities";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { useCampaignCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import type { EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";
import { SCHOOL_VAR, spellLevelLabel } from "@/types/spell.types";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";


/** The same ramp as `var()` values, for borders, gradients and canvas — places
 *  a utility class cannot reach. Tint with `color-mix`, never by appending a
 *  hex alpha: that only ever worked on a hex literal. */
const MONSTER_TYPE_VAR: Record<string, string> = {
  aberration:     "var(--monstertype-aberration)",
  beast:          "var(--monstertype-beast)",
  celestial:      "var(--monstertype-celestial)",
  construct:      "var(--monstertype-construct)",
  dragon:         "var(--monstertype-dragon)",
  elemental:      "var(--monstertype-elemental)",
  fey:            "var(--monstertype-fey)",
  fiend:          "var(--monstertype-fiend)",
  giant:          "var(--monstertype-giant)",
  humanoid:       "var(--monstertype-humanoid)",
  monstrosity:    "var(--monstertype-monstrosity)",
  ooze:           "var(--monstertype-ooze)",
  plant:          "var(--monstertype-plant)",
  undead:         "var(--monstertype-undead)",
};
const NPC_STATUS_COLORS: Record<string, string> = {
  alive: "#22c55e",
  dead: "#ef4444",
  missing: "#f59e0b",
  unknown: "#6b7280",
};

const props = defineProps<{ show: boolean; editor: Editor | undefined }>();
const emit = defineEmits<{ close: [] }>();

type TabKey =
  | "npcs"
  | "monsters"
  | "spells"
  | "locations"
  | "deities"
  | "species"
  | "factions"
  | "subclasses";
const TABS = [
  { key: "npcs" as TabKey, label: "NPCs", icon: IconParty },
  { key: "monsters" as TabKey, label: "Monsters", icon: IconMonster },
  { key: "spells" as TabKey, label: "Spells", icon: IconGenerate },
  { key: "locations" as TabKey, label: "Locations", icon: IconLocation },
  { key: "deities" as TabKey, label: "Deities", icon: IconNavPantheon },
  { key: "species" as TabKey, label: "Species", icon: IconSpecies },
  { key: "factions" as TabKey, label: "Factions", icon: IconFaction },
  { key: "subclasses" as TabKey, label: "Subclasses", icon: IconNavCodex },
];

const activeTab = ref<TabKey>("npcs");
const search = ref("");

// ── Data ──────────────────────────────────────────────────────────────────────

const { data: npcs, isPending: npcsLoading } = useNpcs();
// This tab lists the DM's own monsters only; the shared bestiary is not insertable here.
const { data: monsterIndex, isLoading: monstersLoading } = useMonsterIndex();
const monsters = computed(() => monsterIndex.value?.filter((m) => !m.is_shared));
// Same for spells: the DM's own, from the slim index.
const { data: spellIndex, isLoading: spellsLoading } = useSpellIndex();
const spells = computed(() => spellIndex.value?.filter((s) => !s.is_shared));
const { data: locations, isPending: locationsLoading } = useAllLocations();

const { data: deities, isPending: deitiesLoading } = useAllDeities();
const { data: speciesList, isLoading: speciesLoading } = useCampaignSpecies();
const { data: factions, isPending: factionsLoading } = useAllFactions();
const { data: subclasses, isLoading: subclassesLoading } = useCampaignCustomSubclasses();

const tabsWithCount = computed(() => {
  const counts: Record<TabKey, number | null> = {
    npcs: npcs.value?.length ?? null,
    monsters: monsters.value?.length ?? null,
    spells: spells.value?.length ?? null,
    locations: locations.value?.length ?? null,
    deities: deities.value?.length ?? null,
    species: speciesList.value.length,
    factions: factions.value?.length ?? null,
    subclasses: subclasses.value.length,
  };
  return TABS.map((tab) => ({ ...tab, count: counts[tab.key] }));
});

// ── Unified display list ───────────────────────────────────────────────────────

interface ListItem {
  id: string;
  name: string;
  subtitle: string | null;
  badge: { label: string; color: string } | null;
  type: TabKey;
}

const allItems = computed<ListItem[]>(() => {
  if (activeTab.value === "npcs") {
    return (npcs.value ?? []).map((npc) => ({
      id: npc.id,
      name: npc.name,
      subtitle: [npc.race, npc.occupation].filter(Boolean).join(" · "),
      badge: { label: npc.status, color: NPC_STATUS_COLORS[npc.status] ?? "#6b7280" },
      type: "npcs" as TabKey,
    }));
  }
  if (activeTab.value === "monsters") {
    return (monsters.value ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      subtitle: `${m.size} ${m.monster_type} · CR ${m.challenge_rating}`,
      badge: { label: m.monster_type, color: MONSTER_TYPE_VAR[m.monster_type] ?? "var(--muted-foreground)" },
      type: "monsters" as TabKey,
    }));
  }
  if (activeTab.value === "spells") {
    return (spells.value ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      subtitle: `${spellLevelLabel(s.level)} ${s.school}${s.concentration ? " · Conc." : ""}`,
      badge: { label: s.school, color: SCHOOL_VAR[s.school] ?? "var(--muted-foreground)" },
      type: "spells" as TabKey,
    }));
  }
  if (activeTab.value === "deities") {
    return (deities.value ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      subtitle: d.pantheon?.name ?? null,
      badge: null,
      type: "deities" as TabKey,
    }));
  }
  if (activeTab.value === "species") {
    return speciesList.value.map((sp) => ({
      id: sp.id,
      name: sp.name,
      subtitle: null,
      badge: null,
      type: "species" as TabKey,
    }));
  }
  if (activeTab.value === "factions") {
    return (factions.value ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      subtitle: null,
      badge: null,
      type: "factions" as TabKey,
    }));
  }
  if (activeTab.value === "subclasses") {
    return subclasses.value.map((sc) => ({
      id: sc.id,
      name: sc.subclass_name,
      subtitle: sc.class_name,
      badge: null,
      type: "subclasses" as TabKey,
    }));
  }
  return (locations.value ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    subtitle: LOCATION_TYPE_LABELS[l.location_type],
    badge: { label: l.location_type, color: LOCATION_TYPE_COLORS[l.location_type] ?? "#6b7280" },
    type: "locations" as TabKey,
  }));
});

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q ? allItems.value.filter((i) => i.name.toLowerCase().includes(q)) : allItems.value;
});

const isLoading = computed(() => {
  if (activeTab.value === "npcs") return npcsLoading.value;
  if (activeTab.value === "monsters") return monstersLoading.value;
  if (activeTab.value === "spells") return spellsLoading.value;
  if (activeTab.value === "locations") return locationsLoading.value;
  if (activeTab.value === "deities") return deitiesLoading.value;
  if (activeTab.value === "species") return speciesLoading.value;
  if (activeTab.value === "factions") return factionsLoading.value;
  return subclassesLoading.value;
});

// ── Insert ────────────────────────────────────────────────────────────────────
// Inserts a LIVE-linked entityEmbed node, not a one-time HTML snapshot (#915
// story 3) — the editor/preview/PDF resolve it against current data via
// useEntityEmbedData, so editing the NPC afterwards updates the book too.

const TAB_TO_ENTITY_TYPE: Record<TabKey, EntityEmbedType> = {
  npcs: "npc",
  monsters: "monster",
  spells: "spell",
  locations: "location",
  deities: "deity",
  species: "species",
  factions: "faction",
  subclasses: "subclass",
};

function insertItem(item: ListItem) {
  if (!props.editor) return;
  const entityType = TAB_TO_ENTITY_TYPE[item.type];
  const endPos = props.editor.state.doc.content.size;
  props.editor
    .chain()
    .focus()
    .insertContentAt(endPos, {
      type: "entityEmbed",
      // Explicit, not the node's own schema default (which is unconditionally
      // true): only a monster starts its own page by default, matching a
      // Monster Manual entry — an inserted NPC/spell/location shouldn't force
      // a page break just because it landed on the entityEmbed's own default
      // (#915 story 6 round 2). Mirrors buildEntityEmbedDocumentJson's same
      // rule for "Send to Scriptorium" (entityEmbeds.ts).
      attrs: { entityType, entityId: item.id, startsPage: entityType === "monster" },
    })
    .run();
  emit("close");
}
</script>
