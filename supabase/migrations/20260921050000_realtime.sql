-- Migration 012 - enable Realtime for the live event feed.
--
-- Supabase Realtime only broadcasts changes for tables that are members of the
-- supabase_realtime publication. A table not in it produces no events at all, with no
-- error and no warning: the subscription connects, reports itself healthy, and silently
-- never fires. The Live screen looks like a project with no traffic.
--
-- events_rejected is included too, so the ingestion health screen can react to a
-- misconfigured integration as it happens rather than on the next refresh.
--
-- This does not weaken anything. Realtime evaluates row level security per subscriber, so
-- a client only receives rows it could already have read with a select.

do $$
begin
  alter publication supabase_realtime add table public.events_raw;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.events_rejected;
exception
  when duplicate_object then null;
end $$;
