<template>
  <AppModal
    :open="mode !== null"
    size="sm"
    @close="$emit('close')"
  >
    <ModalHeader
      :title="mode === 'short' ? 'Short Rest' : 'Long Rest'"
      :icon="mode === 'short' ? IconMoon : IconSun"
      tone="primary"
    />

    <!-- Body -->
    <!-- Scrolls because the shell caps the panel at the viewport where the old
         hand-rolled panel overflowed it: a long rest lists every resource it
         restores, so the Sleep button must stay reachable on a short screen. -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
      <!-- HP bar -->
      <div class="space-y-1">
        <div class="flex items-baseline justify-between">
          <span
            class="text-label-lg text-muted-foreground"
            >HP</span
          >
          <span class="font-cinzel text-sm font-bold" :class="hpColor">
            {{ previewHp }}
            <span
              class="text-caption text-muted-foreground font-normal"
              >/ {{ member.max_hp }}</span
            >
          </span>
        </div>
        <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="hpBarColor"
            :style="{ width: `${previewHpPct}%` }"
          />
        </div>
      </div>

      <!-- Hit dice section -->
      <div
        class="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
      >
        <div class="flex items-center justify-between">
          <span
            class="text-label-lg font-semibold text-muted-foreground"
            >HIT DICE</span
          >
          <span class="font-cinzel text-xs text-foreground">
            {{ remainingAfterSpend }} / {{ member.level }}
            <span class="text-muted-foreground">(d{{ hitDie }})</span>
          </span>
        </div>

        <!-- Short rest: spend dice -->
        <template v-if="mode === 'short'">
          <div class="flex items-center gap-2">
            <AppButton
              variant="tinted"
              tone="primary"
              emphasis="soft"
              size="sm"
              class="flex-1"
              :disabled="
                remainingAfterSpend <= 0 || previewHp >= member.max_hp
              "
              :label="`Roll d${hitDie} (${abilityModifier(props.member.con)})`"
              @click="rollHitDie"
            />
          </div>

          <!-- Roll history -->
          <div v-if="rolls.length" class="flex flex-wrap gap-1">
            <span
              v-for="(roll, i) in rolls"
              :key="i"
              class="font-cinzel text-2xs px-1.5 py-0.5 rounded bg-elven-green/15 text-elven-green border border-elven-green/30"
              >+{{ roll }}</span
            >
            <span
              class="font-cinzel text-2xs px-1.5 py-0.5 rounded bg-elven-green/10 text-elven-green/80 border border-elven-green/20"
            >
              = {{ totalHealing }} hp healed
            </span>
          </div>
        </template>

        <!-- Long rest: show dice recovery -->
        <template v-else>
          <p class="text-caption text-muted-foreground italic">
            You regain {{ diceRecovered }} expended hit
            {{ diceRecovered === 1 ? "die" : "dice" }} after sleeping.
          </p>
        </template>
      </div>

      <!-- Long rest summary -->
      <div
        v-if="mode === 'long'"
        class="space-y-1 text-caption text-muted-foreground"
      >
        <p class="flex items-center gap-1.5">
          <span class="text-elven-green">✓</span> Full HP restored
        </p>
        <p
          v-if="hasShortRestResources || hasLongRestResources"
          class="flex items-center gap-1.5"
        >
          <span class="text-elven-green">✓</span> All class resources
          restored
        </p>
        <p v-if="hasSpellSlots" class="flex items-center gap-1.5">
          <span class="text-elven-green">✓</span> All spell slots restored
        </p>
        <p class="flex items-center gap-1.5">
          <span class="text-elven-green">✓</span> Innate spell uses restored
        </p>
        <p v-if="(member.wildshapes_used ?? 0) > 0 || member.wildshape_state" class="flex items-center gap-1.5">
          <span class="text-elven-green">✓</span> Wild Shape uses restored
        </p>
        <p class="flex items-center gap-1.5">
          <span class="text-elven-green">✓</span> Death saves cleared
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5">
      <AppButton
        variant="subtle"
        size="sm"
        label="Cancel"
        @click="$emit('close')"
      />
      <AppButton
        variant="primary"
        size="sm"
        :label="mode === 'short' ? 'Finish Rest' : 'Sleep'"
        @click="confirm"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconMoon, IconSun } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import type { PartyMember, PartyMemberUpdate } from "@/types/party.types";
import { getHitDie } from "@/types/spell.types";
import { useClassByName } from "@/composables/useCustomClasses";
import { abilityModifier } from "@/lib/utils";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { getExhaustionLevel, setExhaustionLevel } from "@/rules/conditions";
import type { DieSize } from "@/lib/dice/dice";

