<template>
  <div>
    <!-- Empty state -->
    <div
      v-if="!innateEntries.length"
      class="rounded-lg border border-border bg-card px-5 py-8 text-center space-y-2"
    >
      <Sparkles class="h-8 w-8 mx-auto text-muted-foreground/60" />
      <p class="font-cinzel text-sm font-semibold text-foreground">No innate spells</p>
      <p class="font-fell text-sm text-muted-foreground max-w-sm mx-auto">
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
          <ChevronRight
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform"
            :class="ui.playerInnateOpenSources.includes(group.label) ? 'rotate-90' : ''"
          />
          <span class="font-cinzel text-xs font-bold tracking-wider text-foreground">
            {{ group.label }}
          </span>
          <span class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20">
            {{ SOURCE_TYPE_LABELS[group.entries[0].source_type] ?? group.entries[0].source_type }}
          </span>
          <span class="ml-auto font-cinzel text-[10px] text-muted-foreground tracking-wider">
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
              :style="{ backgroundColor: SCHOOL_COLORS[entry.spell.school] }"
            />

            <!-- Spell name -->
            <button
              class="flex-1 font-fell text-sm text-foreground hover:text-primary transition-colors min-w-0 truncate text-left"
              @click.stop="selectedSpell = entry.spell"
            >
              {{ entry.spell.name }}
            </button>

            <!-- Concentration / ritual badges -->
            <span
              v-if="entry.spell.ritual"
              class="shrink-0 font-cinzel text-[10px] tracking-wider text-muted-foreground border border-border rounded px-1"
            >R</span>
            <span
              v-if="entry.spell.concentration"
              class="shrink-0 font-cinzel text-[10px] tracking-wider text-primary/70 border border-primary/30 rounded px-1"
            >C</span>

            <!-- Attack / save info -->
            <span
              v-if="entry.spell.level > 0 && spellAttackBonus !== null && (entry.spell.attack_type === 'ranged_spell' || entry.spell.attack_type === 'melee_spell')"
              class="shrink-0 font-cinzel text-[10px] text-muted-foreground"
            >Atk {{ signedNum(spellAttackBonus) }}</span>
            <span
              v-else-if="entry.spell.level > 0 && spellSaveDc !== null && entry.spell.attack_type === 'save'"
              class="shrink-0 font-cinzel text-[10px] text-muted-foreground"
            >DC {{ spellSaveDc }}</span>

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
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                {{ entry.uses_remaining ?? 0 }}/{{ entry.uses_per_day }}
              </span>
            </template>
            <span
              v-else
              class="shrink-0 font-cinzel text-[10px] tracking-wider text-emerald-500/70 border border-emerald-500/20 rounded px-1.5 py-0.5"
            >At will</span>

            <!-- Cast button -->
            <button
              class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded font-cinzel text-[10px] font-semibold tracking-wider transition-colors border"
              :class="castButtonClass(entry)"
              :disabled="isCasting || (entry.uses_per_day !== null && !entry.uses_remaining)"
              :title="castButtonTitle(entry)"
              @click="castSpell(entry)"
            >
              <Wand2 class="h-3 w-3" />
              Cast
            </button>

            <!-- Remove button -->
            <button
              class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 p-1 rounded cursor-pointer shrink-0"
              title="Remove innate spell"
              :disabled="isRemoving"
              @click="handleRemove(entry)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <PlayerSpellModal :spell="selectedSpell" @close="selectedSpell = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronRight, Wand2, X, Sparkles } from "lucide-vue-next";
import {
  useCharacterSpellsWithDetails,
  useRemoveCharacterSpellById,
  useSpendInnateUse,
} from "@/composables/useCharacterSpells";
import { useParty } from "@/composables/useParty";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useConcentration } from "@/composables/useConcentration";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useUiStore } from "@/stores/ui";
import { SCHOOL_COLORS } from "@/types/spell.types";
import { parseExpression, parsedToCounts } from "@/lib/dice";
import { rollParsed } from "@/lib/roller";
import { signedNum } from "@/lib/utils";
import type { CharacterSpellEntry, Spell } from "@/types/spell.types";
import PlayerSpellModal from "@/components/spells/PlayerSpellModal.vue";

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

const { data: allEntries } = useCharacterSpellsWithDetails(
  computed(() => props.partyMemberId),
);
const { mutate: removeById, isPending: isRemoving } = useRemoveCharacterSpellById();
const { mutate: spendUse, isPending: isCasting } = useSpendInnateUse();
const { sendFlavorMessage, sendRoll } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();
const { data: partyList } = useParty();
const { startConcentration } = useConcentration();

const thisMember = computed(() =>
  props.partyMemberId && partyList.value
    ? (partyList.value.find((m) => m.id === props.partyMemberId) ?? null)
    : null,
);

const selectedSpell = ref<Spell | null>(null);

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

function castButtonClass(entry: CharacterSpellEntry): string {
  const exhausted = entry.uses_per_day !== null && !entry.uses_remaining;
  if (exhausted) return "bg-muted/30 border-border/50 text-muted-foreground/40 cursor-not-allowed";
  if (entry.spell.level === 0) {
    return "bg-muted/50 border-border text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30";
  }
  return "bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20";
}

function castButtonTitle(entry: CharacterSpellEntry): string {
  if (entry.uses_per_day !== null && !entry.uses_remaining) return "No uses remaining";
  if (entry.uses_per_day === null) return "Cast at will (no spell slot)";
  return `Cast — use 1 of ${entry.uses_remaining} remaining`;
}

async function castSpell(entry: CharacterSpellEntry) {
  if (!props.partyMemberId || isCasting.value) return;
  if (entry.uses_per_day !== null && !entry.uses_remaining) return;

  const spell = entry.spell;

    // Concentration guard
    if (spell.concentration && thisMember.value) {
      const ok = await startConcentration(thisMember.value, spell, { castAtLevel: spell.level });
      if (!ok) return;
    }

    // Flavor message
    let text = `${props.memberName} casts ${spell.name}`;
    if (spell.level > 0 && props.spellAttackBonus !== null
      && (spell.attack_type === "ranged_spell" || spell.attack_type === "melee_spell")) {
      text += ` (Atk ${signedNum(props.spellAttackBonus)})`;
    } else if (spell.level > 0 && props.spellSaveDc !== null && spell.attack_type === "save") {
      text += ` (DC ${props.spellSaveDc} ${spell.save_attribute ?? ""})`;
    }
    if (entry.source_label) text += ` [${entry.source_label}]`;
    await sendFlavorMessage(text, "spell");

    // Auto-roll damage
    if (spell.damage_rolls?.length) {
      for (const dmg of spell.damage_rolls) {
        const parsed = parseExpression(dmg.dice);
        if (!parsed) continue;
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

    // Auto-roll healing
    if (spell.healing_dice) {
      const parsed = parseExpression(spell.healing_dice);
      if (parsed) {
        const label = `${spell.name} — ${spell.healing_dice} healing`;
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: true });
        } else {
          await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: true });
        }
      }
    }

    // Spend a use (if limited)
    if (entry.uses_per_day !== null && entry.uses_remaining !== null && entry.uses_remaining > 0) {
      spendUse({
        id: entry.id,
        partyMemberId: props.partyMemberId,
        newRemaining: entry.uses_remaining - 1,
      });
    }
}

function handleRemove(entry: CharacterSpellEntry) {
  if (!props.partyMemberId) return;
  removeById({ id: entry.id, partyMemberId: props.partyMemberId });
}
</script>
