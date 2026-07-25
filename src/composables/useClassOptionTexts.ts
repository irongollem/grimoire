// Campaign-supplied effect text for class text_pick options (e.g. Artificer
// infusions). The app ships only option names + level gates (mechanics); the
// descriptive text is not SRD-licensed, so campaign members transcribe it from
// their own sourcebooks and it lives in class_option_texts per campaign.
import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";

const QUERY_KEY = "class-option-texts";

export interface ClassOptionText {
  id: string;
  campaign_id: string;
  user_id: string;
  class_name: string;
  choice_key: string;
  option_name: string;
  description: string; // Tiptap JSON
  created_at: string;
  updated_at: string;
}

async function fetchTexts(campaignId: string, className: string, choiceKey: string): Promise<ClassOptionText[]> {
  const { data, error } = await supabase
    .from("class_option_texts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("class_name", className)
    .eq("choice_key", choiceKey);
  if (error) throw error;
  return data as ClassOptionText[];
}

export function useClassOptionTexts(className: string, choiceKey: string) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);

  const query = useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value, className, choiceKey]),
    queryFn: () => fetchTexts(campaignId.value!, className, choiceKey),
    enabled: () => !!campaignId.value,
  });

  const textByOption = computed(() => {
    const map = new Map<string, string>();
    for (const row of query.data.value ?? []) map.set(row.option_name, row.description);
    return map;
  });

  return { ...query, textByOption };
}

export function useSaveClassOptionText(className: string, choiceKey: string) {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  const { error: toastError, fromError } = useToast();

  return useMutation({
    mutationFn: async ({ optionName, description }: { optionName: string; description: string }) => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign");
      const user = getCurrentUser();
      const { error } = await supabase.from("class_option_texts").upsert(
        {
          campaign_id: campaignId,
          user_id: user!.id,
          class_name: className,
          choice_key: choiceKey,
          option_name: optionName,
          description,
        },
        { onConflict: "campaign_id,class_name,choice_key,option_name" },
      );
      if (error) throw error;
    },
    onSettled: (_data, error) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      if (error) toastError(fromError(error, "Failed to save the option text."));
    },
  });
}
