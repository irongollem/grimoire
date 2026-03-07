/**
 * Scriptorium Import Engine
 *
 * Pluggable formatter registry that converts game entities (NPCs, Monsters,
 * and future types like magic items, locations, etc.) into Scriptorium documents.
 *
 * To add a new asset type:
 *   1. Implement AssetFormatter<YourType>
 *   2. Register it in FORMATTERS below
 *   3. Export a typed helper function (e.g. formatMagicItemForScriptorium)
 */

import type { Npc } from '@/types/npc.types'
import type { Monster } from '@/types/monster.types'
import type { ScriptoriumDocType } from '@/types/scriptorium.types'

// ── Output type ───────────────────────────────────────────────────────────────

export interface ScriptoriumImportData {
  title: string
  content: string       // HTML string — Tiptap editor accepts HTML as fallback
  doc_type: ScriptoriumDocType
  tags: string[]
  is_published: boolean
  word_count: number
}

// ── Formatter interface ───────────────────────────────────────────────────────

export interface AssetFormatter<T> {
  format(asset: T): ScriptoriumImportData
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? text.split(' ').length : 0
}

function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

function traitList(traits: Array<{ name: string; description: string }>): string {
  return traits.map(t => `<p><strong>${t.name}.</strong> ${t.description}</p>`).join('\n')
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function uniqueTags(...groups: (string | null | undefined)[][]): string[] {
  const flat = groups.flat().filter((t): t is string => !!t && t.trim().length > 0)
  return [...new Set(flat.map(t => t.toLowerCase().trim()))]
}

// ── NPC formatter ─────────────────────────────────────────────────────────────

const npcFormatter: AssetFormatter<Npc> = {
  format(npc: Npc): ScriptoriumImportData {
    let html = ''

    // Name heading
    html += `<h1>${npc.name}</h1>\n`

    // Subtitle line (race + class)
    const subtitle = [npc.race, npc.class].filter(Boolean).join(', ')
    if (subtitle) html += `<p><em>${subtitle}</em></p>\n`

    // Identity block
    const identityRows = [
      npc.alignment  && `<strong>Alignment</strong> ${npc.alignment}`,
      npc.age        && `<strong>Age</strong> ${npc.age}`,
      npc.occupation && `<strong>Occupation</strong> ${npc.occupation}`,
      npc.location   && `<strong>Location</strong> ${npc.location}`,
      npc.affiliation && `<strong>Affiliation</strong> ${npc.affiliation}`,
    ].filter(Boolean) as string[]

    if (identityRows.length) {
      html += '<h2>Identity</h2>\n'
      identityRows.forEach(row => { html += `<p>${row}</p>\n` })
    }

    // Lore sections
    const loreSections: { label: string; value: string | null }[] = [
      { label: 'Appearance',   value: npc.appearance },
      { label: 'Personality',  value: npc.personality },
      { label: 'Backstory',    value: npc.backstory },
      { label: 'Notes',        value: npc.notes },
    ]
    const loreItems = loreSections.filter(s => s.value)
    if (loreItems.length) {
      html += '<h2>Lore</h2>\n'
      loreItems.forEach(({ label, value }) => {
        html += `<h3>${label}</h3>\n<p>${value}</p>\n`
      })
    }

    // DM Secret (blockquote — visible but clearly marked)
    if (npc.secret) {
      html += `<h2>DM Notes</h2>\n<blockquote><p><strong>Secret:</strong> ${npc.secret}</p></blockquote>\n`
    }

    // Stat block
    if (npc.stat_block) {
      const sb = npc.stat_block
      html += '<h1>Statistics</h1>\n'
      html += `<p><strong>AC</strong> ${sb.armor_class} &nbsp; <strong>HP</strong> ${sb.hit_points} &nbsp; <strong>Speed</strong> ${sb.speed} &nbsp; <strong>CR</strong> ${sb.challenge_rating}</p>\n`

      // Ability scores
      html += '<p>'
      const abilities: [string, number][] = [
        ['STR', sb.str], ['DEX', sb.dex], ['CON', sb.con],
        ['INT', sb.int], ['WIS', sb.wis], ['CHA', sb.cha],
      ]
      html += abilities.map(([label, score]) =>
        `<strong>${label}</strong> ${score} (${abilityMod(score)})`
      ).join(' &nbsp; ')
      html += '</p>\n'

      if (sb.skills && Object.keys(sb.skills).length) {
        const skillsStr = Object.entries(sb.skills).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')
        html += `<p><strong>Skills</strong> ${skillsStr}</p>\n`
      }
      if (sb.senses)               html += `<p><strong>Senses</strong> ${sb.senses}</p>\n`
      if (sb.languages)            html += `<p><strong>Languages</strong> ${sb.languages}</p>\n`
      if (sb.damage_resistances)   html += `<p><strong>Damage Resistances</strong> ${sb.damage_resistances}</p>\n`
      if (sb.damage_immunities)    html += `<p><strong>Damage Immunities</strong> ${sb.damage_immunities}</p>\n`
      if (sb.condition_immunities) html += `<p><strong>Condition Immunities</strong> ${sb.condition_immunities}</p>\n`

      if (sb.special_abilities?.length) html += '<h2>Special Abilities</h2>\n' + traitList(sb.special_abilities)
      if (sb.actions?.length)           html += '<h2>Actions</h2>\n'           + traitList(sb.actions)
      if (sb.legendary_actions?.length) html += '<h2>Legendary Actions</h2>\n' + traitList(sb.legendary_actions)
    }

    return {
      title: npc.name,
      content: html,
      doc_type: 'npc-sheet',
      tags: uniqueTags(['npc'], npc.tags, [npc.race]),
      is_published: false,
      word_count: countWords(html),
    }
  },
}

// ── Monster formatter ─────────────────────────────────────────────────────────

const monsterFormatter: AssetFormatter<Monster> = {
  format(monster: Monster): ScriptoriumImportData {
    const sb = monster.stat_block
    let html = ''

    // Name heading
    html += `<h1>${monster.name}</h1>\n`

    // Type line
    const typeParts = [capitalize(monster.size), capitalize(monster.monster_type), monster.alignment].filter(Boolean)
    html += `<p><em>${typeParts.join(' ')}</em></p>\n`

    // Combat stats
    html += `<p><strong>Armor Class</strong> ${sb.armor_class} &nbsp; <strong>Hit Points</strong> ${sb.hit_points} &nbsp; <strong>Speed</strong> ${sb.speed} &nbsp; <strong>Challenge</strong> ${sb.challenge_rating}</p>\n`

    // Ability scores
    html += '<p>'
    const abilities: [string, number][] = [
      ['STR', sb.str], ['DEX', sb.dex], ['CON', sb.con],
      ['INT', sb.int], ['WIS', sb.wis], ['CHA', sb.cha],
    ]
    html += abilities.map(([label, score]) =>
      `<strong>${label}</strong> ${score} (${abilityMod(score)})`
    ).join(' &nbsp; ')
    html += '</p>\n'

    // Proficiency block
    if (sb.saving_throws)           html += `<p><strong>Saving Throws</strong> ${sb.saving_throws}</p>\n`
    if (sb.skills && Object.keys(sb.skills).length) {
      html += `<p><strong>Skills</strong> ${Object.entries(sb.skills).map(([k, v]) => `${k} ${v}`).join(', ')}</p>\n`
    }
    if (sb.damage_vulnerabilities)  html += `<p><strong>Damage Vulnerabilities</strong> ${sb.damage_vulnerabilities}</p>\n`
    if (sb.damage_resistances)      html += `<p><strong>Damage Resistances</strong> ${sb.damage_resistances}</p>\n`
    if (sb.damage_immunities)       html += `<p><strong>Damage Immunities</strong> ${sb.damage_immunities}</p>\n`
    if (sb.condition_immunities)    html += `<p><strong>Condition Immunities</strong> ${sb.condition_immunities}</p>\n`
    if (sb.senses)                  html += `<p><strong>Senses</strong> ${sb.senses}</p>\n`
    if (sb.languages)               html += `<p><strong>Languages</strong> ${sb.languages}</p>\n`

    // Trait sections
    if (sb.special_abilities?.length) html += '<h2>Special Abilities</h2>\n' + traitList(sb.special_abilities)
    if (sb.actions?.length)           html += '<h2>Actions</h2>\n'           + traitList(sb.actions)
    if (sb.bonus_actions?.length)     html += '<h2>Bonus Actions</h2>\n'     + traitList(sb.bonus_actions)
    if (sb.reactions?.length)         html += '<h2>Reactions</h2>\n'         + traitList(sb.reactions)

    // Legendary
    const hasLegendary = (sb.legendary_resistance ?? 0) > 0 || (sb.legendary_actions?.length ?? 0) > 0
    if (hasLegendary) {
      html += '<h1>Legendary</h1>\n'
      if (sb.legendary_resistance) {
        html += `<p><strong>Legendary Resistance (${sb.legendary_resistance}/Day).</strong> If ${monster.name} fails a saving throw, it can choose to succeed instead.</p>\n`
      }
      if (sb.legendary_actions?.length) html += '<h2>Legendary Actions</h2>\n' + traitList(sb.legendary_actions)
    }

    if (sb.lair_actions?.length) {
      html += '<h1>Lair Actions</h1>\n' + traitList(sb.lair_actions)
    }

    if (monster.notes) {
      html += `<h2>DM Notes</h2>\n<blockquote><p>${monster.notes}</p></blockquote>\n`
    }

    return {
      title: monster.name,
      content: html,
      doc_type: 'monster',
      tags: uniqueTags(['monster'], [monster.monster_type], monster.tags, [monster.source]),
      is_published: false,
      word_count: countWords(html),
    }
  },
}

// ── Registry ──────────────────────────────────────────────────────────────────
// Add new formatters here. Key = asset type identifier.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FORMATTERS: Record<string, AssetFormatter<any>> = {
  npc:     npcFormatter,
  monster: monsterFormatter,
  // future: magicItem: magicItemFormatter,
  // future: location: locationFormatter,
}

// Generic dispatch (for dynamic/plugin use cases)
export function formatForScriptorium<T>(type: string, asset: T): ScriptoriumImportData | null {
  const formatter = FORMATTERS[type] as AssetFormatter<T> | undefined
  return formatter ? formatter.format(asset) : null
}

// Typed convenience exports
export function formatNpcForScriptorium(npc: Npc): ScriptoriumImportData {
  return npcFormatter.format(npc)
}

export function formatMonsterForScriptorium(monster: Monster): ScriptoriumImportData {
  return monsterFormatter.format(monster)
}
