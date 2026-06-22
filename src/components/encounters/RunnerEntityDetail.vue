<template>
  <div v-if="selectedCombatant || selectedTrap" class="detail-panel">
    <div class="detail-header">
      <span class="detail-name">{{ selectedCombatant?.name ?? selectedTrap?.name }}</span>
      <button class="detail-close" @click="emit('close')">×</button>
    </div>

    <!-- Combatant detail (roll banner, modes, stat block) -->
    <template v-if="selectedCombatant">

    <!-- Roll result banner -->
    <RunnerRollBanner :last-check="lastCheck" />

    <!-- Roll mode + chat mode toggles -->
    <RunnerRollModeToggle
      :roll-mode="rollMode"
      :chat-mode="chatMode"
      @update:roll-mode="rollMode = $event"
      @update:chat-mode="chatMode = $event"
    />

    <!-- Monster -->
    <RunnerMonsterPanel
      v-if="selectedCombatant.type === 'monster' && selectedMonster"
      :combatant="selectedCombatant"
      :monster="selectedMonster"
      @roll-check="performCheck"
      @roll-attack="rollAttack"
      @roll-damage="rollActionDamage"
      @spend-legendary="store.spendLegendaryActions(selectedCombatant!.instance_id, $event)"
    />

    <!-- NPC -->
    <RunnerNpcPanel
      v-else-if="selectedCombatant.type === 'monster' && selectedNpc"
      :combatant="selectedCombatant"
      :npc="selectedNpc"
      @roll-check="performCheck"
      @roll-attack="rollAttack"
      @roll-damage="rollActionDamage"
    />

    <!-- Companion -->
    <RunnerCompanionPanel
      v-else-if="selectedCombatant.type === 'player' && selectedCompanion"
      :combatant="selectedCombatant"
      :companion="selectedCompanion"
      @roll-check="performCheck"
      @roll-attack="rollAttack"
      @roll-damage="rollActionDamage"
    />

    <!-- Player -->
    <RunnerPcPanel
      v-else-if="selectedCombatant.type === 'player' && selectedMember"
      :combatant="selectedCombatant"
      :member="selectedMember"
      :monsters="props.monsters"
      @roll-check="performCheck"
      @roll-attack="rollAttack"
      @roll-damage="rollActionDamage"
      @roll-spell="rollSpellDamage"
      @roll-spell-save="announceSpellSave"
    />

    <template v-else>
      <div class="detail-scroll">
        <p class="detail-empty">No stat block available.</p>
      </div>
    </template>

    </template><!-- end v-if="selectedCombatant" -->

    <!-- Trap detail -->
    <template v-else-if="selectedTrap">
      <div class="detail-scroll">
        <span class="trap-type" :style="{ color: trapTypeColor(selectedTrap.trap_type) }">{{ selectedTrap.trap_type }}</span>
        <span v-if="selectedTrap.trigger_type" class="detail-meta"> · {{ selectedTrap.trigger_type }}</span>

        <!-- Roll result banner (reused) -->
        <RunnerRollBanner :last-check="lastCheck" />

        <div class="detail-divider" />

        <!-- DCs -->
        <div class="detail-stats">
          <div v-if="selectedTrap.detection_dc" class="detail-stat">
            <span>Detect DC</span>
            <strong>{{ selectedTrap.detection_dc }}</strong>
          </div>
          <div v-if="selectedTrap.disarm_dc" class="detail-stat">
            <span>Disarm DC</span>
            <strong>{{ selectedTrap.disarm_dc }}</strong>
          </div>
          <div v-if="selectedTrap.trap_ac" class="detail-stat">
            <span>AC</span>
            <strong>{{ selectedTrap.trap_ac }}</strong>
          </div>
          <div v-if="selectedTrap.trap_hp" class="detail-stat">
            <span>HP</span>
            <strong>{{ selectedTrap.trap_hp }}</strong>
          </div>
        </div>

        <!-- Roll buttons -->
        <div class="detail-divider" />
        <div class="detail-check-grid">
          <button
            v-if="selectedTrap.detection_dc"
            type="button"
            class="detail-check-btn"
            @click="performCheck(0, 'Perception (Detection)')"
          >
            <span>Detect</span>
            <em>DC {{ selectedTrap.detection_dc }}</em>
          </button>
          <button
            v-if="selectedTrap.disarm_dc"
            type="button"
            class="detail-check-btn"
            @click="performCheck(0, 'Thieves\' Tools (Disarm)')"
          >
            <span>Disarm</span>
            <em>DC {{ selectedTrap.disarm_dc }}</em>
          </button>
          <button
            v-if="selectedTrap.attack_bonus != null"
            type="button"
            class="detail-check-btn trait-atk-btn"
            @click="rollAttack(selectedTrap.attack_bonus!, 'Trap Attack')"
          >
            <span>Attack</span>
            <em>{{ selectedTrap.attack_bonus! >= 0 ? '+' : '' }}{{ selectedTrap.attack_bonus }}</em>
          </button>
          <button
            v-if="selectedTrap.save_dc && selectedTrap.save_type"
            type="button"
            class="detail-check-btn"
            @click="performCheck(0, selectedTrap.save_type + ' Save (Trap)')"
          >
            <span>{{ selectedTrap.save_type }} Save</span>
            <em>DC {{ selectedTrap.save_dc }}</em>
          </button>
        </div>

        <!-- Damage -->
        <template v-if="selectedTrap.damage_entries?.length">
          <div class="detail-divider" />
          <p class="detail-section-label">Damage</p>
          <div class="flex flex-col gap-1 mt-1">
            <div
              v-for="(entry, i) in selectedTrap.damage_entries"
              :key="i"
              class="flex items-center gap-2"
            >
              <span class="font-cinzel text-sm font-bold text-foreground">{{ entry.dice }}</span>
              <span v-if="entry.type" class="font-fell text-xs text-muted-foreground italic capitalize">{{ entry.type }}</span>
              <button
                v-if="hasRollableDice(entry.dice)"
                type="button"
                class="trait-roll-btn trait-dmg-btn ml-auto"
                @click="rollActionDamage(entry.dice, selectedTrap.name)"
              >🎲 {{ actionDiceLabel(entry.dice) }}</button>
            </div>
          </div>
        </template>

        <!-- Effect description -->
        <template v-if="selectedTrap.effect_description">
          <div class="detail-divider" />
          <p class="detail-section-label">Effect</p>
          <p class="detail-trait-desc font-fell text-xs text-muted-foreground leading-relaxed">
            <span v-html="renderTraitDesc(selectedTrap.effect_description)"></span>
          </p>
        </template>

        <!-- Notes -->
        <template v-if="selectedTrap.notes">
          <div class="detail-divider" />
          <p class="detail-notes"><span v-html="renderTraitDesc(selectedTrap.notes)"></span></p>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { supabase } from "@/lib/supabase";
