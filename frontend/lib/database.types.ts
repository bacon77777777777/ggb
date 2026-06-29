export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: number
          name: string
          description: string | null
          price: number
          image_url: string | null
          type: 'ichiban' | 'gacha'
          status: 'active' | 'inactive' | 'archived'
          total_count: number
          remaining: number
          is_hot: boolean
          release_date: string | null
          created_at: string
          updated_at: string
          seed: string | null
          txid_hash: string | null
        }
        Insert: {
          id?: number
          name: string
          description?: string | null
          price: number
          image_url?: string | null
          type: 'ichiban' | 'gacha'
          status?: 'active' | 'inactive' | 'archived'
          total_count?: number
          remaining?: number
          is_hot?: boolean
          release_date?: string | null
          created_at?: string
          updated_at?: string
          seed?: string | null
          txid_hash?: string | null
        }
        Update: {
          id?: number
          name?: string
          description?: string | null
          price?: number
          image_url?: string | null
          type?: 'ichiban' | 'gacha'
          status?: 'active' | 'inactive' | 'archived'
          total_count?: number
          remaining?: number
          is_hot?: boolean
          release_date?: string | null
          created_at?: string
          updated_at?: string
          seed?: string | null
          txid_hash?: string | null
        }
      }
      product_prizes: {
        Row: {
          id: number
          product_id: number
          name: string
          level: string
          image_url: string | null
          total: number
          remaining: number
          created_at: string
        }
        Insert: {
          id?: number
          product_id: number
          name: string
          level: string
          image_url?: string | null
          total: number
          remaining: number
          created_at?: string
        }
        Update: {
          id?: number
          product_id?: number
          name?: string
          level?: string
          image_url?: string | null
          total?: number
          remaining?: number
          created_at?: string
        }
      }
      draw_records: {
        Row: {
          id: number
          product_id: number
          user_id: string
          ticket_number: number
          prize_level: string
          prize_name: string
          created_at: string
        }
        Insert: {
          id?: number
          product_id: number
          user_id: string
          ticket_number: number
          prize_level: string
          prize_name: string
          created_at?: string
        }
        Update: {
          id?: number
          product_id?: number
          user_id?: string
          ticket_number?: number
          prize_level?: string
          prize_name?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      play_gacha: {
        Args: {
          p_product_id: number
          p_count: number
        }
        Returns: {
          id: number
          name: string
          grade: string
          image_url: string
          ticket_number: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
