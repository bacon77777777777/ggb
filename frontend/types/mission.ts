export type TaskType = 'daily' | 'weekly' | 'achievement';
export type TaskCondition = 
  | 'login' 
  | 'draw_count' 
  | 'spend_amount' 
  | 'share_app' 
  | 'view_product' 
  | 'like_ranking' 
  | 'recharge' 
  | 'win_sr' 
  | 'play_unique_machine'
  | 'bind_phone'
  | 'sell_item';

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string | null;
  target_value: number;
  reward_coins: number;
  condition_type: TaskCondition;
  icon_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserTaskProgress {
  id: string;
  user_id: string;
  task_id: string;
  progress: number;
  is_completed: boolean;
  is_claimed: boolean;
  period_key: string;
  last_updated: string;
}

export interface TaskWithProgress extends Task {
  userProgress?: UserTaskProgress;
}
