<template>
  <!-- Page 1: Core stats -->
  <div class="cs-page">
    <!-- ── Header ──────────────────────────────────────────────── -->
    <header class="cs-header">
      <div class="cs-header-name-block">
        <div class="cs-character-name">{{ member.name }}</div>
        <div class="cs-header-meta">
          <span class="cs-meta-item"><span class="cs-meta-label">Class &amp; Level</span> {{ member.class ?? "—" }}{{ member.subclass ? ` (${member.subclass})` : "" }} {{ member.level }}</span>
          <span class="cs-meta-sep">·</span>
          <span class="cs-meta-item"><span class="cs-meta-label">Background</span> {{ background }}</span>
          <span class="cs-meta-sep">·</span>
          <span class="cs-meta-item"><span class="cs-meta-label">Species</span> {{ species }}</span>
          <span class="cs-meta-sep">·</span>
          <span class="cs-meta-item"><span class="cs-meta-label">Alignment</span> {{ member.alignment ?? "—" }}</span>
          <template v-if="(member.experience_points ?? 0) > 0">
            <span class="cs-meta-sep">·</span>
            <span class="cs-meta-item"><span class="cs-meta-label">XP</span> {{ member.experience_points?.toLocaleString() }}</span>
          </template>
        </div>
      </div>
      <div v-if="member.portrait_url" class="cs-portrait-wrap">
        <img class="cs-portrait" :src="member.portrait_url" alt="" crossorigin="anonymous" />
      </div>
    </header>

    <!-- ── Body (two columns) ──────────────────────────────────── -->
    <div class="cs-body">
      <!-- Left column: abilities, saves, skills -->
      <aside class="cs-left-col">

        <!-- Ability scores -->
        <section class="cs-section cs-ability-scores">
          <div v-for="ab in ABILITIES" :key="ab.key" class="cs-ability-score">
            <div class="cs-ability-modifier">{{ signedMod(member[ab.key]) }}</div>
            <div class="cs-ability-value">{{ member[ab.key] }}</div>
            <div class="cs-ability-label">{{ ab.label }}</div>
          </div>
        </section>

        <!-- Inspiration + Proficiency Bonus -->
        <section class="cs-section cs-insp-prof-row">
          <div class="cs-stat-box">
            <div class="cs-stat-box-value">{{ member.inspiration ? "✦" : "○" }}</div>
            <div class="cs-stat-box-label">Inspiration</div>
          </div>
          <div class="cs-stat-box">
            <div class="cs-stat-box-value">+{{ member.proficiency_bonus }}</div>
            <div class="cs-stat-box-label">Proficiency Bonus</div>
          </div>
        </section>

        <!-- Saving Throws -->
        <section class="cs-section cs-saving-throws">
          <div class="cs-section-title">Saving Throws</div>
          <div v-for="ab in ABILITIES" :key="ab.key" class="cs-check-row">
            <span :class="['cs-prof-dot', member.saving_throw_proficiencies.includes(ab.key) ? 'cs-prof-dot--filled' : '']" />
            <span class="cs-check-bonus">{{ signedBonus(saveBonus(ab.key)) }}</span>
            <span class="cs-check-label">{{ ab.label }}</span>
          </div>
        </section>

        <!-- Passive Perception -->
        <section class="cs-section cs-passive-row">
          <span class="cs-passive-label">Passive Wisdom (Perception)</span>
          <span class="cs-passive-value">{{ passivePerception }}</span>
        </section>

        <!-- Skills -->
        <section class="cs-section cs-skills">
          <div class="cs-section-title">Skills</div>
          <div v-for="sk in SKILLS" :key="sk.key" class="cs-check-row">
            <span :class="['cs-prof-dot', skillLevel(sk.key) !== 'none' ? 'cs-prof-dot--filled' : '', skillLevel(sk.key) === 'expertise' ? 'cs-prof-dot--expertise' : '']" />
            <span class="cs-check-bonus">{{ signedBonus(computedSkillBonus(sk)) }}</span>
            <span class="cs-check-label">{{ sk.label }} <span class="cs-check-ability">({{ sk.ability.toUpperCase() }})</span></span>
          </div>
        </section>

      </aside>

      <!-- Right column: combat + attacks + currency + personality -->
      <main class="cs-right-col">

        <!-- Combat stats bar -->
        <section class="cs-section cs-combat-row">
          <div class="cs-combat-stat">
            <div class="cs-combat-value">{{ member.ac }}</div>
            <div class="cs-combat-label">Armor Class</div>
          </div>
          <div class="cs-combat-stat">
            <div class="cs-combat-value">{{ signedBonus(member.initiative_bonus + abilityMod(member.dex)) }}</div>
            <div class="cs-combat-label">Initiative</div>
          </div>
          <div class="cs-combat-stat">
            <div class="cs-combat-value">{{ member.speed }}</div>
            <div class="cs-combat-label">Speed</div>
          </div>
          <div class="cs-combat-stat cs-combat-stat--wide">
            <div class="cs-hp-row">
              <div class="cs-hp-block">
                <div class="cs-combat-value">{{ member.max_hp }}</div>
                <div class="cs-combat-label">HP Maximum</div>
              </div>
              <div class="cs-hp-block">
                <div class="cs-combat-value">{{ member.current_hp }}</div>
                <div class="cs-combat-label">Current HP</div>
              </div>
              <div class="cs-hp-block">
                <div class="cs-combat-value">{{ member.temp_hp || "—" }}</div>
                <div class="cs-combat-label">Temporary HP</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Hit Dice + Death Saves -->
        <section class="cs-section cs-dice-saves-row">
          <div class="cs-hit-dice">
            <div class="cs-subsection-title">Hit Dice</div>
            <div class="cs-hit-dice-value">{{ hitDiceStr }}</div>
          </div>
          <div class="cs-death-saves">
            <div class="cs-subsection-title">Death Saves</div>
            <div class="cs-death-save-row">
              <span class="cs-death-label">Successes</span>
              <span v-for="i in 3" :key="i" :class="['cs-save-pip', i <= member.death_save_successes ? 'cs-save-pip--filled' : '']" />
            </div>
            <div class="cs-death-save-row">
              <span class="cs-death-label">Failures</span>
              <span v-for="i in 3" :key="i" :class="['cs-save-pip', i <= member.death_save_failures ? 'cs-save-pip--filled cs-save-pip--fail' : '']" />
            </div>
          </div>
        </section>

        <!-- Attacks & Spellcasting -->
        <section class="cs-section cs-attacks">
          <div class="cs-section-title">Attacks &amp; Spellcasting</div>
          <table class="cs-attack-table">
            <thead>
              <tr>
                <th class="cs-attack-th cs-attack-name">Name</th>
                <th class="cs-attack-th">Atk Bonus</th>
                <th class="cs-attack-th">Damage / Type</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in equippedWeapons" :key="item.id" class="cs-attack-row">
                <td class="cs-attack-name">{{ item.name }}</td>
                <td>—</td>
                <td>—</td>
              </tr>
              <tr v-for="i in Math.max(0, 3 - equippedWeapons.length)" :key="`blank-${i}`" class="cs-attack-row cs-attack-row--blank">
                <td></td><td></td><td></td>
              </tr>
            </tbody>
          </table>
          <!-- Spellcasting stats -->
          <div v-if="spellAttack !== null" class="cs-spellcasting-stats">
            <div class="cs-spell-stat">
              <div class="cs-spell-stat-value">{{ castingAbility?.toUpperCase() }}</div>
              <div class="cs-spell-stat-label">Spellcasting Ability</div>
            </div>
            <div class="cs-spell-stat">
              <div class="cs-spell-stat-value">{{ spellSaveDC }}</div>
              <div class="cs-spell-stat-label">Spell Save DC</div>
            </div>
            <div class="cs-spell-stat">
              <div class="cs-spell-stat-value">{{ signedBonus(spellAttack) }}</div>
              <div class="cs-spell-stat-label">Spell Attack</div>
            </div>
          </div>
        </section>

        <!-- Spell Slots -->
        <section v-if="member.spell_slots.length" class="cs-section cs-spell-slots">
          <div class="cs-section-title">Spell Slots</div>
          <div class="cs-slot-grid">
            <div v-for="slot in member.spell_slots" :key="slot.level" class="cs-slot-entry">
              <div class="cs-slot-level">{{ ORDINALS[slot.level - 1] }}</div>
              <div class="cs-slot-pips">
                <span
                  v-for="i in slot.max"
                  :key="i"
                  :class="['cs-slot-pip', i > (slot.max - slot.used) ? 'cs-slot-pip--used' : '']"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Currency -->
        <section class="cs-section cs-currency">
          <div class="cs-section-title">Currency</div>
          <div class="cs-currency-row">
            <div v-for="coin in COINS" :key="coin.key" class="cs-coin">
              <div class="cs-coin-amount">{{ member[coin.key] }}</div>
              <div class="cs-coin-label">{{ coin.label }}</div>
            </div>
          </div>
        </section>

        <!-- Personality -->
        <section class="cs-section cs-personality">
          <div class="cs-personality-grid">
            <div class="cs-trait-box">
              <div class="cs-subsection-title">Personality Traits</div>
              <div class="cs-trait-text">{{ member.personality_traits || "" }}</div>
            </div>
            <div class="cs-trait-box">
              <div class="cs-subsection-title">Ideals</div>
              <div class="cs-trait-text">{{ member.ideals || "" }}</div>
            </div>
            <div class="cs-trait-box">
              <div class="cs-subsection-title">Bonds</div>
              <div class="cs-trait-text">{{ member.bonds || "" }}</div>
            </div>
            <div class="cs-trait-box">
              <div class="cs-subsection-title">Flaws</div>
              <div class="cs-trait-text">{{ member.flaws || "" }}</div>
            </div>
          </div>
        </section>

        <!-- Features & Other proficiencies -->
        <section class="cs-section cs-features">
          <div class="cs-section-title">Other Proficiencies &amp; Languages</div>
          <div class="cs-features-text">
            <template v-if="member.tool_proficiencies.length">
              <strong>Tools:</strong> {{ member.tool_proficiencies.join(", ") }}<br />
            </template>
            <template v-if="member.languages.length">
              <strong>Languages:</strong> {{ member.languages.join(", ") }}
            </template>
          </div>
        </section>

      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { SKILLS, type PartyMember, type SkillProficiencies } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import { getCastingAbility } from "@/types/spell.types";
