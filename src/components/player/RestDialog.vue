<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="mode"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div
          class="relative w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl"
        >
          <!-- Header -->
          <div
            class="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-border"
          >
            <div
              class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary"
            >
              <Moon v-if="mode === 'short'" class="h-4.5 w-4.5" />
              <Sun v-else class="h-4.5 w-4.5" />
            </div>
            <h2
              class="font-cinzel text-sm font-bold text-foreground tracking-wide"
            >
              {{ mode === "short" ? "Short Rest" : "Long Rest" }}
            </h2>
          </div>

          <!-- Body -->
          <div class="px-5 py-4 space-y-4">
            <!-- HP bar -->
            <div class="space-y-1">
              <div class="flex items-baseline justify-between">
                <span
                  class="font-cinzel text-xs text-muted-foreground tracking-wider"
                  >HP</span
                >
                <span class="font-cinzel text-sm font-bold" :class="hpColor">
                  {{ previewHp }}
                  <span
                    class="font-fell text-xs text-muted-foreground font-normal"
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
                  class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
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
                  <button
                    type="button"
                    class="flex-1 cursor-pointer rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-cinzel text-xs text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="
                      remainingAfterSpend <= 0 || previewHp >= member.max_hp
                    "
                    @click="rollHitDie"
                  >
                    Roll d{{ hitDie }} ({{ abilityModifier(props.member.con) }})
                  </button>
                </div>

                <!-- Roll history -->
                <div v-if="rolls.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="(roll, i) in rolls"
                    :key="i"
                    class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-elven-green/15 text-elven-green border border-elven-green/30"
                    >+{{ roll }}</span
                  >
                  <span
                    class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-elven-green/10 text-elven-green/80 border border-elven-green/20"
                  >
                    = {{ totalHealing }} hp healed
                  </span>
                </div>
              </template>

              <!-- Long rest: show dice recovery -->
              <template v-else>
                <p class="font-fell text-xs text-muted-foreground italic">
                  You regain {{ diceRecovered }} expended hit
                  {{ diceRecovered === 1 ? "die" : "dice" }} after sleeping.
                </p>
              </template>
            </div>

            <!-- Long rest summary -->
            <div
              v-if="mode === 'long'"
              class="space-y-1 text-xs font-fell text-muted-foreground"
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
          <div class="flex justify-end gap-2 px-5 pb-5">
            <button
              type="button"
              class="cursor-pointer px-4 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="cursor-pointer px-4 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wider hover:opacity-90 transition-opacity"
              @click="confirm"
            >
              {{ mode === "short" ? "Finish Rest" : "Sleep" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Moon, Sun } from "lucide-vue-next";
import type { PartyMember, PartyMemberUpdate } from "@/types/party.types";
import { getSlotRecovery, getHitDie } from "@/types/spell.types";
import { useClassByName } from "@/composables/useCustomClasses";
import { abilityModifier } from "@/lib/utils";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { restoreInnateUses } from "@/composables/useCharacterSpells";
import type { DieSize } from "@/lib/dice";

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
  const restType = props.mode === "long" ? "long" : "short";
  void restoreInnateUses(props.member.id, restType);

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

    // Restore short-rest class resources
    const updatedResources = { ...props.member.class_resources };
    for (const key of Object.keys(updatedResources)) {
      if (updatedResources[key].rest === "short") {
        updatedResources[key] = {
          ...updatedResources[key],
          current: updatedResources[key].max,
        };
      }
    }
    if (Object.keys(updatedResources).length)
      update.class_resources = updatedResources;

    // Warlock pact slot recovery
    if ((classData.value?.slot_recovery ?? getSlotRecovery(props.member.class)) === "short") {
      update.spell_slots = props.effectiveSpellSlots.map((s) => ({
        ...s,
        used: 0,
      }));
    }

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

    // All class resources
    const updatedResources = { ...props.member.class_resources };
    for (const key of Object.keys(updatedResources)) {
      updatedResources[key] = {
        ...updatedResources[key],
        current: updatedResources[key].max,
      };
    }
    if (Object.keys(updatedResources).length)
      update.class_resources = updatedResources;

    // All spell slots
    update.spell_slots = props.effectiveSpellSlots.map((s) => ({
      ...s,
      used: 0,
    }));

    // Wild Shape: revert active form and reset uses
    update.wildshapes_used = 0;
    update.wildshape_state = null;
  }

  emit("confirm", update);
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative {
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
