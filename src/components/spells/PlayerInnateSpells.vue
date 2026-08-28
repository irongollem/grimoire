<template>
  <div>
    <!-- Empty state -->
    <div
      v-if="!innateEntries.length"
      class="rounded-lg border border-border bg-card px-5 py-8 text-center space-y-2"
    >
      <IconGenerate class="h-8 w-8 mx-auto text-muted-foreground/60" />
      <p class="font-cinzel text-sm font-semibold text-foreground">No innate spells</p>
      <p class="text-body text-muted-foreground max-w-sm mx-auto">
        Add racial traits, feats, or item-granted spells using the button above.
      </p>
    </div>

    <!-- Groups by source label -->
    <div v-else class="space-y-2">
      <div v-for="group in sourceGroups" :key="group.label">
        <!-- Source header -->
        <button
          class="w-full flex items-center gap-2 px-3 py-2 rounded-t-lg bg-muted/40 border border-border hover:bg-muted/60 transition-colors"
          :class="ui.playerInnateOpenSources.includes(group.label) ? 'rounded-t-lg border-b-0' : 'rounded-lg'"
          @click="ui.togglePlayerInnateSource(group.label)"
        >
          <IconChevronRight
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform"
            :class="ui.playerInnateOpenSources.includes(group.label) ? 'rotate-90' : ''"
          />
          <span class="text-label-lg font-bold text-foreground">
            {{ group.label }}
          </span>
          <span class="font-cinzel text-2xs px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20">
            {{ SOURCE_TYPE_LABELS[group.entries[0].source_type] ?? group.entries[0].source_type }}
          </span>
          <span class="ml-auto text-label text-muted-foreground">
            {{ group.entries.length }}
          </span>
        </button>

        <!-- Spell rows -->
        <div
          v-show="ui.playerInnateOpenSources.includes(group.label)"
          class="rounded-b-lg border border-t-0 border-border bg-card divide-y divide-border overflow-hidden"
        >
          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="group flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <!-- School colour dot -->
            <div
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :class="SCHOOL_BG[entry.spell.school]"
            />

            <!-- Spell name -->
            <AppButton
              variant="ghost"
              tone="primary"
              size="inline"
              class="flex-1 min-w-0 justify-start truncate text-body text-foreground"
              @click.stop="selectedSpell = entry.spell"
            >{{ entry.spell.name }}</AppButton>

            <!-- Concentration / ritual badges -->
            <span
              v-if="entry.spell.ritual"
              class="shrink-0 text-eyebrow text-muted-foreground border border-border rounded px-1"
            >R</span>
            <span
              v-if="entry.spell.concentration"
              class="shrink-0 text-eyebrow text-primary/70 border border-primary/30 rounded px-1"
            >C</span>

            <!-- Attack / save info -->
            <span
              v-if="entry.spell.level > 0 && attackBonusFor(entry) !== null && (entry.spell.attack_type === 'ranged_spell' || entry.spell.attack_type === 'melee_spell')"
              class="shrink-0 font-cinzel text-2xs text-muted-foreground"
            >Atk {{ signedNum(attackBonusFor(entry)!) }}</span>
            <span
              v-else-if="entry.spell.level > 0 && saveDcFor(entry) !== null && entry.spell.attack_type === 'save'"
              class="shrink-0 font-cinzel text-2xs text-muted-foreground"
            >DC {{ saveDcFor(entry) }}</span>

            <AppButton
              v-if="entry.spell.damage_rolls?.length && entry.spell.mechanics_reviewed !== false"
              variant="tinted"
              size="xs"
              tone="danger"
              emphasis="soft"
              tooltip="Roll damage after resolving the spell attack or target saving throw"
              :label="entry.spell.effects?.length ? 'Resolve' : 'Damage'"
              @click.stop="entry.spell.effects?.length ? openEffectResolution(entry) : rollInnateDamage(entry)"
            />
            <AppButton
              v-if="entry.spell.healing_dice && entry.spell.mechanics_reviewed !== false"
              variant="tinted"
              size="xs"
              tone="success"
              emphasis="soft"
              tooltip="Roll healing"
              :label="entry.spell.effects?.length ? 'Resolve' : 'Healing'"
              @click.stop="entry.spell.effects?.length ? openEffectResolution(entry) : rollInnateHealing(entry)"
            />
            <span v-if="entry.spell.mechanics_reviewed === false" class="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-cinzel text-2xs text-amber-500">Manual</span>

            <!-- Use tracking: pips or "At will" -->
            <template v-if="entry.uses_per_day !== null">
              <div class="flex items-center gap-0.5 shrink-0">
                <span
                  v-for="i in entry.uses_per_day"
                  :key="i"
                  class="h-2.5 w-2.5 rounded-full border-2 transition-colors"
                  :class="i <= (entry.uses_remaining ?? 0)
                    ? 'bg-violet-500 border-violet-500'
                    : 'border-muted-foreground/30'"
                />
              </div>
              <span class="font-cinzel text-2xs text-muted-foreground shrink-0">
                {{ entry.uses_remaining ?? 0 }}/{{ entry.uses_per_day }}
              </span>
            </template>
            <span
              v-else
              class="shrink-0 text-label text-emerald-500/70 border border-emerald-500/20 rounded px-1.5 py-0.5"
            >At will</span>

            <!-- Cast button -->
            <AppButton
              v-bind="castButtonStyle(entry)"
              size="xs"
              :icon="IconWand"
              icon-size="xs"
              label="Cast"
              :disabled="isCasting || (entry.uses_per_day !== null && !entry.uses_remaining)"
              :tooltip="castButtonTitle(entry)"
              @click="castSpell(entry)"
            />

            <!-- Remove button -->
            <AppButton
              variant="ghost"
              tone="danger"
              size="icon-xs"
              class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              :icon="IconClose"
              tooltip="Remove innate spell"
              :disabled="isRemoving"
              @click="handleRemove(entry)"
            />
          </div>
        </div>
      </div>
    </div>

    <PlayerSpellModal :spell="selectedSpell" @close="selectedSpell = null" />
    <SpellEffectResolver
      :spell="pendingResolution?.spell ?? null"
      :cast-level="pendingResolution?.castLevel ?? 0"
      :character-level="thisMember?.level ?? 1"
      :spellcasting-modifier="pendingResolution?.modifier ?? 0"
      @close="pendingResolution = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconChevronRight, IconClose, IconGenerate, IconWand } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import type { ButtonFill, ButtonTone, ButtonVariant } from "@/components/common/appButtonVariants";
