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

      <label class="flex items-center gap-2">
        <input type="checkbox" v-model="editMode" class="size-4" />
        <span class="text-caption text-muted-foreground">Edit boxes</span>
      </label>

      <template v-if="editMode">
        <button
          type="button"
          class="rounded border border-primary bg-primary/15 px-3 py-1 font-cinzel text-xs tracking-wide hover:bg-primary/25 transition-colors"
          @click="copyConfig"
        >
          {{ copied ? "Copied!" : "Copy config" }}
        </button>
        <button
          type="button"
          class="rounded border border-border bg-card px-3 py-1 font-cinzel text-xs tracking-wide text-muted-foreground hover:text-foreground transition-colors"
          @click="resetFields"
        >
          Reset
        </button>
        <span v-if="selected !== null" class="text-caption font-mono text-muted-foreground">
          {{ editFields[selected]?.section }}: [{{ editFields[selected]?.box.join(", ") }}]
          — drag to move, corner to resize, arrows nudge 0.1% (⇧ 0.5%, ⌥ resizes)
        </span>
        <span v-else class="text-caption text-muted-foreground">click a box to select</span>
      </template>
    </div>

    <div class="overflow-auto rounded-lg border border-border bg-muted p-4">
      <div :data-theme="theme" :data-side="side" :data-size="pageSize" class="relative inline-block">
        <IllustratedSheet
          :member="sampleMember"
          :inventory="sampleInventory"
          :side="side"
          :theme="theme"
          :page-size="pageSize"
          :species-name="SPECIES_NAME"
          :background-name="BACKGROUND_NAME"
          :debug="debug"
          :fields-override="editMode ? editFields : null"
        />
        <!-- Edit layer: one draggable/resizable handle per field box. -->
        <div v-if="editMode" class="absolute inset-0" @pointerdown.self="selected = null">
          <div
            v-for="(f, i) in editFields"
            :key="f.section + i"
            class="absolute cursor-move touch-none"
            :class="i === selected ? 'outline-2 outline-dashed outline-red-600 bg-red-500/10 z-10' : 'outline-1 outline-dashed outline-blue-500/60 hover:bg-blue-500/10'"
            :style="{ left: f.box[0] + '%', top: f.box[1] + '%', width: f.box[2] + '%', height: f.box[3] + '%', outlineStyle: 'dashed' }"
            @pointerdown.prevent="startDrag($event, i, 'move')"
          >
            <span
              v-if="i === selected"
              class="absolute -top-4 left-0 whitespace-nowrap bg-red-600 px-1 font-mono text-2xs text-white"
            >{{ f.section }} [{{ f.box.join(", ") }}]</span>
            <span
              class="absolute -right-1 -bottom-1 size-3 cursor-nwse-resize rounded-sm bg-blue-600"
              :class="{ 'bg-red-600': i === selected }"
              @pointerdown.stop.prevent="startDrag($event, i, 'resize')"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter, type LocationQueryValue } from "vue-router";
import IllustratedSheet from "@/components/character-sheet/illustrated/IllustratedSheet.vue";
import {
  PAGE_PX,
  type FieldSpec,
  type IllustratedTheme,
  type SheetSide,
  type SheetPageSize,
} from "@/components/character-sheet/illustrated/sheetTypes";
import { A4 } from "@/components/character-sheet/illustrated/sheetConfig.a4";
import { LETTER } from "@/components/character-sheet/illustrated/sheetConfig.letter";
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

// ── Box editing ──────────────────────────────────────────────────────────
// A live-editable clone of the active (size, theme, side) field list, fed to
// IllustratedSheet via fieldsOverride. Drag to move, corner handle to resize,
// arrow keys to nudge; "Copy config" emits the exact TS block for the
// sheetConfig.{a4,letter}.ts file.

const editMode = ref(false);
const selected = ref<number | null>(null);
const copied = ref(false);
const editFields = ref<FieldSpec[]>([]);

function activeConfigFields(): FieldSpec[] {
  const cfg = (pageSize.value === "Letter" ? LETTER : A4)[theme.value][side.value];
  return cfg.fields.map((f) => ({ ...f, box: [...f.box] as FieldSpec["box"] }));
}
function resetFields() {
  editFields.value = activeConfigFields();
  selected.value = null;
}
watch([theme, side, pageSize], resetFields, { immediate: true });

const round1 = (n: number) => Math.round(n * 10) / 10;

interface DragState {
  index: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  startBox: [number, number, number, number];
}
let drag: DragState | null = null;

function startDrag(e: PointerEvent, index: number, mode: "move" | "resize") {
  selected.value = index;
  const f = editFields.value[index];
  drag = { index, mode, startX: e.clientX, startY: e.clientY, startBox: [...f.box] };
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag, { once: true });
}
function onDragMove(e: PointerEvent) {
  if (!drag) return;
  const px = PAGE_PX[pageSize.value];
  const dx = ((e.clientX - drag.startX) / px.w) * 100;
  const dy = ((e.clientY - drag.startY) / px.h) * 100;
  const b = drag.startBox;
  const f = editFields.value[drag.index];
  if (drag.mode === "move") {
    f.box = [round1(b[0] + dx), round1(b[1] + dy), b[2], b[3]];
  } else {
    f.box = [b[0], b[1], round1(Math.max(1, b[2] + dx)), round1(Math.max(0.8, b[3] + dy))];
  }
}
function endDrag() {
  drag = null;
  window.removeEventListener("pointermove", onDragMove);
}

function onKeydown(e: KeyboardEvent) {
  if (!editMode.value || selected.value === null) return;
  const dirs: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };
  const d = dirs[e.key];
  if (!d) return;
  e.preventDefault();
  const step = e.shiftKey ? 0.5 : 0.1;
  const f = editFields.value[selected.value];
  const b = f.box;
  f.box = e.altKey
    ? [b[0], b[1], round1(Math.max(1, b[2] + d[0] * step)), round1(Math.max(0.8, b[3] + d[1] * step))]
    : [round1(b[0] + d[0] * step), round1(b[1] + d[1] * step), b[2], b[3]];
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("pointermove", onDragMove);
});

/** The exact `fields: [...]` block to paste into sheetConfig.{a4,letter}.ts. */
function serializeFields(): string {
  const lines = editFields.value.map((f) => {
    const opts = f.opts ? `, opts: ${JSON.stringify(f.opts).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ").replace(/\{/, "{ ").replace(/\}$/, " }")}` : "";
    return `        { section: "${f.section}", box: [${f.box.join(", ")}]${opts} },`;
  });
  return `      fields: [\n${lines.join("\n")}\n      ],`;
}
async function copyConfig() {
  const text = serializeFields();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    console.log(text); // clipboard blocked (e.g. headless) — read it from the console
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

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
