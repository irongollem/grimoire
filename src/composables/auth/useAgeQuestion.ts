import { ref } from "vue";
import { isUnderAdultAge, isValidBirthMonth, type BirthMonth } from "@edge-shared/childAccount.ts";
import { rememberUnder16 } from "@/lib/ageGateSession";

/** What `resolveAge()` found: an adult answer, or an under-16 one that has
 *  already been recorded for this browser session. `null` means it couldn't
 *  resolve at all — `ageError` says why, and the caller should stay put. */
export type AgeResolution = "adult" | "under16";

/**
 * The age question every account-creating form asks first (#919): validate a
 * birth month/year, and on "under 16" remember the answer for this browser
 * session (`rememberUnder16`) so a reload or a back navigation can't simply
 * re-offer the question until it gives the wanted result.
 *
 * Was three near-identical copies — `SignupView`, `JoinCampaignView` and the
 * age-resolution half of `TermsGate.handleContinue()` — each re-deriving the
 * same validation and the same session-memory call. `AgeQuestionStep` wraps
 * this for the two views that show the question as its own step; `TermsGate`
 * uses the composable directly because its age fields sit inside a larger
 * form alongside the Terms checkbox, with its own submit logic after.
 */
export function useAgeQuestion() {
  const birthMonth = ref<number | null>(null);
  const birthYear = ref<number | null>(null);
  const ageError = ref("");

  /** Validates the current answer and, on under-16, records it. Returns
   *  `null` (with `ageError` set) when the answer isn't usable yet. */
  function resolveAge(): AgeResolution | null {
    ageError.value = "";
    if (birthMonth.value === null || birthYear.value === null) {
      ageError.value = "Please choose a birth month and year.";
      return null;
    }
    const birth: BirthMonth = { month: birthMonth.value, year: birthYear.value };
    const today = new Date();
    if (!isValidBirthMonth(birth, today)) {
      ageError.value = "That doesn't look like a valid birth month.";
      return null;
    }
    if (isUnderAdultAge(birth, today)) {
      rememberUnder16();
      return "under16";
    }
    return "adult";
  }

  return { birthMonth, birthYear, ageError, resolveAge };
}
