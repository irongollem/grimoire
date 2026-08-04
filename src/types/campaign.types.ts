import type { SettingCalendarDef } from "@/settings/types";
import type { RulesetKey } from "@/types/ruleset.types";
import type { AiProvenance } from "@/ai/provenance";

/** Per-campaign house-rule toggles. Shape is open-ended; known keys are typed. */
export interface CampaignOptionalRules {
  /** PHB multiclass prereqs waived — any character can multiclass regardless of ability scores. */
  ignore_multiclass_prereqs?: boolean;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  /** Campaign-wide rules edition used by every rules-aware subsystem. */
  ruleset: RulesetKey;
  description: string | null;
  setting: string;
  current_year: number;
  current_month: number;
  current_day: number;
  calendar_id: string; // references CalendarAdapter.id, defaults to 'faerun'; 'custom' uses custom_calendar
  /** When calendar_id === 'custom', this holds the per-campaign calendar definition used to build a runtime adapter. */
  custom_calendar: SettingCalendarDef | null;
  theme: string; // references GrimoireTheme.id, defaults to 'grimoire'
  health_visibility: "strategic" | "immersive" | "unknown";
  immersive_rolls: boolean;
  /** When false, hide the VTT token layer from players entirely. The DM
   *  still sees their own view normally. Useful for in-person sessions
   *  where the VTT is used for map + fog only. */
  battle_map_show_tokens: boolean;
  optional_rules: CampaignOptionalRules;
  excluded_monster_ids: string[];
  disabled_class_names: string[];
  disabled_species_ids: string[];
  // AI keys — one slot per provider
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  gemini_api_key: string | null;
  falai_api_key: string | null;
  // Active provider selection
  text_provider: string | null;
  image_provider: string | null;
  ai_setting_prompt: string | null;
  allow_chronicle_promotion: boolean;
  ai_enabled: boolean;
  group_portrait_url: string | null;
  /** Provenance of group_portrait_url when set by the AI generator; null = not AI / unknown, or cleared by a manual upload that replaced the portrait (see useGroupPortrait). */
  group_portrait_ai_provenance: AiProvenance | null;
  spotify_client_id: string | null;
  ical_token: string; // UUID; used as the shared secret for the iCal subscription URL
  current_location_id: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

type ApiKeyFields =
  | "openai_api_key"
  | "anthropic_api_key"
  | "gemini_api_key"
  | "falai_api_key";
type PortraitFields = "group_portrait_url" | "group_portrait_ai_provenance";
type ProviderFields = "text_provider" | "image_provider";

export type CampaignInsert = Omit<
  Campaign,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "excluded_monster_ids"
  | "disabled_class_names"
  | "disabled_species_ids"
  | "health_visibility"
  | "immersive_rolls"
  | "optional_rules"
  | "ruleset"
  | ApiKeyFields
  | ProviderFields
  | "ai_setting_prompt"
  | "allow_chronicle_promotion"
  | "ical_token"
  | PortraitFields
  | "current_month"
  | "current_day"
  | "current_location_id"
  | "custom_calendar"
> & {
  excluded_monster_ids?: string[];
  disabled_class_names?: string[];
  disabled_species_ids?: string[];
  health_visibility?: Campaign["health_visibility"];
  immersive_rolls?: boolean;
  optional_rules?: CampaignOptionalRules;
  ruleset?: RulesetKey;
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
  gemini_api_key?: string | null;
  falai_api_key?: string | null;
  text_provider?: string | null;
  image_provider?: string | null;
  ai_setting_prompt?: string | null;
  allow_chronicle_promotion?: boolean;
  current_month?: number;
  current_day?: number;
  current_location_id?: string | null;
  custom_calendar?: SettingCalendarDef | null;
};
export type CampaignUpdate = Partial<CampaignInsert> & {
  ical_token?: string;
  spotify_client_id?: string | null;
  is_archived?: boolean;
  group_portrait_url?: string | null;
  group_portrait_ai_provenance?: AiProvenance | null;
};

export type CampaignRole = "dm" | "player";

export interface CampaignMember {
  id: string;
  campaign_id: string;
  user_id: string;
  role: CampaignRole;
  party_member_id: string | null;
  display_name: string | null;
  joined_at: string;
  updated_at: string;
}

export type CampaignMemberUpdate = Partial<
  Pick<CampaignMember, "display_name" | "party_member_id">
>;

export interface CampaignInvite {
  id: string;
  campaign_id: string;
  token: string;
  role: CampaignRole;
  created_by: string;
  label: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
}

export type CampaignInviteInsert = Pick<CampaignInvite, "campaign_id"> &
  Partial<Pick<CampaignInvite, "role" | "label" | "expires_at" | "max_uses">>;
