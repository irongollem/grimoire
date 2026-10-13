import { inject, onScopeDispose, watchEffect, type ComputedRef, type InjectionKey } from "vue";

/**
 * The DM's disclosure labels, shared by every rich-text viewer on screen. The
 * DM layout provides one instance; a viewer holding a secret block asks for it
 * while mounted, so the memories are read once, and only while some viewer
 * shows a secret. The player layout provides nothing, so the player portal
 * never reads them (and never receives a secret block to label).
 */
export interface SecretDisclosures {
  labels: ComputedRef<ReadonlyMap<string, string>>;
  /** Registers interest; call the returned function to release it. */
  want(): () => void;
}

export const SECRET_DISCLOSURES_KEY: InjectionKey<SecretDisclosures> = Symbol("secret-disclosures");

/** The labels for a viewer, or null outside the DM layout. Registers interest while `active` holds. */
export function useSecretDisclosures(active: () => boolean): ComputedRef<ReadonlyMap<string, string>> | null {
  const disclosures = inject(SECRET_DISCLOSURES_KEY, null);
  if (!disclosures) return null;
  let release: (() => void) | null = null;
  const sync = () => {
    if (active() && !release) release = disclosures.want();
    else if (!active() && release) {
      release();
      release = null;
    }
  };
  watchEffect(sync);
  onScopeDispose(() => release?.());
  return disclosures.labels;
}
