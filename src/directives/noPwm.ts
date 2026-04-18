import type { Directive } from "vue";

/**
 * `v-no-pwm` — suppress password-manager overlays on inputs that are not
 * credential fields. Apply to any <input> (or a wrapper element that contains
 * one) to stop 1Password, LastPass, Bitwarden, etc. from rendering their
 * autofill icons over unrelated content.
 *
 * Usage:
 *   <input v-no-pwm … />
 *   <div v-no-pwm>  <!-- stamps attrs on all descendant <input>s -->
 */
function stamp(el: HTMLElement) {
  const inputs =
    el.tagName === "INPUT"
      ? [el as HTMLInputElement]
      : Array.from(el.querySelectorAll<HTMLInputElement>("input"));

  for (const input of inputs) {
    if (input.type === "password") continue;
    input.setAttribute("autocomplete", "off");
    input.setAttribute("data-lpignore", "true");   // LastPass
    input.setAttribute("data-1p-ignore", "");      // 1Password
    input.setAttribute("data-bwignore", "");       // Bitwarden
  }
}

export const noPwm: Directive = {
  mounted: (el: HTMLElement) => stamp(el),
  updated: (el: HTMLElement) => stamp(el),
};
