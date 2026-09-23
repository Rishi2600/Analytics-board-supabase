-- Makes the "Events over time" and "Property breakdown" exports on the Reports screen work.
--
-- The export worker runs as service_role and builds those two files by calling
-- api.timeseries and api.breakdown. service_role never had usage on the api schema, so both
-- kinds failed with "permission denied for schema api" on every run. Only raw event exports,
-- which read the table directly, ever succeeded, and the test covered only those.
--
-- service_role already bypasses row level security everywhere. This adds no reach it did
-- not have, only a schema it could not name.

grant usage on schema api to service_role;
grant execute on function api.timeseries(uuid, timestamptz, timestamptz, text[], jsonb, text) to service_role;
grant execute on function api.breakdown(uuid, timestamptz, timestamptz, text, text, integer) to service_role;
