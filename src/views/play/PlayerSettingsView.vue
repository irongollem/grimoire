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
          autocomplete="off"
          data-1p-ignore
          data-lpignore="true"
          class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          :disabled="savingName || !displayName.trim() || displayName.trim() === currentName"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <IconCheck v-if="nameSaved" class="h-3.5 w-3.5" />
          <IconSave v-else class="h-3.5 w-3.5" />
          {{ nameSaved ? "Saved" : "Save" }}
        </button>
      </form>

      <p v-if="nameError" class="font-fell text-xs text-destructive">{{ nameError }}</p>
    </section>

    <!-- Install app -->
    <section v-if="canInstall" class="rounded-lg border border-primary/30 bg-primary/5 p-5 space-y-3">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Install App</h2>
        <p class="font-fell text-sm text-muted-foreground italic mt-1">
          Add Grimoire to your home screen for quick access between sessions.
        </p>
      </div>
      <!-- Native install prompt available (Chrome/Edge) -->
      <button
        v-if="hasNativePrompt"
        type="button"
        class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity cursor-pointer"
        @click="install"
      >
        <IconDownload class="h-3.5 w-3.5" />
        Install
      </button>
      <!-- Fallback: manual instructions -->
      <div v-else class="space-y-1.5">
        <p class="font-cinzel text-xs text-muted-foreground tracking-wide">To install manually:</p>
        <p class="font-fell text-sm text-foreground">
          Android Chrome — tap the <span class="font-cinzel text-xs">⋮</span> menu → <em>Add to Home screen</em>
        </p>
        <p class="font-fell text-sm text-foreground">
          iOS Safari — tap <span class="font-cinzel text-xs">⎋</span> Share → <em>Add to Home Screen</em>
        </p>
      </div>
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
          Build your own character sheet, or claim an existing party member created by your DM.
        </p>
        <div class="flex flex-wrap gap-2">
          <RouterLink
            to="/play/character/create"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          >
            <IconUser class="h-3.5 w-3.5" />
            Create character
          </RouterLink>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-cinzel text-xs text-primary hover:bg-primary/20 transition-colors"
            @click="showClaim = true"
          >
            Claim existing
          </button>
        </div>
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
            <IconCheck class="h-3.5 w-3.5" />
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
          <IconCalendarCheck class="h-4 w-4 text-elven-green shrink-0" />
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
              class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-2xs md:text-sm tracking-wider border transition-colors"
              :class="myAvailability(s.id) === true
                ? 'border-elven-green/50 bg-elven-green/15 text-elven-green'
                : 'border-border text-muted-foreground hover:border-elven-green/30 hover:text-elven-green'"
              @click="setAvailability(s, true)"
            >
              <IconCheck class="h-3 w-3" />
              Yes
            </button>
            <button
              class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-2xs md:text-sm tracking-wider border transition-colors"
              :class="myAvailability(s.id) === false
                ? 'border-destructive/50 bg-destructive/10 text-destructive'
                : 'border-border text-muted-foreground hover:border-destructive/30 hover:text-destructive'"
              @click="setAvailability(s, false)"
            >
              <IconClose class="h-3 w-3" />
              No
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Calendar subscription -->
    <section v-if="icalFeedUrl" class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Calendar Subscription</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Subscribe once and your calendar app will automatically receive future session updates.
        </p>
      </div>

      <!-- URL field + copy -->
      <div class="flex items-center gap-2">
        <input
          :value="icalFeedUrl"
          readonly
          class="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-mono text-xs text-muted-foreground select-all focus:outline-none focus:ring-1 focus:ring-ring truncate"
          @click="($event.target as HTMLInputElement).select()"
        />
        <button
          class="shrink-0 inline-flex items-center gap-1 font-cinzel text-2xs md:text-sm tracking-wider px-2.5 py-1.5 rounded border border-border hover:bg-muted transition-colors"
          :title="calCopied ? 'Copied!' : 'Copy URL'"
          @click="copyFeedUrl"
        >
          <CheckIcon v-if="calCopied" class="h-3 w-3 text-elven-green" />
          <IconCopy v-else class="h-3 w-3" />
          {{ calCopied ? 'Copied' : 'Copy' }}
        </button>
      </div>

      <!-- Subscribe button -->
      <div>
        <a
          :href="webcalUrl"
          class="inline-flex items-center gap-1.5 font-cinzel text-2xs md:text-sm tracking-wider px-3 py-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <IconAddEvent class="h-3 w-3" />
          Subscribe in Calendar App
        </a>
      </div>
    </section>

    <!-- Navigation preference -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Navigation</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Drag to reorder. The first 4 (or 7 on tablet) appear in the quick bar.
        </p>
      </div>

      <ol ref="dragListRef" class="space-y-1">
        <li
          v-for="(item, i) in sortedNav"
          :key="item.to"
          class="relative flex items-center gap-3 rounded-md border border-border px-3 py-2 bg-card select-none transition-colors"
          :class="{ 'opacity-40': draggingIdx === i }"
        >
          <!-- Drop insertion line — shown above the target row -->
          <div
            v-if="overIdx === i && draggingIdx !== null && draggingIdx !== i"
            class="absolute inset-x-1 top-0 h-0.5 rounded-full bg-primary z-10"
            style="transform: translateY(-50%)"
          />
          <!-- Drag handle -->
          <span
            class="cursor-grab active:cursor-grabbing text-muted-foreground touch-none"
            @pointerdown.prevent="onHandlePointerDown(i, $event)"
          >
            <IconDrag class="h-4 w-4 shrink-0" />
          </span>
          <component :is="item.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="font-cinzel text-xs tracking-wider flex-1">{{ item.label }}</span>
          <span
            v-if="i < MOBILE_NAV_SLOTS"
            class="font-cinzel text-2xs md:text-sm tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0"
          >bar</span>
        </li>
      </ol>
    </section>

    <!-- Combat notifications -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Combat Notifications</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Alerts when it's your turn in a live encounter.
        </p>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="font-cinzel text-xs text-foreground tracking-wide">Turn audio cue</p>
          <p class="font-fell text-xs text-muted-foreground italic">A short chime plays when your turn begins.</p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :class="turnAudioEnabled ? 'bg-primary' : 'bg-muted'"
          role="switch"
          :aria-checked="turnAudioEnabled"
          @click="setTurnAudio(!turnAudioEnabled)"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
            :class="turnAudioEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="font-cinzel text-xs text-foreground tracking-wide">Dice roll sounds</p>
          <p class="font-fell text-xs text-muted-foreground italic">A clack plays on every roll. Crits and fumbles have distinct sounds.</p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :class="diceAudioEnabled ? 'bg-primary' : 'bg-muted'"
          role="switch"
          :aria-checked="diceAudioEnabled"
          @click="setDiceAudio(!diceAudioEnabled)"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
            :class="diceAudioEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
    </section>

    <!-- Dice settings -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Dice</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Choose where rolls come from.
        </p>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="font-cinzel text-xs text-foreground tracking-wide">Dice source</p>
          <p class="font-fell text-xs text-muted-foreground italic">Physical mode prompts you to enter the result of dice you rolled yourself.</p>
        </div>
        <div class="flex rounded-md border border-border overflow-hidden text-2xs md:text-sm font-cinzel tracking-wider shrink-0 ml-3">
          <button
            type="button"
            class="px-3 py-1 transition-colors"
            :class="diceMode === 'tool' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'"
            @click="setDiceMode('tool')"
          >TOOL</button>
          <button
            type="button"
            class="px-3 py-1 transition-colors border-l border-border"
            :class="diceMode === 'physical' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'"
            @click="setDiceMode('physical')"
          >PHYSICAL</button>
        </div>
      </div>
    </section>

    <!-- Theme override -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Appearance</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Your DM sets the campaign theme. Override it here if you prefer a different look.
        </p>
      </div>
      <div class="flex items-center justify-between">
        <p class="font-cinzel text-xs text-foreground tracking-wide">Theme</p>
        <div class="flex rounded-md border border-border overflow-hidden text-2xs md:text-sm font-cinzel tracking-wider shrink-0">
          <button
            v-for="opt in THEME_OVERRIDE_OPTIONS"
            :key="opt.value"
            type="button"
            class="px-2.5 py-1 transition-colors border-l border-border first:border-l-0"
            :class="currentOverride === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'"
            @click="setOverride(opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>
    </section>

    <!-- Timestamps -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Timestamps</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Chat timestamps use your browser's locale by default.
          Override here if you prefer a different date and time format.
        </p>
      </div>
      <div class="space-y-2">
        <EntityCombobox
          v-model="localeInput"
          :options="LOCALE_OPTIONS"
          placeholder="Browser default"
        />
        <p class="font-fell text-xs text-muted-foreground">
          Preview: <span class="text-foreground">{{ localePreview }}</span>
        </p>
      </div>
    </section>

    <!-- Keep screen awake -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Screen</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          Useful during long sessions on a tablet.
        </p>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="font-cinzel text-xs text-foreground tracking-wide">Keep screen awake</p>
          <p class="font-fell text-xs text-muted-foreground italic">
            <template v-if="wakeLockSupported">Prevents your device from sleeping while this page is open.</template>
            <template v-else>Not supported on this browser. Try Chrome or Safari 16.4+.</template>
          </p>
        </div>
        <button
          v-if="wakeLockSupported"
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :class="wakeLockEnabled ? 'bg-primary' : 'bg-muted'"
          role="switch"
          :aria-checked="wakeLockEnabled"
          @click="toggleWakeLock"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
            :class="wakeLockEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
        <span v-else class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider px-2 py-1 rounded border border-border">
          Unavailable
        </span>
      </div>
    </section>

    <!-- Reload app -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">App</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-1">
          If something looks stuck or out of date, a full reload fixes it.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
        @click="reloadApp"
      >
        <IconReset class="h-3.5 w-3.5" />
        Reload app
      </button>
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

    <!-- Legal -->
    <div class="flex items-center gap-5 pt-2 pb-6">
      <RouterLink
        to="/privacy"
        class="font-cinzel text-2xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
      >
        Privacy Policy
      </RouterLink>
      <span class="text-border text-xs">·</span>
      <RouterLink
        to="/terms"
        class="font-cinzel text-2xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
      >
        Terms of Service
      </RouterLink>
    </div>
  </div>
  </PageHeader>

  <!-- Drag ghost — floats with the pointer during reorder (visible on iOS touch) -->
  <Teleport to="body">
    <div
      v-if="ghostItem"
      class="fixed z-9999 pointer-events-none flex items-center gap-3 rounded-md border border-primary/60 bg-card px-3 py-2 shadow-2xl"
      :style="{
        top: ghostY + 'px',
        left: ghostLeft + 'px',
        width: ghostWidth + 'px',
        transform: 'translateY(-50%)',
      }"
    >
      <IconDrag class="h-4 w-4 shrink-0 text-muted-foreground" />
      <component :is="ghostItem.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="font-cinzel text-xs tracking-wider flex-1">{{ ghostItem.label }}</span>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { RouterLink } from "vue-router";
