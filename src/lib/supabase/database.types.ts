
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_is_admin": boolean,"actor_name": string,"at": string,"changed": (string)[] | null,"entity": string,"entity_id": string | null,"id": number,"summary": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_is_admin"?: boolean,"actor_name": string,"at"?: string,"changed"?: (string)[] | null,"entity": string,"entity_id"?: string | null,"id"?: never,"summary"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_is_admin"?: boolean,"actor_name"?: string,"at"?: string,"changed"?: (string)[] | null,"entity"?: string,"entity_id"?: string | null,"id"?: never,"summary"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_team"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "any_barber": boolean,"booked_name": string | null,"cancelled_by_client": boolean,"changed_from": string | null,"client_id": string | null,"created_at": string,"decline_reason": string | null,"duration_min": number,"ends_at": string,"id": string,"manage_token": string,"message_sent_at": string | null,"price_pence": number,"service_id": string,"service_name": string,"source": string,"staff_id": string,"starts_at": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "any_barber"?: boolean,"booked_name"?: string | null,"cancelled_by_client"?: boolean,"changed_from"?: string | null,"client_id"?: string | null,"created_at"?: string,"decline_reason"?: string | null,"duration_min": number,"ends_at": string,"id"?: string,"manage_token"?: string,"message_sent_at"?: string | null,"price_pence": number,"service_id": string,"service_name": string,"source": string,"staff_id": string,"starts_at": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "any_barber"?: boolean,"booked_name"?: string | null,"cancelled_by_client"?: boolean,"changed_from"?: string | null,"client_id"?: string | null,"created_at"?: string,"decline_reason"?: string | null,"duration_min"?: number,"ends_at"?: string,"id"?: string,"manage_token"?: string,"message_sent_at"?: string | null,"price_pence"?: number,"service_id"?: string,"service_name"?: string,"source"?: string,"staff_id"?: string,"starts_at"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_changed_from_fkey"
      columns: ["changed_from"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_stats"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "bookings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_team"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"phone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"phone": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"phone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"closures": {
                  Row: {
                    "closed_on": string,"created_at": string,"id": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_on": string,"created_at"?: string,"id"?: string,"reason"?: string | null
                  }
                  Update: {
                    "closed_on"?: string,"created_at"?: string,"id"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"gallery_photos": {
                  Row: {
                    "alt": string,"created_at": string,"id": string,"in_hero": boolean,"path": string,"sort": number,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "alt": string,"created_at"?: string,"id"?: string,"in_hero"?: boolean,"path": string,"sort"?: number,"visible"?: boolean
                  }
                  Update: {
                    "alt"?: string,"created_at"?: string,"id"?: string,"in_hero"?: boolean,"path"?: string,"sort"?: number,"visible"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"login_failures": {
                  Row: {
                    "at": string,"id": number,"user_hash": string,"visitor_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: never,"user_hash": string,"visitor_hash": string
                  }
                  Update: {
                    "at"?: string,"id"?: never,"user_hash"?: string,"visitor_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"p256dh": string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"request_attempts": {
                  Row: {
                    "at": string,"id": number,"ip_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: never,"ip_hash": string
                  }
                  Update: {
                    "at"?: string,"id"?: never,"ip_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reviews": {
                  Row: {
                    "author_name": string,"body": string,"created_at": string,"id": string,"is_google": boolean,"review_date": string | null,"sort": number,"stars": number,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "author_name": string,"body": string,"created_at"?: string,"id"?: string,"is_google"?: boolean,"review_date"?: string | null,"sort"?: number,"stars": number,"visible"?: boolean
                  }
                  Update: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"id"?: string,"is_google"?: boolean,"review_date"?: string | null,"sort"?: number,"stars"?: number,"visible"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "active": boolean,"bookable_days": (number)[] | null,"created_at": string,"duration_min": number,"id": string,"name": string,"price_pence": number,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"bookable_days"?: (number)[] | null,"created_at"?: string,"duration_min": number,"id"?: string,"name": string,"price_pence": number,"sort"?: number
                  }
                  Update: {
                    "active"?: boolean,"bookable_days"?: (number)[] | null,"created_at"?: string,"duration_min"?: number,"id"?: string,"name"?: string,"price_pence"?: number,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "booking_window_days": number,"change_cutoff_minutes": number,"discount_text": string | null,"due_back_weeks": number,"google_rating": number | null,"google_review_count": number | null,"google_review_url": string | null,"id": number,"max_open_requests": number,"min_notice_minutes": number,"public_theme": string,"shop_hours": NonNullable<Json>,"shop_photo_path": string | null,"updated_at": string,"walk_in_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_window_days"?: number,"change_cutoff_minutes"?: number,"discount_text"?: string | null,"due_back_weeks"?: number,"google_rating"?: number | null,"google_review_count"?: number | null,"google_review_url"?: string | null,"id"?: number,"max_open_requests"?: number,"min_notice_minutes"?: number,"public_theme"?: string,"shop_hours"?: NonNullable<Json>,"shop_photo_path"?: string | null,"updated_at"?: string,"walk_in_text"?: string | null
                  }
                  Update: {
                    "booking_window_days"?: number,"change_cutoff_minutes"?: number,"discount_text"?: string | null,"due_back_weeks"?: number,"google_rating"?: number | null,"google_review_count"?: number | null,"google_review_url"?: string | null,"id"?: number,"max_open_requests"?: number,"min_notice_minutes"?: number,"public_theme"?: string,"shop_hours"?: NonNullable<Json>,"shop_photo_path"?: string | null,"updated_at"?: string,"walk_in_text"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"staff": {
                  Row: {
                    "active": boolean,"bio": string | null,"bookable": boolean,"created_at": string,"deleted_at": string | null,"display_name": string,"id": string,"photo_path": string | null,"role": string,"show_on_site": boolean,"sort": number,"title": string | null,"updated_at": string,"user_id": string | null,"username": string | null,"weekly_hours": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"bio"?: string | null,"bookable"?: boolean,"created_at"?: string,"deleted_at"?: string | null,"display_name": string,"id"?: string,"photo_path"?: string | null,"role": string,"show_on_site"?: boolean,"sort"?: number,"title"?: string | null,"updated_at"?: string,"user_id"?: string | null,"username"?: string | null,"weekly_hours"?: NonNullable<Json>
                  }
                  Update: {
                    "active"?: boolean,"bio"?: string | null,"bookable"?: boolean,"created_at"?: string,"deleted_at"?: string | null,"display_name"?: string,"id"?: string,"photo_path"?: string | null,"role"?: string,"show_on_site"?: boolean,"sort"?: number,"title"?: string | null,"updated_at"?: string,"user_id"?: string | null,"username"?: string | null,"weekly_hours"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"staff_services": {
                  Row: {
                    "service_id": string,"staff_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "service_id": string,"staff_id": string
                  }
                  Update: {
                    "service_id"?: string,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_services_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_services_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_team"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_services_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"time_off": {
                  Row: {
                    "created_at": string,"ends_on": string,"id": string,"reason": string | null,"staff_id": string,"starts_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on": string,"id"?: string,"reason"?: string | null,"staff_id": string,"starts_on": string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string,"id"?: string,"reason"?: string | null,"staff_id"?: string,"starts_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_off_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_team"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_off_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "client_stats": {
                  Row: {
                    "client_id": string,"last_visit": string | null,"next_visit": string | null,"no_shows": number | null,"spent_pence": number | null,"usual_service_id": string | null,"usual_service_name": string | null,"usual_staff_id": string | null,"usual_start_minute": number | null,"visits": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"public_team": {
                  Row: {
                    "bio": string | null,"bookable": boolean,"display_name": string,"id": string,"photo_path": string | null,"show_on_site": boolean,"sort": number,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "bio"?: string | null,"bookable"?: boolean | null,"display_name"?: string | null,"id"?: string | null,"photo_path"?: string | null,"show_on_site"?: boolean | null,"sort"?: number | null,"title"?: string | null
                         }
                        Update: {
                           "bio"?: string | null,"bookable"?: boolean | null,"display_name"?: string | null,"id"?: string | null,"photo_path"?: string | null,"show_on_site"?: boolean | null,"sort"?: number | null,"title"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "tables_missing_2fa_policy":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"two_factor_ok":
{ Args: Record<PropertyKey, never>; Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
