export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type TableDef<Row, Insert = Row, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: unknown[]
}

export interface Database {
  public: {
    Tables: {
      users: TableDef<{
        id: string
        email: string | null
        name: string | null
        points: number
        tokens: number
        recipient_name: string | null
        recipient_phone: string | null
        address: string | null
        role: string | null
        invite_code: string | null
        phone_number: string | null
        is_phone_verified: boolean
        created_at: string
        updated_at: string
      }>

      products: TableDef<{
        id: number
        product_code: string | null
        name: string
        description: string | null
        image_url: string | null
        category: string | null
        type: 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom'
        status: 'active' | 'pending' | 'ended' | 'inactive' | 'archived' | 'selling' | 'soldout' | 'coming_soon'
        price: number
        total_count: number
        remaining: number
        remaining_count: number
        is_hot: boolean
        release_date: string | null
        seed: string | null
        txid_hash: string | null
        is_preorder: boolean | null
        preorder_available_at: string | null
        distributor: string | null
        created_at: string
      }>

      prizes: TableDef<{
        id: string
        product_id: number | null
        grade: string | null
        level: string | null
        name: string
        image_url: string | null
        quantity: number | null
        probability: number | null
        created_at: string | null
      }>

      product_prizes: TableDef<{
        id: number
        product_id: number
        level: string
        name: string
        image_url: string | null
        total: number
        remaining: number
        probability: number | null
        created_at: string
      }>

      banners: TableDef<{
        id: string
        image_url: string
        link_url: string | null
        sort_order: number | null
        is_active: boolean | null
        created_at: string | null
      }>

      news: TableDef<{
        id: string
        title: string
        content: string | null
        image_url: string | null
        category: string | null
        is_published: boolean
        published_at: string | null
        created_at: string
      }>

      coupons: TableDef<{
        id: string
        code: string
        title: string
        description: string | null
        discount_type: 'fixed' | 'percentage'
        discount_value: number
        min_spend: number
        max_discount: number | null
        expiry_date: string | null
        is_active: boolean
        created_at: string
      }>

      user_coupons: TableDef<{
        id: string
        user_id: string
        coupon_id: string
        status: 'unused' | 'used' | 'expired'
        expiry_date: string | null
        used_at: string | null
        created_at: string
      }>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