import { IconAddEvent, IconCalendarCheck, IconCheck, IconClose, IconCopy, IconDownload, IconDrag, IconReset, IconSave, IconUser } from '@/lib/icons';
const CheckIcon = IconCheck;
import { usePwaInstall } from "@/composables/usePwaInstall";
import { useWakeLock } from "@/composables/useWakeLock";

const { canInstall, hasNativePrompt, install } = usePwaInstall();
const { enabled: wakeLockEnabled, isSupported: wakeLockSupported, toggle: toggleWakeLock } = useWakeLock();
import { usePlayerNavPrefs } from "@/composables/usePlayerNavPrefs";
import { usePlayerCombatPrefs } from "@/composables/usePlayerCombatPrefs";
import { useDicePrefs } from "@/composables/useDicePrefs";
import { useTheme } from "@/composables/useTheme";
import type { ThemeOverride } from "@/composables/useTheme";
import { useLocalePrefs } from "@/composables/useLocalePrefs";
import { formatChatTimestamp } from "@/lib/utils";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { MOBILE_NAV_SLOTS } from "@/lib/playerNav";
import PageHeader from "@/components/common/PageHeader.vue";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useSessionProposals, useAllSessionAvailability, useUpsertAvailability } from "@/composables/useScheduling";
import { useCampaignById } from "@/composables/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import type { SessionProposal } from "@/types/scheduling.types";

