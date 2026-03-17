export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
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
      attendances: {
        Row: {
          id: string
          notes: string | null
          player_id: string
          session_id: string
          status: string
        }
        Insert: {
          id?: string
          notes?: string | null
          player_id: string
          session_id: string
          status?: string
        }
        Update: {
          id?: string
          notes?: string | null
          player_id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      availability: {
        Row: {
          id: string
          match_date: string
          note: string | null
          player_id: string
          responded_at: string | null
          status: string
          team_id: string
        }
        Insert: {
          id?: string
          match_date: string
          note?: string | null
          player_id: string
          responded_at?: string | null
          status?: string
          team_id: string
        }
        Update: {
          id?: string
          match_date?: string
          note?: string | null
          player_id?: string
          responded_at?: string | null
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booked_at: string | null
          booked_by: string | null
          booking_type: string
          family_id: string
          id: string
          notes: string | null
          player_id: string
          program_id: string | null
          session_id: string | null
          status: string
        }
        Insert: {
          booked_at?: string | null
          booked_by?: string | null
          booking_type: string
          family_id: string
          id?: string
          notes?: string | null
          player_id: string
          program_id?: string | null
          session_id?: string | null
          status?: string
        }
        Update: {
          booked_at?: string | null
          booked_by?: string | null
          booking_type?: string
          family_id?: string
          id?: string
          notes?: string | null
          player_id?: string
          program_id?: string | null
          session_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          created_at: string | null
          email: string | null
          hourly_rate: Json | null
          id: string
          is_owner: boolean | null
          name: string
          phone: string | null
          qualifications: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          hourly_rate?: Json | null
          id?: string
          is_owner?: boolean | null
          name: string
          phone?: string | null
          qualifications?: Json | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          hourly_rate?: Json | null
          id?: string
          is_owner?: boolean | null
          name?: string
          phone?: string | null
          qualifications?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      families: {
        Row: {
          address: string | null
          billing_prefs: Json | null
          created_at: string | null
          display_id: string
          family_name: string
          id: string
          notes: string | null
          preferred_name: string | null
          primary_contact: Json | null
          referred_by: string | null
          secondary_contact: Json | null
          status: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          billing_prefs?: Json | null
          created_at?: string | null
          display_id: string
          family_name: string
          id?: string
          notes?: string | null
          preferred_name?: string | null
          primary_contact?: Json | null
          referred_by?: string | null
          secondary_contact?: Json | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          billing_prefs?: Json | null
          created_at?: string | null
          display_id?: string
          family_name?: string
          id?: string
          notes?: string | null
          preferred_name?: string | null
          primary_contact?: Json | null
          referred_by?: string | null
          secondary_contact?: Json | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      family_balance: {
        Row: {
          balance_cents: number
          family_id: string
          last_updated: string | null
        }
        Insert: {
          balance_cents?: number
          family_id: string
          last_updated?: string | null
        }
        Update: {
          balance_cents?: number
          family_id?: string
          last_updated?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_balance_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          id: string
          family_id: string
          email: string
          token: string
          status: string
          created_by: string | null
          claimed_by: string | null
          created_at: string | null
          expires_at: string | null
          claimed_at: string | null
        }
        Insert: {
          id?: string
          family_id: string
          email: string
          token: string
          status?: string
          created_by?: string | null
          claimed_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          claimed_at?: string | null
        }
        Update: {
          id?: string
          family_id?: string
          email?: string
          token?: string
          status?: string
          created_by?: string | null
          claimed_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          claimed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string | null
          display_id: string
          due_date: string | null
          family_id: string
          id: string
          items: Json | null
          paid_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          display_id: string
          due_date?: string | null
          family_id: string
          id?: string
          items?: Json | null
          paid_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          display_id?: string
          due_date?: string | null
          family_id?: string
          id?: string
          items?: Json | null
          paid_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_notes: {
        Row: {
          coach_id: string | null
          created_at: string | null
          drills_used: string[] | null
          focus: string | null
          id: string
          next_plan: string | null
          notes: string | null
          player_id: string
          progress: string | null
          session_id: string
          video_url: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          drills_used?: string[] | null
          focus?: string | null
          id?: string
          next_plan?: string | null
          notes?: string | null
          player_id: string
          progress?: string | null
          session_id: string
          video_url?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          drills_used?: string[] | null
          focus?: string | null
          id?: string
          next_plan?: string | null
          notes?: string | null
          player_id?: string
          progress?: string | null
          session_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          player_id: string | null
          program_id: string | null
          session_id: string | null
          source: string
          thumbnail_url: string | null
          title: string | null
          type: string
          uploaded_by: string | null
          url: string
          visibility: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          player_id?: string | null
          program_id?: string | null
          session_id?: string | null
          source: string
          thumbnail_url?: string | null
          title?: string | null
          type: string
          uploaded_by?: string | null
          url: string
          visibility?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          player_id?: string | null
          program_id?: string | null
          session_id?: string | null
          source?: string
          thumbnail_url?: string | null
          title?: string | null
          type?: string
          uploaded_by?: string | null
          url?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          id: string
          notification_id: string
          user_id: string
          read_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          notification_id: string
          user_id: string
          read_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          notification_id?: string
          user_id?: string
          read_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_by: string | null
          id: string
          sent_at: string | null
          target_id: string | null
          target_level: string | null
          target_type: string
          title: string
          type: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_by?: string | null
          id?: string
          sent_at?: string | null
          target_id?: string | null
          target_level?: string | null
          target_type: string
          title: string
          type: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_by?: string | null
          id?: string
          sent_at?: string | null
          target_id?: string | null
          target_level?: string | null
          target_type?: string
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          category: string | null
          created_at: string | null
          description: string | null
          family_id: string
          id: string
          invoice_id: string | null
          notes: string | null
          payment_method: string
          received_at: string | null
          recorded_by: string | null
          square_payment_id: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          category?: string | null
          created_at?: string | null
          description?: string | null
          family_id: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_method: string
          received_at?: string | null
          recorded_by?: string | null
          square_payment_id?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          category?: string | null
          created_at?: string | null
          description?: string | null
          family_id?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_method?: string
          received_at?: string | null
          recorded_by?: string | null
          square_payment_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          ball_color: string | null
          coach_id: string | null
          comp_interest: string | null
          created_at: string | null
          current_focus: string[] | null
          dob: string | null
          family_id: string
          first_name: string
          id: string
          last_name: string
          level: string | null
          long_term_goal: string | null
          media_consent: boolean | null
          medical_notes: string | null
          physical_notes: string | null
          preferred_name: string | null
          short_term_goal: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          ball_color?: string | null
          coach_id?: string | null
          comp_interest?: string | null
          created_at?: string | null
          current_focus?: string[] | null
          dob?: string | null
          family_id: string
          first_name: string
          id?: string
          last_name: string
          level?: string | null
          long_term_goal?: string | null
          media_consent?: boolean | null
          medical_notes?: string | null
          physical_notes?: string | null
          preferred_name?: string | null
          short_term_goal?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          ball_color?: string | null
          coach_id?: string | null
          comp_interest?: string | null
          created_at?: string | null
          current_focus?: string[] | null
          dob?: string | null
          family_id?: string
          first_name?: string
          id?: string
          last_name?: string
          level?: string | null
          long_term_goal?: string | null
          media_consent?: boolean | null
          medical_notes?: string | null
          physical_notes?: string | null
          preferred_name?: string | null
          short_term_goal?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      program_coaches: {
        Row: {
          availability: string | null
          coach_id: string
          id: string
          program_id: string
          role: string
        }
        Insert: {
          availability?: string | null
          coach_id: string
          id?: string
          program_id: string
          role?: string
        }
        Update: {
          availability?: string | null
          coach_id?: string
          id?: string
          program_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_coaches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_roster: {
        Row: {
          enrolled_at: string | null
          id: string
          player_id: string
          program_id: string
          status: string
        }
        Insert: {
          enrolled_at?: string | null
          id?: string
          player_id: string
          program_id: string
          status?: string
        }
        Update: {
          enrolled_at?: string | null
          id?: string
          player_id?: string
          program_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_roster_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_roster_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string | null
          day_of_week: number | null
          description: string | null
          duration_min: number | null
          end_time: string | null
          id: string
          level: string
          max_capacity: number | null
          name: string
          per_session_cents: number | null
          slug: string | null
          start_time: string | null
          status: string
          term: string | null
          term_fee_cents: number | null
          type: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week?: number | null
          description?: string | null
          duration_min?: number | null
          end_time?: string | null
          id?: string
          level: string
          max_capacity?: number | null
          name: string
          per_session_cents?: number | null
          slug?: string | null
          start_time?: string | null
          status?: string
          term?: string | null
          term_fee_cents?: number | null
          type: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number | null
          description?: string | null
          duration_min?: number | null
          end_time?: string | null
          id?: string
          level?: string
          max_capacity?: number | null
          name?: string
          per_session_cents?: number | null
          slug?: string | null
          start_time?: string | null
          status?: string
          term?: string | null
          term_fee_cents?: number | null
          type?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          keys?: Json
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          cancellation_reason: string | null
          coach_id: string | null
          created_at: string | null
          date: string
          end_time: string | null
          id: string
          notes: string | null
          program_id: string | null
          session_type: string
          start_time: string | null
          status: string
          venue_id: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          coach_id?: string | null
          created_at?: string | null
          date: string
          end_time?: string | null
          id?: string
          notes?: string | null
          program_id?: string | null
          session_type: string
          start_time?: string | null
          status?: string
          venue_id?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          coach_id?: string | null
          created_at?: string | null
          date?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          program_id?: string | null
          session_type?: string
          start_time?: string | null
          status?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string | null
          player_id: string
          role: string
          team_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          player_id: string
          role?: string
          team_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          player_id?: string
          role?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          body: string
          created_at: string | null
          id: string
          sender_id: string
          team_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          sender_id: string
          team_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          sender_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          captain_id: string | null
          coach_id: string | null
          created_at: string | null
          id: string
          name: string
          program_id: string | null
          season: string | null
          status: string
        }
        Insert: {
          captain_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          program_id?: string | null
          season?: string | null
          status?: string
        }
        Update: {
          captain_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          program_id?: string | null
          season?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          coach_id: string | null
          family_id: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          coach_id?: string | null
          family_id?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          coach_id?: string | null
          family_id?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          courts: number | null
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          address?: string | null
          courts?: number | null
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          address?: string | null
          courts?: number | null
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_coach_id: { Args: { user_uuid: string }; Returns: string }
      get_user_family_id: { Args: { user_uuid: string }; Returns: string }
      get_user_role: { Args: { user_uuid: string }; Returns: string }
      is_admin: { Args: { user_uuid: string }; Returns: boolean }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
