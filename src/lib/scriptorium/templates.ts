/**
 * Entity block templates for Scriptorium.
 *
 * Each factory returns an HTML string that `editor.chain().focus().insertContent()`
 * accepts directly. Placeholder text uses [Bracketed] labels so authors know
 * exactly what to fill in.
 *
 * Wrapper nodes:
 *   - Monster stat blocks use `<div data-type="noteBlock">` (→ sc-note) so the
 *     block renders with the callout-style framing that mirrors Homebrewery's
 *     stat block appearance. No new Tiptap node type required.
 *   - Spell, magic item, and class feature blocks use plain headings + paragraphs
 *     (matching the DB-sourced formatter output from `scriptoriumImport.ts`).
 *   - The wide monster variant additionally wraps in `<div data-type="wide-block">`.
 *
 * CSS for these templates lives in:
 *   • ScriptoriumEditor.vue  (scoped `<style>` — preview + editor)
 *   • useScriptoriumPdf.ts   (RENDER_CSS — PDF export)
 *
 * Registered in `blockRegistry.ts` under the "Templates" group.
 */

// ── Monster Stat Block ────────────────────────────────────────────────────────

/**
 * Standard monster stat block template.
 *
 * Uses `noteBlock` as the outer wrapper so the stat block renders with the
 * callout framing in both 2024 and Classic themes. Mirrors the content shape
 * of `formatMonsterForScriptorium` but with bracketed placeholder text.
 */
export function monsterStatBlockTemplate(): string {
  return `<div data-type="noteBlock">
<h1>[Name]</h1>
<p><em>[Size] [Monster Type], [Alignment]</em></p>
<p><strong>Armor Class</strong> [AC] &nbsp; <strong>Hit Points</strong> [HP] ([Hit Dice]) &nbsp; <strong>Speed</strong> [Speed] ft.</p>
<p><strong>Challenge</strong> [CR] ([XP] XP) &nbsp; <strong>Proficiency Bonus</strong> +[PB]</p>
<p><strong>STR</strong> [10] (+0) &nbsp; <strong>DEX</strong> [10] (+0) &nbsp; <strong>CON</strong> [10] (+0) &nbsp; <strong>INT</strong> [10] (+0) &nbsp; <strong>WIS</strong> [10] (+0) &nbsp; <strong>CHA</strong> [10] (+0)</p>
<p><strong>Saving Throws</strong> [e.g. Dex +4, Wis +2]</p>
<p><strong>Skills</strong> [e.g. Perception +4, Stealth +6]</p>
<p><strong>Damage Resistances</strong> [damage types]</p>
<p><strong>Damage Immunities</strong> [damage types]</p>
<p><strong>Condition Immunities</strong> [conditions]</p>
<p><strong>Senses</strong> [e.g. darkvision 60 ft., passive Perception 14]</p>
<p><strong>Languages</strong> [languages]</p>
<h2>Special Abilities</h2>
<p><strong>[Ability Name].</strong> [Description of what the ability does.]</p>
<h2>Actions</h2>
<p><strong>[Action Name].</strong> <em>Melee Weapon Attack:</em> +[X] to hit, reach [Y] ft., one target. <em>Hit:</em> [Xd6 + X] [type] damage.</p>
<h2>Reactions</h2>
<p><strong>[Reaction Name].</strong> [Trigger]. [Effect.]</p>
<h2>Legendary Actions</h2>
<p>[Name] can take 3 legendary actions, choosing from the options below. Only one option can be used at a time, and only at the end of another creature's turn. [Name] regains spent legendary actions at the start of its turn.</p>
<p><strong>[Legendary Action].</strong> [Description.]</p>
</div>`;
}

/**
 * Wide monster stat block template.
 *
 * Identical content to the standard variant but wrapped in the `wideBlock`
 * node so the block spans both columns in a two-column Scriptorium document.
 */
