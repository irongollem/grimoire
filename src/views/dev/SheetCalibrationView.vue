<!--
  SheetCalibrationView.vue — dev-only harness for eyeballing (and headlessly
  screenshotting) the illustrated character-sheet overlay against its baked
  PNG plate. Renders exactly ONE IllustratedSheet at 100% scale — no
  downscaling — so field-box coordinates in sheetConfig.{a4,letter}.ts can be
  nudged pixel-accurately.

  All state round-trips through the URL query string so a headless browser
  can drive every combination without clicking:
    /dev/sheet-calibration?theme=gothic&side=back&size=letter&debug=1

  theme: classic | adventure | gothic | fairy | sumie   (default classic)
  side:  front | back                                    (default front)
  size:  a4 | letter                                     (default a4)
  debug: 1 | 0                                           (default 1 — boxes ON)
-->
<template>
  <div class="flex flex-col gap-4 p-4">
    <div class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-label-lg">
      <h1 class="font-cinzel text-heading font-bold">Sheet Calibration</h1>

      <label class="flex items-center gap-2">
        <span class="text-caption text-muted-foreground">Theme</span>
        <select v-model="theme" class="rounded border border-border bg-background px-2 py-1">
          <option v-for="t in THEMES" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>

      <label class="flex items-center gap-2">
        <span class="text-caption text-muted-foreground">Side</span>
        <select v-model="side" class="rounded border border-border bg-background px-2 py-1">
          <option v-for="s in SIDES" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>

      <label class="flex items-center gap-2">
        <span class="text-caption text-muted-foreground">Page</span>
        <select v-model="pageSize" class="rounded border border-border bg-background px-2 py-1">
          <option v-for="p in PAGE_SIZES" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>

      <label class="flex items-center gap-2">
        <input type="checkbox" v-model="debug" class="size-4" />
        <span class="text-caption text-muted-foreground">Debug boxes</span>
      </label>
    </div>

    <div class="overflow-auto rounded-lg border border-border bg-muted p-4">
      <div :data-theme="theme" :data-side="side" :data-size="pageSize" class="inline-block">
        <IllustratedSheet
          :member="sampleMember"
          :inventory="sampleInventory"
          :side="side"
          :theme="theme"
          :page-size="pageSize"
          :species-name="SPECIES_NAME"
          :background-name="BACKGROUND_NAME"
          :debug="debug"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter, type LocationQueryValue } from "vue-router";
import IllustratedSheet from "@/components/character-sheet/illustrated/IllustratedSheet.vue";
import type { IllustratedTheme, SheetSide, SheetPageSize } from "@/components/character-sheet/illustrated/sheetTypes";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";

const THEMES = ["classic", "adventure", "gothic", "fairy", "sumie"] as const;
const SIDES = ["front", "back"] as const;
const PAGE_SIZES = ["A4", "Letter"] as const;

const SPECIES_NAME = "High Elf";
const BACKGROUND_NAME = "Sage";

const route = useRoute();
const router = useRouter();

function firstQuery(v: LocationQueryValue | LocationQueryValue[]): string | undefined {
  const val = Array.isArray(v) ? v[0] : v;
  return val ?? undefined;
}

function updateQuery(patch: Record<string, string>) {
  router.replace({ query: { ...route.query, ...patch } });
}

const theme = computed<IllustratedTheme>({
  get: () => {
    const q = firstQuery(route.query.theme);
    return (THEMES as readonly string[]).includes(q ?? "") ? (q as IllustratedTheme) : "classic";
  },
  set: (v) => updateQuery({ theme: v }),
});

const side = computed<SheetSide>({
  get: () => {
    const q = firstQuery(route.query.side);
    return (SIDES as readonly string[]).includes(q ?? "") ? (q as SheetSide) : "front";
  },
  set: (v) => updateQuery({ side: v }),
});

const pageSize = computed<SheetPageSize>({
  get: () => (firstQuery(route.query.size) === "letter" ? "Letter" : "A4"),
  set: (v) => updateQuery({ size: v === "Letter" ? "letter" : "a4" }),
});

