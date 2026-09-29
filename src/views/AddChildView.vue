<template>
  <PageHeader title="Add a Young Player" description="A parent-managed account for a player under 16">
    <div class="max-w-lg space-y-6">
      <div v-if="inspecting" class="flex justify-center py-8">
        <div class="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>

      <!-- A request token that didn't resolve is a dead end: nothing here can be
           reasonably created without knowing what it was approving. -->
      <template v-else-if="requestToken && requestError">
        <p class="text-body text-destructive">{{ requestError }}</p>
        <AppButton variant="outline" size="md" label="Back to Family" to="/account/family" />
      </template>

      <template v-else>
        <div v-if="requestInfo" class="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-1.5">
          <p class="text-body text-foreground font-semibold">You're approving a request from a young player</p>
          <p v-if="requestInfo.existingAccount" class="text-body text-muted-foreground">
            They already have an account: approving turns it into a young player's account you manage,
            with the login name and password you set here.
          </p>
          <p v-if="requestInfo.campaignName" class="text-body text-muted-foreground">
            They'll join {{ requestInfo.campaignName }}.
          </p>
        </div>

        <form class="space-y-5" @submit.prevent="submit">
          <div class="space-y-1.5">
            <label class="text-body text-foreground" for="child-display-name">Display name</label>
            <AppInput
              id="child-display-name"
              v-model="displayName"
              type="text"
              tone="default"
              size="body"
              placeholder="Robin"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-body text-foreground" for="child-login-name">Login name</label>
            <AppInput
              id="child-login-name"
              v-model="loginName"
              type="text"
              tone="default"
              size="body"
              autocomplete="off"
              placeholder="robin-the-brave"
              @blur="loginNameTouched = true"
            />
            <p
              class="text-caption"
              :class="loginNameTouched && !loginNameValid ? 'text-destructive' : 'text-muted-foreground'"
            >
              3-30 lowercase letters, numbers or hyphens; they type this to sign in.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-body text-foreground" for="child-password">Password</label>
              <AppInput
                id="child-password"
                v-model="password"
                type="password"
                tone="default"
                size="body"
                autocomplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-body text-foreground" for="child-password-confirm">Confirm password</label>
              <AppInput
                id="child-password-confirm"
                v-model="confirmPassword"
                type="password"
                tone="default"
                size="body"
                autocomplete="new-password"
              />
            </div>
          </div>
          <p v-if="confirmPassword && password !== confirmPassword" class="text-caption text-destructive">
            Passwords don't match.
          </p>

          <BirthMonthField
            v-model:month="birthMonth"
            v-model:year="birthYear"
            legend="When was your child born?"
          />
          <p v-if="birthTooOld" class="text-caption text-destructive">
            That birth date makes them 16 or older. They can create their own account instead of a
            young player's one.
          </p>

          <div class="space-y-2">
            <AppCheckbox v-model="consented" align="start" label-role="caption">
              I am this child's parent or legal guardian. I accept the
              <a :href="legalUrl('terms')" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">Terms of Service</a>
              on their behalf and consent to Grimoire processing their account data as the
              <a :href="legalUrl('privacy')" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">Privacy Policy</a>'s
              section on children describes. Their account cannot use AI features, buy anything or
              receive email. Characters and notes they write are game content: a Dungeon Master
              running AI features in a campaign they play in may include them. I can download or
              delete their account from this page at any time.
            </AppCheckbox>
            <p class="text-caption text-muted-foreground pl-6">
              <a :href="legalUrl('young-players')" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">Read it together</a>,
              our page about young players' accounts.
            </p>
          </div>

          <p v-if="submitError" class="text-body text-destructive">{{ submitError }}</p>

          <AppButton
            type="submit"
            variant="primary"
            size="lg"
            block
            :loading="createChild.isPending.value"
            :disabled="!canSubmit"
            label="Add young player"
          />
        </form>
      </template>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * "Add a young player" (#919) — creates a parent-managed account for a player
 * under 16, or (with `?request=`) approves an incoming request from one.
 */
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import BirthMonthField from "@/components/auth/BirthMonthField.vue";
import { useToast } from "@/composables/useToast";
import { legalUrl } from "@/lib/marketing";
import { isValidLoginName } from "@edge-shared/childAccount.ts";
import {
  childAccountErrorMessage,
  childFormErrors,
  useCreateChild,
  useInspectChildRequest,
  type ChildFormState,
  type InspectRequestResult,
} from "@/composables/account/useFamily";

const route = useRoute();
const router = useRouter();
const { success } = useToast();

const requestToken = computed(() =>
  typeof route.query.request === "string" ? route.query.request : null,
);

const displayName = ref("");
const loginName = ref("");
const loginNameTouched = ref(false);
const password = ref("");
const confirmPassword = ref("");
const birthMonth = ref<number | null>(null);
const birthYear = ref<number | null>(null);
const consented = ref(false);
const submitError = ref<string | null>(null);

const loginNameValid = computed(() => isValidLoginName(loginName.value));

const formState = computed<ChildFormState>(() => ({
  displayName: displayName.value,
  loginName: loginName.value,
  password: password.value,
  confirmPassword: confirmPassword.value,
  birthMonth: birthMonth.value,
  birthYear: birthYear.value,
  consented: consented.value,
}));

const formErrors = computed(() => childFormErrors(formState.value));
const birthTooOld = computed(
  () =>
    birthMonth.value !== null &&
    birthYear.value !== null &&
    formErrors.value.some((e) => e.includes("16 or older")),
);

const createChild = useCreateChild();
const canSubmit = computed(() => formErrors.value.length === 0 && !createChild.isPending.value);

async function submit() {
  if (!canSubmit.value || birthMonth.value === null || birthYear.value === null) return;
  submitError.value = null;
  try {
    const result = await createChild.mutateAsync({
      displayName: displayName.value.trim(),
      loginName: loginName.value,
      password: password.value,
      birth: { month: birthMonth.value, year: birthYear.value },
      requestToken: requestToken.value ?? undefined,
    });
    const name = displayName.value.trim();
    const joined = result.joinedCampaign;
    if (joined?.status === "pending") {
      success(
        `${name} can now sign in as ${result.loginName}. They'll join ${joined.name} once the other family's parent says yes.`,
      );
    } else {
      success(`${name} can now sign in as ${result.loginName}.`);
    }
    router.push("/account/family");
  } catch (err) {
    submitError.value = childAccountErrorMessage(err instanceof Error ? err.message : String(err));
  }
}

// ── Incoming request (?request=) ────────────────────────────────────────────
const inspecting = ref(Boolean(requestToken.value));
const requestInfo = ref<InspectRequestResult | null>(null);
const requestError = ref<string | null>(null);
const inspectRequest = useInspectChildRequest();

onMounted(async () => {
  if (!requestToken.value) return;
  try {
    requestInfo.value = await inspectRequest.mutateAsync(requestToken.value);
  } catch (err) {
    requestError.value = childAccountErrorMessage(err instanceof Error ? err.message : String(err));
  } finally {
    inspecting.value = false;
  }
});
</script>
