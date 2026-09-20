-- Migration 011 - the exports storage bucket.
--
-- Not public. Export files contain a customer's raw event data, so they are reachable only
-- through a signed URL generated on request and valid for fifteen minutes.

insert into storage.buckets (id, name, public, file_size_limit)
values ('exports', 'exports', false, 268435456)
on conflict (id) do update set public = false;

-- No storage.objects policies are created for the exports bucket, deliberately.
--
-- Clients never read this bucket directly. The dashboard asks the server for a signed URL,
-- the server checks project membership before signing, and writes an audit entry. A select
-- policy here would be a second, quieter path to the same files that nothing audits.
