-- Revoking an onboarding link now kills the credential, not just the status.
--
-- Revocation set status = 'revoked' and left capability_hash intact, so the
-- revoked URL still resolved to its instance: the status gate inside the
-- client operation was the single control between a leaked link and a live
-- draft. Worse, the token is deterministic per generation — so any later
-- state change that made the instance readable again would have quietly
-- re-armed the exact URL that was revoked.
--
-- A trigger rather than an edit to the multi-action staff function, because
-- revocation happens on two paths — the revoke action and the archive that
-- revokes in passing — and both are UPDATEs of status. The hash column is
-- NOT NULL with a 64-hex shape check, so the kill writes a random well-formed
-- value no presented token can ever hash to (tokens resolve via SHA-256; this
-- value is built from random UUIDs and is not the SHA-256 of anything a
-- caller can present). Built-in md5 twice over, because pgcrypto is not
-- installed in this schema and the value needs shape, not strength. A legitimate holder now sees the same
-- invalid-link wall as anyone else, which is what being revoked means.

BEGIN;

CREATE OR REPLACE FUNCTION public.onboarding_revocation_kills_credential()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'revoked' AND OLD.status IS DISTINCT FROM 'revoked' THEN
    NEW.capability_hash := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
    NEW.capability_generation := LEAST(OLD.capability_generation + 1, 2147483646);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onboarding_revocation_kills_credential
  ON public.workspace_onboarding_instances;
CREATE TRIGGER onboarding_revocation_kills_credential
  BEFORE UPDATE ON public.workspace_onboarding_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.onboarding_revocation_kills_credential();

-- Already-revoked rows keep their live hashes from before this migration;
-- kill those credentials too.
UPDATE public.workspace_onboarding_instances
SET
  capability_hash = md5(gen_random_uuid()::text || id::text) || md5(gen_random_uuid()::text),
  capability_generation = LEAST(capability_generation + 1, 2147483646)
WHERE status = 'revoked';

COMMIT;