import RunnerRollBanner from "@/components/encounters/RunnerRollBanner.vue";
import type { CheckResult } from "@/components/encounters/RunnerRollBanner.vue";
import RunnerRollModeToggle from "@/components/encounters/RunnerRollModeToggle.vue";
import type { CheckMode, ChatMode } from "@/components/encounters/RunnerRollModeToggle.vue";
import RunnerMonsterPanel from "@/components/encounters/RunnerMonsterPanel.vue";
import RunnerNpcPanel from "@/components/encounters/RunnerNpcPanel.vue";
import RunnerCompanionPanel from "@/components/encounters/RunnerCompanionPanel.vue";
import RunnerPcPanel from "@/components/encounters/RunnerPcPanel.vue";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useCompanions } from "@/composables/useCompanions";
import { TRAP_TYPE_COLORS } from "@/types/trap.types";
import { useCampaignStore } from "@/stores/campaign";
import { parseExpression } from "@/lib/dice";
import { rollParsed } from "@/lib/roller";
import type { DieSize, RollResult } from "@/lib/roller";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import type { Spell as SpellType } from "@/types/spell.types";
import { useAuthStore } from "@/stores/auth";
import { renderTiptapHtml } from "@/lib/renderTiptap";

const props = defineProps<{
  selectedId: string | null;
  selectedTrapId: string | null;
  monsters: Monster[];
  partyMembers: PartyMember[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const store = useEncounterRunStore();
const campaign = useCampaignStore();
const auth = useAuthStore();
const { data: companions } = useCompanions();

// ── Trap detail ───────────────────────────────────────────────────────────────

const selectedTrap = computed(() =>
  store.traps.find((t) => t.id === props.selectedTrapId) ?? null,
);

// ── Roll check state ──────────────────────────────────────────────────────────

const chatMode = ref<ChatMode>("public");
const rollMode = ref<CheckMode>("normal");
const lastCheck = ref<CheckResult | null>(null);

const { promptRoll } = usePromptedRoll();

async function performCheck(modifier: number, label: string): Promise<RollResult | null> {
  const senderName = selectedCombatant.value?.name ?? "Encounter";
  const silent = chatMode.value === "silent";
  const r = await promptRoll({
    counts: { 20: 1 },
    modifier,
    label,
    mode: rollMode.value,
    senderName,
    silent,
  });
  if (!r) return null;
  const kept = r.breakdown.find((d) => !d.dropped)!;
  const dropped = r.breakdown.find((d) => d.dropped);
  lastCheck.value = {
    total: r.total,
    label,
    modifier,
    d20: kept.val,
    dropped: dropped?.val,
    isCrit: r.isCrit,
    isFumble: r.isFumble,
  };
  return r;
}

// ── Action roll helpers ───────────────────────────────────────────────────────

function hasRollableDice(desc: string): boolean {
  const parsed = parseExpression(desc);
  return !!parsed && parsed.terms.length > 0;
}

function actionDiceLabel(desc: string): string {
  const parsed = parseExpression(desc);
  if (!parsed || !parsed.terms.length) return "";
  const diceStr = parsed.terms.map((t) => `${t.count}d${t.sides}`).join("+");
  const mod = parsed.modifier;
  return diceStr + (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : "");
}

async function postRollToChat(
  label: string,
  total: number,
  breakdown: { val: number; dropped: boolean }[],
  modifier: number,
  isCrit: boolean,
  isFumble: boolean,
  senderName: string,
) {
  if (!campaign.activeCampaignId || !auth.user?.id) return;
  if (chatMode.value === "silent") return;

  try {
    await supabase.from("campaign_messages").insert({
      campaign_id: campaign.activeCampaignId,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName,
      message: `rolled ${label} = ${total}`,
      type: "roll",
      metadata: { label, total, breakdown, modifier, isCrit, isFumble },
    });
  } catch {
  }
}

function rollAttack(attackBonus: number, actionName: string) {
  void performCheck(attackBonus, actionName + " Attack");
}

function parsedTermsToCounts(terms: { count: number; sides: number }[]): Partial<Record<DieSize, number>> {
  const counts: Partial<Record<DieSize, number>> = {};
  for (const t of terms) {
    if ([4, 6, 8, 10, 12, 20, 100].includes(t.sides)) {
      const k = t.sides as DieSize;
      counts[k] = (counts[k] ?? 0) + t.count;
    }
  }
  return counts;
}

async function rollActionDamage(desc: string, actionName: string) {
  const parsed = parseExpression(desc);
  if (!parsed || !parsed.terms.length) return;
  const label = `${actionName} (${actionDiceLabel(desc)})`;
  const counts = parsedTermsToCounts(parsed.terms);
  const r = await promptRoll({
    counts,
    modifier: parsed.modifier,
    label,
    senderName: selectedCombatant.value?.name ?? "Encounter",
    silent: chatMode.value === "silent",
  });
  if (!r) return;
  lastCheck.value = { total: r.total, label, modifier: parsed.modifier, d20: r.breakdown[0]?.val ?? r.total, isCrit: false, isFumble: false };
}

async function rollSpellDamage(spell: SpellType) {
  const rolls = spell.damage_rolls;
  if (!rolls?.length) return;
  const combined = rolls.reduce<{ terms: { count: number; sides: number }[]; modifier: number }>(
    (acc, roll) => {
      const parsed = parseExpression(roll.dice);
      if (parsed) { acc.terms.push(...parsed.terms); acc.modifier += parsed.modifier; }
      return acc;
    },
    { terms: [], modifier: 0 },
  );
  const diceLabel = rolls.map((r) => `${r.dice}${r.type ? " " + r.type : ""}`).join(" + ");
  const label = `${spell.name} (${diceLabel})`;
  const counts = parsedTermsToCounts(combined.terms);
  if (Object.keys(counts).length === 0) {
    const { total, breakdown } = rollParsed(combined);
    lastCheck.value = { total, label, modifier: 0, d20: breakdown[0]?.val ?? total, isCrit: false, isFumble: false };
    void postRollToChat(label, total, breakdown, 0, false, false, selectedMember.value?.name ?? "Player");
    return;
  }
  const r = await promptRoll({
    counts,
    modifier: combined.modifier,
    label,
    senderName: selectedMember.value?.name ?? "Player",
    silent: chatMode.value === "silent",
  });
  if (!r) return;
  lastCheck.value = { total: r.total, label, modifier: 0, d20: r.breakdown[0]?.val ?? r.total, isCrit: false, isFumble: false };
}

/** Announce a spell's saving throw (DC + ability) into chat so the table can roll against it. */
async function announceSpellSave(spell: SpellType, dc: number) {
  if (!campaign.activeCampaignId || !auth.user?.id) return;
  if (chatMode.value === "silent") return;
  const ability = spell.save_attribute ?? "";
  const effect =
    spell.save_effect === "half" ? " (half on save)"
    : spell.save_effect === "negates" ? " (negates on save)"
    : "";
  try {
    await supabase.from("campaign_messages").insert({
      campaign_id: campaign.activeCampaignId,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: selectedMember.value?.name ?? selectedCombatant.value?.name ?? "Player",
      message: `casts ${spell.name} — DC ${dc} ${ability} saving throw${effect}`,
      type: "system",
      metadata: null,
    });
  } catch {
    // best-effort announcement
  }
}

// ── Combatant selection ───────────────────────────────────────────────────────

const selectedCombatant = computed(() =>
  store.sortedCombatants.find((c) => c.instance_id === props.selectedId) ?? null,
);

const selectedMonster = computed(() => {
  if (!selectedCombatant.value?.monster_id) return null;
  return props.monsters.find((m) => m.id === selectedCombatant.value!.monster_id) ?? null;
});

const selectedNpc = computed(() => {
  if (!selectedCombatant.value?.npc_id) return null;
  return store.availableNpcs.find((n) => n.id === selectedCombatant.value!.npc_id) ?? null;
});

const selectedMember = computed(() => {
  if (!selectedCombatant.value?.party_member_id) return null;
  return props.partyMembers.find((m) => m.id === selectedCombatant.value!.party_member_id) ?? null;
});

const selectedCompanion = computed(() => {
  const cid = selectedCombatant.value?.companion_id;
  if (!cid) return null;
  return companions.value?.find((c) => c.id === cid) ?? null;
});

// ── Trap helper ───────────────────────────────────────────────────────────────

function trapTypeColor(trapType: string): string {
  return TRAP_TYPE_COLORS[trapType as keyof typeof TRAP_TYPE_COLORS] ?? "#3D3D3D";
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderTraitDesc(desc: string): string {
  return renderTiptapHtml(desc);
}
</script>

<style scoped>
@reference "@/assets/main.css";

/* ── Detail panel ─────────────────────────────────────────────────────────── */

.detail-panel {
  @apply w-full bg-card flex flex-col overflow-hidden;
}

@media (max-width: 639px) {
  .detail-panel {
    position: absolute;
    inset: 0;
    width: 100%;
    z-index: 10;
    border-left: none;
  }
}

.detail-header {
  @apply flex items-center justify-between px-3 py-2 border-b border-border shrink-0;
}

.detail-name {
  @apply font-cinzel text-sm font-bold text-foreground truncate;
}

.detail-close {
  @apply text-muted-foreground hover:text-foreground transition-colors text-xl leading-none shrink-0 ml-2;
}

.detail-scroll {
  @apply flex-1 overflow-y-auto p-3 flex flex-col gap-2;
}

.detail-meta {
  @apply font-fell text-xs text-muted-foreground italic capitalize;
}

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-stats {
  @apply grid grid-cols-2 gap-1;
}

.detail-stat {
  @apply flex flex-col bg-muted/40 rounded px-2 py-1;
}

.detail-stat span {
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase;
}

.detail-stat strong {
  @apply font-cinzel text-sm font-bold text-foreground;
}

.detail-check-grid {
  @apply grid grid-cols-2 gap-1;
}

.detail-check-btn {
  @apply flex items-center justify-between bg-muted/30 rounded px-2 py-1 hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-colors cursor-pointer;
}

.detail-check-btn span {
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase truncate;
}

.detail-check-btn em {
  @apply font-cinzel text-xs font-bold not-italic text-foreground shrink-0 ml-1;
}

.detail-section-label {
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase mt-1;
}

.trait-roll-btn {
  @apply inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold tracking-wider cursor-pointer transition-colors whitespace-nowrap;
}

.trait-atk-btn {
  @apply bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25;
}

.trait-dmg-btn {
  @apply bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25;
}

.detail-trait-desc {
  @apply font-fell text-xs text-muted-foreground leading-relaxed;
}

.detail-notes {
  @apply font-fell text-xs text-muted-foreground italic;
}

.detail-empty {
  @apply font-fell text-sm text-muted-foreground italic text-center py-8;
}

/* Trap type label in detail panel */
.trap-type {
  font-family: var(--font-fell, serif);
  font-size: 10px;
  font-weight: 500;
}
</style>