import type { SheetPageSize } from "@/composables/useCharacterSheetPdf";

const props = defineProps<{
  member: PartyMember;
  inventory: PartyInventoryItem[];
  pageSize?: SheetPageSize;
}>();

const ABILITIES = [
  { key: "str" as const, label: "Strength" },
  { key: "dex" as const, label: "Dexterity" },
  { key: "con" as const, label: "Constitution" },
  { key: "int" as const, label: "Intelligence" },
  { key: "wis" as const, label: "Wisdom" },
  { key: "cha" as const, label: "Charisma" },
];

const COINS = [
  { key: "pp" as keyof PartyMember, label: "PP" },
  { key: "gp" as keyof PartyMember, label: "GP" },
  { key: "ep" as keyof PartyMember, label: "EP" },
  { key: "sp" as keyof PartyMember, label: "SP" },
  { key: "cp" as keyof PartyMember, label: "CP" },
];

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

// ── Computed helpers ──────────────────────────────────────────────────────────

const background = computed(() => props.member.background_id ?? "—");
const species = computed(() => props.member.subrace
  ? `${props.member.subrace}`
  : (props.member.species_id ?? "—"));

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function signedMod(score: number): string {
  const m = abilityMod(score);
  return m >= 0 ? `+${m}` : `${m}`;
}

