import { parseMechanics } from "@/rules/features/mechanics";
import type { FeatureKind, FeatureMechanics } from "@/rules/features/mechanics.types";
import type { ClassFeature, ClassFeatureInsert } from "@/types/feature.types";
import { validateFeatFields, type FeatFormFields } from "@/components/feats/featFields";
import { deepEqual } from "@/lib/utils";

/** What the feature editor holds while the DM works: every editable column of a `class_features` row. */
export interface FeatureDraft {
  name: string;
  source: string;
  /** The book's wording of the prerequisite. A feat's structured conditions are in `feat`. */
  prerequisite: string;
  tags: string[];
  description: string | null;
  /** A campaign id, or "all" for every campaign. */
  campaignScope: string;
  mechanics: FeatureMechanics;
  feat: FeatFormFields;
}

/** A plain deep copy; `structuredClone` throws on the reactive proxies query data can be wrapped in. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function emptyDraft(campaignScope: string): FeatureDraft {
  return {
    name: "",
    source: "",
    prerequisite: "",
    tags: [],
    description: null,
    campaignScope,
    mechanics: {},
    feat: { feat_category: null, prerequisites: null, repeatable: false, ability_increase: null },
  };
}

export function draftFromFeature(feature: ClassFeature): FeatureDraft {
  return {
    name: feature.name,
    source: feature.source ?? "",
    prerequisite: feature.prerequisite ?? "",
    tags: [...feature.tags],
    description: feature.description,
    campaignScope: feature.campaign_id ?? "all",
    mechanics: clone(parseMechanics(feature.mechanics).mechanics),
    feat: {
      feat_category: feature.feat_category,
      prerequisites: feature.prerequisites ? clone(feature.prerequisites) : null,
      repeatable: feature.repeatable,
      ability_increase: feature.ability_increase ? clone(feature.ability_increase) : null,
    },
  };
}

export interface DraftCheck {
  /** The mechanics as they would be stored. Only meaningful when `errors` is empty. */
  mechanics: FeatureMechanics;
  feat: FeatFormFields;
  mechanicsErrors: string[];
  featErrors: string[];
}

/**
 * Runs the draft through the same parsers the app reads rows with. The parsers
 * drop what they cannot read, so a draft with errors must not be saved as parsed:
 * the editor pauses instead and shows the messages beside the fields.
 */
export function checkDraft(draft: FeatureDraft, kind: FeatureKind): DraftCheck {
  const { mechanics, errors } = parseMechanics(draft.mechanics);
  // The parser leaves out a part it rejected without saying the part was edited away;
  // a draft that differs from its own parse has a part the parser could not keep.
  const mechanicsErrors = [...errors];
  if (errors.length === 0 && !deepEqual(mechanics, draft.mechanics)) {
    mechanicsErrors.push("Some mechanics are incomplete: fill in every field of the parts you added, or remove them.");
  }
  if (kind === "feature") {
    return {
      mechanics,
      feat: { feat_category: null, prerequisites: null, repeatable: false, ability_increase: null },
      mechanicsErrors,
      featErrors: [],
    };
  }
  const { parsed, errors: featErrors } = validateFeatFields(draft.feat);
  return { mechanics, feat: parsed, mechanicsErrors, featErrors };
}

/** The columns a save writes. Campaign scope, the ruleset and provenance are added by the caller. */
export function contentColumns(draft: FeatureDraft, check: DraftCheck, kind: FeatureKind) {
  return {
    name: draft.name.trim(),
    source: draft.source.trim() || null,
    prerequisite: draft.prerequisite.trim() || null,
    description: draft.description,
    mechanics: check.mechanics,
    kind,
    ...check.feat,
  } satisfies Partial<ClassFeatureInsert>;
}

/** True when a save changes anything a human would call authoring (tags and scope are carve-outs). */
export function contentChanged(feature: ClassFeature, columns: ReturnType<typeof contentColumns>): boolean {
  return (
    columns.name !== feature.name ||
    columns.source !== feature.source ||
    columns.prerequisite !== feature.prerequisite ||
    !deepEqual(columns.description, feature.description) ||
    !deepEqual(columns.mechanics, parseMechanics(feature.mechanics).mechanics) ||
    columns.feat_category !== feature.feat_category ||
    !deepEqual(columns.prerequisites, feature.prerequisites) ||
    columns.repeatable !== feature.repeatable ||
    !deepEqual(columns.ability_increase, feature.ability_increase)
  );
}
