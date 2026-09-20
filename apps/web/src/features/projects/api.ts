import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'

export interface Project {
  id: string
  org_id: string
  name: string
  slug: string
  timezone: string
  retention_days: number
  allowed_origins: string[]
  filter_bots: boolean
  created_at: string
}

const PROJECT_COLUMNS =
  'id, org_id, name, slug, timezone, retention_days, allowed_origins, filter_bots, created_at'

/** Every project the user can see, across all their organizations. */
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select(PROJECT_COLUMNS)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Project> => {
      const { data, error } = await supabase
        .from('projects')
        .select(PROJECT_COLUMNS)
        .eq('id', projectId ?? '')
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      orgId: string
      name: string
      slug: string
      timezone: string
    }): Promise<Project> => {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          org_id: input.orgId,
          name: input.name,
          slug: input.slug,
          timezone: input.timezone,
        })
        .select(PROJECT_COLUMNS)
        .single()
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
    },
  })
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patch: Partial<Omit<Project, 'id' | 'org_id' | 'created_at'>>) => {
      const { data, error } = await supabase
        .from('projects')
        .update(patch)
        .eq('id', projectId)
        .select(PROJECT_COLUMNS)
        .single()
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
    },
  })
}
