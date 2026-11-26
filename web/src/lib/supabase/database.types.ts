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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_settings: {
        Row: {
          locale: string
          marketing_emails: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          locale?: string
          marketing_emails?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          locale?: string
          marketing_emails?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          business_id: string
          code: string
          created_at: string
          id: string
          kind: string
          name: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          id?: string
          kind: string
          name: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          business_id: string | null
          checksum: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_id?: string | null
          checksum?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_id?: string | null
          checksum?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number_last4: string | null
          business_id: string
          created_at: string
          currency: string
          id: string
          institution: string | null
          ledger_account_id: string
          name: string
          opening_balance: number
          status: string
          updated_at: string
        }
        Insert: {
          account_number_last4?: string | null
          business_id: string
          created_at?: string
          currency?: string
          id?: string
          institution?: string | null
          ledger_account_id: string
          name: string
          opening_balance?: number
          status?: string
          updated_at?: string
        }
        Update: {
          account_number_last4?: string | null
          business_id?: string
          created_at?: string
          currency?: string
          id?: string
          institution?: string | null
          ledger_account_id?: string
          name?: string
          opening_balance?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_ledger_account_id_business_id_fkey"
            columns: ["ledger_account_id", "business_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      bank_statement_lines: {
        Row: {
          amount: number
          bank_account_id: string
          business_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          journal_entry_id: string | null
          matched_expense_payment_id: string | null
          matched_payment_id: string | null
          matched_supplier_payment_id: string | null
          posted_on: string
          status: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          journal_entry_id?: string | null
          matched_expense_payment_id?: string | null
          matched_payment_id?: string | null
          matched_supplier_payment_id?: string | null
          posted_on: string
          status?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          journal_entry_id?: string | null
          matched_expense_payment_id?: string | null
          matched_payment_id?: string | null
          matched_supplier_payment_id?: string | null
          posted_on?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_bank_account_id_business_id_fkey"
            columns: ["bank_account_id", "business_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "bank_statement_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          business_id: string
          created_at: string
          expires_on: string | null
          id: string
          location_id: string
          lot_code: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          expires_on?: string | null
          id?: string
          location_id: string
          lot_code: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          expires_on?: string | null
          id?: string
          location_id?: string
          lot_code?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_location_id_business_id_fkey"
            columns: ["location_id", "business_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "batches_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          bill_id: string
          business_id: string
          description: string
          id: string
          line_total: number
          quantity: number
          unit_price: number
        }
        Insert: {
          bill_id: string
          business_id: string
          description: string
          id?: string
          line_total?: number
          quantity?: number
          unit_price?: number
        }
        Update: {
          bill_id?: string
          business_id?: string
          description?: string
          id?: string
          line_total?: number
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_bill_id_business_id_fkey"
            columns: ["bill_id", "business_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      bills: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string | null
          discount: number
          id: string
          issued_at: string | null
          number: string
          order_id: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          issued_at?: string | null
          number: string
          order_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          issued_at?: string | null
          number?: string
          order_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_customer_id_business_id_fkey"
            columns: ["customer_id", "business_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "bills_order_id_business_id_fkey"
            columns: ["order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      brands: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_components: {
        Row: {
          bundle_id: string
          business_id: string
          component_id: string
          created_at: string
          id: string
          quantity: number
        }
        Insert: {
          bundle_id: string
          business_id: string
          component_id: string
          created_at?: string
          id?: string
          quantity: number
        }
        Update: {
          bundle_id?: string
          business_id?: string
          component_id?: string
          created_at?: string
          id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_components_bundle_id_business_id_fkey"
            columns: ["bundle_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "bundle_components_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_components_component_id_business_id_fkey"
            columns: ["component_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      business_capabilities: {
        Row: {
          business_id: string
          capability_key: string
          enabled: boolean
          updated_at: string
        }
        Insert: {
          business_id: string
          capability_key: string
          enabled?: boolean
          updated_at?: string
        }
        Update: {
          business_id?: string
          capability_key?: string
          enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_capabilities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_capabilities_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["key"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role_id: string | null
          role_key: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role_id?: string | null
          role_key: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role_id?: string | null
          role_key?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_role_id_business_id_fkey"
            columns: ["role_id", "business_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      business_settings: {
        Row: {
          address: Json
          business_id: string
          invoice_prefix: string
          legal_name: string | null
          order_prefix: string
          tax_id: string | null
          tax_rate: number
          updated_at: string
        }
        Insert: {
          address?: Json
          business_id: string
          invoice_prefix?: string
          legal_name?: string | null
          order_prefix?: string
          tax_id?: string | null
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          address?: Json
          business_id?: string
          invoice_prefix?: string
          legal_name?: string | null
          order_prefix?: string
          tax_id?: string | null
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          currency: string
          id: string
          industry_id: string | null
          locale: string
          name: string
          organization_id: string
          owner_id: string
          portfolio_id: string | null
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          industry_id?: string | null
          locale?: string
          name: string
          organization_id: string
          owner_id: string
          portfolio_id?: string | null
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          industry_id?: string | null
          locale?: string
          name?: string
          organization_id?: string
          owner_id?: string
          portfolio_id?: string | null
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_industry_id_organization_id_fkey"
            columns: ["industry_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_industries"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "businesses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      capabilities: {
        Row: {
          description: string
          key: string
          module: string
          name: string
        }
        Insert: {
          description: string
          key: string
          module: string
          name: string
        }
        Update: {
          description?: string
          key?: string
          module?: string
          name?: string
        }
        Relationships: []
      }
      capital_entries: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          description: string
          id: string
          journal_entry_id: string | null
          kind: string
          location_id: string | null
          occurred_on: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          description: string
          id?: string
          journal_entry_id?: string | null
          kind: string
          location_id?: string | null
          occurred_on?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          description?: string
          id?: string
          journal_entry_id?: string | null
          kind?: string
          location_id?: string | null
          occurred_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_business_id_fkey"
            columns: ["parent_id", "business_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          body: string
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          deal_id: string | null
          id: string
          kind: string
          occurred_at: string
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deal_id?: string | null
          id?: string
          kind?: string
          occurred_at?: string
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deal_id?: string | null
          id?: string
          kind?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_customer_id_business_id_fkey"
            columns: ["customer_id", "business_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_reports: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          metrics: string[]
          name: string
          period: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metrics: string[]
          name: string
          period?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metrics?: string[]
          name?: string
          period?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          customer_type: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          customer_type?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          customer_type?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          customer_id: string | null
          id: string
          stage: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          stage?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          stage?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_customer_id_business_id_fkey"
            columns: ["customer_id", "business_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      depreciation_entries: {
        Row: {
          amount: number
          asset_id: string
          business_id: string
          created_at: string
          id: string
          journal_entry_id: string | null
          period_on: string
        }
        Insert: {
          amount: number
          asset_id: string
          business_id: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_on: string
        }
        Update: {
          amount?: number
          asset_id?: string
          business_id?: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_entries_asset_id_business_id_fkey"
            columns: ["asset_id", "business_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "depreciation_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_store_assignments: {
        Row: {
          created_at: string
          employee_id: string
          location_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          location_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_store_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "organization_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_store_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          account_id: string
          business_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          account_id: string
          business_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          account_id?: string
          business_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_account_id_business_id_fkey"
            columns: ["account_id", "business_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "expense_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_files: {
        Row: {
          business_id: string
          content_type: string | null
          created_at: string
          created_by: string | null
          expense_id: string
          file_name: string
          file_path: string
          id: string
        }
        Insert: {
          business_id: string
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          expense_id: string
          file_name: string
          file_path: string
          id?: string
        }
        Update: {
          business_id?: string
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          expense_id?: string
          file_name?: string
          file_path?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_files_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_files_expense_id_business_id_fkey"
            columns: ["expense_id", "business_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          expense_id: string
          id: string
          journal_entry_id: string | null
          method: string
          notes: string | null
          paid_on: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          expense_id: string
          id?: string
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          paid_on?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          expense_id?: string
          id?: string
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          paid_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_expense_id_business_id_fkey"
            columns: ["expense_id", "business_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      expense_schedules: {
        Row: {
          account_id: string | null
          amount: number
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          end_on: string | null
          frequency: string
          generated_count: number
          id: string
          installment_count: number | null
          kind: string
          loan_id: string | null
          location_id: string | null
          next_on: string
          notes: string | null
          start_on: string
          status: string
          updated_at: string
          vendor: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          business_id: string
          category: string
          created_at?: string
          created_by?: string | null
          end_on?: string | null
          frequency: string
          generated_count?: number
          id?: string
          installment_count?: number | null
          kind: string
          loan_id?: string | null
          location_id?: string | null
          next_on: string
          notes?: string | null
          start_on: string
          status?: string
          updated_at?: string
          vendor: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          end_on?: string | null
          frequency?: string
          generated_count?: number
          id?: string
          installment_count?: number | null
          kind?: string
          loan_id?: string | null
          location_id?: string | null
          next_on?: string
          notes?: string | null
          start_on?: string
          status?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_schedules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_schedules_loan_id_fkey"
            columns: ["loan_id", "business_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_id: string | null
          amount: number
          amount_paid: number
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          due_on: string | null
          id: string
          interest_amount: number
          loan_id: string | null
          location_id: string | null
          notes: string | null
          principal_amount: number
          schedule_id: string | null
          source: string
          spent_on: string
          status: string
          updated_at: string
          vendor: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          amount_paid?: number
          business_id: string
          category: string
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          id?: string
          interest_amount?: number
          loan_id?: string | null
          location_id?: string | null
          notes?: string | null
          principal_amount?: number
          schedule_id?: string | null
          source?: string
          spent_on?: string
          status?: string
          updated_at?: string
          vendor: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          amount_paid?: number
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          id?: string
          interest_amount?: number
          loan_id?: string | null
          location_id?: string | null
          notes?: string | null
          principal_amount?: number
          schedule_id?: string | null
          source?: string
          spent_on?: string
          status?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_loan_id_fkey"
            columns: ["loan_id", "business_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "expenses_schedule_id_fkey"
            columns: ["schedule_id", "business_id"]
            isOneToOne: false
            referencedRelation: "expense_schedules"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          business_id: string
          created_at: string
          id: string
          kind: string
          payload: Json
          period_end: string
          period_start: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          period_end: string
          period_start: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          accumulated_depreciation: number
          acquired_on: string
          acquisition_cost: number
          acquisition_journal_id: string | null
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          disposed_on: string | null
          id: string
          location_id: string | null
          name: string
          notes: string | null
          residual_value: number
          shipment_id: string | null
          shipment_line_id: string | null
          status: string
          updated_at: string
          useful_life_months: number
        }
        Insert: {
          accumulated_depreciation?: number
          acquired_on?: string
          acquisition_cost: number
          acquisition_journal_id?: string | null
          business_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          disposed_on?: string | null
          id?: string
          location_id?: string | null
          name: string
          notes?: string | null
          residual_value?: number
          shipment_id?: string | null
          shipment_line_id?: string | null
          status?: string
          updated_at?: string
          useful_life_months?: number
        }
        Update: {
          accumulated_depreciation?: number
          acquired_on?: string
          acquisition_cost?: number
          acquisition_journal_id?: string | null
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          disposed_on?: string | null
          id?: string
          location_id?: string | null
          name?: string
          notes?: string | null
          residual_value?: number
          shipment_id?: string | null
          shipment_line_id?: string | null
          status?: string
          updated_at?: string
          useful_life_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      health_checks: {
        Row: {
          business_id: string | null
          check_key: string
          checked_at: string
          detail: string | null
          id: string
          status: string
        }
        Insert: {
          business_id?: string | null
          check_key: string
          checked_at?: string
          detail?: string | null
          id?: string
          status: string
        }
        Update: {
          business_id?: string | null
          check_key?: string
          checked_at?: string
          detail?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_checks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          business_id: string
          id: string
          location_id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          business_id: string
          id?: string
          location_id: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          id?: string
          location_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_location_id_business_id_fkey"
            columns: ["location_id", "business_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "inventory_balances_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          product_id: string
          quantity: number
          reason: string
          reference: string | null
        }
        Insert: {
          batch_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          product_id: string
          quantity: number
          reason: string
          reference?: string | null
        }
        Update: {
          batch_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          product_id?: string
          quantity?: number
          reason?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_business_id_fkey"
            columns: ["location_id", "business_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          entry_date: string
          event: string | null
          id: string
          location_id: string | null
          memo: string | null
          posted: boolean
          register_id: string | null
          register_session_id: string | null
          reverses_entry_id: string | null
          source_id: string | null
          source_type: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          event?: string | null
          id?: string
          location_id?: string | null
          memo?: string | null
          posted?: boolean
          register_id?: string | null
          register_session_id?: string | null
          reverses_entry_id?: string | null
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          event?: string | null
          id?: string
          location_id?: string | null
          memo?: string | null
          posted?: boolean
          register_id?: string | null
          register_session_id?: string | null
          reverses_entry_id?: string | null
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id", "business_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          business_id: string
          credit: number
          debit: number
          entry_id: string
          id: string
        }
        Insert: {
          account_id: string
          business_id: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
        }
        Update: {
          account_id?: string
          business_id?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_business_id_fkey"
            columns: ["account_id", "business_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_business_id_fkey"
            columns: ["entry_id", "business_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      loans: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          end_on: string | null
          frequency: string
          id: string
          installment_amount: number | null
          installment_count: number | null
          interest_rate: number
          lender: string
          location_id: string | null
          name: string
          next_on: string | null
          notes: string | null
          outstanding: number
          principal: number
          start_on: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          end_on?: string | null
          frequency?: string
          id?: string
          installment_amount?: number | null
          installment_count?: number | null
          interest_rate?: number
          lender: string
          location_id?: string | null
          name: string
          next_on?: string | null
          notes?: string | null
          outstanding: number
          principal: number
          start_on?: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          end_on?: string | null
          frequency?: string
          id?: string
          installment_amount?: number | null
          installment_count?: number | null
          interest_rate?: number
          lender?: string
          location_id?: string | null
          name?: string
          next_on?: string | null
          notes?: string | null
          outstanding?: number
          principal?: number
          start_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: Json
          business_id: string
          created_at: string
          fulfillment_warehouse_id: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          place_id: string | null
          sales_channel: string | null
          updated_at: string
        }
        Insert: {
          address?: Json
          business_id: string
          created_at?: string
          fulfillment_warehouse_id?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          place_id?: string | null
          sales_channel?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json
          business_id?: string
          created_at?: string
          fulfillment_warehouse_id?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          place_id?: string | null
          sales_channel?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_fulfillment_warehouse_id_business_id_fkey"
            columns: ["fulfillment_warehouse_id", "business_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "locations_place_id_business_id_fkey"
            columns: ["place_id", "business_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      nav_shortcuts: {
        Row: {
          business_id: string
          created_at: string
          id: string
          label: string
          path: string
          position: number
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          label: string
          path: string
          position?: number
          user_id?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          label?: string
          path?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nav_shortcuts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_components: {
        Row: {
          business_id: string
          component_id: string
          created_at: string
          id: string
          order_line_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          business_id: string
          component_id: string
          created_at?: string
          id?: string
          order_line_id: string
          quantity: number
          unit_cost?: number
        }
        Update: {
          business_id?: string
          component_id?: string
          created_at?: string
          id?: string
          order_line_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_line_components_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_components_component_id_business_id_fkey"
            columns: ["component_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "order_line_components_order_line_id_business_id_fkey"
            columns: ["order_line_id", "business_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      order_lines: {
        Row: {
          business_id: string
          description: string
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          quantity: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          business_id: string
          description: string
          id?: string
          line_total?: number
          order_id: string
          product_id?: string | null
          quantity?: number
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          business_id?: string
          description?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          quantity?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_business_id_fkey"
            columns: ["order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "order_lines_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      orders: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount: number
          id: string
          location_id: string | null
          notes: string | null
          number: string
          quotation_id: string | null
          register_id: string | null
          register_session_id: string | null
          source: string
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          number: string
          quotation_id?: string | null
          register_id?: string | null
          register_session_id?: string | null
          source?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          number?: string
          quotation_id?: string | null
          register_id?: string | null
          register_session_id?: string | null
          source?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_business_id_fkey"
            columns: ["customer_id", "business_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "orders_location_id_business_id_fkey"
            columns: ["location_id", "business_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "orders_quotation_id_business_id_fkey"
            columns: ["quotation_id", "business_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "orders_register_id_business_id_fkey"
            columns: ["register_id", "business_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "orders_register_session_id_business_id_fkey"
            columns: ["register_session_id", "business_id"]
            isOneToOne: false
            referencedRelation: "register_sessions"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      organization_employees: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          job_title: string | null
          organization_id: string
          phone: string | null
          reports_to_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          job_title?: string | null
          organization_id: string
          phone?: string | null
          reports_to_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          job_title?: string | null
          organization_id?: string
          phone?: string | null
          reports_to_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_employees_reports_to_id_organization_id_fkey"
            columns: ["reports_to_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_employees"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_industries: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_industries_organization_id_fkey"
            columns: ["organization_id"]
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
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bill_id: string | null
          business_id: string
          change_amount: number | null
          created_at: string
          currency: string
          external_ref: string | null
          id: string
          method: string
          order_id: string | null
          provider: string | null
          register_session_id: string | null
          status: string
          tendered: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          bill_id?: string | null
          business_id: string
          change_amount?: number | null
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          method?: string
          order_id?: string | null
          provider?: string | null
          register_session_id?: string | null
          status?: string
          tendered?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bill_id?: string | null
          business_id?: string
          change_amount?: number | null
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          method?: string
          order_id?: string | null
          provider?: string | null
          register_session_id?: string | null
          status?: string
          tendered?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_business_id_fkey"
            columns: ["bill_id", "business_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_business_id_fkey"
            columns: ["order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "payments_register_session_id_business_id_fkey"
            columns: ["register_session_id", "business_id"]
            isOneToOne: false
            referencedRelation: "register_sessions"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      permissions: {
        Row: {
          description: string
          key: string
          module: string
        }
        Insert: {
          description: string
          key: string
          module: string
        }
        Update: {
          description?: string
          key?: string
          module?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          address: Json
          business_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: Json
          business_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: Json
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_capabilities: {
        Row: {
          capability_key: string
          plan_id: string
        }
        Insert: {
          capability_key: string
          plan_id: string
        }
        Update: {
          capability_key?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_capabilities_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "plan_capabilities_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          interval: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          interval?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          interval?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_invoices: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          due_on: string | null
          id: string
          number: string
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          due_on?: string | null
          id?: string
          number: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          due_on?: string | null
          id?: string
          number?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_operators: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_members: {
        Row: {
          created_at: string
          portfolio_id: string
          role_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          portfolio_id: string
          role_key?: string
          user_id: string
        }
        Update: {
          created_at?: string
          portfolio_id?: string
          role_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_members_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      procurement_requests: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          needed_on: string | null
          status: string
          supplier_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          needed_on?: string | null
          status?: string
          supplier_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          needed_on?: string | null
          status?: string
          supplier_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requests_supplier_id_business_id_fkey"
            columns: ["supplier_id", "business_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      product_images: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_primary: boolean
          path: string
          product_id: string
          sort_order: number
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          path: string
          product_id: string
          sort_order?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          path?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          business_id: string
          created_at: string
          id: string
          option_id: string
          position: number
          value: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          option_id: string
          position?: number
          value: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          option_id?: string
          position?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_values_option_id_business_id_fkey"
            columns: ["option_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      product_options: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          position: number
          product_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
          product_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      product_variant_values: {
        Row: {
          business_id: string
          created_at: string
          id: string
          option_id: string
          option_value_id: string
          variant_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          option_id: string
          option_value_id: string
          variant_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          option_id?: string
          option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_values_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_values_option_id_business_id_fkey"
            columns: ["option_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "product_variant_values_option_value_id_option_id_fkey"
            columns: ["option_value_id", "option_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id", "option_id"]
          },
          {
            foreignKeyName: "product_variant_values_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          business_id: string
          category_id: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          is_visible: boolean
          name: string
          pack_size: string | null
          parent_id: string | null
          price: number
          product_type: string
          sku: string
          sort_order: number
          status: string
          supplier_sku: string | null
          tax_mode: string
          tax_rate: number | null
          track_inventory: boolean
          unit: string
          updated_at: string
          variant_key: string | null
          weight_grams: number | null
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          business_id: string
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name: string
          pack_size?: string | null
          parent_id?: string | null
          price?: number
          product_type?: string
          sku: string
          sort_order?: number
          status?: string
          supplier_sku?: string | null
          tax_mode?: string
          tax_rate?: number | null
          track_inventory?: boolean
          unit?: string
          updated_at?: string
          variant_key?: string | null
          weight_grams?: number | null
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          business_id?: string
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          pack_size?: string | null
          parent_id?: string | null
          price?: number
          product_type?: string
          sku?: string
          sort_order?: number
          status?: string
          supplier_sku?: string | null
          tax_mode?: string
          tax_rate?: number | null
          track_inventory?: boolean
          unit?: string
          updated_at?: string
          variant_key?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_business_id_fkey"
            columns: ["brand_id", "business_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_business_id_fkey"
            columns: ["category_id", "business_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "products_parent_id_business_id_fkey"
            columns: ["parent_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_lines: {
        Row: {
          business_id: string
          description: string
          id: string
          line_total: number
          product_id: string | null
          purchase_order_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          business_id: string
          description: string
          id?: string
          line_total?: number
          product_id?: string | null
          purchase_order_id: string
          quantity?: number
          unit_cost?: number
        }
        Update: {
          business_id?: string
          description?: string
          id?: string
          line_total?: number
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_business_id_fkey"
            columns: ["purchase_order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          business_id: string
          created_at: string
          id: string
          number: string
          request_id: string | null
          status: string
          supplier_id: string
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          number: string
          request_id?: string | null
          status?: string
          supplier_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          number?: string
          request_id?: string | null
          status?: string
          supplier_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_request_id_business_id_fkey"
            columns: ["request_id", "business_id"]
            isOneToOne: false
            referencedRelation: "procurement_requests"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_business_id_fkey"
            columns: ["supplier_id", "business_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      quotation_lines: {
        Row: {
          business_id: string
          description: string
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          quotation_id: string
          unit_price: number
        }
        Insert: {
          business_id: string
          description: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          quotation_id: string
          unit_price?: number
        }
        Update: {
          business_id?: string
          description?: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          quotation_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_lines_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "quotation_lines_quotation_id_business_id_fkey"
            columns: ["quotation_id", "business_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      quotations: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          number: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          number: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          number?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_business_id_fkey"
            columns: ["customer_id", "business_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      register_cash_moves: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          register_session_id: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          note?: string | null
          register_session_id: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          register_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_cash_moves_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_cash_moves_register_session_id_business_id_fkey"
            columns: ["register_session_id", "business_id"]
            isOneToOne: false
            referencedRelation: "register_sessions"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      register_sessions: {
        Row: {
          business_id: string
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          closing_count: Json | null
          counted_cash: number | null
          expected_cash: number | null
          force_closed: boolean
          id: string
          opened_at: string
          opened_by: string | null
          opening_cash: number
          opening_count: Json
          reconciled: boolean
          reconciliation_journal_id: string | null
          register_id: string
          session_number: number | null
          status: string
        }
        Insert: {
          business_id: string
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          closing_count?: Json | null
          counted_cash?: number | null
          expected_cash?: number | null
          force_closed?: boolean
          id?: string
          opened_at?: string
          opened_by?: string | null
          opening_cash?: number
          opening_count?: Json
          reconciled?: boolean
          reconciliation_journal_id?: string | null
          register_id: string
          session_number?: number | null
          status?: string
        }
        Update: {
          business_id?: string
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          closing_count?: Json | null
          counted_cash?: number | null
          expected_cash?: number | null
          force_closed?: boolean
          id?: string
          opened_at?: string
          opened_by?: string | null
          opening_cash?: number
          opening_count?: Json
          reconciled?: boolean
          reconciliation_journal_id?: string | null
          register_id?: string
          session_number?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_sessions_register_id_business_id_fkey"
            columns: ["register_id", "business_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      registers: {
        Row: {
          business_id: string
          created_at: string
          device_label: string | null
          id: string
          location_id: string
          name: string
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          device_label?: string | null
          id?: string
          location_id: string
          name: string
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          device_label?: string | null
          id?: string
          location_id?: string
          name?: string
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registers_location_id_business_id_fkey"
            columns: ["location_id", "business_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "registers_warehouse_id_business_id_fkey"
            columns: ["warehouse_id", "business_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      revenues: {
        Row: {
          amount: number
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          recognized_on: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          recognized_on?: string
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          recognized_on?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenues_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_system: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_lines: {
        Row: {
          business_id: string
          description: string
          id: string
          line_total: number
          order_line_id: string | null
          product_id: string | null
          quantity: number
          return_id: string
          unit_cost: number
          unit_price: number
        }
        Insert: {
          business_id: string
          description: string
          id?: string
          line_total: number
          order_line_id?: string | null
          product_id?: string | null
          quantity: number
          return_id: string
          unit_cost?: number
          unit_price: number
        }
        Update: {
          business_id?: string
          description?: string
          id?: string
          line_total?: number
          order_line_id?: string | null
          product_id?: string | null
          quantity?: number
          return_id?: string
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_lines_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "sale_return_lines_return_id_business_id_fkey"
            columns: ["return_id", "business_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          amount: number
          bill_id: string
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          method: string
          number: string
          order_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          method: string
          number: string
          order_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          number?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_bill_id_business_id_fkey"
            columns: ["bill_id", "business_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "sale_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_order_id_business_id_fkey"
            columns: ["order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      shipment_charges: {
        Row: {
          amount: number
          business_id: string
          cost_group: string
          created_at: string
          description: string | null
          id: string
          kind: string
          recoverable: boolean
          shipment_id: string
          source: string
        }
        Insert: {
          amount: number
          business_id: string
          cost_group?: string
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          recoverable?: boolean
          shipment_id: string
          source?: string
        }
        Update: {
          amount?: number
          business_id?: string
          cost_group?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          recoverable?: boolean
          shipment_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_charges_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_charges_shipment_id_business_id_fkey"
            columns: ["shipment_id", "business_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          actor_id: string | null
          business_id: string
          id: string
          note: string | null
          occurred_at: string
          shipment_id: string
          stage: string | null
          status: string
        }
        Insert: {
          actor_id?: string | null
          business_id: string
          id?: string
          note?: string | null
          occurred_at?: string
          shipment_id: string
          stage?: string | null
          status: string
        }
        Update: {
          actor_id?: string | null
          business_id?: string
          id?: string
          note?: string | null
          occurred_at?: string
          shipment_id?: string
          stage?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_events_shipment_id_business_id_fkey"
            columns: ["shipment_id", "business_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      shipment_lines: {
        Row: {
          allocated_charge: number
          batch_reference: string | null
          business_id: string
          capitalize: boolean
          catalog_cost: number
          created_at: string
          description: string | null
          id: string
          line_landing_total: number
          name: string
          position: number
          product_id: string
          quantity: number
          quantity_received: number
          sell_price: number
          shipment_id: string
          sku: string
          supplier_sku: string | null
          unit_cost: number
          unit_landing_cost: number
          unit_weight_grams: number
        }
        Insert: {
          allocated_charge?: number
          batch_reference?: string | null
          business_id: string
          capitalize?: boolean
          catalog_cost?: number
          created_at?: string
          description?: string | null
          id?: string
          line_landing_total?: number
          name: string
          position: number
          product_id: string
          quantity: number
          quantity_received?: number
          sell_price?: number
          shipment_id: string
          sku: string
          supplier_sku?: string | null
          unit_cost?: number
          unit_landing_cost?: number
          unit_weight_grams?: number
        }
        Update: {
          allocated_charge?: number
          batch_reference?: string | null
          business_id?: string
          capitalize?: boolean
          catalog_cost?: number
          created_at?: string
          description?: string | null
          id?: string
          line_landing_total?: number
          name?: string
          position?: number
          product_id?: string
          quantity?: number
          quantity_received?: number
          sell_price?: number
          shipment_id?: string
          sku?: string
          supplier_sku?: string | null
          unit_cost?: number
          unit_landing_cost?: number
          unit_weight_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipment_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_lines_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "shipment_lines_shipment_id_business_id_fkey"
            columns: ["shipment_id", "business_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      shipment_return_lines: {
        Row: {
          business_id: string
          description: string
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          return_id: string
          shipment_line_id: string | null
          unit_cost: number
        }
        Insert: {
          business_id: string
          description: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity: number
          return_id: string
          shipment_line_id?: string | null
          unit_cost?: number
        }
        Update: {
          business_id?: string
          description?: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          return_id?: string
          shipment_line_id?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipment_return_lines_return_id_business_id_fkey"
            columns: ["return_id", "business_id"]
            isOneToOne: false
            referencedRelation: "shipment_returns"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      shipment_returns: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          number: string
          returned_on: string
          shipment_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          number: string
          returned_on?: string
          shipment_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          number?: string
          returned_on?: string
          shipment_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_returns_shipment_id_business_id_fkey"
            columns: ["shipment_id", "business_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      shipments: {
        Row: {
          actuals_locked: boolean
          allocation_method: string
          business_id: string
          carrier: string | null
          charge_total: number
          chargeable_weight_kg: number | null
          created_at: string
          declared_value: number
          direction: string
          discount_percent: number
          expected_on: string | null
          freight_per_kg: number
          id: string
          landing_total: number
          location_id: string | null
          merchandise_total: number
          name: string | null
          order_id: string | null
          origin_country: string | null
          origin_currency: string
          origin_to_usd_rate: number
          package_count_actual: number | null
          purchase_order_id: string | null
          reference: string | null
          stage: string
          status: string
          supplier_id: string | null
          tracking_number: string | null
          updated_at: string
          usd_to_business_rate: number
        }
        Insert: {
          actuals_locked?: boolean
          allocation_method?: string
          business_id: string
          carrier?: string | null
          charge_total?: number
          chargeable_weight_kg?: number | null
          created_at?: string
          declared_value?: number
          direction: string
          discount_percent?: number
          expected_on?: string | null
          freight_per_kg?: number
          id?: string
          landing_total?: number
          location_id?: string | null
          merchandise_total?: number
          name?: string | null
          order_id?: string | null
          origin_country?: string | null
          origin_currency?: string
          origin_to_usd_rate?: number
          package_count_actual?: number | null
          purchase_order_id?: string | null
          reference?: string | null
          stage?: string
          status?: string
          supplier_id?: string | null
          tracking_number?: string | null
          updated_at?: string
          usd_to_business_rate?: number
        }
        Update: {
          actuals_locked?: boolean
          allocation_method?: string
          business_id?: string
          carrier?: string | null
          charge_total?: number
          chargeable_weight_kg?: number | null
          created_at?: string
          declared_value?: number
          direction?: string
          discount_percent?: number
          expected_on?: string | null
          freight_per_kg?: number
          id?: string
          landing_total?: number
          location_id?: string | null
          merchandise_total?: number
          name?: string | null
          order_id?: string | null
          origin_country?: string | null
          origin_currency?: string
          origin_to_usd_rate?: number
          package_count_actual?: number | null
          purchase_order_id?: string | null
          reference?: string | null
          stage?: string
          status?: string
          supplier_id?: string | null
          tracking_number?: string | null
          updated_at?: string
          usd_to_business_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_location_id_business_id_fkey"
            columns: ["location_id", "business_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "shipments_order_id_business_id_fkey"
            columns: ["order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "shipments_purchase_order_id_business_id_fkey"
            columns: ["purchase_order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "shipments_supplier_id_business_id_fkey"
            columns: ["supplier_id", "business_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          business_id: string
          created_at: string
          current_period_end: string | null
          id: string
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          method: string
          notes: string | null
          paid_on: string
          shipment_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          paid_on?: string
          shipment_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          paid_on?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_shipment_id_business_id_fkey"
            columns: ["shipment_id", "business_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      suppliers: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      general_ledger: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_kind: string | null
          account_name: string | null
          business_id: string | null
          created_at: string | null
          credit: number | null
          debit: number | null
          entry_date: string | null
          entry_id: string | null
          event: string | null
          id: string | null
          location_id: string | null
          memo: string | null
          posted: boolean | null
          register_id: string | null
          register_session_id: string | null
          source_id: string | null
          source_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_business_id_fkey"
            columns: ["account_id", "business_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
    }
    Functions: {
      accept_quotation: {
        Args: { p_business_id: string; p_quotation_id: string }
        Returns: Json
      }
      add_bank_statement_line: {
        Args: {
          p_amount: number
          p_bank_account_id: string
          p_business_id: string
          p_description: string
          p_posted_on: string
        }
        Returns: string
      }
      adjust_bank_statement_line: {
        Args: { p_business_id: string; p_line_id: string }
        Returns: string
      }
      adjust_inventory: {
        Args: {
          p_business_id: string
          p_location_id: string
          p_product_id: string
          p_quantity: number
          p_reason?: string
          p_reference?: string
        }
        Returns: string
      }
      close_register_session: {
        Args: {
          p_business_id: string
          p_closing_count?: Json
          p_counted_cash: number
          p_session_id: string
        }
        Returns: Json
      }
      complete_pos_sale: {
        Args: {
          p_business_id: string
          p_customer_id?: string
          p_discount?: number
          p_draft_id?: string
          p_lines: Json
          p_method: string
          p_notes?: string
          p_register_id: string
          p_tendered?: number
        }
        Returns: Json
      }
      confirm_shipment_actuals: {
        Args: {
          p_batch_references: Json
          p_chargeable_weight_kg?: number
          p_charges: Json
          p_freight_per_kg?: number
          p_package_count: number
          p_shipment_id: string
        }
        Returns: undefined
      }
      convert_shipment_draft: {
        Args: { p_shipment_id: string }
        Returns: undefined
      }
      create_bank_account: {
        Args: {
          p_account_number_last4?: string
          p_business_id: string
          p_institution?: string
          p_name: string
          p_opening_balance?: number
        }
        Returns: string
      }
      create_capital_entry: {
        Args: {
          p_amount: number
          p_business_id: string
          p_description: string
          p_kind: string
          p_location_id?: string
          p_method?: string
          p_occurred_on?: string
        }
        Returns: string
      }
      create_expense_schedule: {
        Args: {
          p_amount: number
          p_business_id: string
          p_category: string
          p_end_on?: string
          p_frequency: string
          p_installment_count?: number
          p_kind: string
          p_loan_id?: string
          p_location_id?: string
          p_notes?: string
          p_start_on: string
          p_vendor: string
        }
        Returns: string
      }
      create_fixed_asset: {
        Args: {
          p_acquired_on?: string
          p_acquisition_cost: number
          p_business_id: string
          p_category?: string
          p_location_id?: string
          p_method?: string
          p_name: string
          p_residual_value?: number
          p_useful_life_months?: number
        }
        Returns: string
      }
      create_inbound_shipment: {
        Args: {
          p_allocation_method?: string
          p_business_id: string
          p_carrier?: string
          p_charges?: Json
          p_expected_on?: string
          p_lines: Json
          p_location_id: string
          p_supplier_id?: string
          p_tracking_number?: string
        }
        Returns: string
      }
      create_loan: {
        Args: {
          p_business_id: string
          p_end_on?: string
          p_frequency?: string
          p_installment_count?: number
          p_interest_rate?: number
          p_lender: string
          p_location_id?: string
          p_method?: string
          p_name: string
          p_notes?: string
          p_principal: number
          p_start_on?: string
        }
        Returns: string
      }
      create_manual_expense: {
        Args: {
          p_account_id?: string
          p_amount: number
          p_business_id: string
          p_category: string
          p_due_on?: string
          p_location_id?: string
          p_notes?: string
          p_spent_on?: string
          p_vendor: string
        }
        Returns: string
      }
      create_manual_journal: {
        Args: {
          p_business_id: string
          p_entry_date: string
          p_lines: Json
          p_memo: string
        }
        Returns: string
      }
      custom_report_snapshot: {
        Args: { p_business_id: string; p_period?: string }
        Returns: {
          amount: number
          label: string
          metric_key: string
          unit: string
        }[]
      }
      delete_shipment_draft: {
        Args: { p_shipment_id: string }
        Returns: undefined
      }
      discard_pos_draft: {
        Args: { p_business_id: string; p_order_id: string }
        Returns: undefined
      }
      duplicate_shipment: { Args: { p_shipment_id: string }; Returns: string }
      force_close_register_session: {
        Args: { p_business_id: string; p_session_id: string }
        Returns: Json
      }
      generate_due_finance: { Args: { p_as_of?: string }; Returns: number }
      hold_pos_cart: {
        Args: {
          p_business_id: string
          p_customer_id?: string
          p_discount?: number
          p_lines: Json
          p_notes?: string
          p_register_id: string
        }
        Returns: Json
      }
      match_bank_statement_line: {
        Args: {
          p_business_id: string
          p_expense_payment_id?: string
          p_line_id: string
          p_payment_id?: string
          p_supplier_payment_id?: string
        }
        Returns: undefined
      }
      open_register_session: {
        Args: {
          p_business_id: string
          p_opening_cash: number
          p_opening_count?: Json
          p_register_id: string
        }
        Returns: Json
      }
      pay_expense: {
        Args: {
          p_amount: number
          p_bank_account_id?: string
          p_business_id: string
          p_expense_id: string
          p_method?: string
          p_notes?: string
          p_paid_on?: string
        }
        Returns: string
      }
      pay_supplier: {
        Args: {
          p_amount: number
          p_bank_account_id?: string
          p_business_id: string
          p_method?: string
          p_notes?: string
          p_paid_on?: string
          p_shipment_id: string
        }
        Returns: string
      }
      receive_shipment: {
        Args: { p_lines?: Json; p_shipment_id: string }
        Returns: undefined
      }
      recognize_other_income: {
        Args: {
          p_amount: number
          p_business_id: string
          p_category: string
          p_method?: string
          p_recognized_on?: string
          p_source: string
        }
        Returns: string
      }
      reconcile_register_session: {
        Args: { p_business_id: string; p_session_id: string }
        Returns: string
      }
      return_inbound_shipment: {
        Args: {
          p_business_id: string
          p_lines: Json
          p_notes?: string
          p_shipment_id: string
        }
        Returns: string
      }
      return_pos_sale: {
        Args: { p_bill_id: string; p_business_id: string; p_lines: Json }
        Returns: Json
      }
      save_pos_draft: {
        Args: {
          p_business_id: string
          p_customer_id?: string
          p_discount?: number
          p_lines?: Json
          p_notes?: string
          p_order_id?: string
          p_register_id: string
        }
        Returns: Json
      }
      save_product: {
        Args: { p_business_id: string; p_payload: Json }
        Returns: Json
      }
      save_shipment_actuals: {
        Args: {
          p_batch_references: Json
          p_chargeable_weight_kg?: number
          p_charges: Json
          p_freight_per_kg?: number
          p_package_count: number
          p_shipment_id: string
        }
        Returns: undefined
      }
      save_shipment_draft: {
        Args: {
          p_allocation_method?: string
          p_business_id: string
          p_carrier?: string
          p_chargeable_weight_kg?: number
          p_charges?: Json
          p_declared_value?: number
          p_discount_percent?: number
          p_expected_on?: string
          p_freight_per_kg?: number
          p_lines: Json
          p_location_id: string
          p_name?: string
          p_origin_country?: string
          p_origin_currency?: string
          p_origin_to_usd_rate?: number
          p_shipment_id: string
          p_supplier_id?: string
          p_tracking_number?: string
          p_usd_to_business_rate?: number
        }
        Returns: string
      }
      set_expense_schedule_status: {
        Args: { p_business_id: string; p_schedule_id: string; p_status: string }
        Returns: undefined
      }
      set_shipment_stage: {
        Args: { p_note?: string; p_shipment_id: string; p_stage: string }
        Returns: undefined
      }
      set_shipment_status: {
        Args: { p_note?: string; p_shipment_id: string; p_status: string }
        Returns: undefined
      }
      take_pos_hold: {
        Args: { p_business_id: string; p_register_id: string }
        Returns: Json
      }
      void_pos_sale: {
        Args: { p_business_id: string; p_order_id: string }
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
  public: {
    Enums: {},
  },
} as const