const auth = useAuthStore();

// ── Navigation preferences ─────────────────────────────────────────────────────
const { sortedNav, setNavOrder } = usePlayerNavPrefs();

// ── Combat preferences ────────────────────────────────────────────────────────
const { turnAudioEnabled, setTurnAudio } = usePlayerCombatPrefs();
const { diceAudioEnabled, setDiceAudio, diceMode, setDiceMode } = useDicePrefs();

// ── Theme override ───────────────────────────────────────────────────────────
const { themeOverride, setOverride } = useTheme();

// ── Locale preference ─────────────────────────────────────────────────────────
const FALLBACK_LOCALES = [
  "en-US","en-GB","nl-NL","nl-BE","de-DE","fr-FR","fr-BE","es-ES","it-IT",
  "pt-PT","pt-BR","pl-PL","sv-SE","da-DK","fi-FI","nb-NO","ja-JP","ko-KR",
  "zh-CN","zh-TW",
];

function buildLocaleOptions(): { id: string; name: string }[] {
  let tags: string[];
  try {
    tags = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("locale");
  } catch {
    tags = FALLBACK_LOCALES;
  }
  const dn = new Intl.DisplayNames(undefined, { type: "language" });
  return tags
    .map(t => ({ id: t, name: dn.of(t) ?? t }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const LOCALE_OPTIONS = buildLocaleOptions();

const { chatLocale, setChatLocale } = useLocalePrefs();
const localeInput = ref(chatLocale.value);

watch(localeInput, val => setChatLocale(val));

const localePreview = computed(() =>
  formatChatTimestamp(new Date(Date.now() - 86_400_000).toISOString(), localeInput.value || undefined)
);
const currentOverride = themeOverride;
const THEME_OVERRIDE_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: "campaign", label: "Campaign" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const dragListRef = ref<HTMLElement | null>(null);
const draggingIdx = ref<number | null>(null);
const overIdx     = ref<number | null>(null);

// Ghost element state for pointer-follow feedback on iOS and other touch devices
const ghostY     = ref(0);
const ghostLeft  = ref(0);
const ghostWidth = ref(280);
const ghostItem  = computed(() =>
  draggingIdx.value !== null ? (sortedNav.value[draggingIdx.value] ?? null) : null
);

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

function onHandlePointerDown(index: number, e: PointerEvent) {
  // Capture the pointer so events keep firing even if the finger leaves the element (iOS)
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

  const listRect = dragListRef.value?.getBoundingClientRect();
  ghostLeft.value  = listRect?.left ?? 0;
  ghostWidth.value = listRect?.width ?? 280;
  ghostY.value     = e.clientY;

  draggingIdx.value = index;
  overIdx.value     = index;

  activeMove = (ev: PointerEvent) => {
    overIdx.value = getOverIndex(ev.clientY);
    ghostY.value  = ev.clientY;
  };
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
const { data: campaignData } = useCampaignById(() => campaign.activeCampaignId);
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

const today = new Date().toISOString().slice(0, 10);

const confirmedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "confirmed" && p.proposed_date >= today)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);

const proposedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "proposed" && p.proposed_date >= today)
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

// ── Calendar subscription ─────────────────────────────────────────────────────

const icalFeedUrl = computed(() => {
  const token = campaignData.value?.ical_token;
  if (!token) return null;
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/ical-feed/${token}`;
});

const webcalUrl = computed(() =>
  icalFeedUrl.value?.replace(/^https?:\/\//, "webcal://") ?? undefined
);

const calCopied = ref(false);

async function copyFeedUrl() {
  if (!icalFeedUrl.value) return;
  await navigator.clipboard.writeText(icalFeedUrl.value);
  calCopied.value = true;
  setTimeout(() => { calCopied.value = false; }, 2000);
}

function reloadApp() { window.location.reload(); }

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
