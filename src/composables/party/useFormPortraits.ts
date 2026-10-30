import { toValue, type MaybeRefOrGetter } from "vue";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { formPortrait, type FormPortrait, type PortraitSubject } from "@/lib/wildshapePortrait";
import type { WildshapeState } from "@/types/encounter.types";

/**
 * `formPortrait` with each beast's picture as it reads now (library art merged),
 * for the forms on screen. A form's own `beast_image_url` is a copy taken when
 * it was assumed, and null for a library beast whose picture lives in the art
 * tables, so a caller that passes only the form draws the placeholder.
 *
 * Pass every form the component draws (`() => [form]` for one); the read is
 * batched with other callers' in the same tick. Returns a function so it can be
 * used inside a list loop; wrap the call in `computed` at the call site so it
 * reacts when the beast resolves.
 */
export function useFormPortraits(forms: MaybeRefOrGetter<readonly (WildshapeState | null | undefined)[]>) {
  const { data: beasts } = useMonstersByIds(() => toValue(forms).map((f) => f?.monster_id), { withArt: true });
  return (subject: PortraitSubject, form: WildshapeState | null | undefined): FormPortrait =>
    formPortrait(subject, form, form ? beasts.value.get(form.monster_id)?.image_url : null);
}
