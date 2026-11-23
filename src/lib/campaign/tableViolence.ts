import type { Campaign } from "@/types/campaign.types";

/**
 * How hard the AI table's Narrator tells violence and horror (`campaigns.table_violence`). The words are shown in two
 * places that must agree: the dial in Campaign settings and the line under "Lines and veils" in the Canon's premise.
 */
export const TABLE_VIOLENCE_OPTIONS = [
  { value: "gentle" as const, label: "Gentle", desc: "Danger and defeat are told without lingering on wounds, blood or cruelty. For younger or gentler players." },
  { value: "standard" as const, label: "Standard", desc: "Told plainly, the way a D&D table tells it, without relish." },
  { value: "grim" as const, label: "Grim", desc: "Wounds, fear and horror are told with weight and consequence, still never gore for its own sake." },
] as const;

/** The dial's label for a campaign, "Standard" when its row has none (the column's default). */
export function tableViolenceLabel(value: Campaign["table_violence"] | null | undefined): string {
  const match = TABLE_VIOLENCE_OPTIONS.find((o) => o.value === value);
  return (match ?? TABLE_VIOLENCE_OPTIONS[1]).label;
}