function signedBonus(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function saveBonus(key: keyof Pick<PartyMember, "str" | "dex" | "con" | "int" | "wis" | "cha">): number {
  const mod = abilityMod(props.member[key]);
  const prof = props.member.saving_throw_proficiencies.includes(key) ? props.member.proficiency_bonus : 0;
  return mod + prof;
}

function skillLevel(key: keyof SkillProficiencies): string {
  return props.member.skill_proficiencies?.[key] ?? "none";
}

function computedSkillBonus(sk: typeof SKILLS[number]): number {
  const mod = abilityMod(props.member[sk.ability]);
  const level = skillLevel(sk.key);
  const pb = props.member.proficiency_bonus;
  return mod + (level === "none" ? 0 : level === "proficient" ? pb : pb * 2);
}

const passivePerception = computed(() => {
  const sk = SKILLS.find((s) => s.key === "perception")!;
  return 10 + computedSkillBonus(sk);
});

const castingAbility = computed(() => getCastingAbility(props.member.class));
const castingMod = computed(() =>
  castingAbility.value ? abilityMod(props.member[castingAbility.value]) : null,
);
const spellAttack = computed(() =>
  castingMod.value !== null ? props.member.proficiency_bonus + castingMod.value : null,
);
const spellSaveDC = computed(() =>
  spellAttack.value !== null ? 8 + spellAttack.value : null,
);

const hitDiceStr = computed(() => {
  if (!props.member.class) return `${props.member.level}d8`;
  const dieMap: Record<string, number> = {
    Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10,
    Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8,
    Artificer: 8, Sorcerer: 6, Wizard: 6,
  };
  const die = dieMap[props.member.class] ?? 8;
  const rem = props.member.hit_dice_remaining ?? props.member.level;
  return `${rem}d${die}`;
});

const equippedWeapons = computed(() =>
  props.inventory.filter(
    (i) => i.carried_by === props.member.id && i.location === "equipped" &&
    (i.slot === "main_hand" || i.slot === "off_hand"),
  ),
);
</script>

<style>
/* Character Sheet — .cs-* taxonomy (stable, semantic, prefixed) */
/* All rules scoped via .cs-page ancestor to avoid app bleed. */

.cs-page {
  width: 794px;
  min-height: 1123px;
  background: #f8f4ec;
  font-family: 'Crimson Pro', Georgia, 'Times New Roman', serif;
  color: #1a1208;
  padding: 20px 22px;
  box-sizing: border-box;
  line-height: 1.3;
  font-size: 12px;
}

/* ── Header ──────────────────────────────────────────────────────────── */

.cs-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid #2d1f0e;
  margin-bottom: 10px;
}

