<template>
  <AppModal :open="open" size="xl" @close="emit('close')">
    <!-- The band and ribbon are the card's own mourning (black) or honour (gilt). -->
    <div class="setdown-band" :data-kind="kind" aria-hidden="true" />
    <span class="setdown-ribbon" :data-kind="kind" aria-hidden="true" />
    <ModalHeader :title="title" :subtitle="subtitle" closeable header-class="pl-14" @close="emit('close')" />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain md:grid md:grid-cols-[minmax(0,1fr)_18.75rem]">
      <form class="flex flex-col gap-4 px-5 py-4" data-testid="setdown-form" @submit.prevent="submit">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label for="setdown-game-date" class="text-label text-foreground">In the campaign</label>
            <AppInput id="setdown-game-date" v-model.trim="gameDate" size="md" data-testid="game-date" />
            <p class="text-caption italic text-muted-foreground">{{ edit ? "As written on the card" : "Today in the campaign calendar" }}</p>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="setdown-real-date" class="text-label text-foreground">At the table</label>
            <input
              id="setdown-real-date"
              v-model="realDate"
              type="date"
              required
              :class="cn(fieldVariants({ size: 'md', control: 'input' }), 'w-full')"
              data-testid="real-date"
            />
            <p class="text-caption italic text-muted-foreground">{{ edit ? "The real date" : "Today" }}</p>
          </div>
        </div>

        <template v-if="writesAccount">
          <div class="flex flex-col gap-1.5">
            <span class="text-label text-foreground">{{ kind === "fallen" ? "How it happened" : "How they left" }}</span>
            <RichTextEditor v-model="account" size="md" placeholder="What happened, in your own words." />
            <p class="text-caption italic text-muted-foreground">
              Opens the {{ kind === "fallen" ? "obituary" : "card" }}, after a line composed from the sheet: name, lineage, date.
            </p>
          </div>
          <div v-if="kind === 'fallen'" class="flex flex-col gap-1.5">
            <label for="setdown-last-blow" class="text-label text-foreground">Struck down by</label>
            <AppInput id="setdown-last-blow" v-model.trim="lastBlow" size="md" data-testid="last-blow" />
            <p class="text-caption italic text-muted-foreground">Optional. Leave it empty to keep it off the card.</p>
          </div>
        </template>

        <div v-if="kind === 'fallen' && !edit" class="flex flex-col gap-1.5">
          <span class="text-label text-foreground">Survived by</span>
          <p class="rounded-md bg-muted px-3 py-2 text-body text-foreground" data-testid="survived-by">
            {{ survivedByText }}
          </p>
          <p class="text-caption italic text-muted-foreground">The party as it stands now. Kept as it is today.</p>
        </div>

        <div v-if="writesFarewell" class="flex flex-col gap-1.5">
          <span class="text-label text-foreground">Your farewell</span>
          <RichTextEditor v-model="farewell" size="md" placeholder="What would they say?" />
          <p class="text-caption italic text-muted-foreground">Optional. You can write or change it later from the card.</p>
        </div>

        <div v-if="writesFarewell && rememberedBy" class="flex flex-col gap-1.5">
          <span class="text-label text-foreground">Remembered by</span>
          <p class="rounded-md bg-muted px-3 py-2 text-body text-foreground" data-testid="remembered-by">
            {{ rememberedBy }}
          </p>
          <p class="text-caption italic text-muted-foreground">Your name today, kept as it is.</p>
        </div>

        <p v-if="note" class="text-body text-muted-foreground" data-testid="note">{{ note }}</p>
      </form>

      <aside class="setdown-aside" aria-label="How they will be remembered">
        <span class="setdown-aside-title">How they will be remembered</span>
        <div class="setdown-preview">
          <MemorialCard
            :memorial="draft"
            side="front"
            viewer="other"
            :candle-count="0"
            :lit-by-me="false"
          />
        </div>
        <span class="setdown-aside-note">
          {{ kind === "fallen" ? "The cameo greys and the border goes black the moment you confirm." : "The laurel and the gilt frame are added when you confirm." }}
        </span>
      </aside>
    </div>

    <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="ghost" size="md" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="md"
        :label="confirmLabel"
        :loading="busy"
        :disabled="!canSubmit"
        data-testid="confirm"
        @click="submit"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { fieldVariants } from "@/components/common/fieldVariants";
import MemorialCard from "@/components/memorials/MemorialCard.vue";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useCampaignMemorials, useEditMemorialAccount, useSetCharacterDown } from "@/composables/memorials/useMemorials";
import { useSpeciesNames } from "@/composables/rules/useSpecies";
import { useToast } from "@/composables/useToast";
import { formatGameDate } from "@/lib/memorials/gameDate";
import { writtenOrNull } from "@/lib/memorials/writing";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import type { CharacterMemorial, MemorialKind } from "@/types/memorial.types";
import type { PartyMember } from "@/types/party.types";