import {
  useCharacterSpellsWithDetails,
  useRemoveCharacterSpellById,
} from "@/composables/party/useCharacterSpells";
import { useCastCharacterSpell, useParty } from "@/composables/party/useParty";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useConcentration } from "@/composables/party/useConcentration";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useUiStore } from "@/stores/ui";
import { SCHOOL_BG } from "@/types/spell.types";
import { parseExpression, parsedToCounts } from "@/lib/dice/dice";
import { rollParsed } from "@/lib/dice/roller";
import { signedNum } from "@/lib/utils";
import type { CharacterSpellEntry, Spell } from "@/types/spell.types";
import type { ConcentrationState } from "@/types/party.types";
import PlayerSpellModal from "@/components/spells/PlayerSpellModal.vue";
import SpellEffectResolver from "@/components/spells/SpellEffectResolver.vue";
import { canAutoRollSpellEffect } from "@/rules/spellcastingPolicy";
import { useToast } from "@/composables/useToast";
import { grantAttackBonus, grantSaveDc } from "@/rules/spellGrantStats";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  racial: "Racial",
  feat: "Feat",
  item: "Item",
  other: "Other",
};

const props = defineProps<{
  partyMemberId: string | null;
  memberName: string;
  spellAttackBonus: number | null;
  spellSaveDc: number | null;
}>();

const ui = useUiStore();
const toast = useToast();

const { data: allEntries } = useCharacterSpellsWithDetails(
  computed(() => props.partyMemberId),
);
const { mutate: removeById, isPending: isRemoving } = useRemoveCharacterSpellById();
const { mutateAsync: commitCast, isPending: isCasting } = useCastCharacterSpell();
const { sendFlavorMessage, sendRoll } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();
const { data: partyList } = useParty();
const { prepareConcentration } = useConcentration();

const thisMember = computed(() =>
  props.partyMemberId && partyList.value
    ? (partyList.value.find((m) => m.id === props.partyMemberId) ?? null)
    : null,
);

const selectedSpell = ref<Spell | null>(null);
const pendingResolution = ref<{ spell: Spell; castLevel: number; modifier: number } | null>(null);
function attackBonusFor(entry: CharacterSpellEntry): number | null {
  return grantAttackBonus(entry, thisMember.value, null, props.spellAttackBonus);
}
function saveDcFor(entry: CharacterSpellEntry): number | null {
  return grantSaveDc(entry, thisMember.value, null, props.spellSaveDc);
}
function openEffectResolution(entry: CharacterSpellEntry) {
  pendingResolution.value = {
    spell: entry.spell,
    castLevel: entry.spell.level,
    modifier: (attackBonusFor(entry) ?? 0) - (thisMember.value?.proficiency_bonus ?? 0),
  };
}

// Only non-class spells
const innateEntries = computed(() =>
  (allEntries.value ?? []).filter((e) => e.source_type && e.source_type !== "class"),
);

// Group by source_label (falling back to source_type label)
const sourceGroups = computed(() => {
  const map = new Map<string, CharacterSpellEntry[]>();
  for (const e of innateEntries.value) {
    const label = e.source_label || SOURCE_TYPE_LABELS[e.source_type] || e.source_type;
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(e);
  }
  return [...map.entries()].map(([label, entries]) => ({ label, entries }));
});

