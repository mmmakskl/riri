import { useState, useEffect, useCallback } from 'react';
import { supabase, setUserContext } from '../utils/supabase';
import { useAuth } from './useAuth';
import { useProjectContext } from '../contexts/ProjectContext';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggested_script?: string;
  timestamp?: string;
}

export interface ScriptDraft {
  id: string;
  project_id: string;
  user_id: string;
  style_id: string | null;
  title: string;
  script_text: string;
  status: 'draft' | 'generating' | 'done';
  chat_history: ChatMessage[];
  source_type: 'topic' | 'reference' | null;
  source_data: Record<string, unknown>;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useScriptDrafts() {
  const [drafts, setDrafts] = useState<ScriptDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { currentProjectId } = useProjectContext();

  const getUserId = useCallback(() => user?.id || 'anonymous', [user]);

  const fetchDrafts = useCallback(async () => {
    if (!currentProjectId || !user?.id) {
      setDrafts([]);
      setLoading(false);
      return;
    }

    try {
      await setUserContext(user.id);
      const { data, error } = await supabase
        .from('script_drafts')
        .select('*')
        .eq('project_id', currentProjectId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[ScriptDrafts] fetch error:', error);
        setDrafts([]);
      } else {
        setDrafts((data || []) as ScriptDraft[]);
      }
    } catch (err) {
      console.error('[ScriptDrafts] fetch exception:', err);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, user?.id]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const createDraft = useCallback(async (draft: {
    title?: string;
    script_text?: string;
    style_id?: string;
    source_type?: 'topic' | 'reference';
    source_data?: Record<string, unknown>;
    chat_history?: ChatMessage[];
  }): Promise<ScriptDraft | null> => {
    const userId = getUserId();
    if (!currentProjectId) return null;

    try {
      await setUserContext(userId);
      const { data, error } = await supabase
        .from('script_drafts')
        .insert({
          project_id: currentProjectId,
          user_id: userId,
          style_id: draft.style_id || null,
          title: draft.title || 'Без названия',
          script_text: draft.script_text || '',
          status: 'draft',
          chat_history: draft.chat_history || [],
          source_type: draft.source_type || null,
          source_data: draft.source_data || {},
        })
        .select()
        .single();

      if (error) {
        console.error('[ScriptDrafts] create error:', error);
        return null;
      }

      const newDraft = data as ScriptDraft;
      setDrafts(prev => [newDraft, ...prev]);
      return newDraft;
    } catch (err) {
      console.error('[ScriptDrafts] create exception:', err);
      return null;
    }
  }, [getUserId, currentProjectId]);

  const updateDraft = useCallback(async (
    draftId: string,
    updates: Partial<Pick<ScriptDraft, 'title' | 'script_text' | 'status' | 'chat_history' | 'cover_url' | 'style_id' | 'source_type' | 'source_data'>>
  ): Promise<boolean> => {
    const userId = getUserId();
    try {
      await setUserContext(userId);
      const { error } = await supabase
        .from('script_drafts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', draftId);

      if (error) {
        console.error('[ScriptDrafts] update error:', error);
        return false;
      }

      setDrafts(prev => prev.map(d =>
        d.id === draftId ? { ...d, ...updates, updated_at: new Date().toISOString() } : d
      ));
      return true;
    } catch (err) {
      console.error('[ScriptDrafts] update exception:', err);
      return false;
    }
  }, [getUserId]);

  const deleteDraft = useCallback(async (draftId: string): Promise<boolean> => {
    const userId = getUserId();
    try {
      await setUserContext(userId);
      const { error } = await supabase
        .from('script_drafts')
        .delete()
        .eq('id', draftId);

      if (error) {
        console.error('[ScriptDrafts] delete error:', error);
        return false;
      }

      setDrafts(prev => prev.filter(d => d.id !== draftId));
      return true;
    } catch (err) {
      console.error('[ScriptDrafts] delete exception:', err);
      return false;
    }
  }, [getUserId]);

  const addDraftToFeed = useCallback(async (
    draftId: string,
    folderId: string | null,
    coverUrl?: string
  ): Promise<boolean> => {
    const userId = getUserId();
    if (!currentProjectId) return false;

    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return false;

    try {
      await setUserContext(userId);

      const videoId = `script-${Date.now()}`;
      const { error } = await supabase
        .from('saved_videos')
        .insert({
          user_id: userId,
          video_id: videoId,
          caption: draft.title,
          script_text: draft.script_text,
          project_id: currentProjectId,
          folder_id: folderId,
          thumbnail_url: coverUrl || draft.cover_url || '',
        });

      if (error) {
        console.error('[ScriptDrafts] addToFeed error:', error);
        return false;
      }

      await updateDraft(draftId, { status: 'done' });

      window.dispatchEvent(new CustomEvent('videos-updated', {
        detail: { projectId: currentProjectId },
      }));

      return true;
    } catch (err) {
      console.error('[ScriptDrafts] addToFeed exception:', err);
      return false;
    }
  }, [getUserId, currentProjectId, drafts, updateDraft]);

  return {
    drafts,
    loading,
    createDraft,
    updateDraft,
    deleteDraft,
    addDraftToFeed,
    refetch: fetchDrafts,
  };
}