export function monsterStatBlockWideTemplate(): string {
  return `<div data-type="wide-block"><div data-type="noteBlock">
<h1>[Name] (Wide)</h1>
<p><em>[Size] [Monster Type], [Alignment]</em></p>
<p><strong>Armor Class</strong> [AC] &nbsp; <strong>Hit Points</strong> [HP] ([Hit Dice]) &nbsp; <strong>Speed</strong> [Speed] ft.</p>
<p><strong>Challenge</strong> [CR] ([XP] XP) &nbsp; <strong>Proficiency Bonus</strong> +[PB]</p>
<p><strong>STR</strong> [10] (+0) &nbsp; <strong>DEX</strong> [10] (+0) &nbsp; <strong>CON</strong> [10] (+0) &nbsp; <strong>INT</strong> [10] (+0) &nbsp; <strong>WIS</strong> [10] (+0) &nbsp; <strong>CHA</strong> [10] (+0)</p>
<p><strong>Saving Throws</strong> [e.g. Dex +4, Wis +2]</p>
<p><strong>Skills</strong> [e.g. Perception +4, Stealth +6]</p>
<p><strong>Damage Resistances</strong> [damage types]</p>
<p><strong>Damage Immunities</strong> [damage types]</p>
<p><strong>Condition Immunities</strong> [conditions]</p>
<p><strong>Senses</strong> [e.g. darkvision 60 ft., passive Perception 14]</p>
<p><strong>Languages</strong> [languages]</p>
<h2>Special Abilities</h2>
<p><strong>[Ability Name].</strong> [Description of what the ability does.]</p>
<h2>Actions</h2>
<p><strong>[Action Name].</strong> <em>Melee Weapon Attack:</em> +[X] to hit, reach [Y] ft., one target. <em>Hit:</em> [Xd6 + X] [type] damage.</p>
<h2>Reactions</h2>
<p><strong>[Reaction Name].</strong> [Trigger]. [Effect.]</p>
<h2>Legendary Actions</h2>
<p>[Name] can take 3 legendary actions, choosing from the options below. Only one option can be used at a time, and only at the end of another creature's turn. [Name] regains spent legendary actions at the start of its turn.</p>
<p><strong>[Legendary Action].</strong> [Description.]</p>
</div></div>`;
}

// ── Spell ─────────────────────────────────────────────────────────────────────

/**
 * Spell block template.
 *
 * Mirrors the Homebrewery / OneDnD spell entry format and matches the output
 * of `formatSpellForScriptorium`. Uses H3 for the name (matching the
 * sub-heading level used for spell entries within a larger document).
 */
export function spellTemplate(): string {
  return `<h3>[Spell Name]</h3>
<p><em>[Nth]-level [School]</em></p>
<p><strong>Casting Time</strong> [1 action]</p>
<p><strong>Range</strong> [30 feet]</p>
<p><strong>Components</strong> V, S, M (a pinch of [material component])</p>
<p><strong>Duration</strong> [Instantaneous]</p>
<p>[Describe the spell's effect. What are the targets, area, and saving throw?]</p>
<p><strong>Spell Lists</strong> [Bard, Cleric, Wizard]</p>
<h3>At Higher Levels</h3>
<p>[When cast with a higher-level slot, describe the scaling effect here.]</p>`;
}

// ── Magic Item ────────────────────────────────────────────────────────────────

/**
 * Magic item block template.
 *
 * Mirrors the output of `formatItemForScriptorium` and the Homebrewery
 * magic item entry format: heading, type + rarity + attunement subtitle,
 * flavour description, mechanical effect, and charges block.
 */
export function magicItemTemplate(): string {
  return `<h3>[Item Name]</h3>
<p><em>[Weapon / Wondrous Item / Armor], [Uncommon / Rare / Very Rare / Legendary] (requires attunement)</em></p>
<p>[Describe the item's appearance, history, or flavour text.]</p>
<p>[Describe the mechanical effect — what does it do when activated or worn?]</p>
<p><strong>Charges.</strong> This item has [N] charges. You expend 1 charge to [effect]. It regains [1d6] expended charges daily at dawn.</p>`;
}

// ── Class Feature ─────────────────────────────────────────────────────────────

/**
 * Class feature block template.
 *
 * Level heading, prerequisite / source line, description body, and an optional
 * sub-feature for complex features (e.g. Spellcasting with Cantrips, Spell
 * Slots, and Preparing Spells sub-sections).
 */
export function classFeatureTemplate(): string {
  return `<h3>[Feature Name]</h3>
<p><em>[Nth]-level [Class] feature</em></p>
<p>[Describe what the character gains at this level. State dice, modifier, uses, and recharge condition clearly.]</p>
<h3>[Sub-feature Name]</h3>
<p>[Optional: break complex features (e.g. Spellcasting) into sub-features with their own H3 headings.]</p>`;
}
