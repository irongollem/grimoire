/** Per-campaign house-rule toggles. Shape is open-ended; known keys are typed. */
export interface CampaignOptionalRules {
  /** PHB multiclass prereqs waived — any character can multiclass regardless of ability scores. */
  ignore_multiclass_prereqs?: boolean;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  setting: string;
  current_year: number;
  calendar_id: string;  // references CalendarAdapter.id, defaults to 'faerun'
  theme: string;        // references GrimoireTheme.id, defaults to 'grimoire'
  health_visibility: "strategic" | "immersive" | "unknown";
  immersive_rolls: boolean;
  optional_rules: CampaignOptionalRules;
  excluded_monster_ids: string[];
  disabled_class_names: string[];
  openai_api_key: string | null;
  text_api_key: string | null;
  ai_setting_prompt: string | null;
  spotify_client_id: string | null;
  ical_token: string;   // UUID; used as the shared secret for the iCal subscription URL
  created_at: string;
  updated_at: string;
}

export type CampaignInsert = Omit<Campaign, "id" | "user_id" | "created_at" | "updated_at" | "excluded_monster_ids" | "disabled_class_names" | "health_visibility" | "immersive_rolls" | "optional_rules" | "openai_api_key" | "text_api_key" | "ai_setting_prompt" | "ical_token"> & { excluded_monster_ids?: string[]; disabled_class_names?: string[]; health_visibility?: Campaign["health_visibility"]; immersive_rolls?: boolean; optional_rules?: CampaignOptionalRules; openai_api_key?: string | null; text_api_key?: string | null; ai_setting_prompt?: string | null };
export type CampaignUpdate = Partial<CampaignInsert> & { ical_token?: string; spotify_client_id?: string | null };

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

export type CampaignMemberUpdate = Partial<Pick<CampaignMember, "display_name" | "party_member_id">>;

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
