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
      accounts: {
        Row: {
          code: string
          created_at: string
          fund_id: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          school_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          fund_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          school_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          fund_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          school_id?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          school_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          school_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          cashbook_balance: number
          created_at: string
          fund_id: string
          id: string
          notes: string | null
          reconciled_by: string | null
          school_id: string
          statement_balance: number
          statement_date: string
          updated_at: string
        }
        Insert: {
          cashbook_balance: number
          created_at?: string
          fund_id: string
          id?: string
          notes?: string | null
          reconciled_by?: string | null
          school_id: string
          statement_balance: number
          statement_date: string
          updated_at?: string
        }
        Update: {
          cashbook_balance?: number
          created_at?: string
          fund_id?: string
          id?: string
          notes?: string | null
          reconciled_by?: string | null
          school_id?: string
          statement_balance?: number
          statement_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: {
          closing_balance: number | null
          created_at: string | null
          filename: string
          fund_id: string
          id: string
          imported_by: string | null
          line_count: number | null
          opening_balance: number | null
          school_id: string
          statement_from: string | null
          statement_to: string | null
          updated_at: string | null
        }
        Insert: {
          closing_balance?: number | null
          created_at?: string | null
          filename: string
          fund_id: string
          id?: string
          imported_by?: string | null
          line_count?: number | null
          opening_balance?: number | null
          school_id: string
          statement_from?: string | null
          statement_to?: string | null
          updated_at?: string | null
        }
        Update: {
          closing_balance?: number | null
          created_at?: string | null
          filename?: string
          fund_id?: string
          id?: string
          imported_by?: string | null
          line_count?: number | null
          opening_balance?: number | null
          school_id?: string
          statement_from?: string | null
          statement_to?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_lines: {
        Row: {
          created_at: string | null
          credit: number
          debit: number
          description: string | null
          fund_id: string
          id: string
          import_id: string
          matched_cashbook_id: string | null
          reference: string | null
          running_balance: number | null
          school_id: string
          status: string
          txn_date: string
        }
        Insert: {
          created_at?: string | null
          credit?: number
          debit?: number
          description?: string | null
          fund_id: string
          id?: string
          import_id: string
          matched_cashbook_id?: string | null
          reference?: string | null
          running_balance?: number | null
          school_id: string
          status?: string
          txn_date: string
        }
        Update: {
          created_at?: string | null
          credit?: number
          debit?: number
          description?: string | null
          fund_id?: string
          id?: string
          import_id?: string
          matched_cashbook_id?: string | null
          reference?: string | null
          running_balance?: number | null
          school_id?: string
          status?: string
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_cashbook_id_fkey"
            columns: ["matched_cashbook_id"]
            isOneToOne: false
            referencedRelation: "cashbook_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      bursaries: {
        Row: {
          amount: number
          amount_allocated: number
          created_at: string
          id: string
          is_demo: boolean
          notes: string | null
          received_on: string
          reference: string | null
          school_id: string
          source: Database["public"]["Enums"]["bursary_source"]
          sponsor_name: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          amount_allocated?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          notes?: string | null
          received_on?: string
          reference?: string | null
          school_id: string
          source: Database["public"]["Enums"]["bursary_source"]
          sponsor_name?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_allocated?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          notes?: string | null
          received_on?: string
          reference?: string | null
          school_id?: string
          source?: Database["public"]["Enums"]["bursary_source"]
          sponsor_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bursaries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      bursary_allocations: {
        Row: {
          amount: number
          bursary_id: string
          created_at: string
          id: string
          invoice_id: string | null
          student_id: string
          term_id: string | null
        }
        Insert: {
          amount: number
          bursary_id: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          student_id: string
          term_id?: string | null
        }
        Update: {
          amount?: number
          bursary_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          student_id?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bursary_allocations_bursary_id_fkey"
            columns: ["bursary_id"]
            isOneToOne: false
            referencedRelation: "bursaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bursary_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bursary_allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bursary_allocations_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      cashbook_entries: {
        Row: {
          bank_statement_line_id: string | null
          created_at: string
          description: string
          entry_date: string
          fund_id: string
          id: string
          journal_entry_id: string | null
          payments: number
          receipts: number
          reconciled: boolean
          reconciled_on: string | null
          reference: string | null
          running_balance: number | null
          school_id: string
          updated_at: string
        }
        Insert: {
          bank_statement_line_id?: string | null
          created_at?: string
          description: string
          entry_date?: string
          fund_id: string
          id?: string
          journal_entry_id?: string | null
          payments?: number
          receipts?: number
          reconciled?: boolean
          reconciled_on?: string | null
          reference?: string | null
          running_balance?: number | null
          school_id: string
          updated_at?: string
        }
        Update: {
          bank_statement_line_id?: string | null
          created_at?: string
          description?: string
          entry_date?: string
          fund_id?: string
          id?: string
          journal_entry_id?: string | null
          payments?: number
          receipts?: number
          reconciled?: boolean
          reconciled_on?: string | null
          reference?: string | null
          running_balance?: number | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashbook_entries_bank_statement_line_id_fkey"
            columns: ["bank_statement_line_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbook_entries_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbook_entries_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbook_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          form: number
          id: string
          school_id: string
          stream: string
          teacher_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          form: number
          id?: string
          school_id: string
          stream: string
          teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          form?: number
          id?: string
          school_id?: string
          stream?: string
          teacher_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structure_items: {
        Row: {
          amount: number
          created_at: string
          fee_structure_id: string
          id: string
          vote_head_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee_structure_id: string
          id?: string
          vote_head_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_structure_id?: string
          id?: string
          vote_head_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structure_items_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structure_items_vote_head_id_fkey"
            columns: ["vote_head_id"]
            isOneToOne: false
            referencedRelation: "vote_heads"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          class_id: string
          created_at: string
          id: string
          is_boarder: boolean
          school_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          is_boarder?: boolean
          school_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          is_boarder?: boolean
          school_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          bank_account_no: string | null
          bank_name: string | null
          code: Database["public"]["Enums"]["fund_code"]
          created_at: string
          id: string
          name: string
          opening_balance: number
          school_id: string
          updated_at: string
        }
        Insert: {
          bank_account_no?: string | null
          bank_name?: string | null
          code: Database["public"]["Enums"]["fund_code"]
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          school_id: string
          updated_at?: string
        }
        Update: {
          bank_account_no?: string | null
          bank_name?: string | null
          code?: Database["public"]["Enums"]["fund_code"]
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          paid_amount: number
          vote_head_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          paid_amount?: number
          vote_head_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          paid_amount?: number
          vote_head_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_vote_head_id_fkey"
            columns: ["vote_head_id"]
            isOneToOne: false
            referencedRelation: "vote_heads"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance: number
          created_at: string
          id: string
          invoice_no: string
          is_demo: boolean
          issue_date: string
          notes: string | null
          opening_balance: number
          school_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          term_id: string
          total_bursary: number
          total_charges: number
          total_paid: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          invoice_no: string
          is_demo?: boolean
          issue_date?: string
          notes?: string | null
          opening_balance?: number
          school_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          term_id: string
          total_bursary?: number
          total_charges?: number
          total_paid?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          invoice_no?: string
          is_demo?: boolean
          issue_date?: string
          notes?: string | null
          opening_balance?: number
          school_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
          term_id?: string
          total_bursary?: number
          total_charges?: number
          total_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          entry_date: string
          entry_no: string
          id: string
          memo: string | null
          posted_at: string | null
          posted_by: string | null
          school_id: string
          source_id: string | null
          source_table: string | null
          status: Database["public"]["Enums"]["journal_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_date?: string
          entry_no: string
          id?: string
          memo?: string | null
          posted_at?: string | null
          posted_by?: string | null
          school_id: string
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          entry_no?: string
          id?: string
          memo?: string | null
          posted_at?: string | null
          posted_by?: string | null
          school_id?: string
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          fund_id: string | null
          id: string
          journal_entry_id: string
          line_no: number | null
          memo: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          fund_id?: string | null
          id?: string
          journal_entry_id: string
          line_no?: number | null
          memo?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          fund_id?: string | null
          id?: string
          journal_entry_id?: string
          line_no?: number | null
          memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_item_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_item_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_item_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_vouchers: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          fund_id: string
          id: string
          is_demo: boolean
          journal_entry_id: string | null
          memo: string | null
          method: Database["public"]["Enums"]["payment_method"]
          paid_on: string
          payee: string
          prepared_by: string | null
          reference: string | null
          school_id: string
          status: Database["public"]["Enums"]["voucher_status"]
          updated_at: string
          vote_head_id: string | null
          voucher_no: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          created_at?: string
          fund_id: string
          id?: string
          is_demo?: boolean
          journal_entry_id?: string | null
          memo?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          payee: string
          prepared_by?: string | null
          reference?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["voucher_status"]
          updated_at?: string
          vote_head_id?: string | null
          voucher_no: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          fund_id?: string
          id?: string
          is_demo?: boolean
          journal_entry_id?: string | null
          memo?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          payee?: string
          prepared_by?: string | null
          reference?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["voucher_status"]
          updated_at?: string
          vote_head_id?: string | null
          voucher_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_vouchers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_vote_head_id_fkey"
            columns: ["vote_head_id"]
            isOneToOne: false
            referencedRelation: "vote_heads"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          fund_id: string
          id: string
          is_demo: boolean
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_on: string
          payer_name: string | null
          receipt_no: string
          recorded_by: string | null
          reference: string | null
          school_id: string
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          fund_id: string
          id?: string
          is_demo?: boolean
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          payer_name?: string | null
          receipt_no: string
          recorded_by?: string | null
          reference?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          fund_id?: string
          id?: string
          is_demo?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          payer_name?: string | null
          receipt_no?: string
          recorded_by?: string | null
          reference?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_school_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active_school_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active_school_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_school_id_fkey"
            columns: ["active_school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_runs: {
        Row: {
          balances_carried: number
          created_at: string
          from_term_id: string
          id: string
          notes: string | null
          ran_by: string | null
          school_id: string
          status: string
          students_promoted: number
          to_term_id: string
        }
        Insert: {
          balances_carried?: number
          created_at?: string
          from_term_id: string
          id?: string
          notes?: string | null
          ran_by?: string | null
          school_id: string
          status?: string
          students_promoted?: number
          to_term_id: string
        }
        Update: {
          balances_carried?: number
          created_at?: string
          from_term_id?: string
          id?: string
          notes?: string | null
          ran_by?: string | null
          school_id?: string
          status?: string
          students_promoted?: number
          to_term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_runs_from_term_id_fkey"
            columns: ["from_term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_runs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_runs_to_term_id_fkey"
            columns: ["to_term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          code: string | null
          county: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          motto: string | null
          name: string
          phone: string | null
          receipt_footer: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          county?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          motto?: string | null
          name: string
          phone?: string | null
          receipt_footer?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          county?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          motto?: string | null
          name?: string
          phone?: string | null
          receipt_footer?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          admission_no: string
          class_id: string | null
          county_of_residence: string | null
          created_at: string
          date_of_birth: string | null
          exit_reason: string | null
          exited_on: string | null
          full_name: string
          gender: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relation: string | null
          id: string
          is_boarder: boolean
          is_demo: boolean
          joined_on: string | null
          kcpe_marks: number | null
          school_id: string
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
        }
        Insert: {
          admission_no: string
          class_id?: string | null
          county_of_residence?: string | null
          created_at?: string
          date_of_birth?: string | null
          exit_reason?: string | null
          exited_on?: string | null
          full_name: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relation?: string | null
          id?: string
          is_boarder?: boolean
          is_demo?: boolean
          joined_on?: string | null
          kcpe_marks?: number | null
          school_id: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Update: {
          admission_no?: string
          class_id?: string | null
          county_of_residence?: string | null
          created_at?: string
          date_of_birth?: string | null
          exit_reason?: string | null
          exited_on?: string | null
          full_name?: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relation?: string | null
          id?: string
          is_boarder?: boolean
          is_demo?: boolean
          joined_on?: string | null
          kcpe_marks?: number | null
          school_id?: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          is_closed: boolean
          school_id: string
          start_date: string
          term: Database["public"]["Enums"]["term_number"]
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          is_closed?: boolean
          school_id: string
          start_date: string
          term: Database["public"]["Enums"]["term_number"]
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          is_closed?: boolean
          school_id?: string
          start_date?: string
          term?: Database["public"]["Enums"]["term_number"]
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_heads: {
        Row: {
          code: string
          created_at: string
          fund_id: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          fund_id: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          fund_id?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_heads_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_heads_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_match_bank_import: { Args: { _import_id: string }; Returns: number }
      can_write_money: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      clear_demo_data: { Args: { _school_id: string }; Returns: Json }
      create_school: {
        Args: {
          _code?: string
          _county?: string
          _motto?: string
          _name: string
        }
        Returns: string
      }
      ensure_chart_for_fund: {
        Args: { _fund_code: string; _fund_id: string; _school_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _school_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      is_member: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      next_journal_no: { Args: { _school_id: string }; Returns: string }
      next_voucher_no: { Args: { _school_id: string }; Returns: string }
      post_payment: { Args: { _payment_id: string }; Returns: string }
      post_voucher: { Args: { _voucher_id: string }; Returns: string }
      run_promotion: {
        Args: { _from_term_id: string; _school_id: string; _to_term_id: string }
        Returns: Json
      }
      seed_demo_data: { Args: { _school_id: string }; Returns: Json }
      unmatch_bank_line: { Args: { _line_id: string }; Returns: undefined }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      app_role: "admin" | "bursar" | "principal" | "board"
      bursary_source: "ng_cdf" | "county" | "capitation" | "sponsor" | "other"
      fund_code: "tuition" | "operations" | "school_fund"
      invoice_status: "open" | "partial" | "paid" | "void"
      journal_status: "draft" | "posted" | "reversed"
      payment_method:
        | "mpesa"
        | "kcb"
        | "equity"
        | "cash"
        | "cheque"
        | "bank_transfer"
        | "bursary"
        | "other"
      payment_status: "pending" | "confirmed" | "reversed"
      student_status:
        | "active"
        | "transferred"
        | "graduated"
        | "withdrawn"
        | "deceased"
      term_number: "1" | "2" | "3"
      voucher_status: "draft" | "approved" | "paid" | "cancelled"
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
      account_type: ["asset", "liability", "equity", "income", "expense"],
      app_role: ["admin", "bursar", "principal", "board"],
      bursary_source: ["ng_cdf", "county", "capitation", "sponsor", "other"],
      fund_code: ["tuition", "operations", "school_fund"],
      invoice_status: ["open", "partial", "paid", "void"],
      journal_status: ["draft", "posted", "reversed"],
      payment_method: [
        "mpesa",
        "kcb",
        "equity",
        "cash",
        "cheque",
        "bank_transfer",
        "bursary",
        "other",
      ],
      payment_status: ["pending", "confirmed", "reversed"],
      student_status: [
        "active",
        "transferred",
        "graduated",
        "withdrawn",
        "deceased",
      ],
      term_number: ["1", "2", "3"],
      voucher_status: ["draft", "approved", "paid", "cancelled"],
    },
  },
} as const
