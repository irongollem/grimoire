export interface Campaign {
  id: string
  user_id: string
  name: string
  description: string | null
  setting: string
  current_year: number
  calendar_id: string   // references CalendarAdapter.id, defaults to 'faerun'
  created_at: string
  updated_at: string
}

export type CampaignInsert = Omit<Campaign, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type CampaignUpdate = Partial<CampaignInsert>