.cs-header-name-block {
  flex: 1;
  min-width: 0;
}

.cs-character-name {
  font-family: 'Cinzel', 'Palatino Linotype', serif;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #1a0e04;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cs-header-meta {
  font-size: 10px;
  color: #5a4a32;
  margin-top: 3px;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
}

.cs-meta-label {
  font-family: 'Cinzel', serif;
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #8a7055;
  margin-right: 3px;
}

.cs-meta-sep {
  color: #c8b896;
  margin: 0 1px;
}

.cs-portrait-wrap {
  width: 60px;
  height: 75px;
  flex-shrink: 0;
  border: 1.5px solid #6b4c2a;
  border-radius: 3px;
  overflow: hidden;
}

.cs-portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ── Body layout ────────────────────────────────────────────────────── */

.cs-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.cs-left-col {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cs-right-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Sections ────────────────────────────────────────────────────────── */

.cs-section {
  border: 1px solid #b09870;
  border-radius: 3px;
  padding: 6px 8px;
  background: rgba(255,252,245,0.6);
}

.cs-section-title {
  font-family: 'Cinzel', serif;
  font-size: 7.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6b4c2a;
  border-bottom: 0.5px solid #c8b896;
  padding-bottom: 2px;
  margin-bottom: 4px;
}

.cs-subsection-title {
  font-family: 'Cinzel', serif;
  font-size: 7px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #8a7055;
  margin-bottom: 2px;
}

/* ── Ability scores ──────────────────────────────────────────────────── */

.cs-ability-scores {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 6px;
}

.cs-ability-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid #b09870;
  border-radius: 3px;
  padding: 4px 2px;
  background: white;
  min-width: 0;
}

.cs-ability-modifier {
  font-family: 'Cinzel', serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  color: #1a0e04;
}

.cs-ability-value {
  font-size: 10px;
  border: 0.5px solid #c8b896;
  border-radius: 2px;
  padding: 0 4px;
  margin: 2px 0;
  min-width: 22px;
  text-align: center;
  background: #f8f4ec;
}

.cs-ability-label {
  font-size: 6.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a7055;
  text-align: center;
}

/* ── Insp + prof ────────────────────────────────────────────────────── */

.cs-insp-prof-row {
  display: flex;
  gap: 6px;
}

.cs-stat-box {
  flex: 1;
  border: 1px solid #b09870;
  border-radius: 3px;
  padding: 4px;
  background: white;
  text-align: center;
}

.cs-stat-box-value {
  font-family: 'Cinzel', serif;
  font-size: 13px;
  font-weight: 700;
  color: #1a0e04;
  line-height: 1;
}

.cs-stat-box-label {
  font-size: 6.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a7055;
  margin-top: 1px;
}

/* ── Check rows (saves + skills) ─────────────────────────────────────── */

.cs-check-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
}

.cs-prof-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid #6b4c2a;
  flex-shrink: 0;
  display: inline-block;
}

.cs-prof-dot--filled {
  background: #2d1f0e;
}

.cs-prof-dot--expertise {
  box-shadow: 0 0 0 1.5px #2d1f0e;
}

.cs-check-bonus {
  font-family: 'Cinzel', serif;
  font-size: 9px;
  font-weight: 600;
  min-width: 22px;
  text-align: right;
  color: #1a0e04;
}

