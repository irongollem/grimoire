import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface AiSystemPrompt {
  id: string;
  generator_type: string;
  label: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function useAdminPrompts() {
  const qc = useQueryClient();

  const { data: prompts, isPending, isError } = useQuery({
    queryKey: ["admin", "prompts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_system_prompts")
        .select("*")
        .order("label");
      if (error) throw error;
      return data as AiSystemPrompt[];
    },
  });

  const updatePrompt = useMutation({
    mutationFn: async ({ generator_type, content }: { generator_type: string; content: string }) => {
      const { error } = await supabase
        .from("ai_system_prompts")
        .update({ content })
        .eq("generator_type", generator_type);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "prompts"] }),
  });

  return { prompts, isPending, isError, updatePrompt };
}
