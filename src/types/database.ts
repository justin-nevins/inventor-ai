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
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          subscription_tier: 'free' | 'pro' | 'enterprise'
          onboarding_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          subscription_tier?: 'free' | 'pro' | 'enterprise'
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          subscription_tier?: 'free' | 'pro' | 'enterprise'
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          problem_statement: string | null
          target_audience: string | null
          status: 'draft' | 'researching' | 'validated' | 'archived'
          current_stage: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          problem_statement?: string | null
          target_audience?: string | null
          status?: 'draft' | 'researching' | 'validated' | 'archived'
          current_stage?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          problem_statement?: string | null
          target_audience?: string | null
          status?: 'draft' | 'researching' | 'validated' | 'archived'
          current_stage?: string
          created_at?: string
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          title: string | null
          agent_type: 'assistant' | 'market_research' | 'validation' | 'audience_analysis'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          title?: string | null
          agent_type?: 'assistant' | 'market_research' | 'validation' | 'audience_analysis'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string | null
          title?: string | null
          agent_type?: 'assistant' | 'market_research' | 'validation' | 'audience_analysis'
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          metadata: Json
          objective_truth: number | null
          practical_truth: number | null
          completeness: number | null
          contextual_scope: number | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          metadata?: Json
          objective_truth?: number | null
          practical_truth?: number | null
          completeness?: number | null
          contextual_scope?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant' | 'system'
          content?: string
          metadata?: Json
          objective_truth?: number | null
          practical_truth?: number | null
          completeness?: number | null
          contextual_scope?: number | null
          created_at?: string
        }
      }
      ai_memory: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          memory_type: 'preference' | 'context' | 'insight' | 'correction'
          content: Json
          importance_score: number
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          memory_type: 'preference' | 'context' | 'insight' | 'correction'
          content: Json
          importance_score?: number
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string | null
          memory_type?: 'preference' | 'context' | 'insight' | 'correction'
          content?: Json
          importance_score?: number
          expires_at?: string | null
          created_at?: string
        }
      }
      knowledge_articles: {
        Row: {
          id: string
          title: string
          content: string
          source_url: string
          source_name: string
          category: string | null
          tags: string[]
          last_updated: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          source_url: string
          source_name: string
          category?: string | null
          tags?: string[]
          last_updated?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          source_url?: string
          source_name?: string
          category?: string | null
          tags?: string[]
          last_updated?: string
          is_active?: boolean
          created_at?: string
        }
      }
      search_cache: {
        Row: {
          id: string
          query_hash: string
          search_type: 'patent' | 'web' | 'retail'
          query_params: Json
          results: Json
          result_count: number
          source_api: string
          created_at: string
          expires_at: string | null
        }
        Insert: {
          id?: string
          query_hash: string
          search_type: 'patent' | 'web' | 'retail'
          query_params: Json
          results: Json
          result_count: number
          source_api: string
          created_at?: string
          expires_at?: string | null
        }
        Update: {
          id?: string
          query_hash?: string
          search_type?: 'patent' | 'web' | 'retail'
          query_params?: Json
          results?: Json
          result_count?: number
          source_api?: string
          created_at?: string
          expires_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

// Convenience exports
export type Profile = Tables<'profiles'>
export type Project = Tables<'projects'>
export type ProjectInsert = InsertTables<'projects'>
export type Conversation = Tables<'conversations'>
export type ConversationInsert = InsertTables<'conversations'>
export type Message = Tables<'messages'>
export type MessageInsert = InsertTables<'messages'>
export type AiMemory = Tables<'ai_memory'>
export type AiMemoryInsert = InsertTables<'ai_memory'>
export type KnowledgeArticle = Tables<'knowledge_articles'>