const debug = computed<boolean>({
  get: () => {
    const q = firstQuery(route.query.debug);
    return q === undefined ? true : q !== "0" && q !== "false";
  },
  set: (v) => updateQuery({ debug: v ? "1" : "0" }),
});

// ── Fixture data ─────────────────────────────────────────────────────────
// A single deliberately "full" PartyMember + inventory so every overlay
// section on both front and back renders non-empty text. Long name / notes /
// personality strings are intentional — they exercise the ellipsis (name)
// and line-clamp (prose) overflow handling.
//
// NOTE: sheetData.ts's toBack() has no source yet for `allies`, `treasure`,
// `quests`, `spellnotes`, `secrets`, `travel`, or `crestCap` (hardcoded to
// "" / [] — see comments in that file) and toFront() hardcodes `features: []`
// and attack `bonus`/`damage` to "—". Those boxes render blank/dashed
// regardless of fixture data; that's an existing gap in sheetData.ts, not a
// bug in this harness.
const nowIso = new Date().toISOString();

const sampleMember: PartyMember = {
  id: "calib-member-0000-0000-000000000001",
  user_id: "calib-user-0000-0000-000000000001",
  owner_user_id: null,
  is_dm_managed: false,
  campaign_id: null,
  name: "Seraphina Emberlyn Duskwhisper-Ashford, Blade of the Sundered Vale",
  player_name: "Calibration Player",
  class: "Wizard",
  subclass: "School of Evocation",
  level: 12,
  subrace: "High Elf",
  species_id: null,
  disguise_species_id: null,
  disguise_race: null,
  disguise_subrace: null,
  background_id: null,
  max_hp: 88,
  current_hp: 61,
  temp_hp: 12,
  ac: 17,
  ac_formula: null,
  speed: 30,
  initiative_bonus: 2,
  current_initiative: null,
  str: 8,
  dex: 16,
  con: 14,
  int: 20,
  wis: 12,
  cha: 10,
  proficiency_bonus: 4,
  skill_proficiencies: {
    arcana: "expertise",
    history: "proficient",
    investigation: "proficient",
    insight: "proficient",
    perception: "proficient",
    persuasion: "proficient",
  },
  saving_throw_proficiencies: ["int", "wis"],
  conditions: [],
  curses: [],
  inspiration: true,
  death_save_successes: 2,
  death_save_failures: 1,
  // opaque rectangle so the portrait box's true edges are visible against the arch
  portrait_url: "/icon-512.png",
  portrait_focal_point: null,
  notes:
    "Carries a sunbleached journal bound in dragonhide, its pages dense with annotated evocation diagrams. Owes a favor to the Duskwhisper family's estranged patriarch and refuses to discuss it. Keeps a pressed flower from the Sundered Vale tucked into the journal's spine as a reminder of what the war actually cost.",
  sort_order: 0,
  alignment: "Chaotic Good",
  personality_traits: "Quotes obscure arcane treatises mid-argument, whether or not anyone asked. Cannot pass a locked door without trying to pick it, on principle.",
  ideals: "Knowledge unshared is knowledge wasted — the Vale burned because its archives were locked away from the people who needed them most.",
  bonds: "The surviving apprentices of the Sundered Vale academy are the only family Seraphina has left, and she will burn another kingdom to keep them safe.",
  flaws: "Trusts a well-argued lie over an inconvenient truth, and has paid for it twice already.",
  deity: "Mystra",
  deity_id: null,
  age: "127",
  gender: "Female",
  pronouns: "she/her",
  height: "5'6\"",
  physical_description:
    "Silver hair cropped short and singed at the ends from one too many evocation mishaps. A faint latticework of old burn scars traces her left forearm, mostly hidden beneath layered violet robes stitched with protective sigils. Keeps her wand sheathed at the small of her back rather than in a visible holster.",
  player_description:
    "Trained at the Sundered Vale academy until it fell to the Ashen Concord; fled with a handful of surviving apprentices and has spent the last decade rebuilding what she can of its library from memory, one recovered tome at a time.",
  experience_points: 85000,
  cp: 23,
  sp: 47,
  ep: 0,
  gp: 312,
  pp: 8,
  tool_proficiencies: ["Calligrapher's Supplies", "Herbalism Kit"],
  languages: ["Common", "Elvish", "Draconic", "Celestial"],
  weapon_masteries: [],
  spell_slots: [
    { level: 1, max: 4, used: 1 },
    { level: 2, max: 3, used: 0 },
    { level: 3, max: 3, used: 0 },
    { level: 4, max: 3, used: 0 },
    { level: 5, max: 2, used: 0 },
    { level: 6, max: 1, used: 0 },
  ],
  current_location_id: null,
  carry_capacity_override: null,
  hit_dice_remaining: 9,
  class_resources: {
    "Arcane Recovery": { current: 1, max: 1, rest: "long" },
  },
  class_choices: {},
  active_infusions: [],
  rage_active: false,
  level_choices: {},
  concentration: null,
  wildshape_state: null,
  wildshapes_used: 0,
  wildshape_reset: null,
  created_at: nowIso,
  updated_at: nowIso,
};