/**
 * One dialog for the three ways a memorial is written (Hall of the Fallen, #982, frames 06
 * and 08): "Mark as fallen" (DM), "Retire" (DM or the character's owner), and `edit`, where
 * the DM revises the account on a card already on the wall. A live card on the right shows
 * how they will be remembered as the form is filled.
 *
 * Only the fields the caller's role may write are sent; the server refuses the rest, so the
 * others go as null ("not written"). Fallen and the account/blow are DM-only, the farewell is
 * the owner's, and a retire is open to both. Nothing is navigated to afterwards: the sheet
 * stays put and its banner appears.
 *
 * A second fall after a restore starts from the account and blow the first one left, because
 * the server keeps them ("Everything that was written stays, in case they fall again").
 */
const props = defineProps<{
  open: boolean;
  mode: "fallen" | "retired" | "edit";
  /** The character being set down; required for `fallen` / `retired`. */
  member?: PartyMember | null;
  /** The memorial being revised; required for `edit`. */
  memorial?: CharacterMemorial | null;
}>();
const emit = defineEmits<{ close: [] }>();

const auth = useAuthStore();
const campaign = useCampaignStore();
const calendar = useCalendarStore();
const toast = useToast();
const setDown = useSetCharacterDown();
const editAccount = useEditMemorialAccount();
const { data: activeParty } = useActiveParty();
const { data: memorials } = useCampaignMemorials();
const speciesNameOf = useSpeciesNames(() => (props.member ? [props.member] : []));

const edit = computed(() => props.mode === "edit");
const kind = computed<MemorialKind>(() => (props.mode === "edit" ? (props.memorial?.kind ?? "fallen") : props.mode));
const characterName = computed(() => (props.memorial ? props.memorial.character_name : props.member ? props.member.name : ""));
const isDm = computed(() => auth.isDM);
const isOwner = computed(() => !!props.member && props.member.owner_user_id !== null && props.member.owner_user_id === auth.user?.id);
const writesAccount = computed(() => edit.value || isDm.value);
const writesFarewell = computed(() => !edit.value && kind.value === "retired" && isOwner.value);
const rememberedBy = computed(() => auth.publicName);

const gameDate = ref("");
const realDate = ref("");
const account = ref<string | null>(null);
const lastBlow = ref("");
const farewell = ref<string | null>(null);

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function textOrNull(text: string): string | null {
  return text.trim() === "" ? null : text.trim();
}

