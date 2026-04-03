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
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          auto_approved: boolean
          booked_at: string | null
          booked_by: string | null
          booking_type: string
          cancellation_type: string | null
          discount_cents: number | null
          duration_minutes: number | null
          family_id: string
          id: string
          is_standing: boolean
          notes: string | null
          payment_option: string | null
          player_id: string
          price_cents: number | null
          program_id: string | null
          second_family_id: string | null
          second_player_id: string | null
          session_id: string | null
          sessions_charged: number | null
          sessions_total: number | null
          standing_parent_id: string | null
          status: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          auto_approved?: boolean
          booked_at?: string | null
          booked_by?: string | null
          booking_type: string
          cancellation_type?: string | null
          discount_cents?: number | null
          duration_minutes?: number | null
          family_id: string
          id?: string
          is_standing?: boolean
          notes?: string | null
          payment_option?: string | null
          player_id: string
          price_cents?: number | null
          program_id?: string | null
          second_family_id?: string | null
          second_player_id?: string | null
          session_id?: string | null
          sessions_charged?: number | null
          sessions_total?: number | null
          standing_parent_id?: string | null
          status?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          auto_approved?: boolean
          booked_at?: string | null
          booked_by?: string | null
          booking_type?: string
          cancellation_type?: string | null
          discount_cents?: number | null
          duration_minutes?: number | null
          family_id?: string
          id?: string
          is_standing?: boolean
          notes?: string | null
          payment_option?: string | null
          player_id?: string
          price_cents?: number | null
          program_id?: string | null
          second_family_id?: string | null
          second_player_id?: string | null
          session_id?: string | null
          sessions_charged?: number | null
          sessions_total?: number | null
          standing_parent_id?: string | null
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
            foreignKeyName: "bookings_second_family_id_fkey"
            columns: ["second_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_second_player_id_fkey"
            columns: ["second_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_standing_parent_id_fkey"
            columns: ["standing_parent_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_tracker: {
        Row: {
          created_at: string | null
          family_id: string
          id: string
          late_cancellation_count: number
          noshow_count: number
          term: number
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          family_id: string
          id?: string
          late_cancellation_count?: number
          noshow_count?: number
          term: number
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          family_id?: string
          id?: string
          late_cancellation_count?: number
          noshow_count?: number
          term?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_tracker_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount_cents: number
          booking_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          family_id: string
          id: string
          invoice_id: string | null
          player_id: string | null
          program_id: string | null
          session_id: string | null
          source_id: string | null
          source_type: string
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          family_id: string
          id?: string
          invoice_id?: string | null
          player_id?: string | null
          program_id?: string | null
          session_id?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          family_id?: string
          id?: string
          invoice_id?: string | null
          player_id?: string | null
          program_id?: string | null
          session_id?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      club_events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          event_type: string
          external_url: string | null
          id: string
          location: string | null
          start_date: string
          start_time: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type?: string
          external_url?: string | null
          id?: string
          location?: string | null
          start_date: string
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type?: string
          external_url?: string | null
          id?: string
          location?: string | null
          start_date?: string
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      coach_availability: {
        Row: {
          coach_id: string
          created_at: string | null
          day_of_week: number
          effective_from: string
          effective_until: string | null
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          day_of_week: number
          effective_from?: string
          effective_until?: string | null
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          day_of_week?: number
          effective_from?: string
          effective_until?: string | null
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_availability_exceptions: {
        Row: {
          coach_id: string
          created_at: string | null
          end_time: string | null
          exception_date: string
          id: string
          reason: string | null
          start_time: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          end_time?: string | null
          exception_date: string
          id?: string
          reason?: string | null
          start_time?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          end_time?: string | null
          exception_date?: string
          id?: string
          reason?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_exceptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_earnings: {
        Row: {
          amount_cents: number
          coach_id: string
          created_at: string | null
          duration_minutes: number
          id: string
          pay_period_key: string
          session_id: string
          session_type: string
          status: string
          term: number | null
          year: number | null
        }
        Insert: {
          amount_cents: number
          coach_id: string
          created_at?: string | null
          duration_minutes: number
          id?: string
          pay_period_key: string
          session_id: string
          session_type: string
          status?: string
          term?: number | null
          year?: number | null
        }
        Update: {
          amount_cents?: number
          coach_id?: string
          created_at?: string | null
          duration_minutes?: number
          id?: string
          pay_period_key?: string
          session_id?: string
          session_type?: string
          status?: string
          term?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_earnings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_earnings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_payments: {
        Row: {
          amount_cents: number
          coach_id: string
          created_at: string | null
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          pay_period_key: string
        }
        Insert: {
          amount_cents: number
          coach_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pay_period_key: string
        }
        Update: {
          amount_cents?: number
          coach_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pay_period_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_payments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
          pay_period: string
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
          pay_period?: string
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
          pay_period?: string
          phone?: string | null
          qualifications?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      competition_players: {
        Row: {
          age: number | null
          created_at: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string | null
          notes: string | null
          player_id: string | null
          registration_status: string
          role: string
          sort_order: number | null
          team_id: string
          updated_at: string | null
          utr_fetched_at: string | null
          utr_profile_id: string | null
          utr_rating_display: string | null
          utr_rating_status: string | null
        }
        Insert: {
          age?: number | null
          created_at?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          player_id?: string | null
          registration_status?: string
          role?: string
          sort_order?: number | null
          team_id: string
          updated_at?: string | null
          utr_fetched_at?: string | null
          utr_profile_id?: string | null
          utr_rating_display?: string | null
          utr_rating_status?: string | null
        }
        Update: {
          age?: number | null
          created_at?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          player_id?: string | null
          registration_status?: string
          role?: string
          sort_order?: number | null
          team_id?: string
          updated_at?: string | null
          utr_fetched_at?: string | null
          utr_profile_id?: string | null
          utr_rating_display?: string | null
          utr_rating_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string | null
          finals_end: string | null
          finals_start: string | null
          id: string
          name: string
          nomination_close: string | null
          nomination_open: string | null
          notes: string | null
          season: string
          season_end: string | null
          season_start: string | null
          short_name: string | null
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          finals_end?: string | null
          finals_start?: string | null
          id?: string
          name: string
          nomination_close?: string | null
          nomination_open?: string | null
          notes?: string | null
          season: string
          season_end?: string | null
          season_start?: string | null
          short_name?: string | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          finals_end?: string | null
          finals_start?: string | null
          id?: string
          name?: string
          nomination_close?: string | null
          nomination_open?: string | null
          notes?: string | null
          season?: string
          season_end?: string | null
          season_start?: string | null
          short_name?: string | null
          status?: string
          type?: string
          updated_at?: string | null
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
      family_pricing: {
        Row: {
          created_at: string | null
          family_id: string
          id: string
          notes: string | null
          per_session_cents: number | null
          program_id: string | null
          program_type: string | null
          term_fee_cents: number | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          family_id: string
          id?: string
          notes?: string | null
          per_session_cents?: number | null
          program_id?: string | null
          program_type?: string | null
          term_fee_cents?: number | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          family_id?: string
          id?: string
          notes?: string | null
          per_session_cents?: number | null
          program_id?: string | null
          program_type?: string | null
          term_fee_cents?: number | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_pricing_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_pricing_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string | null
          created_by: string | null
          email: string
          expires_at: string | null
          family_id: string
          id: string
          status: string
          token: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          expires_at?: string | null
          family_id: string
          id?: string
          status?: string
          token: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          expires_at?: string | null
          family_id?: string
          id?: string
          status?: string
          token?: string
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
          created_at: string | null
          id: string
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notification_id?: string
          read_at?: string | null
          user_id?: string
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
      player_allowed_coaches: {
        Row: {
          auto_approve: boolean
          coach_id: string
          created_at: string | null
          id: string
          player_id: string
        }
        Insert: {
          auto_approve?: boolean
          coach_id: string
          created_at?: string | null
          id?: string
          player_id: string
        }
        Update: {
          auto_approve?: boolean
          coach_id?: string
          created_at?: string | null
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_allowed_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_allowed_coaches_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
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
          gender: string | null
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
          gender?: string | null
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
          gender?: string | null
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
          early_bird_deadline: string | null
          early_pay_discount_pct: number | null
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
          early_bird_deadline?: string | null
          early_pay_discount_pct?: number | null
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
          early_bird_deadline?: string | null
          early_pay_discount_pct?: number | null
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
      referrals: {
        Row: {
          charge_id: string | null
          created_at: string | null
          credit_amount_cents: number
          id: string
          qualified_at: string | null
          referred_family_id: string
          referred_player_id: string | null
          referring_family_id: string
          status: string
        }
        Insert: {
          charge_id?: string | null
          created_at?: string | null
          credit_amount_cents?: number
          id?: string
          qualified_at?: string | null
          referred_family_id: string
          referred_player_id?: string | null
          referring_family_id: string
          status?: string
        }
        Update: {
          charge_id?: string | null
          created_at?: string | null
          credit_amount_cents?: number
          id?: string
          qualified_at?: string | null
          referred_family_id?: string
          referred_player_id?: string | null
          referring_family_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_family_id_fkey"
            columns: ["referred_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_player_id_fkey"
            columns: ["referred_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referring_family_id_fkey"
            columns: ["referring_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          cancellation_reason: string | null
          coach_id: string | null
          completed_by: string | null
          created_at: string | null
          date: string
          duration_minutes: number | null
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
          completed_by?: string | null
          created_at?: string | null
          date: string
          duration_minutes?: number | null
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
          completed_by?: string | null
          created_at?: string | null
          date?: string
          duration_minutes?: number | null
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
          age_group: string | null
          captain_id: string | null
          coach_id: string | null
          competition_id: string | null
          created_at: string | null
          division: string | null
          gender: string | null
          id: string
          name: string
          nomination_status: string
          program_id: string | null
          season: string | null
          status: string
          team_size_required: number | null
        }
        Insert: {
          age_group?: string | null
          captain_id?: string | null
          coach_id?: string | null
          competition_id?: string | null
          created_at?: string | null
          division?: string | null
          gender?: string | null
          id?: string
          name: string
          nomination_status?: string
          program_id?: string | null
          season?: string | null
          status?: string
          team_size_required?: number | null
        }
        Update: {
          age_group?: string | null
          captain_id?: string | null
          coach_id?: string | null
          competition_id?: string | null
          created_at?: string | null
          division?: string | null
          gender?: string | null
          id?: string
          name?: string
          nomination_status?: string
          program_id?: string | null
          season?: string | null
          status?: string
          team_size_required?: number | null
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
            foreignKeyName: "teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
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
      vouchers: {
        Row: {
          amount_cents: number
          charge_id: string | null
          created_at: string | null
          family_id: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          voucher_code: string
          voucher_type: string
        }
        Insert: {
          amount_cents?: number
          charge_id?: string | null
          created_at?: string | null
          family_id: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          voucher_code: string
          voucher_type?: string
        }
        Update: {
          amount_cents?: number
          charge_id?: string | null
          created_at?: string | null
          family_id?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          voucher_code?: string
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_booking_notification: {
        Args: {
          p_body: string
          p_family_id: string
          p_title: string
          p_type: string
          p_url: string
        }
        Returns: string
      }
      decrypt_medical: { Args: { ciphertext: string }; Returns: string }
      encrypt_medical: { Args: { plaintext: string }; Returns: string }
      get_coach_pay: { Args: { price_cents: number }; Returns: number }
      get_coach_session_ids: { Args: { p_coach_id: string }; Returns: string[] }
      get_coach_team_ids: { Args: { user_uuid: string }; Returns: string[] }
      get_current_term: {
        Args: never
        Returns: {
          term: number
          year: number
        }[]
      }
      get_family_booking_session_ids: {
        Args: { p_family_id: string }
        Returns: string[]
      }
      get_parent_team_ids: { Args: { user_uuid: string }; Returns: string[] }
      get_player_medical_notes: {
        Args: { p_player_id: string }
        Returns: {
          medical_notes: string
          physical_notes: string
        }[]
      }
      get_private_price: {
        Args: { target_coach_id: string; target_duration_minutes: number }
        Returns: number
      }
      get_session_price: {
        Args: {
          target_family_id: string
          target_program_id: string
          target_program_type?: string
        }
        Returns: number
      }
      get_term_price: {
        Args: {
          target_family_id: string
          target_program_id: string
          target_program_type?: string
        }
        Returns: number
      }
      get_user_coach_id: { Args: { user_uuid: string }; Returns: string }
      get_user_family_id: { Args: { user_uuid: string }; Returns: string }
      get_user_role: { Args: { user_uuid: string }; Returns: string }
      increment_cancellation_counter: {
        Args: {
          counter_type: string
          target_family_id: string
          target_term: number
          target_year: number
        }
        Returns: number
      }
      is_admin: { Args: { user_uuid: string }; Returns: boolean }
      recalculate_family_balance: {
        Args: { target_family_id: string }
        Returns: number
      }
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
