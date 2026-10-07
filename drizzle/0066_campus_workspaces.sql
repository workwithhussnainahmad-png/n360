-- Keep institution_id as the workspace boundary used throughout the LMS.
-- Child rows belong to one purchased institution; they are not new purchases.
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS parent_institution_id integer REFERENCES institutions(id) ON DELETE CASCADE;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS campus_name varchar(255) NOT NULL DEFAULT 'Main';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS institutions_parent_institution_idx ON institutions(parent_institution_id);

-- Preserve existing campus names/IDs. Prefer an existing Main, otherwise the
-- first existing campus. Other legacy campuses retain their data until setup.
UPDATE institutions i SET campus_name = c.name
FROM (
  SELECT DISTINCT ON (institution_id) institution_id, name
  FROM campuses WHERE deleted_at IS NULL
  ORDER BY institution_id, (lower(name) = 'main') DESC, id
) c
WHERE i.id = c.institution_id AND i.parent_institution_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM institutions child WHERE child.parent_institution_id = i.id);

INSERT INTO campuses (institution_id, name, address)
SELECT i.id, i.campus_name, i.address FROM institutions i
WHERE NOT EXISTS (SELECT 1 FROM campuses c WHERE c.institution_id = i.id AND c.deleted_at IS NULL AND c.name = i.campus_name);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institutions_parent_not_self') THEN
    ALTER TABLE institutions ADD CONSTRAINT institutions_parent_not_self CHECK (parent_institution_id IS NULL OR parent_institution_id <> id);
  END IF;
END $$;