/**
 * Cast button styling has three distinct states that don't collapse onto a
 * single tinted look, so it's a prop bag spread via v-bind rather than a
 * class string: exhausted (neutral, disabled), cantrip (muted resting,
 * arcane on hover), and a spent slot (arcane tinted at rest).
 */
function castButtonStyle(entry: CharacterSpellEntry): { variant: ButtonVariant; tone: ButtonTone; fill: ButtonFill } {
  const exhausted = entry.uses_per_day !== null && !entry.uses_remaining;
  if (exhausted) return { variant: "subtle", tone: "neutral", fill: "none" };
  if (entry.spell.level === 0) return { variant: "subtle", tone: "arcane", fill: "tone" };
  return { variant: "tinted", tone: "arcane", fill: "none" };
}

function castButtonTitle(entry: CharacterSpellEntry): string {
  if (entry.uses_per_day !== null && !entry.uses_remaining) return "No uses remaining";
  if (entry.uses_per_day === null) return "Cast at will (no spell slot)";
  return `Cast — use 1 of ${entry.uses_remaining} remaining`;
}

async function rollInnateDamage(entry: CharacterSpellEntry) {
  const spell = entry.spell;
  for (const dmg of spell.damage_rolls ?? []) {
    const parsed = parseExpression(dmg.dice);
    if (!parsed) {
      toast.error(`Cannot roll unsupported damage expression: ${dmg.dice}`);
      continue;
    }
    const typeLabel = dmg.type ? ` ${dmg.type}` : "";
    let label = `${spell.name} — ${dmg.dice}${typeLabel} damage`;
    if (spell.attack_type === "save" && spell.save_effect === "half") {
      label += ` (half on ${spell.save_attribute ?? "save"})`;
    }
    const counts = parsedToCounts(parsed.terms);
    if (Object.keys(counts).length === 0) {
      const { total, breakdown } = rollParsed(parsed);
      void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: true });
    } else {
      await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: true });
    }
  }
}

async function rollInnateHealing(entry: CharacterSpellEntry) {
  const dice = entry.spell.healing_dice;
  if (!dice) return;
  const parsed = parseExpression(dice);
  if (!parsed) {
    toast.error(`Cannot roll unsupported healing expression: ${dice}`);
    return;
  }
  const label = `${entry.spell.name} — ${dice} healing`;
  const counts = parsedToCounts(parsed.terms);
  if (Object.keys(counts).length === 0) {
    const { total, breakdown } = rollParsed(parsed);
    void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: false });
  } else {
    await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: false });
  }
}

async function castSpell(entry: CharacterSpellEntry) {
  if (!props.partyMemberId || isCasting.value) return;
  if (entry.uses_per_day !== null && !entry.uses_remaining) return;

  const spell = entry.spell;
  let concentrationState: ConcentrationState | null = null;
  if (spell.concentration && thisMember.value) {
    concentrationState = await prepareConcentration(thisMember.value, spell, { castAtLevel: spell.level });
    if (!concentrationState) return;
  }

  try {
    await commitCast({
      partyMemberId: props.partyMemberId,
      slotLevel: 0,
      pool: "feature",
      slotTemplate: thisMember.value?.spell_slots ?? [],
      concentrationState,
      characterSpellId: entry.id,
    });

    // Flavor message
    let text = `casts ${spell.name}`;
    const attackBonus = attackBonusFor(entry);
    const saveDc = saveDcFor(entry);
    if (spell.level > 0 && attackBonus !== null
      && (spell.attack_type === "ranged_spell" || spell.attack_type === "melee_spell")) {
      text += ` (Atk ${signedNum(attackBonus)})`;
    } else if (spell.level > 0 && saveDc !== null && spell.attack_type === "save") {
      text += ` (DC ${saveDc} ${spell.save_attribute ?? ""})`;
    }
    if (entry.source_label) text += ` [${entry.source_label}]`;
    await sendFlavorMessage(text, "spell");
    if (concentrationState) await sendFlavorMessage(`begins concentrating on ${spell.name}`, spell.name);

    if (spell.mechanics_reviewed !== false && spell.effects?.length) {
      openEffectResolution(entry);
    } else if (spell.mechanics_reviewed === false) {
      toast.info("Imported mechanics are unreviewed; resolve this spell manually from its rules text.");
    }

    if (!spell.effects?.length && spell.damage_rolls?.length && canAutoRollSpellEffect(spell.attack_type, "damage", spell.mechanics_reviewed !== false)) {
      await rollInnateDamage(entry);
    }
    if (!spell.effects?.length && spell.healing_dice && canAutoRollSpellEffect(spell.attack_type, "healing", spell.mechanics_reviewed !== false)) {
      await rollInnateHealing(entry);
    }

  } catch (error) {
    toast.error(toast.fromError(error));
  }
}

function handleRemove(entry: CharacterSpellEntry) {
  if (!props.partyMemberId) return;
  removeById({ id: entry.id, partyMemberId: props.partyMemberId });
}
</script>
