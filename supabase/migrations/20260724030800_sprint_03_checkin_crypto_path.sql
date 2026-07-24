-- Supabase installs pgcrypto functions in the extensions schema.

alter function public.create_checkin_session(uuid,integer)
set search_path=public,extensions;

alter function public.self_check_in(uuid,text,text)
set search_path=public,extensions;
