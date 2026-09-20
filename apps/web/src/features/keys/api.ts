import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { api, supabase } from '@/lib/supabase'

export interface ApiKey {
  id: string
  project_id: string
  name: string
  key_prefix: string
  key_type: 'public' | 'secret'
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface CreatedApiKey {
  id: string
  /** The full key. This is the only moment it exists outside the ingest path. */
  api_key: string
  key_prefix: string
}

export function useApiKeys(projectId: string) {
  return useQuery({
    queryKey: queryKeys.apiKeys(projectId),
    queryFn: async (): Promise<ApiKey[]> => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, project_id, name, key_prefix, key_type, created_at, last_used_at, revoked_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ApiKey[]
    },
  })
}

/**
 * Creates a key and returns it in full, once.
 *
 * The response is deliberately not written into the query cache. Caching it would leave
 * the plaintext key sitting in memory for the rest of the session, reachable by anything
 * that can read the cache, for no benefit: it is shown once and then it is gone.
 */
export function useCreateApiKey(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      keyType: 'public' | 'secret'
    }): Promise<CreatedApiKey> => {
      const { data, error } = await api.rpc('create_api_key', {
        p_project_id: projectId,
        p_name: input.name,
        p_key_type: input.keyType,
      })
      if (error) throw error

      const created = data[0]
      if (!created) throw new Error('The key was not returned. Nothing was created.')
      return created
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(projectId) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLog('') })
    },
  })
}

export function useRevokeApiKey(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await api.rpc('revoke_api_key', { p_key_id: keyId })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(projectId) })
    },
  })
}
