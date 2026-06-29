import { createClient } from '@/lib/supabase/client';
import { Task, TaskWithProgress } from '@/types/mission';

export interface UserMission extends Task {
  progress: number;
  is_completed: boolean;
  is_claimed: boolean;
  period_key: string;
}

export const MissionService = {
  async getUserMissions(): Promise<UserMission[]> {
    const supabase = createClient();
    console.log('[MissionService] Fetching user missions...');
    const startTime = Date.now();
    
    try {
      // Add a timeout promise to race against the fetch
      const TIMEOUT_MS = 15000;
      const fetchPromise = supabase.rpc('get_user_missions');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout fetching missions')), TIMEOUT_MS)
      );
      
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
      
      console.log(`[MissionService] Fetch missions took ${Date.now() - startTime}ms`);
      
      if (error) {
        console.error('Error fetching missions:', error);
        throw error;
      }
      
      return data as UserMission[];
    } catch (error) {
      console.error(`[MissionService] Failed after ${Date.now() - startTime}ms:`, error);
      throw error;
    }
  },
  
  async claimReward(taskId: string, periodKey: string) {
     const supabase = createClient();
     const { data, error } = await supabase.rpc('claim_task_reward', { 
       p_task_id: taskId, 
       p_period_key: periodKey 
     });
     
     if (error) {
       console.error('Error claiming reward:', error);
       throw error;
     }
     
     return data;
  },

  async trackEvent(eventType: string, data: any = {}) {
    const supabase = createClient();
    const { data: res, error } = await supabase.rpc('track_mission_event', {
      p_event_type: eventType,
      p_data: data
    });

    if (error) {
      console.error('Error tracking event:', error);
      throw error;
    }
    return res;
  },

  async trackShare(taskId: string, periodKey: string) {
    return this.trackEvent('share_app', { task_id: taskId, period_key: periodKey });
  }
}
