import type { VersionedContentMetadata } from "@/types/content.types";
import type { AiProvenance } from "@/ai/provenance";
import type {
  Activation,
  FeatAbilityIncrease,
  FeatCategory,
  FeatPrerequisites,
  FeatureKind,
  FeatureMechanics,
} from "@/rules/features/mechanics.types";

/** Labels for `mechanics.activation`; a feature with none is passive. */
export const ACTIVATION_LABELS: Record<Activation, string> = {
  action: "Action",
  bonus_action: "Bonus Action",
  reaction: "Reaction",
  special: "Special",
};

export const FEAT_CATEGORY_LABELS: Record<FeatCategory, string> = {
  origin: "Origin",
  general: "General",
  fighting_style: "Fighting Style",
  epic_boon: "Epic Boon",
};

export interface ClassFeature extends VersionedContentMetadata {
  id: string;
  /** Null on an official row (#976): everyone reads it, only the admin writes it. */
  user_id: string | null;
  campaign_id: string | null;
  name: string;
  description: string | null; // Tiptap JSON string
  /** A feature is granted by a class or subclass; a feat is chosen. #976 */
  kind: FeatureKind;
  /** Feats only: the 2024 category. 2014 feats have none. */
  feat_category: FeatCategory | null;
  /** Feats only, as stored. Read through `parseFeatPrerequisites`; `prerequisite` is the book's wording. */
  prerequisites: FeatPrerequisites | null;
  /** Feats only: may be taken more than once. */
  repeatable: boolean;
  /** Feats only, as stored. Read through `parseFeatAbilityIncrease`. */
  ability_increase: FeatAbilityIncrease | null;
  /** What the feature does. Stored jsonb: read it through `parseMechanics`, never trust its shape. */
  mechanics: FeatureMechanics;
  source: string | null;
  prerequisite: string | null;
  tags: string[];
  open5e_import: boolean;
  /** Set when the row came from the AI generator; flipped by `markEdited` on a content edit. */
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

/** Columns the database defaults (a plain passive feature), so an insert may leave them out. */
type DefaultedColumns = "kind" | "feat_category" | "prerequisites" | "repeatable" | "ability_increase" | "mechanics";

export type ClassFeatureInsert = Omit<ClassFeature, "id" | "user_id" | "created_at" | "updated_at" | DefaultedColumns>
  & Partial<Pick<ClassFeature, DefaultedColumns>>;
export type ClassFeatureUpdate = Partial<ClassFeatureInsert>;
