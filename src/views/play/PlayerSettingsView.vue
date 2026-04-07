<template>
  <PageHeader title="Settings" description="Your profile for this campaign">
  <div class="max-w-lg space-y-8">

    <!-- Display name -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Display Name</h2>
      <p class="font-fell text-sm text-muted-foreground italic">
        This is how your DM and party members see you in the campaign.
        It defaults to your email address.
      </p>

      <form class="flex gap-2" @submit.prevent="saveName">
        <input
          v-model="displayName"
          type="text"
          maxlength="60"
          placeholder="Your name…"
          class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          :disabled="savingName || !displayName.trim() || displayName.trim() === currentName"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Check v-if="nameSaved" class="h-3.5 w-3.5" />
          <Save v-else class="h-3.5 w-3.5" />
          {{ nameSaved ? "Saved" : "Save" }}
        </button>
      </form>

      <p v-if="nameError" class="font-fell text-xs text-destructive">{{ nameError }}</p>
    </section>

    <!-- Character claim -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">My Character</h2>

      <div v-if="linkedCharacter" class="flex items-center gap-3">
        <div class="flex-1">
          <p class="font-cinzel text-sm font-semibold text-foreground">{{ linkedCharacter.name }}</p>
          <p class="font-fell text-xs text-muted-foreground italic">
            {{ linkedCharacter.class }} {{ linkedCharacter.level > 0 ? `· Level ${linkedCharacter.level}` : '' }}
          </p>
        </div>
        <button
          type="button"
          class="font-cinzel text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 transition-colors"
          @click="showClaim = true"
        >
          Change
        </button>
      </div>

      <div v-else>
        <p class="font-fell text-sm text-muted-foreground italic mb-3">
          Claim a character to link your account to a party member.
        </p>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-cinzel text-xs text-primary hover:bg-primary/20 transition-colors"
          @click="showClaim = true"
        >
          <User class="h-3.5 w-3.5" />
          Claim a character
        </button>
      </div>

      <!-- Claim picker -->
      <div v-if="showClaim" class="border border-border rounded-md p-3 space-y-3 bg-background">
        <p class="font-cinzel text-xs text-muted-foreground tracking-wide">Select your character:</p>
        <div v-if="unclaimedMembers.length === 0" class="font-fell text-sm text-muted-foreground italic">
          No unclaimed characters available. Ask your DM to add one.
        </div>
        <div v-else class="space-y-1.5">
          <button
            v-for="m in unclaimedMembers"
            :key="m.id"
            type="button"
            class="w-full text-left rounded px-3 py-2 border transition-colors"
            :class="claimTarget === m.id
              ? 'border-primary/50 bg-primary/10 text-foreground'
              : 'border-border bg-card hover:border-primary/30'"
            @click="claimTarget = m.id"
          >
            <span class="font-cinzel text-sm font-semibold">{{ m.name }}</span>
            <span class="font-fell text-xs text-muted-foreground ml-2">
              {{ m.class }} {{ m.level > 0 ? `· Lv ${m.level}` : '' }}
            </span>
          </button>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="!claimTarget || claimingChar"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
            @click="claimCharacter"
          >
            <Check class="h-3.5 w-3.5" />
            Claim
          </button>
          <button
            type="button"
            class="rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
            @click="showClaim = false; claimTarget = null"
          >
            Cancel
          </button>
        </div>
        <p v-if="claimError" class="font-fell text-xs text-destructive">{{ claimError }}</p>
      </div>
    </section>

    <!-- Upcoming sessions -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Upcoming Sessions</h2>

      <div v-if="!confirmedSessions.length" class="font-fell text-sm text-muted-foreground italic">
        No confirmed sessions yet — check back when your DM books one.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="s in confirmedSessions"
          :key="s.id"
          class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5"
        >
          <CalendarCheck class="h-4 w-4 text-elven-green shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground">{{ s.title }}</p>
            <p class="font-fell text-xs text-muted-foreground">{{ formatSessionDate(s.proposed_date, s.proposed_time) }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Session availability -->
    <section v-if="proposedSessions.length > 0" class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Session Availability</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Let your DM know when you can make it.
        </p>
      </div>

      <div class="space-y-3">
        <div
          v-for="s in proposedSessions"
          :key="s.id"
          class="flex items-center gap-3"
        >
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground">{{ s.title }}</p>
            <p class="font-fell text-xs text-muted-foreground">{{ formatSessionDate(s.proposed_date, s.proposed_time) }}</p>
          </div>
          <!-- 3-way toggle -->
          <div class="flex items-center gap-1 shrink-0">
            <button
              class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-[10px] tracking-wider border transition-colors"
              :class="myAvailability(s.id) === true
                ? 'border-elven-green/50 bg-elven-green/15 text-elven-green'
                : 'border-border text-muted-foreground hover:border-elven-green/30 hover:text-elven-green'"
              @click="setAvailability(s, true)"
            >
              <Check class="h-3 w-3" />
              Yes
            </button>
            <button
              class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-[10px] tracking-wider border transition-colors"
              :class="myAvailability(s.id) === false
                ? 'border-destructive/50 bg-destructive/10 text-destructive'
                : 'border-border text-muted-foreground hover:border-destructive/30 hover:text-destructive'"
              @click="setAvailability(s, false)"
            >
              <X class="h-3 w-3" />
              No
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Navigation preference -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Navigation</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Control which icons appear in your quick-access bar.
        </p>
      </div>

      <!-- Mode toggle -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex-1 rounded-md px-3 py-2 font-cinzel text-xs tracking-wider border transition-colors"
          :class="navMode === 'dynamic'
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/30'"
          @click="setNavMode('dynamic')"
        >
          Dynamic
        </button>
        <button
          type="button"
          class="flex-1 rounded-md px-3 py-2 font-cinzel text-xs tracking-wider border transition-colors"
          :class="navMode === 'custom'
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/30'"
          @click="setNavMode('custom')"
        >
          Custom
        </button>
      </div>

      <p v-if="navMode === 'dynamic'" class="font-fell text-xs text-muted-foreground italic">
        Your most-visited sections rise to the top. Needs roughly twice the visits to advance — small diffs won't shuffle icons around.
      </p>

      <!-- Custom order: drag-to-reorder list -->
      <div v-else>
        <p class="font-fell text-xs text-muted-foreground italic mb-3">
          Drag to reorder. The first 4 (or 7 on tablet) appear in the quick bar.
        </p>

        <ol ref="dragListRef" class="space-y-1">
          <li
            v-for="(item, i) in sortedNav"
            :key="item.to"
            class="flex items-center gap-3 rounded-md border px-3 py-2 bg-card select-none transition-colors"
            :class="{
              'opacity-40': draggingIdx === i,
              'border-primary/50': overIdx === i && draggingIdx !== null && draggingIdx !== i,
              'border-border': !(overIdx === i && draggingIdx !== null && draggingIdx !== i),
            }"
          >
            <!-- Drag handle -->
            <span
              class="cursor-grab active:cursor-grabbing text-muted-foreground touch-none"
              @pointerdown.prevent="onHandlePointerDown(i, $event)"
            >
              <GripVertical class="h-4 w-4 shrink-0" />
            </span>
            <component :is="item.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="font-cinzel text-xs tracking-wider flex-1">{{ item.label }}</span>
            <span
              v-if="i < MOBILE_NAV_SLOTS"
              class="font-cinzel text-[9px] tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0"
            >bar</span>
          </li>
        </ol>
      </div>
    </section>

    <!-- Account info (read-only) -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-2">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Account</h2>
      <div class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground w-16">Email</span>
        <span class="font-fell text-sm text-foreground">{{ auth.userEmail ?? '—' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground w-16">Role</span>
        <span class="font-cinzel text-xs tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
          {{ auth.currentRole ?? '—' }}
        </span>
      </div>
    </section>
  </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { CalendarCheck, Check, GripVertical, Save, User, X } from "lucide-vue-next";
import { usePlayerNavPrefs } from "@/composables/usePlayerNavPrefs";
import { MOBILE_NAV_SLOTS } from "@/lib/playerNav";
import PageHeader from "@/components/common/PageHeader.vue";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useSessionProposals, useAllSessionAvailability, useUpsertAvailability } from "@/composables/useScheduling";
import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import type { SessionProposal } from "@/types/scheduling.types";

const auth = useAuthStore();

// ── Navigation preferences ─────────────────────────────────────────────────────
const { navMode, sortedNav, setNavMode, setNavOrder } = usePlayerNavPrefs();

const dragListRef = ref<HTMLElement | null>(null);
const draggingIdx = ref<number | null>(null);
const overIdx     = ref<number | null>(null);

function getOverIndex(clientY: number): number {
  if (!dragListRef.value) return 0;
  const items = Array.from(dragListRef.value.children) as HTMLElement[];
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return items.length - 1;
}

let activeMove: ((ev: PointerEvent) => void) | null = null;
let activeUp: (() => void) | null = null;

function onHandlePointerDown(index: number, _e: PointerEvent) {
  draggingIdx.value = index;
  overIdx.value = index;

  activeMove = (ev: PointerEvent) => { overIdx.value = getOverIndex(ev.clientY); };
  activeUp = () => {
    if (draggingIdx.value !== null && overIdx.value !== null && draggingIdx.value !== overIdx.value) {
      const current = sortedNav.value.map((item) => item.to);
      const [moved] = current.splice(draggingIdx.value, 1);
      current.splice(overIdx.value, 0, moved);
      setNavOrder(current);
    }
    draggingIdx.value = null;
    overIdx.value     = null;
    window.removeEventListener("pointermove", activeMove!);
    activeMove = null;
    activeUp   = null;
  };

  window.addEventListener("pointermove", activeMove);
  window.addEventListener("pointerup", activeUp, { once: true });
}

onBeforeUnmount(() => {
  if (activeMove) window.removeEventListener("pointermove", activeMove);
  if (activeUp)   window.removeEventListener("pointerup", activeUp);
});
const campaign = useCampaignStore();
const { data: partyMembers } = useParty();
const { data: campaignMembers } = useCampaignMembers();
const { data: proposals } = useSessionProposals();
const { data: allAvailability } = useAllSessionAvailability();
const { mutateAsync: upsertAvailability } = useUpsertAvailability();

// ── Display name ──────────────────────────────────────────────────────────────
const currentName = computed(() => auth.membership?.display_name ?? "");
const displayName = ref(currentName.value);
const savingName = ref(false);
const nameSaved = ref(false);
const nameError = ref<string | null>(null);

async function saveName() {
  if (!auth.membership?.id || !displayName.value.trim()) return;
  savingName.value = true;
  nameError.value = null;
  nameSaved.value = false;

  const { error: err } = await supabase
    .from("campaign_members")
    .update({ display_name: displayName.value.trim() })
    .eq("id", auth.membership.id);

  savingName.value = false;

  if (err) {
    nameError.value = err.message;
  } else {
    if (auth.membership) auth.membership = { ...auth.membership, display_name: displayName.value.trim() };
    nameSaved.value = true;
    setTimeout(() => { nameSaved.value = false; }, 2000);
  }
}

// ── Character claim ───────────────────────────────────────────────────────────
const showClaim = ref(false);
const claimTarget = ref<string | null>(null);
const claimingChar = ref(false);
const claimError = ref<string | null>(null);

// Party members not yet claimed by any other player
const unclaimedMembers = computed(() => {
  const allMembers = partyMembers.value ?? [];
  const claimedIds = new Set(
    (campaignMembers.value ?? [])
      .filter(m => m.party_member_id && m.user_id !== auth.user?.id)
      .map(m => m.party_member_id!)
  );
  return allMembers.filter(m => !claimedIds.has(m.id));
});

const linkedCharacter = computed(() => {
  if (!auth.linkedPartyMemberId || !partyMembers.value) return null;
  return partyMembers.value.find(m => m.id === auth.linkedPartyMemberId) ?? null;
});

// ── Scheduling ────────────────────────────────────────────────────────────────

const confirmedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "confirmed")
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);

const proposedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "proposed")
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);

function myAvailability(proposalId: string): boolean | null {
  const row = (allAvailability.value ?? [])
    .find(a => a.session_proposal_id === proposalId && a.user_id === auth.user?.id);
  return row ? row.available : null;
}

async function setAvailability(proposal: SessionProposal, available: boolean) {
  if (!campaign.activeCampaignId) return;
  await upsertAvailability({
    session_proposal_id: proposal.id,
    campaign_id: campaign.activeCampaignId,
    available,
  });
}

function formatSessionDate(date: string, time: string | null): string {
  const d = new Date(date + "T00:00:00");
  const dateStr = d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  if (!time) return dateStr;
  const [h, m] = time.split(":");
  const t = new Date();
  t.setHours(Number(h), Number(m));
  return `${dateStr} · ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

async function claimCharacter() {
  if (!auth.membership?.id || !claimTarget.value) return;
  claimingChar.value = true;
  claimError.value = null;

  const { error: err } = await supabase
    .from("campaign_members")
    .update({ party_member_id: claimTarget.value })
    .eq("id", auth.membership.id);

  claimingChar.value = false;

  if (err) {
    claimError.value = err.message;
  } else {
    if (auth.membership) {
      auth.membership = { ...auth.membership, party_member_id: claimTarget.value };
    }
    showClaim.value = false;
    claimTarget.value = null;
  }
}
</script>
