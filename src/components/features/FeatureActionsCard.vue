<template>
  <div v-if="groups.length" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">Feature actions</p>
    </div>
    <div class="divide-y divide-border">
      <section v-for="group in groups" :key="group.activation" :aria-label="group.label">
        <p class="px-4 pt-2.5 pb-1 text-label font-semibold text-primary/80">{{ group.label }}</p>
        <ul>
          <li
            v-for="entry in group.entries"
            :key="`${entry.featureId}:${entry.name}`"
            class="flex items-center gap-x-3 gap-y-1 px-4 py-2 flex-wrap"
          >
            <div class="min-w-0 flex-1 basis-40">
              <p class="text-body text-foreground leading-snug">{{ rowName(entry) }}</p>
              <p v-if="entry.spends" class="text-caption leading-snug" :class="reasonFor(entry) ? 'text-destructive' : 'text-muted-foreground'">
                {{ reasonFor(entry) ?? costNote(entry.spends) }}
              </p>
            </div>

            <template v-if="entry.toggleKey">
              <span v-if="readonly" class="text-label-lg shrink-0" :class="uses.isOn(entry.toggleKey) ? 'text-primary' : 'text-muted-foreground'">
                {{ uses.isOn(entry.toggleKey) ? "On" : "Off" }}
              </span>
              <AppButton
                v-else
                variant="subtle"
                fill="muted"
                size="md"
                class="shrink-0 min-w-16"
                :active="uses.isOn(entry.toggleKey)"
                :aria-pressed="uses.isOn(entry.toggleKey)"
                :aria-label="`${entry.name}: ${uses.isOn(entry.toggleKey) ? 'on' : 'off'}`"
                :disabled="uses.isSaving.value || (!uses.isOn(entry.toggleKey) && reasonFor(entry) !== null)"
                :label="uses.isOn(entry.toggleKey) ? 'On' : 'Off'"
                @click="flip(entry)"
              />
            </template>
            <AppButton
              v-else-if="!readonly && entry.spends"
              variant="subtle"
              fill="muted"
              size="md"
              class="shrink-0"
              :disabled="uses.isSaving.value || reasonFor(entry) !== null"
              label="Use"
              :aria-label="`Use ${entry.name}`"
              @click="use(entry)"
            />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useCharacterFeatures } from "@/composables/features/useCharacterFeatures";
import { useFeatureUses } from "@/composables/features/useFeatureUses";
import { useToast } from "@/composables/useToast";
import type { ActionEntry } from "@/rules/features/characterFeatures";
import type { Activation, UsesCost } from "@/rules/features/mechanics.types";
import type { PartyMember } from "@/types/party.types";

/**
 * What a character can do with its features, by the action it takes (#976):
 * the player's Combat tab and the encounter runner's character panel show the
 * same card. A feature that spends something gets a Use button; one that costs
 * nothing is just listed. `readonly` is the view without the buttons.
 */
const { member, readonly = false } = defineProps<{
  member: PartyMember;
  readonly?: boolean;
}>();

const toast = useToast();
const memberRef = toRef(() => member);
const { actions, pools } = useCharacterFeatures(memberRef);
const uses = useFeatureUses(memberRef, pools);

const GROUP_LABELS: { activation: Activation; label: string }[] = [
  { activation: "action", label: "Action" },
  { activation: "bonus_action", label: "Bonus Action" },
  { activation: "reaction", label: "Reaction" },
  { activation: "special", label: "Special" },
];

const groups = computed(() =>
  GROUP_LABELS
    .map(g => ({ ...g, entries: actions.value[g.activation] }))
    .filter(g => g.entries.length > 0),
);

/** "Cunning Action: Disengage" for a sub-action; a feature's own action is just its name. */
function rowName(entry: ActionEntry): string {
  return entry.isSubAction ? `${entry.featureName}: ${entry.name}` : entry.name;
}

function poolLabel(key: string): string {
  const pool = pools.value.find(p => p.key === key);
  return pool ? pool.label : key;
}

/** "Ki 3/5" for a pool with a count, "Ki (unlimited)" when it never runs out. */
function remainingText(key: string): string {
  const left = uses.remaining(key);
  const label = poolLabel(key);
  if (left === "unlimited") return `${label} unlimited`;
  const pool = pools.value.find(p => p.key === key);
  if (left === null || !pool || pool.max === "unlimited") return label;
  return `${label} ${left}/${pool.max}`;
}

function costNote(cost: UsesCost): string {
  return cost.amount === 1 ? remainingText(cost.key) : `Costs ${cost.amount}. ${remainingText(cost.key)}`;
}

/** Why the row cannot be used, or null when it can. */
function reasonFor(entry: ActionEntry): string | null {
  if (!entry.spends || uses.payable(entry.spends)) return null;
  return `No ${poolLabel(entry.spends.key)} left`;
}

async function use(entry: ActionEntry) {
  if (!entry.spends) return;
  try {
    await uses.spend(entry.spends);
  } catch (error) {
    toast.error(toast.fromError(error, `Couldn't use ${entry.name}.`));
  }
}

async function flip(entry: ActionEntry) {
  if (!entry.toggleKey) return;
  const turningOn = !uses.isOn(entry.toggleKey);
  try {
    await uses.setToggle(entry.toggleKey, turningOn, turningOn ? entry.spends : null);
  } catch (error) {
    toast.error(toast.fromError(error, `Couldn't switch ${entry.name} ${turningOn ? "on" : "off"}.`));
  }
}
</script>