/** The memorial a character already has from an earlier fall, restored since. */
const earlier = computed(() => {
  const member = props.member;
  if (!member || !memorials.value) return null;
  const rows = memorials.value
    .filter((m) => m.party_member_id === member.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return rows.length > 0 ? rows[0] : null;
});

function fill() {
  if (edit.value && props.memorial) {
    const m = props.memorial;
    gameDate.value = m.game_date !== null ? m.game_date : "";
    realDate.value = m.real_date.slice(0, 10);
    account.value = m.account;
    lastBlow.value = m.last_blow !== null ? m.last_blow : "";
    farewell.value = null;
    return;
  }
  gameDate.value = formatGameDate(calendar.adapter, campaign.todayYear, campaign.todayMonth, campaign.todayDay);
  realDate.value = todayIso();
  const prior = earlier.value;
  account.value = prior ? prior.account : null;
  lastBlow.value = prior && prior.last_blow !== null ? prior.last_blow : "";
  farewell.value = prior ? prior.last_words : null;
}

watch(
  () => [props.open, props.member?.id, props.memorial?.id] as const,
  ([open]) => {
    if (open) fill();
  },
  { immediate: true },
);

// A restored memorial can arrive after the dialog opened; take its words in, but never over an edit.
watch(earlier, (prior, was) => {
  if (!props.open || edit.value || was || !prior) return;
  if (writtenOrNull(account.value) === null) account.value = prior.account;
  if (lastBlow.value === "" && prior.last_blow !== null) lastBlow.value = prior.last_blow;
});

const survivedBy = computed(() =>
  (activeParty.value ? activeParty.value : []).filter((m) => m.id !== props.member?.id).map((m) => m.name),
);

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
const survivedByText = computed(() =>
  survivedBy.value.length > 0 ? joinNames(survivedBy.value) : "No one else is in the party.",
);

const title = computed(() => {
  if (edit.value) return `${characterName.value}'s account`;
  return kind.value === "fallen" ? `Mark ${characterName.value} as Fallen?` : `Retire ${characterName.value}?`;
});
const subtitle = computed(() => {
  if (edit.value) return "Changes the card on the wall.";
  const name = characterName.value;
  return kind.value === "fallen"
    ? `${name} leaves the party tracker and the encounter roster, and is laid in the Hall of the Fallen. You can restore them to life later.`
    : `${name} leaves the party tracker and the encounter roster, and is honoured in the Hall of the Fallen. They can return whenever you like.`;
});
const note = computed(() => {
  if (edit.value) return null;
  const name = characterName.value;
  if (kind.value === "fallen") {
    const player = props.member?.player_name;
    return `${player ? player : "The player"} is told, and writes ${name}'s last words.`;
  }
  return isDm.value && !isOwner.value
    ? `${props.member?.player_name ? props.member.player_name : "The player"} is told.`
    : `Your DM is told, and writes how ${name} left.`;
});
const confirmLabel = computed(() => {
  if (edit.value) return "Save";
  return kind.value === "fallen" ? "Mark as fallen" : `Retire ${characterName.value}`;
});

/** What the card will say, built from the sheet and the form as it stands. */
const draft = computed<CharacterMemorial>(() => {
  const now = new Date().toISOString();
  const typedBlow = textOrNull(lastBlow.value);
  if (edit.value && props.memorial) {
    return {
      ...props.memorial,
      game_date: textOrNull(gameDate.value),
      real_date: realDate.value,
      account: writtenOrNull(account.value),
      last_blow: typedBlow,
    };
  }
  const member = props.member;
  return {
    id: "draft",
    party_member_id: member ? member.id : "",
    campaign_id: member && member.campaign_id !== null ? member.campaign_id : "",
    owner_user_id: member ? member.owner_user_id : null,
    marked_by: null,
    kind: kind.value,
    restored_at: null,
    game_date: textOrNull(gameDate.value),
    real_date: realDate.value,
    account: writesAccount.value ? writtenOrNull(account.value) : null,
    last_words: writesFarewell.value ? writtenOrNull(farewell.value) : null,
    last_blow: kind.value === "fallen" && writesAccount.value ? typedBlow : null,
    survived_by: kind.value === "fallen" ? survivedBy.value : [],
    player_name: member ? member.player_name : null,
    character_name: characterName.value,
    portrait_url: member ? member.portrait_url : null,
    portrait_focal_point: member && member.portrait_focal_point ? member.portrait_focal_point : null,
    species_name: member ? speciesNameOf(member) : null,
    class_name: member ? member.class : null,
    level: member ? member.level : null,
    campaign_name: campaign.activeCampaign ? campaign.activeCampaign.name : "",
    created_at: now,
    updated_at: now,
  };
});

const busy = computed(() => setDown.isPending.value || editAccount.isPending.value);
const canSubmit = computed(() => realDate.value !== "" && !busy.value && (edit.value ? !!props.memorial : !!props.member));

function submit() {
  if (!canSubmit.value) return;
  const onSuccess = () => emit("close");
  if (edit.value && props.memorial) {
    editAccount.mutate(
      {
        partyMemberId: props.memorial.party_member_id,
        gameDate: textOrNull(gameDate.value),
        realDate: realDate.value,
        account: writtenOrNull(account.value),
        lastBlow: props.memorial.kind === "fallen" ? textOrNull(lastBlow.value) : null,
      },
      { onSuccess, onError: (e) => toast.error(toast.fromError(e, "Could not save the account.")) },
    );
    return;
  }
  const member = props.member;
  if (!member) return;
  setDown.mutate(
    {
      partyMemberId: member.id,
      kind: kind.value,
      gameDate: textOrNull(gameDate.value),
      realDate: realDate.value,
      account: writesAccount.value ? writtenOrNull(account.value) : null,
      lastBlow: writesAccount.value && kind.value === "fallen" ? textOrNull(lastBlow.value) : null,
      lastWords: writesFarewell.value ? writtenOrNull(farewell.value) : null,
    },
    {
      onSuccess,
      onError: (e) =>
        toast.error(
          toast.fromError(e, kind.value === "fallen" ? `Could not mark ${member.name} as fallen.` : `Could not retire ${member.name}.`),
        ),
    },
  );
}
</script>

<style scoped>
.setdown-band {
  height: 0.625rem;
  flex-shrink: 0;
  background: #14100c;
}
.setdown-band[data-kind="retired"] {
  background: #b48a32;
}
.setdown-ribbon {
  position: absolute;
  top: 0.625rem;
  left: 1.25rem;
  z-index: 1;
  width: 0.875rem;
  height: 2.25rem;
  background: #14100c;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
}
.setdown-ribbon[data-kind="retired"] {
  background: #7a5a14;
}
.setdown-aside {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.125rem 0 1rem;
  background: #1c1612;
  color: #cbbda3;
}
.setdown-aside-title {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #d4a646;
}
.setdown-aside-note {
  padding: 0 1.125rem;
  text-align: center;
  font-size: 0.8125rem;
  font-style: italic;
  line-height: 1.4;
}
</style>
