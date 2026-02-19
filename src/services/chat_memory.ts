import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
    id?: string;
    case_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at?: string;
}

export const chatMemory = {
    async saveMessage(message: ChatMessage): Promise<void> {
        if (!supabase) {
            console.error("[ChatMemory] Supabase not initialized. Skipping persistence.");
            return;
        }

        try {
            const { error } = await supabase
                .from('chat_messages')
                .insert({
                    case_id: message.case_id,
                    role: message.role,
                    content: message.content
                });

            if (error) throw error;
        } catch (err) {
            console.error("[ChatMemory] Failed to save message:", err);
        }
    },

    async getHistory(caseId: string, limit: number = 10): Promise<ChatMessage[]> {
        if (!supabase) {
            console.warn("[ChatMemory] Supabase not initialized. Returning empty history.");
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('case_id', caseId)
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("[ChatMemory] Failed to retrieve history:", err);
            return [];
        }
    },

    async clearHistory(caseId: string): Promise<void> {
        if (!supabase) return;

        try {
            const { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('case_id', caseId);

            if (error) throw error;
        } catch (err) {
            console.error("[ChatMemory] Failed to clear history:", err);
        }
    }
};
