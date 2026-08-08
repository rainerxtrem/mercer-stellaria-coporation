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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          summary?: string | null
        }
        Relationships: []
      }
      backups: {
        Row: {
          created_at: string
          created_by: string | null
          filename: string
          id: string
          note: string | null
          row_counts: Json
          size_bytes: number
          storage_path: string
          tables: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filename: string
          id?: string
          note?: string | null
          row_counts?: Json
          size_bytes?: number
          storage_path: string
          tables?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filename?: string
          id?: string
          note?: string | null
          row_counts?: Json
          size_bytes?: number
          storage_path?: string
          tables?: Json
        }
        Relationships: []
      }
      bar_exam_answers: {
        Row: {
          attempt_id: string
          awarded_points: number | null
          choice_ids: string[]
          id: string
          is_correct: boolean | null
          manually_graded: boolean
          question_id: string
          text_answer: string | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          awarded_points?: number | null
          choice_ids?: string[]
          id?: string
          is_correct?: boolean | null
          manually_graded?: boolean
          question_id: string
          text_answer?: string | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          awarded_points?: number | null
          choice_ids?: string[]
          id?: string
          is_correct?: boolean | null
          manually_graded?: boolean
          question_id?: string
          text_answer?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_exam_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "bar_exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "bar_exam_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_exam_attempts: {
        Row: {
          auto_submitted: boolean
          batonnier_comment: string | null
          candidate_id: string
          correct_count: number | null
          created_at: string
          deadline_at: string
          exam_id: string
          graded_at: string | null
          graded_by: string | null
          id: string
          needs_manual_grading: boolean
          passed: boolean | null
          score_pct: number | null
          score_points: number | null
          started_at: string
          status: Database["public"]["Enums"]["bar_attempt_status"]
          submitted_at: string | null
          total_points: number | null
          updated_at: string
          wrong_count: number | null
        }
        Insert: {
          auto_submitted?: boolean
          batonnier_comment?: string | null
          candidate_id: string
          correct_count?: number | null
          created_at?: string
          deadline_at: string
          exam_id: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          needs_manual_grading?: boolean
          passed?: boolean | null
          score_pct?: number | null
          score_points?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["bar_attempt_status"]
          submitted_at?: string | null
          total_points?: number | null
          updated_at?: string
          wrong_count?: number | null
        }
        Update: {
          auto_submitted?: boolean
          batonnier_comment?: string | null
          candidate_id?: string
          correct_count?: number | null
          created_at?: string
          deadline_at?: string
          exam_id?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          needs_manual_grading?: boolean
          passed?: boolean | null
          score_pct?: number | null
          score_points?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["bar_attempt_status"]
          submitted_at?: string | null
          total_points?: number | null
          updated_at?: string
          wrong_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "bar_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_exam_audit: {
        Row: {
          action: string
          actor_id: string | null
          attempt_id: string | null
          created_at: string
          exam_id: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          attempt_id?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          attempt_id?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_exam_audit_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "bar_exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_exam_audit_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "bar_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_exam_choices: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          label: string
          points_override: number | null
          position: number
          question_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label: string
          points_override?: number | null
          position?: number
          question_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label?: string
          points_override?: number | null
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_exam_choices_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "bar_exam_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_exam_questions: {
        Row: {
          category: string | null
          created_at: string
          exam_id: string
          explanation: string | null
          id: string
          points: number
          position: number
          prompt: string
          type: Database["public"]["Enums"]["bar_question_type"]
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          exam_id: string
          explanation?: string | null
          id?: string
          points?: number
          position?: number
          prompt: string
          type?: Database["public"]["Enums"]["bar_question_type"]
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          exam_id?: string
          explanation?: string | null
          id?: string
          points?: number
          position?: number
          prompt?: string
          type?: Database["public"]["Enums"]["bar_question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "bar_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_exams: {
        Row: {
          access_code: string
          access_code_active: boolean
          auto_publish_results: boolean
          closes_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_min: number
          id: string
          max_attempts: number
          name: string
          opens_at: string | null
          pass_threshold_pct: number
          show_results_to_candidate: boolean
          shuffle_answers: boolean
          shuffle_questions: boolean
          status: Database["public"]["Enums"]["bar_exam_status"]
          total_points: number
          updated_at: string
        }
        Insert: {
          access_code?: string
          access_code_active?: boolean
          auto_publish_results?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          max_attempts?: number
          name: string
          opens_at?: string | null
          pass_threshold_pct?: number
          show_results_to_candidate?: boolean
          shuffle_answers?: boolean
          shuffle_questions?: boolean
          status?: Database["public"]["Enums"]["bar_exam_status"]
          total_points?: number
          updated_at?: string
        }
        Update: {
          access_code?: string
          access_code_active?: boolean
          auto_publish_results?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          max_attempts?: number
          name?: string
          opens_at?: string | null
          pass_threshold_pct?: number
          show_results_to_candidate?: boolean
          shuffle_answers?: boolean
          shuffle_questions?: boolean
          status?: Database["public"]["Enums"]["bar_exam_status"]
          total_points?: number
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          birth_date: string | null
          company: string | null
          created_at: string
          discord_webhook_url: string | null
          email: string | null
          firm_id: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string
          notes: string | null
          owner_id: string
          phone: string | null
          profile_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          company?: string | null
          created_at?: string
          discord_webhook_url?: string | null
          email?: string | null
          firm_id?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          company?: string | null
          created_at?: string
          discord_webhook_url?: string | null
          email?: string | null
          firm_id?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          created_at: string
          email: string
          first_name: string
          handled_by: string | null
          id: string
          last_name: string
          message: string
          status: Database["public"]["Enums"]["contact_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          handled_by?: string | null
          id?: string
          last_name: string
          message: string
          status?: Database["public"]["Enums"]["contact_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          handled_by?: string | null
          id?: string
          last_name?: string
          message?: string
          status?: Database["public"]["Enums"]["contact_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      disciplinary_cases: {
        Row: {
          closed_at: string | null
          complaint_id: string | null
          created_at: string
          created_by: string | null
          id: string
          lawyer_id: string
          number: string | null
          opened_at: string
          rapporteur_id: string | null
          status: Database["public"]["Enums"]["disc_case_status"]
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          complaint_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lawyer_id: string
          number?: string | null
          opened_at?: string
          rapporteur_id?: string | null
          status?: Database["public"]["Enums"]["disc_case_status"]
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          complaint_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lawyer_id?: string
          number?: string | null
          opened_at?: string
          rapporteur_id?: string | null
          status?: Database["public"]["Enums"]["disc_case_status"]
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_cases_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_cases_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_cases_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_cases_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_complaints: {
        Row: {
          admin_notes: string | null
          complainant_email: string
          complainant_name: string
          complainant_phone: string | null
          complainant_user_id: string | null
          created_at: string
          description: string
          handled_at: string | null
          handled_by: string | null
          id: string
          lawyer_id: string | null
          lawyer_name_input: string | null
          status: Database["public"]["Enums"]["disc_complaint_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          complainant_email: string
          complainant_name: string
          complainant_phone?: string | null
          complainant_user_id?: string | null
          created_at?: string
          description: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          lawyer_id?: string | null
          lawyer_name_input?: string | null
          status?: Database["public"]["Enums"]["disc_complaint_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          complainant_email?: string
          complainant_name?: string
          complainant_phone?: string | null
          complainant_user_id?: string | null
          created_at?: string
          description?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          lawyer_id?: string | null
          lawyer_name_input?: string | null
          status?: Database["public"]["Enums"]["disc_complaint_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_complaints_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_complaints_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_complaints_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_decisions: {
        Row: {
          case_id: string
          created_at: string
          decided_at: string
          decided_by: string | null
          decision: Database["public"]["Enums"]["disc_decision"]
          id: string
          motivation: string
          published: boolean
          sanction_end: string | null
          sanction_start: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision: Database["public"]["Enums"]["disc_decision"]
          id?: string
          motivation: string
          published?: boolean
          sanction_end?: string | null
          sanction_start?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["disc_decision"]
          id?: string
          motivation?: string
          published?: boolean
          sanction_end?: string | null
          sanction_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_hearings: {
        Row: {
          case_id: string
          created_at: string
          held: boolean
          id: string
          location: string | null
          notes: string | null
          scheduled_at: string
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          held?: boolean
          id?: string
          location?: string | null
          notes?: string | null
          scheduled_at: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          held?: boolean
          id?: string
          location?: string | null
          notes?: string | null
          scheduled_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_hearings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_template_categories: {
        Row: {
          created_at: string
          created_by: string | null
          firm_id: string
          id: string
          name: string
          parent_id: string | null
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          firm_id: string
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          firm_id?: string
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_template_categories_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_template_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "doc_template_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_template_versions: {
        Row: {
          body_text: string | null
          created_at: string
          created_by: string | null
          fields: Json
          file_name: string
          id: string
          mime_type: string
          note: string | null
          size_bytes: number
          storage_path: string
          template_id: string
          updated_at: string
          version: number
        }
        Insert: {
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          fields?: Json
          file_name: string
          id?: string
          mime_type: string
          note?: string | null
          size_bytes?: number
          storage_path: string
          template_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          fields?: Json
          file_name?: string
          id?: string
          mime_type?: string
          note?: string | null
          size_bytes?: number
          storage_path?: string
          template_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "doc_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "doc_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_templates: {
        Row: {
          active: boolean
          archived: boolean
          category_id: string | null
          created_at: string
          created_by: string | null
          current_version: number
          description: string | null
          firm_id: string
          id: string
          kind: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          archived?: boolean
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          firm_id: string
          id?: string
          kind?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          archived?: boolean
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          firm_id?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "doc_template_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_templates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          created_at: string
          first_name: string
          id: string
          invoice_id: string
          ip_address: string | null
          last_name: string
          link_id: string
          method: string
          placements: Json
          signature_uid: string
          signed_at: string
          storage_path: string | null
          style: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          first_name: string
          id?: string
          invoice_id: string
          ip_address?: string | null
          last_name: string
          link_id: string
          method: string
          placements?: Json
          signature_uid: string
          signed_at?: string
          storage_path?: string | null
          style?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          invoice_id?: string
          ip_address?: string | null
          last_name?: string
          link_id?: string
          method?: string
          placements?: Json
          signature_uid?: string
          signed_at?: string
          storage_path?: string | null
          style?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_pricing: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          firm_id: string
          id: string
          price: number
          service: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          firm_id: string
          id?: string
          price: number
          service: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          firm_id?: string
          id?: string
          price?: number
          service?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_pricing_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          address: string | null
          created_at: string
          created_on: string
          id: string
          logo_url: string | null
          manager: string | null
          name: string
          number: string
          status: Database["public"]["Enums"]["license_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_on?: string
          id?: string
          logo_url?: string | null
          manager?: string | null
          name: string
          number: string
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_on?: string
          id?: string
          logo_url?: string | null
          manager?: string | null
          name?: string
          number?: string
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          label: string
          line_total: number
          position: number
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          label: string
          line_total?: number
          position?: number
          quantity?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          label?: string
          line_total?: number
          position?: number
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: string
          received_on: string
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method: string
          received_on?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string
          received_on?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cancelled_at: string | null
          client_id: string | null
          client_snapshot: Json
          converted_from_id: string | null
          created_at: string
          currency: string
          delivery_mode: string
          delivery_status: string
          due_date: string | null
          expired_at: string | null
          id: string
          issue_date: string
          kind: string
          locked: boolean
          matter_id: string | null
          notes: string | null
          number: string | null
          owner_id: string
          owner_snapshot: Json
          paid_amount: number
          paid_at: string | null
          public_token: string
          refusal_reason: string | null
          refused_at: string | null
          sent_at: string | null
          signed_at: string | null
          signing_started_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          terms: string | null
          total: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          client_id?: string | null
          client_snapshot?: Json
          converted_from_id?: string | null
          created_at?: string
          currency?: string
          delivery_mode?: string
          delivery_status?: string
          due_date?: string | null
          expired_at?: string | null
          id?: string
          issue_date?: string
          kind: string
          locked?: boolean
          matter_id?: string | null
          notes?: string | null
          number?: string | null
          owner_id: string
          owner_snapshot?: Json
          paid_amount?: number
          paid_at?: string | null
          public_token?: string
          refusal_reason?: string | null
          refused_at?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signing_started_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          terms?: string | null
          total?: number
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          client_id?: string | null
          client_snapshot?: Json
          converted_from_id?: string | null
          created_at?: string
          currency?: string
          delivery_mode?: string
          delivery_status?: string
          due_date?: string | null
          expired_at?: string | null
          id?: string
          issue_date?: string
          kind?: string
          locked?: boolean
          matter_id?: string | null
          notes?: string | null
          number?: string | null
          owner_id?: string
          owner_snapshot?: Json
          paid_amount?: number
          paid_at?: string | null
          public_token?: string
          refusal_reason?: string | null
          refused_at?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signing_started_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          terms?: string | null
          total?: number
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_converted_from_id_fkey"
            columns: ["converted_from_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      lawyers: {
        Row: {
          address: string | null
          admitted_on: string
          bio: string | null
          city: string | null
          created_at: string
          email: string | null
          firm_id: string | null
          first_name: string
          id: string
          last_name: string
          license: string
          phone: string | null
          photo_url: string | null
          profile_id: string | null
          specialty: string | null
          status: Database["public"]["Enums"]["license_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          admitted_on?: string
          bio?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          firm_id?: string | null
          first_name: string
          id?: string
          last_name: string
          license: string
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          admitted_on?: string
          bio?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          firm_id?: string | null
          first_name?: string
          id?: string
          last_name?: string
          license?: string
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lawyers_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      library_articles: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          body: string | null
          category_id: string | null
          created_at: string
          excerpt: string | null
          external_link: string | null
          id: string
          media_url: string | null
          slug: string
          status: Database["public"]["Enums"]["publication_status"]
          tags: string[]
          theme: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string | null
          category_id?: string | null
          created_at?: string
          excerpt?: string | null
          external_link?: string | null
          id?: string
          media_url?: string | null
          slug: string
          status?: Database["public"]["Enums"]["publication_status"]
          tags?: string[]
          theme?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string | null
          category_id?: string | null
          created_at?: string
          excerpt?: string | null
          external_link?: string | null
          id?: string
          media_url?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["publication_status"]
          tags?: string[]
          theme?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "library_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      library_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          position: number
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "library_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_activity: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          matter_id: string
          metadata: Json
          summary: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          matter_id: string
          metadata?: Json
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          matter_id?: string
          metadata?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_activity_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_assistants: {
        Row: {
          created_at: string
          granted_by: string | null
          matter_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          matter_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          matter_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_assistants_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_clients: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          matter_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          matter_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          matter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_clients_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_documents: {
        Row: {
          comment: string | null
          created_at: string
          filename: string
          folder_id: string | null
          id: string
          matter_id: string
          mime_type: string
          shared_at: string | null
          shared_by: string | null
          shared_with_client: boolean
          size_bytes: number
          storage_path: string
          tags: string[]
          updated_at: string
          uploaded_by: string
          uploaded_by_client: boolean
          version: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          filename: string
          folder_id?: string | null
          id?: string
          matter_id: string
          mime_type: string
          shared_at?: string | null
          shared_by?: string | null
          shared_with_client?: boolean
          size_bytes?: number
          storage_path: string
          tags?: string[]
          updated_at?: string
          uploaded_by: string
          uploaded_by_client?: boolean
          version?: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          filename?: string
          folder_id?: string | null
          id?: string
          matter_id?: string
          mime_type?: string
          shared_at?: string | null
          shared_by?: string | null
          shared_with_client?: boolean
          size_bytes?: number
          storage_path?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string
          uploaded_by_client?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "matter_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "matter_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_documents_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_folders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          matter_id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          matter_id: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          matter_id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_folders_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "matter_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          document_id: string | null
          id: string
          internal: boolean
          matter_id: string
          read_by_client_at: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          document_id?: string | null
          id?: string
          internal?: boolean
          matter_id: string
          read_by_client_at?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          document_id?: string | null
          id?: string
          internal?: boolean
          matter_id?: string
          read_by_client_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "matter_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_messages_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          matter_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          matter_id: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          matter_id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_tasks_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      matters: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          number: string
          opened_on: string
          owner_id: string
          status: string
          title: string
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          number: string
          opened_on?: string
          owner_id: string
          status?: string
          title: string
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          number?: string
          opened_on?: string
          owner_id?: string
          status?: string
          title?: string
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      news: {
        Row: {
          author_id: string | null
          body: string | null
          cover_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["publication_status"]
          tag: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["publication_status"]
          tag?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["publication_status"]
          tag?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      signature_events: {
        Row: {
          actor_id: string | null
          actor_label: string | null
          created_at: string
          id: string
          invoice_id: string
          link_id: string | null
          metadata: Json
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          link_id?: string | null
          metadata?: Json
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          link_id?: string | null
          metadata?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          expires_at: string | null
          first_opened_at: string | null
          id: string
          invalidate_on_sign: boolean
          invoice_id: string
          max_opens: number | null
          opens_count: number
          pin_hash: string | null
          revoked_at: string | null
          signed_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          invalidate_on_sign?: boolean
          invoice_id: string
          max_opens?: number | null
          opens_count?: number
          pin_hash?: string | null
          revoked_at?: string | null
          signed_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          invalidate_on_sign?: boolean
          invoice_id?: string
          max_opens?: number | null
          opens_count?: number
          pin_hash?: string | null
          revoked_at?: string | null
          signed_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          body: string
          key: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          key: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          key?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      training_attempts: {
        Row: {
          answers: Json
          id: string
          max_score: number
          passed: boolean
          points_awarded: number
          score: number
          submitted_at: string
          training_id: string
          user_id: string
        }
        Insert: {
          answers?: Json
          id?: string
          max_score?: number
          passed?: boolean
          points_awarded?: number
          score?: number
          submitted_at?: string
          training_id: string
          user_id: string
        }
        Update: {
          answers?: Json
          id?: string
          max_score?: number
          passed?: boolean
          points_awarded?: number
          score?: number
          submitted_at?: string
          training_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_attempts_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      training_categories: {
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
      training_choices: {
        Row: {
          id: string
          is_correct: boolean
          label: string
          position: number
          question_id: string
        }
        Insert: {
          id?: string
          is_correct?: boolean
          label: string
          position?: number
          question_id: string
        }
        Update: {
          id?: string
          is_correct?: boolean
          label?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_choices_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "training_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_manual_adjustments: {
        Row: {
          attempt_id: string
          created_at: string
          delta_points: number
          granted_by: string | null
          id: string
          reason: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          delta_points: number
          granted_by?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          delta_points?: number
          granted_by?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_manual_adjustments_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "training_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          content: string | null
          created_at: string
          id: string
          position: number
          title: string
          training_id: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          position?: number
          title: string
          training_id: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          position?: number
          title?: string
          training_id?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_modules_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      training_questions: {
        Row: {
          created_at: string
          id: string
          kind: string
          position: number
          prompt: string
          training_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          position?: number
          prompt: string
          training_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          position?: number
          prompt?: string
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_questions_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          category_id: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_min: number
          id: string
          pass_threshold: number
          points: number
          published_at: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          pass_threshold?: number
          points?: number
          published_at?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          pass_threshold?: number
          points?: number
          published_at?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "training_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      lawyers_admin: {
        Row: {
          address: string | null
          admitted_on: string | null
          bio: string | null
          city: string | null
          created_at: string | null
          email: string | null
          firm_id: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          license: string | null
          phone: string | null
          photo_url: string | null
          profile_id: string | null
          specialty: string | null
          status: Database["public"]["Enums"]["license_status"] | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          admitted_on?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          firm_id?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          license?: string | null
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["license_status"] | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          admitted_on?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          firm_id?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          license?: string | null
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["license_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lawyers_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      lawyers_public: {
        Row: {
          admitted_on: string | null
          bio: string | null
          city: string | null
          created_at: string | null
          firm_id: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          license: string | null
          photo_url: string | null
          specialty: string | null
          status: Database["public"]["Enums"]["license_status"] | null
        }
        Insert: {
          admitted_on?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          firm_id?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          license?: string | null
          photo_url?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["license_status"] | null
        }
        Update: {
          admitted_on?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          firm_id?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          license?: string | null
          photo_url?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["license_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "lawyers_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_list_lawyers: {
        Args: never
        Returns: {
          address: string | null
          admitted_on: string
          bio: string | null
          city: string | null
          created_at: string
          email: string | null
          firm_id: string | null
          first_name: string
          id: string
          last_name: string
          license: string
          phone: string | null
          photo_url: string | null
          profile_id: string | null
          specialty: string | null
          status: Database["public"]["Enums"]["license_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "lawyers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      bar_exam_recompute_total: {
        Args: { _exam_id: string }
        Returns: undefined
      }
      get_firm_stats: {
        Args: { _firm_id: string }
        Returns: {
          invoices_total: number
          matters_open: number
          matters_total: number
          members_active: number
          members_total: number
          revenue_paid: number
          revenue_pending: number
        }[]
      }
      get_my_firm_id: { Args: never; Returns: string }
      get_public_disciplinary_decisions: {
        Args: never
        Returns: {
          case_number: string
          decided_at: string
          decision: Database["public"]["Enums"]["disc_decision"]
          id: string
          lawyer_initials: string
          motivation: string
        }[]
      }
      get_public_lawyer: {
        Args: { _id: string }
        Returns: {
          admitted_on: string
          bio: string
          city: string
          firm_name: string
          first_name: string
          id: string
          last_name: string
          license: string
          photo_url: string
          specialty: string
          status: Database["public"]["Enums"]["license_status"]
        }[]
      }
      get_public_stats: {
        Args: never
        Returns: {
          exams_total: number
          firms_total: number
          lawyers_total: number
          licenses_active: number
          news_published: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_public_lawyers: {
        Args: never
        Returns: {
          admitted_on: string
          city: string
          firm_id: string
          firm_name: string
          first_name: string
          id: string
          last_name: string
          license: string
          photo_url: string
          specialty: string
          status: Database["public"]["Enums"]["license_status"]
        }[]
      }
      next_bar_license: { Args: never; Returns: string }
    }
    Enums: {
      app_role:
        | "batonnier"
        | "avocat"
        | "citoyen"
        | "assistant"
        | "responsable_cabinet"
        | "formateur"
        | "examinateur"
        | "client"
      bar_attempt_status: "in_progress" | "submitted" | "graded" | "admitted"
      bar_exam_status: "draft" | "open" | "closed" | "archived"
      bar_question_type: "single" | "multiple" | "truefalse" | "short" | "essay"
      contact_status: "nouveau" | "en_cours" | "traite" | "archive"
      disc_case_status:
        | "opened"
        | "investigation"
        | "hearing"
        | "decided"
        | "closed"
      disc_complaint_status: "new" | "under_review" | "dismissed" | "referred"
      disc_decision:
        | "dismissal"
        | "warning"
        | "reprimand"
        | "suspension"
        | "disbarment"
      license_status: "active" | "suspended" | "revoked"
      publication_status: "draft" | "published" | "archived"
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
  public: {
    Enums: {
      app_role: [
        "batonnier",
        "avocat",
        "citoyen",
        "assistant",
        "responsable_cabinet",
        "formateur",
        "examinateur",
        "client",
      ],
      bar_attempt_status: ["in_progress", "submitted", "graded", "admitted"],
      bar_exam_status: ["draft", "open", "closed", "archived"],
      bar_question_type: ["single", "multiple", "truefalse", "short", "essay"],
      contact_status: ["nouveau", "en_cours", "traite", "archive"],
      disc_case_status: [
        "opened",
        "investigation",
        "hearing",
        "decided",
        "closed",
      ],
      disc_complaint_status: ["new", "under_review", "dismissed", "referred"],
      disc_decision: [
        "dismissal",
        "warning",
        "reprimand",
        "suspension",
        "disbarment",
      ],
      license_status: ["active", "suspended", "revoked"],
      publication_status: ["draft", "published", "archived"],
    },
  },
} as const
