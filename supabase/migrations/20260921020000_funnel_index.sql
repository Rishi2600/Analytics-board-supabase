-- Migration 009 - the index funnels and retention need.
--
-- Both walk a single user's events in order: "did this person do B after they did A, and
-- within the window". That is a lookup by (project, user, event name, time), and without
-- an index covering it the planner falls back to scanning a large slice of events_raw once
-- per funnel step. Measured on a million events, a four step funnel took 1.35 seconds.
--
-- This index is not free: it is roughly the width of its four columns times the row count.
-- It is worth it because these are the only two query paths in the product that cannot be
-- answered from a rollup, so this is where the raw table has to be fast.
create index if not exists events_raw_user_event_ts_idx
  on public.events_raw (project_id, distinct_id, event_name, ts);
