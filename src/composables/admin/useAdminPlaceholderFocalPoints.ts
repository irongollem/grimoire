import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '@/lib/supabase';
import { updatePlaceholderFocalPointCache } from '@/lib/placeholderFocalPoints';

export type PlaceholderFocalPoints = Record<string, { x: number; y: number }>;

const QUERY_KEY = ['app_settings', 'placeholder_focal_points'] as const;

export function useAdminPlaceholderFocalPoints() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<PlaceholderFocalPoints> => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'placeholder_focal_points')
        .maybeSingle();
      return (data?.value as PlaceholderFocalPoints) ?? {};
    },
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async ({ entityType, fp }: { entityType: string; fp: { x: number; y: number } }) => {
      const current = qc.getQueryData<PlaceholderFocalPoints>(QUERY_KEY) ?? {};
      const updated = { ...current, [entityType]: fp };
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'placeholder_focal_points', value: updated });
      if (error) throw error;
      return updated;
    },
    onMutate: async ({ entityType, fp }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<PlaceholderFocalPoints>(QUERY_KEY);
      qc.setQueryData(QUERY_KEY, { ...prev, [entityType]: fp });
      updatePlaceholderFocalPointCache(entityType, fp);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSuccess: (updated) => {
      qc.setQueryData(QUERY_KEY, updated);
    },
  });

  return { query, mutation };
}
