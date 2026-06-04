<!--
  IllustratedSheet.vue — one illustrated character-sheet page (front OR back) for
  one theme + page size. The artwork (frame, section boxes, printed labels) is a
  baked PNG "plate"; live character data is laid over it as absolutely-positioned,
  overflow-clamped value-only fields driven by the pure-data config in
  sheetConfig.{a4,letter}.ts. Labels are NEVER rendered here — they're on the plate.

  Markup + CSS ported from the design handoff mockups (Sheet Front/Back Illustrated).
-->
<template>
  <div class="cs-page illustrated" :class="[`t-${theme}`, { dbg: debug }]" :style="{ width: px.w + 'px', height: px.h + 'px' }">
    <img class="plate" :src="plateUrl" alt="" crossorigin="anonymous" />
    <div class="fields">
      <div
        v-for="(f, i) in sheet.fields"
        :key="i"
        class="fld"
        :class="fldClass(f)"
        :style="boxStyle(f)"
      >
        <!-- ─────────────── FRONT ─────────────── -->
        <template v-if="f.section === 'name'">
          <div class="nm">{{ front.name }}</div>
          <div class="sub">{{ front.sub }}</div>
        </template>

        <template v-else-if="f.section === 'abilities'">
          <div v-for="a in front.abilities" :key="a.key" class="ab">
            <div class="modbox">
              <div class="m">{{ a.mod }}</div>
              <span class="s">{{ a.score }}</span>
            </div>
            <div class="meta">
              <div class="an">{{ a.name }}</div>
              <div class="al">{{ a.key.toUpperCase() }}</div>
            </div>
          </div>
        </template>

        <template v-else-if="f.section === 'ac' || f.section === 'init' || f.section === 'speed'">
          <div class="v">{{ frontValue(f.section) }}</div>
        </template>

        <template v-else-if="f.section === 'passperc' || f.section === 'profbonus'">
          <div class="ssv">{{ frontValue(f.section) }}</div>
        </template>

        <template v-else-if="f.section === 'hp'">
          <div class="big">{{ front.hp.cur }} / {{ front.hp.max }}</div>
          <div class="row"><span class="k">Temp</span><span class="v">{{ front.hp.temp }}</span></div>
        </template>

        <template v-else-if="f.section === 'hitdice'">
          <div class="row"><span class="k">Remaining</span><span class="v">{{ front.hitdice }}</span></div>
        </template>

        <template v-else-if="f.section === 'death'">
          <div class="grp2">
            <span class="lab">Succ</span>
            <span v-for="n in 3" :key="n" class="pip s" :class="{ on: n <= front.death.succ }" />
          </div>
          <div class="grp2">
            <span class="lab">Fail</span>
            <span v-for="n in 3" :key="n" class="pip f" :class="{ on: n <= front.death.fail }" />
          </div>
        </template>

        <template v-else-if="f.section === 'portrait'">
          <img v-if="front.portraitUrl" :src="front.portraitUrl" alt="" crossorigin="anonymous" />
          <div v-else class="ph">Portrait</div>
        </template>

        <template v-else-if="f.section === 'attacks'">
          <div v-for="(at, j) in front.attacks" :key="j" class="atk-row">
            <span class="an">{{ at.name }}</span>
            <span class="a2">{{ at.bonus }}</span>
            <span class="a3">{{ at.damage }}</span>
          </div>
          <div v-if="front.spell" class="spellline">
            <span>Ability <b>{{ front.spell.ability }}</b></span>
            <span>Save DC <b>{{ front.spell.dc }}</b></span>
            <span>Spell Atk <b>{{ front.spell.atk }}</b></span>
          </div>
        </template>

        <template v-else-if="f.section === 'skills'">
          <div class="skgrid" :style="f.opts?.fontSize ? { fontSize: f.opts.fontSize + 'px' } : undefined">
            <div v-for="s in front.skills" :key="s.name" class="sk">
              <i class="dot" :class="{ on: s.level !== 'none', ex: s.level === 'expertise' }" />
              <span class="skm">{{ s.mod }}</span>
              <span class="skn">{{ s.name }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="f.section === 'equipment'">
          <div class="lst">
            <div v-for="(e, j) in front.equipment" :key="j" class="li">
              <span>{{ e.item }}</span><span class="q">×{{ e.qty }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="f.section === 'features'">
          <div v-for="(ft, j) in front.features" :key="j" class="fitem">
            <span class="fn">{{ ft.name }}. </span><span class="ft">{{ ft.text }}</span>
          </div>
        </template>

        <!-- ─────────────── BACK ─────────────── -->
        <template v-else-if="f.section === 'crest'">
          <div class="mono">{{ back.crest }}</div>
          <div v-if="back.crestCap" class="cap">{{ back.crestCap }}</div>
        </template>

        <template v-else-if="f.section === 'allies'">
          <div class="rows">
            <div v-for="(r, j) in back.allies" :key="j" class="row2">
              <div class="nm">{{ r[0] }}<span class="sub">{{ r[1] }}</span></div>
            </div>
          </div>
        </template>

        <template v-else-if="f.section === 'treasure'">
          <div class="rows">
            <div v-for="(r, j) in back.treasure" :key="j" class="row2">
              <span class="nm">{{ r[0] }}</span><span class="val">{{ r[1] }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="f.section === 'quests'">
          <div v-for="(q, j) in back.quests" :key="j" class="q" :class="{ done: q[1] === 2 }">{{ q[0] }}</div>
        </template>

        <template v-else-if="f.section === 'personality'">
          <div class="pibf" :class="{ two: f.opts?.cols === 2 }">
            <template v-for="(blk, j) in pibfBlocks" :key="blk.k">
              <div v-if="j && f.opts?.cols !== 2" class="dv" />
              <div class="blk"><div class="k">{{ blk.k }}</div><div class="vv">{{ blk.v }}</div></div>
            </template>
          </div>
        </template>

        <template v-else-if="f.section === 'pTraits' || f.section === 'pIdeals' || f.section === 'pBonds' || f.section === 'pFlaws'">
          <div class="prose" :style="clampStyle(f.opts?.lines ?? 3)">{{ pibfOne(f.section) }}</div>
        </template>

        <!-- appearance / backstory / spellnotes / generalnotes / secrets / travel / notes -->
        <template v-else>
          <div class="prose" :style="clampStyle(f.opts?.lines)">{{ proseText(f.section) }}</div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import {
  PAGE_PX,
  type IllustratedTheme,
  type SheetSide,
  type SheetPageSize,
  type FieldSpec,
  type SectionId,
} from "./sheetTypes";
import { A4 } from "./sheetConfig.a4";
import { LETTER } from "./sheetConfig.letter";
import { toFront, toBack } from "./sheetData";

const {
  member,
  inventory,
  side,
  theme,
  pageSize,
  speciesName = null,
  backgroundName = null,
  acBonus = 0,
  debug = false,
} = defineProps<{
  member: PartyMember;
  inventory: PartyInventoryItem[];
  side: SheetSide;
  theme: IllustratedTheme;
  pageSize: SheetPageSize;
  speciesName?: string | null;
  backgroundName?: string | null;
  /** Shield AC bonus added to the member's base AC. */
  acBonus?: number;
  /** Calibration aid: outline each overlay box so coordinates can be nudged by eye. */
  debug?: boolean;
}>();

// All plate PNGs, resolved to hashed build URLs. Keyed by their /src path so the
// active (pageSize, plate) pair is a plain lookup — no dynamic new URL() needed.
const plateModules = import.meta.glob("/src/assets/sheets/**/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const px = computed(() => PAGE_PX[pageSize]);
const sheet = computed(() => (pageSize === "Letter" ? LETTER : A4)[theme][side]);
const plateUrl = computed(
  () => plateModules[`/src/assets/sheets/${pageSize.toLowerCase()}/${sheet.value.plate}`],
);

const front = computed(() => toFront(member, inventory, speciesName, backgroundName, acBonus));
const back = computed(() => toBack(member));
const pibfBlocks = computed(() => [
  { k: "Personality", v: back.value.personality.traits },
  { k: "Ideals", v: back.value.personality.ideals },
  { k: "Bonds", v: back.value.personality.bonds },
  { k: "Flaws", v: back.value.personality.flaws },
]);

function boxStyle(f: FieldSpec) {
  const b = f.box;
  return { left: b[0] + "%", top: b[1] + "%", width: b[2] + "%", height: b[3] + "%" };
}
function fldClass(f: FieldSpec) {
  return [
    `fld-${f.section}`,
    f.opts?.tight ? "tight" : "",
    f.opts?.cols === 2 ? "two" : "",
  ];
}
function clampStyle(lines?: number) {
  return lines ? ({ "-webkit-line-clamp": String(lines) } as Record<string, string>) : undefined;
}
function frontValue(s: "ac" | "init" | "speed" | "passperc" | "profbonus") {
  return front.value[s];
}
function proseText(s: SectionId) {
  return (back.value as unknown as Record<string, string>)[s] ?? "";
}
function pibfOne(s: SectionId) {
  const map: Record<string, keyof typeof back.value.personality> = {
    pTraits: "traits", pIdeals: "ideals", pBonds: "bonds", pFlaws: "flaws",
  };
  return back.value.personality[map[s]] ?? "";
}
</script>

<!--
  Unscoped so the styles survive the off-screen createApp() rendering context the
  PDF pipeline uses (same approach as CharacterSheetRenderer.vue). Every selector
  is namespaced under .illustrated to avoid leaking into the rest of the app.
-->
<style>
.cs-page.illustrated {
  position: relative;
  overflow: hidden;
  --ink: #33271a;
  --ink-soft: #6b5a44;
  --accent: #6f2230;
  --paper: #efe6d2;
  --head: "Cinzel", serif;
  --body: "EB Garamond", serif;
  color: var(--ink);
  font-family: var(--body);
}
.cs-page.illustrated .plate {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  z-index: 0;
}
.cs-page.illustrated .fields { position: absolute; inset: 0; z-index: 2; }
.cs-page.illustrated .fld { position: absolute; overflow: hidden; display: flex; flex-direction: column; }
/* Calibration overlay — outline every box for nudging coordinates by eye. */
.cs-page.illustrated.dbg .fld { outline: 1px solid rgba(0, 120, 255, .65); background: rgba(0, 120, 255, .08); }

/* name */
.illustrated .fld-name { z-index: 3; justify-content: center; align-items: flex-start; }
.illustrated .fld-name .nm {
  font-family: var(--head); font-weight: 700; color: var(--accent);
  font-size: 22px; line-height: 1; letter-spacing: .01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.illustrated .fld-name .sub {
  font-family: var(--body); font-size: 11px; color: var(--ink-soft); margin-top: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}

/* abilities — designed stat cells */
.illustrated .fld-abilities { gap: 6px; justify-content: space-between; padding: 5px 7px; }
.illustrated .ab {
  display: grid; grid-template-columns: 46px 1fr; align-items: center; gap: 9px;
  border: 1.4px solid color-mix(in srgb, var(--ink) 34%, transparent); border-radius: 5px;
  background: color-mix(in srgb, var(--paper) 55%, transparent); padding: 4px 8px; flex: 1;
}
.illustrated .ab .modbox {
  text-align: center; border: 1.3px solid color-mix(in srgb, var(--ink) 40%, transparent);
  border-radius: 4px; background: color-mix(in srgb, #fff 45%, transparent); padding: 3px 0 2px;
}
.illustrated .ab .modbox .m { font-family: var(--head); font-size: 19px; font-weight: 700; line-height: 1; color: var(--ink); }
.illustrated .ab .modbox .s {
  display: block; font-size: 8.5px; color: var(--ink-soft);
  border-top: 1px solid color-mix(in srgb, var(--ink) 28%, transparent);
  margin-top: 2px; padding-top: 1px; font-variant-numeric: tabular-nums;
}
.illustrated .ab .meta .an { font-family: var(--head); font-size: 12px; font-weight: 600; letter-spacing: .03em; color: var(--ink); line-height: 1.05; }
.illustrated .ab .meta .al { font-size: 8px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-soft); margin-top: 2px; }

/* big single stats (ac/init/speed) */
.illustrated .fld-ac, .illustrated .fld-init, .illustrated .fld-speed { align-items: center; justify-content: center; }
.illustrated .fld-ac .v, .illustrated .fld-init .v, .illustrated .fld-speed .v {
  font-family: var(--head); font-weight: 700; font-size: 25px; line-height: 1; color: var(--ink);
}
.illustrated .fld-ac .v { font-size: 22px; transform: translateY(-2px); }

/* hp / hit dice */
.illustrated .fld-hp, .illustrated .fld-hitdice { gap: 2px; justify-content: center; }
.illustrated .fld-hp .row, .illustrated .fld-hitdice .row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 12px;
}
.illustrated .fld-hp .row .k, .illustrated .fld-hitdice .row .k {
  color: var(--ink-soft); font-size: 9.5px; letter-spacing: .04em; text-transform: uppercase;
}
.illustrated .fld-hp .row .v, .illustrated .fld-hitdice .row .v { font-family: var(--head); font-weight: 600; font-size: 15px; color: var(--ink); }
.illustrated .fld-hp .big { font-family: var(--head); font-weight: 700; font-size: 22px; color: var(--ink); line-height: 1; text-align: right; }

/* death saves */
.illustrated .fld-death { flex-direction: row; align-items: center; justify-content: center; gap: 18px; }
.illustrated .fld-death .grp2 { display: flex; align-items: center; gap: 6px; }
.illustrated .fld-death .lab { font-size: 9.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-soft); }
.illustrated .pip { width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid var(--ink-soft); display: inline-block; }
.illustrated .pip.s.on { background: #2d5a1f; border-color: #2d5a1f; }
.illustrated .pip.f.on { background: var(--accent); border-color: var(--accent); }

/* portrait */
.illustrated .fld-portrait { padding: 0; }
.illustrated .fld-portrait img { width: 100%; height: 100%; object-fit: cover; border-radius: 3px; }
.illustrated .fld-portrait .ph {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-family: var(--head); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft);
}

/* attacks */
.illustrated .atk-row {
  display: grid; grid-template-columns: 1fr 38px 96px; gap: 6px; align-items: baseline;
  font-size: 11.5px; padding: 2.5px 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
}
.illustrated .atk-row .an { font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.illustrated .atk-row .a2 { font-family: var(--head); text-align: center; color: var(--ink); }
.illustrated .atk-row .a3 { color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.illustrated .spellline { display: flex; gap: 14px; margin-top: 5px; font-size: 11px; color: var(--ink-soft); }
.illustrated .spellline b { font-family: var(--head); color: var(--ink); font-weight: 600; }

/* skills */
.illustrated .fld-skills { padding: 1px 4px; font-size: 10px; }
.illustrated .fld-skills .skgrid { display: block; }
.illustrated .fld-skills.two .skgrid { column-count: 2; column-gap: 11px; }
.illustrated .sk {
  display: grid; grid-template-columns: 11px 26px 1fr; gap: 5px; align-items: center;
  font-size: inherit; padding: 1px 0; line-height: 1.18; break-inside: avoid; -webkit-column-break-inside: avoid;
}
.illustrated .fld-skills.tight .sk { line-height: 1.05; padding: 0; }
.illustrated .dot { width: 7px; height: 7px; border-radius: 50%; border: 1.4px solid var(--ink-soft); display: inline-block; }
.illustrated .dot.on { background: var(--accent); border-color: var(--accent); }
.illustrated .dot.ex { box-shadow: 0 0 0 1.5px var(--accent); }
.illustrated .sk .skm { font-family: var(--head); font-size: inherit; font-weight: 600; text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; }
.illustrated .sk .skn { color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* equipment list */
.illustrated .lst { font-size: 11px; line-height: 1.5; }
.illustrated .lst .li {
  display: flex; justify-content: space-between; gap: 8px; color: var(--ink);
  border-bottom: 1px dotted color-mix(in srgb, var(--ink) 18%, transparent); padding: 1px 0;
}
.illustrated .lst .li > span:first-child { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.illustrated .lst .li .q { flex: 0 0 auto; color: var(--ink-soft); font-variant-numeric: tabular-nums; }

/* features */
.illustrated .fld-features .fitem { margin-bottom: 4px; }
.illustrated .fld-features .fn { font-family: var(--head); font-weight: 600; font-size: 11px; color: var(--ink); }
.illustrated .fld-features .ft { color: var(--ink-soft); font-size: 10.5px; line-height: 1.35; }

/* single value (passperc / profbonus) */
.illustrated .fld-passperc, .illustrated .fld-profbonus { align-items: center; justify-content: center; }
.illustrated .ssv { font-family: var(--head); font-weight: 700; font-size: 16px; color: var(--ink); }

/* prose (notes + most back sections) */
.illustrated .prose {
  font-size: 11.5px; line-height: 1.5; color: var(--ink); white-space: pre-line;
  display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
}
.illustrated .fld-notes .prose { font-size: 11px; line-height: 1.42; }

/* key-value list (allies, treasure) */
.illustrated .rows { display: flex; flex-direction: column; gap: 0; font-size: 11.5px; }
.illustrated .row2 {
  display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: baseline; padding: 2.5px 0;
  border-bottom: 1px dotted color-mix(in srgb, var(--ink) 22%, transparent);
}
.illustrated .row2:last-child { border-bottom: 0; }
.illustrated .row2 .nm { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.illustrated .row2 .nm .sub { display: block; font-size: 9.5px; color: var(--ink-soft); font-style: italic; white-space: normal; line-height: 1.25; }
.illustrated .row2 .val { color: var(--ink-soft); font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 10.5px; }

/* quest items */
.illustrated .q { font-size: 11.5px; line-height: 1.3; padding-left: 14px; position: relative; margin-bottom: 3px; color: var(--ink); }
.illustrated .q::before { content: "◆"; position: absolute; left: 0; top: 2px; font-size: 7px; color: var(--accent); }
.illustrated .q.done { color: var(--ink-soft); }
.illustrated .q.done::before { content: "✓"; font-size: 8px; }

/* personality / ideals / bonds / flaws block */
.illustrated .pibf { display: flex; flex-direction: column; gap: 8px; }
.illustrated .pibf.two { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 16px; }
.illustrated .pibf .blk .k { font-family: var(--head); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin-bottom: 2px; }
.illustrated .pibf .blk .vv { font-size: 11px; line-height: 1.4; color: var(--ink); }
.illustrated .pibf .dv { height: 1px; background: color-mix(in srgb, var(--ink) 18%, transparent); }

/* crest */
.illustrated .fld-crest { align-items: center; justify-content: center; text-align: center; }
.illustrated .fld-crest .mono { font-family: var(--head); font-weight: 700; font-size: 30px; color: var(--accent); line-height: 1; letter-spacing: .04em; }
.illustrated .fld-crest .cap { font-size: 9.5px; font-style: italic; color: var(--ink-soft); margin-top: 5px; line-height: 1.3; }

/* ── per-theme typography + ink tokens ── */
.illustrated.t-classic   { --ink: #3a2718; --ink-soft: #7a5c3a; --accent: #6f2230; --paper: #efe6d2; --head: "Cinzel", serif;            --body: "EB Garamond", serif; }
.illustrated.t-adventure { --ink: #41301c; --ink-soft: #7c5a30; --accent: #7a3410; --paper: #e7d7af; --head: "Cinzel", serif;            --body: "EB Garamond", serif; }
.illustrated.t-gothic    { --ink: #1d1418; --ink-soft: #5a4750; --accent: #6e0f1c; --paper: #d9d1c5; --head: "Cinzel", serif;            --body: "EB Garamond", serif; }
.illustrated.t-fairy     { --ink: #5a3146; --ink-soft: #8a6076; --accent: #8b3055; --paper: #fbf3ee; --head: "Cormorant Garamond", serif; --body: "EB Garamond", serif; }
.illustrated.t-sumie     { --ink: #16120e; --ink-soft: #5a5048; --accent: #c8200a; --paper: #efe7d6; --head: "Shippori Mincho", serif;    --body: "Shippori Mincho", serif; }
</style>