const sampleInventory: PartyInventoryItem[] = [
  {
    id: "calib-item-0000-0000-000000000001",
    campaign_id: "calib-campaign-0000-0000-000000000001",
    user_id: sampleMember.user_id,
    item_id: null,
    name: "Rune-Etched Longsword of the Sundered Vale",
    quantity: 1,
    carried_by: sampleMember.id,
    location: "equipped",
    slot: "main_hand",
    is_container: false,
    container_id: null,
    is_attuned: true,
    is_equipped: true,
    notes: null,
    current_charges: null,
    updated_at: nowIso,
    is_identified: true,
    is_ruined: false,
    sort_order: 0,
    curse_revealed: false,
  },
  {
    id: "calib-item-0000-0000-000000000002",
    campaign_id: "calib-campaign-0000-0000-000000000001",
    user_id: sampleMember.user_id,
    item_id: null,
    name: "Duskwood Hand Crossbow",
    quantity: 1,
    carried_by: sampleMember.id,
    location: "equipped",
    slot: "off_hand",
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: true,
    notes: null,
    current_charges: null,
    updated_at: nowIso,
    is_identified: true,
    is_ruined: false,
    sort_order: 1,
    curse_revealed: false,
  },
  {
    id: "calib-item-0000-0000-000000000003",
    campaign_id: "calib-campaign-0000-0000-000000000001",
    user_id: sampleMember.user_id,
    item_id: null,
    name: "Bag of Holding",
    quantity: 1,
    carried_by: sampleMember.id,
    location: "backpack",
    slot: null,
    is_container: true,
    container_id: null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
    current_charges: null,
    updated_at: nowIso,
    is_identified: true,
    is_ruined: false,
    sort_order: 2,
    curse_revealed: false,
  },
  {
    id: "calib-item-0000-0000-000000000004",
    campaign_id: "calib-campaign-0000-0000-000000000001",
    user_id: sampleMember.user_id,
    item_id: null,
    name: "Explorer's Pack",
    quantity: 1,
    carried_by: sampleMember.id,
    location: "backpack",
    slot: null,
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
    current_charges: null,
    updated_at: nowIso,
    is_identified: true,
    is_ruined: false,
    sort_order: 3,
    curse_revealed: false,
  },
  {
    id: "calib-item-0000-0000-000000000005",
    campaign_id: "calib-campaign-0000-0000-000000000001",
    user_id: sampleMember.user_id,
    item_id: null,
    name: "Potion of Superior Healing",
    quantity: 3,
    carried_by: sampleMember.id,
    location: "backpack",
    slot: null,
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
    current_charges: null,
    updated_at: nowIso,
    is_identified: true,
    is_ruined: false,
    sort_order: 4,
    curse_revealed: false,
  },
];
</script>
