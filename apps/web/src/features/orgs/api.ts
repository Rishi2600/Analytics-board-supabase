import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { api, supabase } from '@/lib/supabase'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
}

/** Every organization the signed-in user belongs to. Row level security does the scoping;
 *  there is no org filter in this query because there does not need to be one. */
export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations(),
    queryFn: async (): Promise<Organization[]> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, created_at')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/**
 * Creates an organization and makes the caller its owner, in one transaction.
 *
 * This goes through a function rather than an insert. There is no insert policy on
 * organizations at all: a direct insert cannot return the new row to its creator, because
 * the row level security check on the RETURNING clause runs before any trigger could have
 * written the membership row.
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; slug?: string }): Promise<string> => {
      const { data, error } = await api.rpc('create_organization', {
        p_name: input.name,
        p_slug: input.slug,
      })
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations() })
    },
  })
}

export function useAcceptInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (token: string): Promise<string> => {
      const { data, error } = await api.rpc('accept_invite', { p_token: token })
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
    },
  })
}
