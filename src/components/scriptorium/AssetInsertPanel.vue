<template>
  <AppModal :open="show" size="lg" panel-class="h-[min(37.5rem,90vh)]" @close="$emit('close')">
    <ModalHeader title="Insert Asset" closeable @close="$emit('close')" />

    <!-- Tabs -->
    <div class="flex shrink-0 border-b border-border px-4 gap-1 pt-2">
      <button
        v-for="tab in tabsWithCount"
        :key="tab.key"
        type="button"
        class="px-3 py-1.5 text-label-lg font-semibold rounded-t transition-colors"
        :class="
          activeTab === tab.key
            ? 'border-b-2 border-primary text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" class="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
        {{ tab.label }}
        <span v-if="tab.count !== null" class="ml-1 font-fell text-muted-foreground"
          >({{ tab.count }})</span
        >
      </button>
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
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">
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
                backgroundColor: `color-mix(in oklab, ${item.badgeColor} 13%, transparent)`,
                color: item.badgeColor,
                border: `1px solid color-mix(in oklab, ${item.badgeColor} 27%, transparent)`,
              }"
            >
              {{ item.badge }}
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
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import { IconGenerate, IconLocation, IconMonster, IconParty } from '@/lib/icons';
import type { Editor } from "@tiptap/core";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useMonsters } from "@/composables/monsters/useMonsters";
import { useSpells } from "@/composables/spells/useSpells";
import { useAllLocations } from "@/composables/locations/useLocations";
import {
  formatNpcForScriptorium,
  formatMonsterForScriptorium,
  formatSpellForScriptorium,
  formatLocationForScriptorium,
} from "@/lib/scriptorium/scriptoriumImport";
import { SCHOOL_VAR, spellLevelLabel } from "@/types/spell.types";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { ScriptoriumTheme } from "@/types/scriptorium.types";


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

const props = defineProps<{ show: boolean; editor: Editor | undefined; theme: ScriptoriumTheme }>();
const emit = defineEmits<{ close: [] }>();

type TabKey = "npcs" | "monsters" | "spells" | "locations";
const TABS = [
  { key: "npcs" as TabKey, label: "NPCs", icon: IconParty },
  { key: "monsters" as TabKey, label: "Monsters", icon: IconMonster },
  { key: "spells" as TabKey, label: "Spells", icon: IconGenerate },
  { key: "locations" as TabKey, label: "Locations", icon: IconLocation },
];

const activeTab = ref<TabKey>("npcs");
const search = ref("");

// ── Data ──────────────────────────────────────────────────────────────────────

const { data: npcs, isPending: npcsLoading } = useNpcs();
const { data: monsters, isPending: monstersLoading } = useMonsters();
const { data: spells, isPending: spellsLoading } = useSpells();
const { data: locations, isPending: locationsLoading } = useAllLocations();

const tabsWithCount = computed(() =>
  TABS.map((tab) => ({
    ...tab,
    count:
      tab.key === "npcs"
        ? (npcs.value?.length ?? null)
        : tab.key === "monsters"
          ? (monsters.value?.length ?? null)
          : tab.key === "spells"
            ? (spells.value?.length ?? null)
            : (locations.value?.length ?? null),
  })),
);

// ── Unified display list ───────────────────────────────────────────────────────

interface ListItem {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  type: TabKey;
}

const allItems = computed<ListItem[]>(() => {
  if (activeTab.value === "npcs") {
    return (npcs.value ?? []).map((npc) => ({
      id: npc.id,
      name: npc.name,
      subtitle: [npc.race, npc.occupation].filter(Boolean).join(" · "),
      badge: npc.status,
      badgeColor: NPC_STATUS_COLORS[npc.status] ?? "#6b7280",
      type: "npcs" as TabKey,
    }));
  }
  if (activeTab.value === "monsters") {
    return (monsters.value ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      subtitle: `${m.size} ${m.monster_type} · CR ${m.stat_block.challenge_rating}`,
      badge: m.monster_type,
      badgeColor: MONSTER_TYPE_VAR[m.monster_type] ?? "var(--muted-foreground)",
      type: "monsters" as TabKey,
    }));
  }
  if (activeTab.value === "spells") {
    return (spells.value ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      subtitle: `${spellLevelLabel(s.level)} ${s.school}${s.concentration ? " · Conc." : ""}`,
      badge: s.school,
      badgeColor: SCHOOL_VAR[s.school] ?? "var(--muted-foreground)",
      type: "spells" as TabKey,
    }));
  }
  return (locations.value ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    subtitle: LOCATION_TYPE_LABELS[l.location_type],
    badge: l.location_type,
    badgeColor: LOCATION_TYPE_COLORS[l.location_type] ?? "#6b7280",
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
  return locationsLoading.value;
});

// ── Insert ────────────────────────────────────────────────────────────────────

function insertItem(item: ListItem) {
  if (!props.editor) return;

  let html = "";
  if (item.type === "npcs") {
    const npc = npcs.value?.find((n) => n.id === item.id);
    if (!npc) return;
    const locationName = npc.location_id
      ? (locations.value?.find((l) => l.id === npc.location_id)?.name ?? null)
      : null;
    html = formatNpcForScriptorium(npc, locationName, props.theme).content;
  } else if (item.type === "monsters") {
    const monster = monsters.value?.find((m) => m.id === item.id);
    if (!monster) return;
    html = formatMonsterForScriptorium(monster, props.theme).content;
  } else if (item.type === "spells") {
    const spell = spells.value?.find((s) => s.id === item.id);
    if (!spell) return;
    html = formatSpellForScriptorium(spell).content;
  } else {
    const loc = locations.value?.find((l) => l.id === item.id);
    if (!loc) return;
    html = formatLocationForScriptorium(loc).content;
  }

  const endPos = props.editor.state.doc.content.size;
  props.editor.chain().focus().insertContentAt(endPos, html).run();
  emit("close");
}
</script>
