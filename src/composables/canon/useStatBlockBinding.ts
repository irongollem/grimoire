import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import type { AskBind, AskBinder } from "@/lib/ask/askBind";

/**
 * The binder for a species' form (#1282): the monster the Familiar's card made becomes that form's stat block. A stat
 * block belongs to one form per campaign, so a refusal (the unique index) is an outcome the result card says, and the
 * monster stays made. `updateForm` has already toasted the database's own words; the card carries the way out.
 */
export function useStatBlockBinder(): AskBinder {
  const { updateForm } = useSpeciesEditing(() => false);

  async function bindToForm(bind: Extract<AskBind, { kind: "species_form" }>, monsterId: string, name: string) {
    const done = await updateForm(bind.formId, { monsterId });
    if (done === null) {
      return { ok: false, text: `${name} was made, but could not be tied to ${bind.formLabel}. A stat block belongs to one form only; pick it on the form in the Field guide.` };
    }
    return { ok: true, text: `Bound to ${bind.formLabel}.` };
  }

  return async (bind, record) => {
    switch (bind.kind) {
      case "species_form":
        return bindToForm(bind, record.id, record.name);
    }
  };
}
