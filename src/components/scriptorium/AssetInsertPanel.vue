<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div
        class="flex flex-col w-[min(42.5rem,94vw)] h-[min(37.5rem,90vh)] bg-card rounded-xl border border-border shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 class="font-cinzel font-bold text-sm tracking-wide text-foreground">Insert Asset</h2>
          <button
            type="button"
            class="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            @click="$emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex shrink-0 border-b border-border px-4 gap-1 pt-2">
          <button
            v-for="tab in tabsWithCount"
            :key="tab.key"
            type="button"
            class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider rounded-t transition-colors"
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
          <input
            v-model="search"
            type="search"
            placeholder="Filter by name…"
            class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto px-4 pb-4">
          <div
            v-if="isLoading"
            class="flex items-center justify-center py-12 text-muted-foreground font-fell text-sm italic"
          >
            Loading…
          </div>

          <div
            v-else-if="filteredItems.length === 0"
            class="flex items-center justify-center py-12 text-muted-foreground font-fell text-sm italic"
          >
            {{ search ? "No matches found." : "No assets yet." }}
          </div>

          <div v-else class="space-y-1.5 pt-1">
            <button
              v-for="item in filteredItems"
              :key="item.id"
              type="button"
              class="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted hover:border-primary/30 transition-colors text-left group"
              @click="insertItem(item)"
            >
              <div class="min-w-0">
                <p class="font-cinzel text-sm font-semibold text-foreground truncate">
                  {{ item.name }}
                </p>
                <p
                  v-if="item.subtitle"
                  class="font-fell text-xs text-muted-foreground italic truncate"
                >
                  {{ item.subtitle }}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span
                  v-if="item.badge"
                  class="px-2 py-0.5 rounded font-cinzel text-2xs font-bold tracking-wider capitalize"
                  :style="{
                    backgroundColor: item.badgeColor + '22',
                    color: item.badgeColor,
                    border: `1px solid ${item.badgeColor}44`,
                  }"
                >
                  {{ item.badge }}
                </span>
                <span
                  class="font-cinzel text-2xs text-muted-foreground group-hover:text-primary transition-colors tracking-wider"
                >
                  Insert →
                </span>
              </div>
            </button>
          </div>
        </div>

        <!-- Footer hint -->
        <div class="px-4 py-2.5 border-t border-border shrink-0 bg-muted/30">
          <p class="font-fell text-xs text-muted-foreground italic">
            Assets are appended as a new page at the end of your document.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconClose, IconGenerate, IconLocation, IconMonster, IconParty } from '@/lib/icons';
import type { Editor } from "@tiptap/core";
import { useNpcs } from "@/composables/useNpcs";
import { useMonsters } from "@/composables/useMonsters";
import { useSpells } from "@/composables/useSpells";
import { useAllLocations } from "@/composables/useLocations";
import {
  formatNpcForScriptorium,
  formatMonsterForScriptorium,
  formatSpellForScriptorium,
  formatLocationForScriptorium,
} from "@/lib/scriptoriumImport";
import { SCHOOL_COLORS, spellLevelLabel } from "@/types/spell.types";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { ScriptoriumTheme } from "@/types/scriptorium.types";

const MONSTER_TYPE_COLORS: Record<string, string> = {
  aberration: "#7c3aed",
  beast: "#16a34a",
  celestial: "#f59e0b",
  construct: "#6b7280",
  dragon: "#dc2626",
  elemental: "#ea580c",
  fey: "#ec4899",
  fiend: "#991b1b",
  giant: "#92400e",
  humanoid: "#2563eb",
  monstrosity: "#059669",
  ooze: "#65a30d",
  plant: "#15803d",
  undead: "#6b21a8",
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
      badgeColor: MONSTER_TYPE_COLORS[m.monster_type] ?? "#6b7280",
      type: "monsters" as TabKey,
    }));
  }
  if (activeTab.value === "spells") {
    return (spells.value ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      subtitle: `${spellLevelLabel(s.level)} ${s.school}${s.concentration ? " · Conc." : ""}`,
      badge: s.school,
      badgeColor: SCHOOL_COLORS[s.school] ?? "#6b7280",
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
