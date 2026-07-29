-- 365_slot_theme_videos.sql
-- 設定「絕頂RUSH」主題的六支特效影片（來自 lp-assets/zetcho）

DO $$
DECLARE
  v_base TEXT := 'https://akdqleelvqvjhjnfkpfq.supabase.co/storage/v1/object/public/lp-assets/zetcho';
BEGIN
  UPDATE slot_themes SET
    video_rush_entry        = v_base || '/banchou-buildup.mp4',
    video_rush_anticipation = v_base || '/banchou-yokoku-strong.mp4',
    video_rush_win          = v_base || '/banchou-win.mp4',
    video_rush_win_strong   = v_base || '/banchou-win-strong.mp4',
    video_rush_win_god      = v_base || '/banchou-win-god.mp4',
    video_rush_revival      = v_base || '/zetcho_reversal.mp4'
  WHERE name = '絕頂RUSH';
END;
$$;
