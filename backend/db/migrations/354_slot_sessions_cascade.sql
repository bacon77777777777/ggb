-- 修正 slot_sessions.machine_id FK 為 CASCADE，避免刪機台時因殘留 session 而報錯
ALTER TABLE public.slot_sessions
  DROP CONSTRAINT slot_sessions_machine_id_fkey;

ALTER TABLE public.slot_sessions
  ADD CONSTRAINT slot_sessions_machine_id_fkey
    FOREIGN KEY (machine_id)
    REFERENCES public.slot_machines(id)
    ON DELETE CASCADE;
