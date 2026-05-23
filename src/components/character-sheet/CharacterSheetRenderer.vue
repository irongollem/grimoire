<template>
  <!-- Page 1: Core stats -->
  <div class="cs-page">

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <header class="cs-header">
      <div class="cs-header-name-block">
        <div class="cs-character-name">{{ member.name }}</div>
        <div class="cs-header-meta">
          <span class="cs-meta-item">
            <span class="cs-meta-label">Class &amp; Level</span>
            {{ member.class ?? "—" }}{{ member.subclass ? ` (${member.subclass})` : "" }} {{ member.level }}
          </span>
          <span class="cs-meta-sep">·</span>
          <span class="cs-meta-item">
            <span class="cs-meta-label">Background</span>{{ background }}
          </span>
          <span class="cs-meta-sep">·</span>
          <span class="cs-meta-item">
            <span class="cs-meta-label">Species</span>{{ species }}
          </span>
          <span class="cs-meta-sep">·</span>
          <span class="cs-meta-item">
            <span class="cs-meta-label">Alignment</span>{{ member.alignment ?? "—" }}
          </span>
          <template v-if="(member.experience_points ?? 0) > 0">
            <span class="cs-meta-sep">·</span>
            <span class="cs-meta-item">
              <span class="cs-meta-label">XP</span>{{ member.experience_points?.toLocaleString() }}
            </span>
          </template>
        </div>
      </div>
      <div v-if="member.portrait_url" class="cs-portrait-wrap">
        <img class="cs-portrait" :src="member.portrait_url" alt="" crossorigin="anonymous" />
      </div>
    </header>

    <!-- ── Body (two columns) ──────────────────────────────────── -->
    <div class="cs-body">

      <!-- Left column: abilities · saves · skills -->
      <aside class="cs-left-col">

        <!-- Ability scores -->
        <div class="cs-section cs-ability-scores-section">
          <div class="cs-ability-scores">
            <div v-for="ab in ABILITIES" :key="ab.key" class="cs-ability-score">
              <div class="cs-ability-modifier">{{ signedMod(member[ab.key]) }}</div>
              <div class="cs-ability-value">{{ member[ab.key] }}</div>
              <div class="cs-ability-label">{{ ab.label }}</div>
            </div>
          </div>
        </div>

        <!-- Inspiration + Proficiency Bonus -->
        <div class="cs-section cs-insp-prof-row">
          <div class="cs-section-body">
            <div class="cs-stat-box">
              <div class="cs-stat-box-value">{{ member.inspiration ? "✦" : "○" }}</div>
              <div class="cs-stat-box-label">Inspiration</div>
            </div>
            <div class="cs-stat-box">
              <div class="cs-stat-box-value">+{{ member.proficiency_bonus }}</div>
              <div class="cs-stat-box-label">Proficiency Bonus</div>
            </div>
          </div>
        </div>

        <!-- Saving Throws -->
        <div class="cs-section cs-saving-throws">
          <div class="cs-section-title">Saving Throws</div>
          <div class="cs-section-body">
            <div v-for="ab in ABILITIES" :key="ab.key" class="cs-check-row">
              <span :class="['cs-prof-dot', member.saving_throw_proficiencies.includes(ab.key) ? 'cs-prof-dot--filled' : '']" />
              <span class="cs-check-bonus">{{ signedBonus(saveBonus(ab.key)) }}</span>
              <span class="cs-check-label">{{ ab.label }}</span>
            </div>
          </div>
        </div>

        <!-- Passive Perception -->
        <div class="cs-section cs-passive-row">
          <div class="cs-section-body">
            <span class="cs-passive-label">Passive Wisdom (Perception)</span>
            <span class="cs-passive-value">{{ passivePerception }}</span>
          </div>
        </div>

        <!-- Skills -->
        <div class="cs-section cs-skills">
          <div class="cs-section-title">Skills</div>
          <div class="cs-section-body">
            <div v-for="sk in SKILLS" :key="sk.key" class="cs-check-row">
              <span :class="[
                'cs-prof-dot',
                skillLevel(sk.key) !== 'none' ? 'cs-prof-dot--filled' : '',
                skillLevel(sk.key) === 'expertise' ? 'cs-prof-dot--expertise' : '',
              ]" />
              <span class="cs-check-bonus">{{ signedBonus(computedSkillBonus(sk)) }}</span>
              <span class="cs-check-label">
                {{ sk.label }} <span class="cs-check-ability">({{ sk.ability.toUpperCase() }})</span>
              </span>
            </div>
          </div>
        </div>

      </aside>

      <!-- Right column: combat · attacks · spells · currency · personality -->
      <main class="cs-right-col">

        <!-- Combat stats bar -->
        <div class="cs-section cs-combat-row">
          <div class="cs-section-title">Combat</div>
          <div class="cs-section-body">
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
          </div>
        </div>

        <!-- Hit Dice + Death Saves -->
        <div class="cs-section cs-dice-saves-row">
          <div class="cs-section-body">
            <div class="cs-hit-dice">
              <div class="cs-subsection-title">Hit Dice</div>
              <div class="cs-hit-dice-value">{{ hitDiceStr }}</div>
            </div>
            <div class="cs-death-saves">
              <div class="cs-subsection-title">Death Saves</div>
              <div class="cs-death-save-row">
                <span class="cs-death-label">Successes</span>
                <span
                  v-for="i in 3"
                  :key="i"
                  :class="['cs-save-pip', i <= member.death_save_successes ? 'cs-save-pip--filled' : '']"
                />
              </div>
              <div class="cs-death-save-row">
                <span class="cs-death-label">Failures</span>
                <span
                  v-for="i in 3"
                  :key="i"
                  :class="['cs-save-pip', i <= member.death_save_failures ? 'cs-save-pip--filled cs-save-pip--fail' : '']"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Attacks & Spellcasting -->
        <div class="cs-section cs-attacks">
          <div class="cs-section-title">Attacks &amp; Spellcasting</div>
          <div class="cs-section-body">
            <table class="cs-attack-table">
              <thead>
                <tr>
                  <th class="cs-attack-th cs-attack-name-col">Name</th>
                  <th class="cs-attack-th">Atk Bonus</th>
                  <th class="cs-attack-th">Damage / Type</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in equippedWeapons" :key="item.id" class="cs-attack-row">
                  <td>{{ item.name }}</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
                <tr
                  v-for="i in Math.max(0, 3 - equippedWeapons.length)"
                  :key="`blank-${i}`"
                  class="cs-attack-row cs-attack-row--blank"
                >
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
          </div>
        </div>

        <!-- Spell Slots -->
        <div v-if="member.spell_slots.length" class="cs-section cs-spell-slots">
          <div class="cs-section-title">Spell Slots</div>
          <div class="cs-section-body">
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
          </div>
        </div>

        <!-- Currency -->
        <div class="cs-section cs-currency">
          <div class="cs-section-title">Currency</div>
          <div class="cs-section-body">
            <div class="cs-currency-row">
              <div v-for="coin in COINS" :key="coin.key" class="cs-coin">
                <div class="cs-coin-amount">{{ member[coin.key] }}</div>
                <div class="cs-coin-label">{{ coin.label }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Personality -->
        <div class="cs-section cs-personality">
          <div class="cs-section-title">Personality</div>
          <div class="cs-section-body">
            <div class="cs-personality-grid">
              <div class="cs-trait-box">
                <div class="cs-trait-title">Personality Traits</div>
                <div class="cs-trait-text">{{ member.personality_traits || "" }}</div>
              </div>
              <div class="cs-trait-box">
                <div class="cs-trait-title">Ideals</div>
                <div class="cs-trait-text">{{ member.ideals || "" }}</div>
              </div>
              <div class="cs-trait-box">
                <div class="cs-trait-title">Bonds</div>
                <div class="cs-trait-text">{{ member.bonds || "" }}</div>
              </div>
              <div class="cs-trait-box">
                <div class="cs-trait-title">Flaws</div>
                <div class="cs-trait-text">{{ member.flaws || "" }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Other Proficiencies & Languages -->
        <div class="cs-section cs-proficiencies">
          <div class="cs-section-title">Other Proficiencies &amp; Languages</div>
          <div class="cs-section-body">
            <div class="cs-proficiencies-text">
              <template v-if="member.tool_proficiencies.length">
                <strong>Tools:</strong> {{ member.tool_proficiencies.join(", ") }}<br />
              </template>
              <template v-if="member.languages.length">
                <strong>Languages:</strong> {{ member.languages.join(", ") }}
              </template>
            </div>
          </div>
        </div>

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

const { member, inventory, speciesName = null, backgroundName = null } = defineProps<{
  member: PartyMember;
  inventory: PartyInventoryItem[];
  pageSize?: SheetPageSize;
  speciesName?: string | null;
  backgroundName?: string | null;
}>();

const ABILITIES = [
  { key: "str" as const, label: "Strength" },
  { key: "dex" as const, label: "Dexterity" },
  { key: "con" as const, label: "Constitution" },
  { key: "int" as const, label: "Intelligence" },
  { key: "wis" as const, label: "Wisdom" },
  { key: "cha" as const, label: "Charisma" },
] as const;

const COINS = [
  { key: "pp" as keyof PartyMember, label: "PP" },
  { key: "gp" as keyof PartyMember, label: "GP" },
  { key: "ep" as keyof PartyMember, label: "EP" },
  { key: "sp" as keyof PartyMember, label: "SP" },
  { key: "cp" as keyof PartyMember, label: "CP" },
] as const;

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

// ── Data resolution ────────────────────────────────────────────────────────────

/** Resolved display name: subrace takes priority, then speciesName prop, else em dash */
const species = computed(() => member.subrace ?? speciesName ?? "—");

/** Resolved display name: backgroundName prop else em dash */
const background = computed(() => backgroundName ?? "—");

// ── Computed helpers ──────────────────────────────────────────────────────────

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
  const mod = abilityMod(member[key]);
  const prof = member.saving_throw_proficiencies.includes(key) ? member.proficiency_bonus : 0;
  return mod + prof;
}

function skillLevel(key: keyof SkillProficiencies): string {
  return member.skill_proficiencies?.[key] ?? "none";
}

function computedSkillBonus(sk: typeof SKILLS[number]): number {
  const mod = abilityMod(member[sk.ability]);
  const level = skillLevel(sk.key);
  const pb = member.proficiency_bonus;
  return mod + (level === "none" ? 0 : level === "proficient" ? pb : pb * 2);
}

const passivePerception = computed(() => {
  const sk = SKILLS.find((s) => s.key === "perception")!;
  return 10 + computedSkillBonus(sk);
});

const castingAbility = computed(() => getCastingAbility(member.class));
const castingMod = computed(() =>
  castingAbility.value ? abilityMod(member[castingAbility.value]) : null,
);
const spellAttack = computed(() =>
  castingMod.value !== null ? member.proficiency_bonus + castingMod.value : null,
);
const spellSaveDC = computed(() =>
  spellAttack.value !== null ? 8 + spellAttack.value : null,
);

const hitDiceStr = computed(() => {
  if (!member.class) return `${member.level}d8`;
  const dieMap: Record<string, number> = {
    Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10,
    Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8,
    Artificer: 8, Sorcerer: 6, Wizard: 6,
  };
  const die = dieMap[member.class] ?? 8;
  const rem = member.hit_dice_remaining ?? member.level;
  return `${rem}d${die}`;
});

const equippedWeapons = computed(() =>
  inventory.filter(
    (i) => i.carried_by === member.id && i.location === "equipped" &&
    (i.slot === "main_hand" || i.slot === "off_hand"),
  ),
);
</script>

<style>
/* Import the shared .cs-* stylesheet.
   Unscoped so the styles survive the off-screen createApp() rendering context. */
@import "@/assets/character-sheet.css";

/* Ability-scores section doesn't use cs-section-body padding — grid sits flush */
.cs-ability-scores-section {
  padding: 8px;
}
</style>
