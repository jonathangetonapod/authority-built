-- Removes the storage behind declared stage output fields.
--
-- A stage could declare named fields to return: the run appended a JSON shape
-- to the prompt, parsed values back out of the answer, and stripped the block
-- off again before handing the report on. Every stage now returns its whole
-- answer as {{<stage_id>_response}}, derived from the stage list rather than
-- declared, so the feature these tables backed has no remaining reader — the
-- run stopped consulting them, the endpoints that wrote them are gone, and the
-- panel that named the fields is gone.
--
-- Dropped rather than left in place. Tables that still accept writes nothing
-- consumes are how a removed feature returns as half of one, and an operator
-- reading the schema cannot tell a live table from a retired one.
--
-- The rows are not preserved. What they held was a list of field names and
-- descriptions per stage, all of it re-creatable by hand and none of it a
-- record of anything that happened; the pitches, reports and audit entries the
-- runs produced live elsewhere and are untouched.
--
-- Written to be safe to run twice: IF EXISTS throughout, and CASCADE is
-- deliberately NOT used, so an object that came to depend on these tables after
-- this was written fails the migration loudly instead of being dropped with it.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:prompt-output-fields:v1', 0));

DROP TABLE IF EXISTS public.client_prompt_outputs;
DROP TABLE IF EXISTS public.workspace_prompt_outputs;

COMMIT;
