import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

export interface SavedViewQuery {
  events: string[]
  filterKey: string | null
  filterValue: string | null
  breakdown: string | null
  preset: string
}

export interface SavedView {
  id: string
  name: string
  query: SavedViewQuery
  is_shared: boolean
  created_at: string
}

export function useSavedViews(projectId: string) {
  return useQuery({
    queryKey: queryKeys.savedViews(projectId),
    queryFn: async (): Promise<SavedView[]> => {
      const { data, error } = await supabase
        .from('saved_views')
        .select('id, name, query, is_shared, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map((row) => ({ ...row, query: row.query as unknown as SavedViewQuery }))
    },
  })
}

export function useCreateSavedView(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; query: SavedViewQuery; isShared: boolean }) => {
      const { data: session } = await supabase.auth.getUser()
      const { error } = await supabase.from('saved_views').insert({
        project_id: projectId,
        name: input.name,
        query: input.query as unknown as Json,
        is_shared: input.isShared,
        created_by: session.user?.id,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.savedViews(projectId) })
    },
  })
}

export function useDeleteSavedView(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (viewId: string) => {
      const { error } = await supabase.from('saved_views').delete().eq('id', viewId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.savedViews(projectId) })
    },
  })
}