const props = defineProps<{
  member: PartyMember;
  mode: "short" | "long" | null;
  effectiveSpellSlots: { level: number; max: number; used: number }[];
}>();

const emit = defineEmits<{
  close: [];
  confirm: [update: PartyMemberUpdate];
}>();

const memberClassRef = computed(() => props.member.class ?? "");
const classData = useClassByName(memberClassRef);

// ── Hit dice ──────────────────────────────────────────────────────────────────

const hitDie = computed(() => classData.value?.hit_die ?? getHitDie(props.member.class));
const conMod = computed(() => Math.floor((props.member.con - 10) / 2));
const hitDiceRemaining = computed(
  () => props.member.hit_dice_remaining ?? props.member.level,
);

// Dice recovered on long rest = floor(level / 2), min 1
const diceRecovered = computed(() =>
  Math.min(
    props.member.level - hitDiceRemaining.value, // can't exceed spent dice
    Math.max(1, Math.floor(props.member.level / 2)),
  ),
);

// ── Short rest roll state ─────────────────────────────────────────────────────

const rolls = ref<number[]>([]);

const totalHealing = computed(() => rolls.value.reduce((s, r) => s + r, 0));
const diceSpent = computed(() => rolls.value.length);
const remainingAfterSpend = computed(
  () => hitDiceRemaining.value - diceSpent.value,
);

const { promptRoll } = usePromptedRoll();

async function rollHitDie() {
  const r = await promptRoll({
    counts: { [hitDie.value as DieSize]: 1 },
    modifier: conMod.value,
    label: `Hit Die (1d${hitDie.value}+${conMod.value})`,
    silent: true,
  });
  if (r) rolls.value.push(Math.max(1, r.total));
}

// ── HP preview ────────────────────────────────────────────────────────────────

const previewHp = computed(() => {
  if (props.mode === "long") return props.member.max_hp;
  return Math.min(
    props.member.max_hp,
    props.member.current_hp + totalHealing.value,
  );
});

const previewHpPct = computed(() =>
  props.member.max_hp === 0
    ? 0
    : Math.min(100, (previewHp.value / props.member.max_hp) * 100),
);

const hpColor = computed(() => {
  const p = previewHpPct.value;
  if (p <= 0) return "text-destructive";
  if (p < 33) return "text-destructive";
  if (p < 66) return "text-amber-400";
  return "text-elven-green";
});

const hpBarColor = computed(() => {
  const p = previewHpPct.value;
  if (p <= 0) return "bg-muted-foreground/40";
  if (p < 33) return "bg-destructive";
  if (p < 66) return "bg-amber-500";
  return "bg-elven-green";
});

// ── Resource checks ───────────────────────────────────────────────────────────

const hasShortRestResources = computed(() =>
  Object.values(props.member.class_resources ?? {}).some(
    (r) => r.rest === "short",
  ),
);
const hasLongRestResources = computed(() =>
  Object.values(props.member.class_resources ?? {}).some(
    (r) => r.rest === "long",
  ),
);
const hasSpellSlots = computed(() => props.effectiveSpellSlots.length > 0);

// ── Confirm ───────────────────────────────────────────────────────────────────

function confirm() {
  const update: PartyMemberUpdate = {};
  if (props.mode === "short") {
    // HP from hit dice
    if (totalHealing.value > 0) {
      update.current_hp = Math.min(
        props.member.max_hp,
        props.member.current_hp + totalHealing.value,
      );
    }
    // Hit dice spent
    update.hit_dice_remaining = remainingAfterSpend.value;

    // Spell slots and class resources are restored server-side by
    // useTakeSpellcastingRest (RestButtons.onRestConfirm) — not emitted here.

    // Wild Shape recharges on short rest (5e RAW)
    update.wildshapes_used = 0;
  } else {
    // Long rest — restore everything
    update.current_hp = props.member.max_hp;
    update.temp_hp = 0;
    update.death_save_successes = 0;
    update.death_save_failures = 0;
    update.hit_dice_remaining = Math.min(
      props.member.level,
      hitDiceRemaining.value + diceRecovered.value,
    );

    // All class resources and spell slots are restored server-side by
    // useTakeSpellcastingRest (RestButtons.onRestConfirm) — not emitted here.

    // Wild Shape: revert active form and reset uses
    update.wildshapes_used = 0;
    update.wildshape_state = null;

    // Exhaustion: long rest reduces level by 1 (SRD 5e)
    const exhaustionLevel = getExhaustionLevel(props.member.conditions);
    if (exhaustionLevel > 0) {
      update.conditions = setExhaustionLevel(props.member.conditions, exhaustionLevel - 1);
    }
  }

  emit("confirm", update);
}
</script>
