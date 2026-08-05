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

/**
 * 前台讀得到的資料表形狀。
 *
 * 刻意不含 products.seed / cost / profit_rate ——
 * 那幾欄已經在資料庫用欄位級授權擋掉（migration 471），前台選它們會直接
 * 42501 permission denied。型別留著只會讓人以為拿得到值。
 *   seed        抽獎種子，公開等於玩家能預先算出每一抽的結果
 *   profit_rate 殺率，商業機密
 *   cost        進貨成本，商業機密
 *
 * product_prizes.probability 則刻意保留 —— 轉蛋／盒玩是「每抽當下獨立隨機」，
 * 機率對玩家有意義，PrizeDetailSheet 本來就會顯示（籤號制才不顯示）。
 * （release_date 是舊版留下的欄位，資料表裡早就沒有了。）
 */
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
        probability: number | null
        remaining_count: number
        is_hot: boolean
        txid_hash: string | null
        is_preorder: boolean | null
        preorder_available_at: string | null
        distributor: string | null
        series: string | null
        supplier_id: number | null
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