.cs-check-label {
  font-size: 9px;
  color: #1a0e04;
  flex: 1;
}

.cs-check-ability {
  font-size: 7.5px;
  color: #8a7055;
}

/* ── Passive perception ──────────────────────────────────────────────── */

.cs-passive-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cs-passive-label {
  font-size: 8.5px;
  color: #5a4a32;
}

.cs-passive-value {
  font-family: 'Cinzel', serif;
  font-size: 13px;
  font-weight: 700;
  color: #1a0e04;
}

/* ── Combat stats ────────────────────────────────────────────────────── */

.cs-combat-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.cs-combat-stat {
  border: 1px solid #b09870;
  border-radius: 3px;
  padding: 4px 6px;
  background: white;
  text-align: center;
  flex-shrink: 0;
}

.cs-combat-stat--wide {
  flex: 1;
}

.cs-combat-value {
  font-family: 'Cinzel', serif;
  font-size: 15px;
  font-weight: 700;
  color: #1a0e04;
  line-height: 1;
}

.cs-combat-label {
  font-size: 6.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a7055;
  margin-top: 1px;
  white-space: nowrap;
}

.cs-hp-row {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.cs-hp-block {
  text-align: center;
}

/* ── Hit Dice + Death saves ──────────────────────────────────────────── */

.cs-dice-saves-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.cs-hit-dice {
  flex-shrink: 0;
}

.cs-hit-dice-value {
  font-family: 'Cinzel', serif;
  font-size: 13px;
  font-weight: 700;
  margin-top: 2px;
}

.cs-death-saves {
  flex: 1;
}

.cs-death-save-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.cs-death-label {
  font-size: 8px;
  color: #5a4a32;
  min-width: 50px;
}

.cs-save-pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid #6b4c2a;
  display: inline-block;
}

.cs-save-pip--filled { background: #2d5a1f; }
.cs-save-pip--fail   { background: #8b1a1a; }

/* ── Attacks ─────────────────────────────────────────────────────────── */

.cs-attack-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9px;
  margin-bottom: 4px;
}

.cs-attack-th {
  font-family: 'Cinzel', serif;
  font-size: 7.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b4c2a;
  border-bottom: 0.5px solid #b09870;
  padding: 1px 3px;
  text-align: left;
}

.cs-attack-name {
  flex: 1;
}

.cs-attack-row td {
  padding: 3px;
  border-bottom: 0.5px solid #e4d8c0;
  min-height: 16px;
}

.cs-attack-row--blank td {
  height: 14px;
}

.cs-spellcasting-stats {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.cs-spell-stat {
  flex: 1;
  border: 1px solid #b09870;
  border-radius: 3px;
  padding: 3px 5px;
  background: white;
  text-align: center;
}

.cs-spell-stat-value {
  font-family: 'Cinzel', serif;
  font-size: 11px;
  font-weight: 700;
  color: #1a0e04;
}

.cs-spell-stat-label {
  font-size: 6.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a7055;
}

/* ── Spell slots ─────────────────────────────────────────────────────── */

.cs-slot-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cs-slot-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.cs-slot-level {
  font-size: 7px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a7055;
}

.cs-slot-pips {
  display: flex;
  gap: 2px;
}

.cs-slot-pip {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid #6b4c2a;
  display: inline-block;
  background: #f8f4ec;
}

.cs-slot-pip--used {
  background: white;
  border-color: #c8b896;
}

/* ── Currency ────────────────────────────────────────────────────────── */

.cs-currency-row {
  display: flex;
  gap: 6px;
}

.cs-coin {
  flex: 1;
  border: 1px solid #b09870;
  border-radius: 3px;
  padding: 3px 4px;
  background: white;
  text-align: center;
}

.cs-coin-amount {
  font-family: 'Cinzel', serif;
  font-size: 11px;
  font-weight: 700;
  color: #1a0e04;
}

.cs-coin-label {
  font-size: 7px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a7055;
}

/* ── Personality ─────────────────────────────────────────────────────── */

.cs-personality-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

.cs-trait-box {
  border: 1px solid #b09870;
  border-radius: 2px;
  padding: 4px;
  background: white;
  min-height: 44px;
}

.cs-trait-text {
  font-size: 8.5px;
  color: #1a0e04;
  line-height: 1.4;
  margin-top: 1px;
}

/* ── Features ────────────────────────────────────────────────────────── */

.cs-features-text {
  font-size: 9px;
  color: #1a0e04;
  line-height: 1.5;
}
</style>
