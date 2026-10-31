<template>
  <div class="mt-1.5 space-y-1.5" data-testid="loot-roll">
    <!-- Open: countdown, picks so far, and the three choices -->
    <template v-if="open">
      <div class="flex items-center justify-between gap-2">
        <span class="text-label text-ink-caution">Roll for it</span>
        <span class="text-label tabular-nums text-ink-caution" data-testid="loot-roll-countdown">
          {{ countdown }}
        </span>
      </div>
      <ul v-if="ranked.length" class="space-y-0.5">
        <li
          v-for="entry in ranked"
          :key="entry.party_member_id"
          class="text-caption text-muted-foreground"
        >
          <span class="text-foreground">{{ entry.name }}</span>: {{ describe(entry) }}
        </li>
      </ul>
      <p v-else class="text-caption text-muted-foreground italic">No one has rolled yet.</p>
      <div v-if="myEntry" class="text-caption text-ink-caution">
        You chose {{ describe(myEntry) }}.
      </div>
      <div v-else-if="linkedPartyMemberId" class="flex flex-wrap gap-1.5">
        <AppButton
          variant="tinted"
          tone="caution"
          emphasis="soft"
          size="xs"
          label="Need"
          @click="emit('choose', { messageId, choice: 'need' })"
        />
        <AppButton
          variant="tinted"
          tone="caution"
          emphasis="soft"
          size="xs"
          label="Greed"
          @click="emit('choose', { messageId, choice: 'greed' })"
        />
        <AppButton
          variant="subtle"
          size="xs"
          label="Pass"
          @click="emit('choose', { messageId, choice: 'pass' })"
        />
      </div>
      <AppButton
        v-if="isDM"
        variant="subtle"
        size="xs"
        label="End roll"
        @click="emit('end', { messageId })"
      />
    </template>

    <!-- Resolved -->
    <template v-else>
      <p v-if="roll.outcome === 'unclaimed'" class="text-caption text-muted-foreground italic">
        Everyone passed, free to grab
      </p>
      <template v-else>
        <p class="text-caption text-foreground">
          Won by
          <template v-for="(w, i) in winners" :key="w.party_member_id">
            <span v-if="i > 0">, </span>
            <span class="font-semibold text-ink-caution">{{ w.name }}</span>
            <span class="text-muted-foreground"> ({{ describe(w) }})</span>
          </template>
        </p>
        <ul v-if="others.length" class="space-y-0.5">
          <li
            v-for="entry in others"
            :key="entry.party_member_id"
            class="text-caption-sm text-muted-foreground"
          >
            {{ entry.name }}: {{ describe(entry) }}
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import AppButton from '@/components/common/controls/AppButton.vue';
import type { ItemDropClaim, LootRoll, LootRollChoice, LootRollEntry } from '@/types/chat.types';

const {
  messageId,
  roll,
  claims = [],
  isDM = false,
  linkedPartyMemberId = null,
} = defineProps<{
  messageId: string;
  roll: LootRoll;
  claims?: ItemDropClaim[];
  isDM?: boolean;
  linkedPartyMemberId?: string | null;
}>();

const emit = defineEmits<{
  choose: [payload: { messageId: string; choice: LootRollChoice }];
  end: [payload: { messageId: string }];
}>();

const open = computed(() => roll.resolved_at === null);

// The tick runs only while the window is open, so a settled drop costs nothing.
const now = ref(Date.now());
const { pause, resume } = useIntervalFn(() => { now.value = Date.now(); }, 1000, { immediate: false });
watch(open, (isOpen) => {
  if (isOpen) { now.value = Date.now(); resume(); } else pause();
}, { immediate: true });

const countdown = computed(() => {
  const left = Math.max(0, Math.ceil((new Date(roll.closes_at).getTime() - now.value) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
});

const TIER: Record<LootRollChoice, number> = { need: 2, greed: 1, pass: 0 };

/** Need above Greed above Pass, highest roll first. */
const ranked = computed(() =>
  [...roll.entries].sort((a, b) => TIER[b.choice] - TIER[a.choice] || (b.roll ?? 0) - (a.roll ?? 0)),
);

const myEntry = computed(() =>
  linkedPartyMemberId ? roll.entries.find(e => e.party_member_id === linkedPartyMemberId) ?? null : null,
);

const winnerIds = computed(() => new Set(claims.map(c => c.party_member_id)));
const winners = computed(() => ranked.value.filter(e => winnerIds.value.has(e.party_member_id)));
const others = computed(() => ranked.value.filter(e => !winnerIds.value.has(e.party_member_id)));

function describe(entry: LootRollEntry): string {
  if (entry.choice === 'pass') return 'passed';
  const label = entry.choice === 'need' ? 'Need' : 'Greed';
  return `${label} ${entry.roll}`;
}
</script>
