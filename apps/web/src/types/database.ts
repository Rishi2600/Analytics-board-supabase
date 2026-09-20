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
      list_org_members: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          email: string
          role: string
          user_id: string
        }[]
      }
      revoke_api_key: { Args: { p_key_id: string }; Returns: undefined }
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
  public: {
    Enums: {},
  },
} as const

