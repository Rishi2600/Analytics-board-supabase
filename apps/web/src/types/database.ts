export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  api: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string }
      breakdown: {
        Args: {
          p_event?: string
          p_from: string
          p_limit?: number
          p_project: string
          p_prop?: string
          p_to: string
        }
        Returns: {
          event_count: number
          prop_value: string
          share: number
        }[]
      }
      create_api_key: {
        Args: { p_key_type?: string; p_name: string; p_project_id: string }
        Returns: {
          api_key: string
          id: string
          key_prefix: string
        }[]
      }
      create_invite: {
        Args: { p_email: string; p_org_id: string; p_role: string }
        Returns: {
          invite_id: string
          token: string
        }[]
      }
      create_organization: {
        Args: { p_name: string; p_slug?: string }
        Returns: string
      }
      event_names: {
        Args: { p_project: string }
        Returns: {
          event_count: number
          event_name: string
        }[]
      }
      funnel: {
        Args: {
          p_from?: string
          p_project: string
          p_steps: Json
          p_to?: string
          p_window?: string
        }
        Returns: {
          conversion_from_first: number
          conversion_from_previous: number
          event_name: string
          step_index: number
          users: number
        }[]
      }
      ingestion_health: {
        Args: { p_from?: string; p_project: string; p_to?: string }
        Returns: {
          accepted: number
          bucket: string
          rejected: number
        }[]
      }
      list_org_members: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          email: string
          role: string
          user_id: string
        }[]
      }
      live_events: {
        Args: { p_limit?: number; p_project: string }
        Returns: {
          context: Json
          distinct_id: string
          event_name: string
          id: string
          properties: Json
          received_at: string
          session_id: string
          ts: string
        }[]
      }
      property_keys: {
        Args: { p_project: string }
        Returns: {
          enabled: boolean
          prop_key: string
        }[]
      }
      record_export_download: {
        Args: { p_export_id: string }
        Returns: undefined
      }
      rejection_reasons: {
        Args: { p_from?: string; p_project: string; p_to?: string }
        Returns: {
          last_seen: string
          reason: string
          sample: Json
          total: number
        }[]
      }
      resolution_for: {
        Args: { p_from: string; p_to: string }
        Returns: string
      }
      retention: {
        Args: {
          p_cohort_event: string
          p_from?: string
          p_period?: string
          p_periods?: number
          p_project: string
          p_return_event: string
          p_to?: string
        }
        Returns: {
          cohort_size: number
          cohort_start: string
          period_number: number
          rate: number
          returned: number
        }[]
      }
      revoke_api_key: { Args: { p_key_id: string }; Returns: undefined }
      rollup_status: {
        Args: { p_project: string }
        Returns: {
          lag_seconds: number
          last_error: string
          last_run_at: string
          last_status: string
          watermark: string
        }[]
      }
      summary: {
        Args: { p_from: string; p_project: string; p_to: string }
        Returns: {
          events_per_user: number
          prev_events_per_user: number
          prev_sessions: number
          prev_total_events: number
          prev_unique_users: number
          sessions: number
          timezone: string
          total_events: number
          unique_users: number
        }[]
      }
      timeseries: {
        Args: {
          p_events?: string[]
          p_filters?: Json
          p_from: string
          p_project: string
          p_resolution?: string
          p_to: string
        }
        Returns: {
          bucket: string
          event_count: number
          event_name: string
          resolution: string
        }[]
      }
      top_events: {
        Args: {
          p_from: string
          p_limit?: number
          p_project: string
          p_to: string
        }
        Returns: {
          event_count: number
          event_name: string
          share: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  jobs: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      backfill_range: {
        Args: { p_from: string; p_project_id: string; p_to: string }
        Returns: number
      }
      claim_export: {
        Args: { p_export_id: string }
        Returns: {
          format: string
          id: string
          kind: string
          params: Json
          project_id: string
        }[]
      }
      consume_rate_limit: {
        Args: {
          p_api_key_id: string
          p_capacity: number
          p_cost: number
          p_refill_per_second: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      discover_properties: {
        Args: { p_project_id: string; p_since: string }
        Returns: undefined
      }
      expire_exports: { Args: never; Returns: number }
      fail_export: {
        Args: { p_error: string; p_export_id: string }
        Returns: undefined
      }
      finish_export: {
        Args: {
          p_export_id: string
          p_row_count: number
          p_storage_path: string
        }
        Returns: undefined
      }
      ingest_batch: {
        Args: {
          p_api_key_id: string
          p_events: Json
          p_project_id: string
          p_rejected: Json
        }
        Returns: number
      }
      prune_events: { Args: { p_batch_size?: number }; Returns: number }
      random_key_material: { Args: { p_bytes?: number }; Returns: string }
      run_daily_rollups: { Args: { p_days?: number }; Returns: undefined }
      run_project_rollup: {
        Args: { p_lag?: string; p_project_id: string }
        Returns: undefined
      }
      run_rollups: { Args: never; Returns: undefined }
      sweep_query_cache: { Args: never; Returns: number }
      touch_api_key: { Args: { p_key_id: string }; Returns: undefined }
      verify_api_key: {
        Args: { p_presented_key: string }
        Returns: {
          api_key_id: string
          key_type: string
          project_id: string
        }[]
      }
      write_audit: {
        Args: {
          p_action: string
          p_actor: string
          p_metadata?: Json
          p_org_id: string
          p_target_id?: string
          p_target_type?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_key_secrets: {
        Row: {
          api_key_id: string
          key_hash: string
          salt: string
        }
        Insert: {
          api_key_id: string
          key_hash: string
          salt: string
        }
        Update: {
          api_key_id?: string
          key_hash?: string
          salt?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_key_secrets_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: true
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_prefix: string
          key_type: string
          last_used_at: string | null
          name: string
          project_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_prefix: string
          key_type: string
          last_used_at?: string | null
          name: string
          project_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_prefix?: string
          key_type?: string
          last_used_at?: string | null
          name?: string
          project_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          org_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          org_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          org_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      events_raw: {
        Row: {
          context: Json
          distinct_id: string
          event_name: string
          id: string
          ingest_id: string | null
          ip_hash: string | null
          project_id: string
          properties: Json
          received_at: string
          session_id: string | null
          ts: string
        }
        Insert: {
          context?: Json
          distinct_id: string
          event_name: string
          id?: string
          ingest_id?: string | null
          ip_hash?: string | null
          project_id: string
          properties?: Json
          received_at?: string
          session_id?: string | null
          ts: string
        }
        Update: {
          context?: Json
          distinct_id?: string
          event_name?: string
          id?: string
          ingest_id?: string | null
          ip_hash?: string | null
          project_id?: string
          properties?: Json
          received_at?: string
          session_id?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_raw_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      events_rejected: {
        Row: {
          api_key_id: string | null
          detail: string | null
          id: string
          project_id: string | null
          raw_payload: Json | null
          reason: string
          received_at: string
        }
        Insert: {
          api_key_id?: string | null
          detail?: string | null
          id?: string
          project_id?: string | null
          raw_payload?: Json | null
          reason: string
          received_at?: string
        }
        Update: {
          api_key_id?: string | null
          detail?: string | null
          id?: string
          project_id?: string | null
          raw_payload?: Json | null
          reason?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_rejected_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_rejected_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          format: string
          id: string
          kind: string
          params: Json
          project_id: string
          requested_by: string | null
          row_count: number | null
          status: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          format?: string
          id?: string
          kind: string
          params?: Json
          project_id: string
          requested_by?: string | null
          row_count?: number | null
          status?: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          format?: string
          id?: string
          kind?: string
          params?: Json
          project_id?: string
          requested_by?: string | null
          row_count?: number | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      indexed_properties: {
        Row: {
          enabled: boolean
          first_seen_at: string
          project_id: string
          prop_key: string
        }
        Insert: {
          enabled?: boolean
          first_seen_at?: string
          project_id: string
          prop_key: string
        }
        Update: {
          enabled?: boolean
          first_seen_at?: string
          project_id?: string
          prop_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "indexed_properties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          org_id: string
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          org_id: string
          role: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          org_id?: string
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          allowed_origins: string[]
          cache_epoch: number
          created_at: string
          filter_bots: boolean
          id: string
          name: string
          org_id: string
          retention_days: number
          slug: string
          timezone: string
        }
        Insert: {
          allowed_origins?: string[]
          cache_epoch?: number
          created_at?: string
          filter_bots?: boolean
          id?: string
          name: string
          org_id: string
          retention_days?: number
          slug: string
          timezone?: string
        }
        Update: {
          allowed_origins?: string[]
          cache_epoch?: number
          created_at?: string
          filter_bots?: boolean
          id?: string
          name?: string
          org_id?: string
          retention_days?: number
          slug?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      query_cache: {
        Row: {
          cache_key: string
          created_at: string
          epoch: number
          expires_at: string
          payload: Json
          project_id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          epoch: number
          expires_at: string
          payload: Json
          project_id: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          epoch?: number
          expires_at?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "query_cache_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          api_key_id: string
          tokens: number
          window_start: string
        }
        Insert: {
          api_key_id: string
          tokens?: number
          window_start?: string
        }
        Update: {
          api_key_id?: string
          tokens?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_buckets_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: true
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      rollup_events_daily: {
        Row: {
          bucket: string
          event_count: number
          event_name: string
          project_id: string
          session_count: number
        }
        Insert: {
          bucket: string
          event_count: number
          event_name: string
          project_id: string
          session_count: number
        }
        Update: {
          bucket?: string
          event_count?: number
          event_name?: string
          project_id?: string
          session_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "rollup_events_daily_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rollup_events_hourly: {
        Row: {
          bucket: string
          event_count: number
          event_name: string
          project_id: string
          session_count: number
        }
        Insert: {
          bucket: string
          event_count: number
          event_name: string
          project_id: string
          session_count: number
        }
        Update: {
          bucket?: string
          event_count?: number
          event_name?: string
          project_id?: string
          session_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "rollup_events_hourly_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rollup_property_daily: {
        Row: {
          day: string
          event_count: number
          event_name: string
          project_id: string
          prop_key: string
          prop_value: string
        }
        Insert: {
          day: string
          event_count: number
          event_name: string
          project_id: string
          prop_key: string
          prop_value: string
        }
        Update: {
          day?: string
          event_count?: number
          event_name?: string
          project_id?: string
          prop_key?: string
          prop_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "rollup_property_daily_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rollup_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          job_name: string
          project_id: string | null
          rows_read: number | null
          rows_written: number | null
          started_at: string
          status: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          project_id?: string | null
          rows_read?: number | null
          rows_written?: number | null
          started_at?: string
          status: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          project_id?: string | null
          rows_read?: number | null
          rows_written?: number | null
          started_at?: string
          status?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rollup_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rollup_state: {
        Row: {
          job_name: string
          project_id: string
          updated_at: string
          watermark: string
        }
        Insert: {
          job_name: string
          project_id: string
          updated_at?: string
          watermark?: string
        }
        Update: {
          job_name?: string
          project_id?: string
          updated_at?: string
          watermark?: string
        }
        Relationships: [
          {
            foreignKeyName: "rollup_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_shared: boolean
          name: string
          project_id: string
          query: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          name: string
          project_id: string
          query: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          name?: string
          project_id?: string
          query?: Json
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      session_activity_daily: {
        Row: {
          day: string
          project_id: string
          session_id: string
        }
        Insert: {
          day: string
          project_id: string
          session_id: string
        }
        Update: {
          day?: string
          project_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_activity_daily_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_daily: {
        Row: {
          day: string
          distinct_id: string
          project_id: string
        }
        Insert: {
          day: string
          distinct_id: string
          project_id: string
        }
        Update: {
          day?: string
          distinct_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_daily_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      slugify: { Args: { p_input: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  api: {
    Enums: {},
  },
  jobs: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

