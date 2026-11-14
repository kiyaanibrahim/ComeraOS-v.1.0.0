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
          id: string
          issued_at: string | null
          number: string
          order_id: string | null
          status: string
          subtotal: number
          discount: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          issued_at?: string | null
          number: string
          order_id?: string | null
          status?: string
          subtotal?: number
          discount?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          issued_at?: string | null
          number?: string
          order_id?: string | null
          status?: string
          subtotal?: number
          discount?: number
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
          locale: string
          name: string
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
          locale?: string
          name: string
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
          locale?: string
          name?: string
          owner_id?: string
          portfolio_id?: string | null
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
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
          business_id: string
          created_at: string
          description: string
          id: string
          kind: string
          occurred_on: string
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          description: string
          id?: string
          kind: string
          occurred_on?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          description?: string
          id?: string
          kind?: string
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
      catalog_entries: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_visible: boolean
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_entries_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
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
      expenses: {
        Row: {
          amount: number
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          spent_on: string
          status: string
          updated_at: string
          vendor: string
        }
        Insert: {
          amount: number
          business_id: string
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          spent_on?: string
          status?: string
          updated_at?: string
          vendor: string
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
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
          id: string
          memo: string | null
          posted: boolean
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          memo?: string | null
          posted?: boolean
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          memo?: string | null
          posted?: boolean
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
          id: string
          location_id: string | null
          notes: string | null
          number: string
          register_id: string | null
          register_session_id: string | null
          source: string
          status: string
          subtotal: number
          quotation_id: string | null
          discount: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          number: string
          register_id?: string | null
          register_session_id?: string | null
          source?: string
          status?: string
          subtotal?: number
          quotation_id?: string | null
          discount?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          number?: string
          register_id?: string | null
          register_session_id?: string | null
          source?: string
          status?: string
          subtotal?: number
          quotation_id?: string | null
          discount?: number
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
      products: {
        Row: {
          business_id: string
          category_id: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          name: string
          pack_size: string | null
          price: number
          sku: string
          status: string
          supplier_sku: string | null
          track_inventory: boolean
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          business_id: string
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          pack_size?: string | null
          price?: number
          sku: string
          status?: string
          supplier_sku?: string | null
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          business_id?: string
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          pack_size?: string | null
          price?: number
          sku?: string
          status?: string
          supplier_sku?: string | null
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
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
      register_sessions: {
        Row: {
          business_id: string
          cash_difference: number | null
          closed_at: string | null
          closing_cash: number | null
          closing_count: Json | null
          counted_cash: number | null
          expected_cash: number | null
          id: string
          opened_at: string
          opened_by: string | null
          opening_cash: number
          opening_count: Json
          register_id: string
          status: string
        }
        Insert: {
          business_id: string
          cash_difference?: number | null
          closed_at?: string | null
          closing_cash?: number | null
          closing_count?: Json | null
          counted_cash?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          opening_cash?: number
          opening_count?: Json
          register_id: string
          status?: string
        }
        Update: {
          business_id?: string
          cash_difference?: number | null
          closed_at?: string | null
          closing_cash?: number | null
          closing_count?: Json | null
          counted_cash?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          opening_cash?: number
          opening_count?: Json
          register_id?: string
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
      [_ in never]: never
    }
    Functions: {
      accept_quotation: {
        Args: {
          p_business_id: string
          p_quotation_id: string
        }
        Returns: Json
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
      discard_pos_draft: {
        Args: {
          p_business_id: string
          p_order_id: string
        }
        Returns: undefined
      }
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
      return_pos_sale: {
        Args: {
          p_bill_id: string
          p_business_id: string
          p_lines: Json
        }
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
      take_pos_hold: {
        Args: {
          p_business_id: string
          p_register_id: string
        }
        Returns: Json
      }
      void_pos_sale: {
        Args: {
          p_business_id: string
          p_order_id: string
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
      delete_shipment_draft: {
        Args: { p_shipment_id: string }
        Returns: undefined
      }
      duplicate_shipment: { Args: { p_shipment_id: string }; Returns: string }
      open_register_session: {
        Args: {
          p_business_id: string
          p_opening_cash: number
          p_opening_count?: Json
          p_register_id: string
        }
        Returns: Json
      }
      receive_shipment: {
        Args: { p_lines?: Json; p_shipment_id: string }
        Returns: undefined
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
      set_shipment_stage: {
        Args: { p_note?: string; p_shipment_id: string; p_stage: string }
        Returns: undefined
      }
      set_shipment_status: {
        Args: { p_note?: string; p_shipment_id: string; p_status: string }
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
