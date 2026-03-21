export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  setting: string;
  current_year: number;
  calendar_id: string; // references CalendarAdapter.id, defaults to 'faerun'
  theme: string;       // references GrimoireTheme.id, defaults to 'grimoire'
  excluded_monster_ids: string[];
  created_at: string;
  updated_at: string;
}

export type CampaignInsert = Omit<Campaign, "id" | "user_id" | "created_at" | "updated_at" | "excluded_monster_ids"> & { excluded_monster_ids?: string[] };
export type CampaignUpdate = Partial<CampaignInsert>;

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
