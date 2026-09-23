import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { api, supabase } from '@/lib/supabase'

export interface OrgMember {
  user_id: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  created_at: string
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orgMembers(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<OrgMember[]> => {
      const { data, error } = await api.rpc('list_org_members', { p_org_id: orgId ?? '' })
      if (error) throw error
      return data as OrgMember[]
    },
  })
}

const NOT_ALLOWED = 'Only an owner or admin can change who is in this organization.'

export function useUpdateMemberRole(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { userId: string; role: OrgMember['role'] }) => {
      const { data, error } = await supabase
        .from('org_members')
        .update({ role: input.role })
        .eq('org_id', orgId)
        .eq('user_id', input.userId)
        .select('user_id')
      if (error) throw error
      // Row level security turns a change you may not make into a change of zero rows.
      if (data.length === 0) throw new Error(NOT_ALLOWED)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers(orgId) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLog(orgId) })
    },
  })
}

export function useRemoveMember(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase
        .from('org_members')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .select('user_id')
      if (error) throw error
      if (data.length === 0) throw new Error(NOT_ALLOWED)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers(orgId) })
    },
  })
}

export function useCreateInvite(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; role: 'admin' | 'member' | 'viewer' }) => {
      const { data, error } = await api.rpc('create_invite', {
        p_org_id: orgId,
        p_email: input.email,
        p_role: input.role,
      })
      if (error) throw error
      const row = data[0]
      if (!row) throw new Error('The invite was not returned. Nothing was created.')
      return row
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.orgInvites(orgId) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLog(orgId) })
    },
  })
}

export interface AuditEntry {
  id: string
  actor_user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export function useAuditLog(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.auditLog(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, actor_user_id, action, target_type, target_id, metadata, created_at')
        .eq('org_id', orgId ?? '')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as AuditEntry[]
    },
  })
}
