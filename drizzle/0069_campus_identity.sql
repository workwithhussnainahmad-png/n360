-- Replace only the old generated campus usernames. Existing staff/student login
-- identifiers and main-campus credentials remain unchanged. Safe to replay.
LOCK TABLE institutions IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  campus record;
  base_name text;
  candidate text;
  suffix text;
  attempt integer;
BEGIN
  FOR campus IN SELECT id, parent_institution_id, campus_name FROM institutions
    WHERE parent_institution_id IS NOT NULL AND campus_name IS NOT NULL
      AND username ~ '^campus[0-9]+[0-9a-f]{8}$'
    ORDER BY id
  LOOP
    base_name := trim(both '-' FROM regexp_replace(lower(regexp_replace(normalize(campus.campus_name, NFKD), U&'[\0300-\036f]', '', 'g')), '[^a-z0-9]+', '-', 'g'));
    IF base_name = '' THEN base_name := 'campus'; END IF;
    candidate := rtrim(left(base_name, 30), '-');
    attempt := 0;
    WHILE EXISTS (SELECT 1 FROM institutions WHERE username = candidate AND id <> campus.id) LOOP
      attempt := attempt + 1;
      suffix := '-' || campus.parent_institution_id || CASE WHEN attempt = 1 THEN '' ELSE '-' || attempt END;
      candidate := rtrim(left(base_name, 30 - length(suffix)), '-') || suffix;
    END LOOP;
    UPDATE institutions SET username = candidate WHERE id = campus.id;
  END LOOP;
END $$;
