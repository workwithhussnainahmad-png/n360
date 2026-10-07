# Live database schema and indexes

Captured from PostgreSQL catalogs; source declaration: src/db/schema.ts. Includes dashboard tables and campuses used by profile. Enum labels are in source schema.

## institutions (1 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('institutions_id_seq'::regclass) |
| name | varchar | NO |  |
| type | institution_type | NO |  |
| username | varchar | NO |  |
| logo_key | varchar | NO |  |
| country | varchar | NO |  |
| city | varchar | NO |  |
| address | text | NO |  |
| contact_email | varchar | NO |  |
| contact_phone | varchar | NO |  |
| registration_number | varchar | NO |  |
| proof_document_key | varchar | NO |  |
| status | institution_status | NO | 'PENDING'::institution_status |
| rejection_reason | text | YES |  |
| admin_password_hash | text | NO |  |
| created_at | timestamp | NO | now() |
| deleted_at | timestamp | YES |  |
| signature_key | varchar | YES |  |
| accept_fee_vouchers | bool | NO | false |
| allow_graduated_student_access | bool | NO | true |
| pricing_plan | varchar | NO |  |
| fee_voucher_open_day | int4 | YES |  |
| fee_voucher_late_day | int4 | YES |  |
| fee_voucher_late_fee | int4 | NO | 0 |
| public_slug | varchar | YES |  |
| public_site_enabled | bool | NO | false |
| admissions_enabled | bool | NO | false |
| fee_payment_methods | jsonb | NO | '[]'::jsonb |
| course_streaming_provider | streaming_provider | YES |  |
| course_streaming_credentials | text | YES |  |

```sql
CREATE INDEX institutions_lower_contact_email_idx ON public.institutions USING btree (lower((contact_email)::text));
CREATE UNIQUE INDEX institutions_pkey ON public.institutions USING btree (id);
CREATE UNIQUE INDEX institutions_public_slug_lower_unique ON public.institutions USING btree (lower((public_slug)::text)) WHERE (public_slug IS NOT NULL);
CREATE INDEX institutions_status_created_idx ON public.institutions USING btree (status, created_at);
CREATE UNIQUE INDEX institutions_username_unique ON public.institutions USING btree (username);
```

Constraints:

- institutions_admissions_requires_public_site_check: CHECK (((NOT admissions_enabled) OR public_site_enabled))
- institutions_fee_voucher_day_order_check: CHECK (((fee_voucher_open_day IS NULL) OR (fee_voucher_late_day IS NULL) OR (fee_voucher_late_day > fee_voucher_open_day)))
- institutions_fee_voucher_late_day_check: CHECK (((fee_voucher_late_day IS NULL) OR ((fee_voucher_late_day >= 1) AND (fee_voucher_late_day <= 28))))
- institutions_fee_voucher_late_fee_check: CHECK ((fee_voucher_late_fee >= 0))
- institutions_fee_voucher_open_day_check: CHECK (((fee_voucher_open_day IS NULL) OR ((fee_voucher_open_day >= 1) AND (fee_voucher_open_day <= 28))))
- institutions_pkey: PRIMARY KEY (id)
- institutions_public_site_requires_slug_check: CHECK (((NOT public_site_enabled) OR (public_slug IS NOT NULL)))
- institutions_public_slug_format_check: CHECK (((public_slug IS NULL) OR (((char_length((public_slug)::text) >= 2) AND (char_length((public_slug)::text) <= 30)) AND ((public_slug)::text = lower((public_slug)::text)) AND ((public_slug)::text ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'::text) AND ((public_slug)::text !~~ '%--%'::text))))
- institutions_public_slug_reserved_check: CHECK (((public_slug IS NULL) OR ((public_slug)::text <> ALL ((ARRAY['admin'::character varying, 'api'::character varying, 'app'::character varying, 'apply'::character varying, 'assets'::character varying, 'auth'::character varying, 'blog'::character varying, 'cdn'::character varying, 'docs'::character varying, 'employee'::character varying, 'help'::character varying, 'institution'::character varying, 'mail'::character varying, 'portal'::character varying, 'sa'::character varying, 'static'::character varying, 'status'::character varying, 'staff'::character varying, 'student'::character varying, 'superadmin'::character varying, 'support'::character varying, 'www'::character varying])::text[]))))
- institutions_username_unique: UNIQUE (username)

## students (1500 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('students_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| campus_id | int4 | YES |  |
| name | varchar | NO |  |
| father_name | varchar | YES |  |
| phone | varchar | YES |  |
| gender | varchar | NO | 'MALE'::character varying |
| profile_picture_url | varchar | YES |  |
| login_roll_number | varchar | NO |  |
| password_hash | text | NO |  |
| class_id | int4 | NO |  |
| section_id | int4 | NO |  |
| year_of_joining | int4 | NO |  |
| class_roll_number | varchar | NO |  |
| age | int4 | YES |  |
| is_active | bool | NO | true |
| must_change_password | bool | NO | true |
| created_at | timestamp | NO | now() |
| deleted_at | timestamp | YES |  |
| expo_push_token | varchar | YES |  |
| emergency_contact | varchar | YES |  |
| parental_whatsapp | varchar | YES |  |
| test_push_notifications_enabled | bool | NO | true |
| announcement_push_notifications_enabled | bool | NO | true |
| admission_sequence | int4 | YES |  |
| academic_status | student_academic_status | NO | 'ACTIVE'::student_academic_status |
| guardian_email | varchar | YES |  |

```sql
CREATE UNIQUE INDEX inst_class_roll_unique ON public.students USING btree (institution_id, class_id, class_roll_number);
CREATE INDEX students_class_roll_trgm_idx ON public.students USING gin (lower((class_roll_number)::text) gin_trgm_ops) WHERE ((deleted_at IS NULL) AND (class_roll_number IS NOT NULL));
CREATE UNIQUE INDEX students_id_institution_unique ON public.students USING btree (id, institution_id);
CREATE INDEX students_institution_guardian_email_idx ON public.students USING btree (institution_id, guardian_email);
CREATE INDEX students_institution_id_idx ON public.students USING btree (institution_id);
CREATE INDEX students_institution_section_id_idx ON public.students USING btree (institution_id, section_id);
CREATE UNIQUE INDEX students_institution_year_admission_sequence_unique ON public.students USING btree (institution_id, year_of_joining, admission_sequence);
CREATE UNIQUE INDEX students_login_roll_number_unique ON public.students USING btree (login_roll_number);
CREATE INDEX students_login_roll_trgm_idx ON public.students USING gin (lower((login_roll_number)::text) gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE INDEX students_lower_login_roll_idx ON public.students USING btree (lower((login_roll_number)::text));
CREATE INDEX students_lower_login_roll_number_idx ON public.students USING btree (lower((login_roll_number)::text));
CREATE INDEX students_name_trgm_idx ON public.students USING gin (lower((name)::text) gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX students_pkey ON public.students USING btree (id);
```

Constraints:

- inst_class_roll_unique: UNIQUE (institution_id, class_id, class_roll_number)
- students_campus_id_campuses_id_fk: FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE SET NULL
- students_class_id_classes_id_fk: FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
- students_id_institution_unique: UNIQUE (id, institution_id)
- students_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- students_login_roll_number_unique: UNIQUE (login_roll_number)
- students_pkey: PRIMARY KEY (id)
- students_section_id_sections_id_fk: FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE

## staff (1000 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('staff_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| campus_id | int4 | YES |  |
| name | varchar | NO |  |
| email | varchar | NO |  |
| phone | varchar | YES |  |
| profile_picture_url | varchar | YES |  |
| password_hash | text | NO |  |
| is_active | bool | NO | true |
| must_change_password | bool | NO | true |
| created_at | timestamp | NO | now() |
| deleted_at | timestamp | YES |  |
| expo_push_token | varchar | YES |  |
| announcement_push_notifications_enabled | bool | NO | true |
| custom_role_id | int4 | YES |  |
| course_streaming_provider | streaming_provider | YES |  |
| course_streaming_credentials | text | YES |  |

```sql
CREATE UNIQUE INDEX staff_email_unique ON public.staff USING btree (email);
CREATE INDEX staff_institution_id_idx ON public.staff USING btree (institution_id);
CREATE INDEX staff_lower_email_idx ON public.staff USING btree (lower((email)::text));
CREATE UNIQUE INDEX staff_pkey ON public.staff USING btree (id);
```

Constraints:

- staff_campus_id_campuses_id_fk: FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE SET NULL
- staff_custom_role_id_fkey: FOREIGN KEY (custom_role_id) REFERENCES institution_custom_roles(id) ON DELETE SET NULL
- staff_email_unique: UNIQUE (email)
- staff_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- staff_pkey: PRIMARY KEY (id)

## staff_assignments (1000 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('staff_assignments_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| staff_id | int4 | YES |  |
| section_id | int4 | NO |  |
| subject_id | int4 | YES |  |
| is_break | bool | NO | false |
| day_of_week | int4 | NO |  |
| start_time | time | NO |  |
| end_time | time | NO |  |
| group_id | int4 | YES |  |

```sql
CREATE UNIQUE INDEX section_time_slot_unique ON public.staff_assignments USING btree (institution_id, section_id, COALESCE(group_id, 0), day_of_week, start_time);
CREATE INDEX staff_assignments_institution_section_day_idx ON public.staff_assignments USING btree (institution_id, section_id, day_of_week);
CREATE INDEX staff_assignments_institution_section_idx ON public.staff_assignments USING btree (institution_id, section_id);
CREATE INDEX staff_assignments_institution_staff_idx ON public.staff_assignments USING btree (institution_id, staff_id);
CREATE UNIQUE INDEX staff_assignments_pkey ON public.staff_assignments USING btree (id);
CREATE UNIQUE INDEX staff_time_slot_unique ON public.staff_assignments USING btree (institution_id, staff_id, day_of_week, start_time);
```

Constraints:

- staff_assignments_group_id_section_groups_id_fk: FOREIGN KEY (group_id) REFERENCES section_groups(id)
- staff_assignments_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- staff_assignments_pkey: PRIMARY KEY (id)
- staff_assignments_section_id_sections_id_fk: FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
- staff_assignments_staff_id_staff_id_fk: FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
- staff_assignments_subject_id_subjects_id_fk: FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
- staff_time_slot_unique: UNIQUE (institution_id, staff_id, day_of_week, start_time)

## subjects (10 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('subjects_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| name | varchar | NO |  |
| code | varchar | YES |  |
| created_at | timestamp | NO | now() |
| deleted_at | timestamp | YES |  |

```sql
CREATE INDEX subjects_institution_id_idx ON public.subjects USING btree (institution_id);
CREATE UNIQUE INDEX subjects_pkey ON public.subjects USING btree (id);
```

Constraints:

- subjects_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- subjects_pkey: PRIMARY KEY (id)

## classes (10 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('classes_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| name | varchar | NO |  |
| level | int4 | NO | 0 |
| created_at | timestamp | NO | now() |
| deleted_at | timestamp | YES |  |
| is_final_class | bool | NO | false |
| is_graduated_archive | bool | NO | false |

```sql
CREATE INDEX classes_institution_id_idx ON public.classes USING btree (institution_id);
CREATE UNIQUE INDEX classes_pkey ON public.classes USING btree (id);
```

Constraints:

- classes_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- classes_pkey: PRIMARY KEY (id)

## sections (100 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('sections_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| class_id | int4 | NO |  |
| name | varchar | NO |  |
| class_teacher_id | int4 | YES |  |
| created_at | timestamp | NO | now() |
| deleted_at | timestamp | YES |  |

```sql
CREATE INDEX sections_institution_class_id_idx ON public.sections USING btree (institution_id, class_id);
CREATE INDEX sections_institution_id_idx ON public.sections USING btree (institution_id);
CREATE UNIQUE INDEX sections_pkey ON public.sections USING btree (id);
```

Constraints:

- sections_class_id_classes_id_fk: FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
- sections_class_teacher_id_staff_id_fk: FOREIGN KEY (class_teacher_id) REFERENCES staff(id) ON DELETE SET NULL
- sections_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- sections_pkey: PRIMARY KEY (id)

## assignments (0 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('assignments_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| staff_id | int4 | NO |  |
| class_id | int4 | NO |  |
| section_id | int4 | YES |  |
| subject_id | int4 | YES |  |
| title | varchar | NO |  |
| description | text | YES |  |
| due_at | timestamp | NO |  |
| created_at | timestamp | NO | now() |
| reference_file_url | text | YES |  |
| reference_file_name | varchar | YES |  |

```sql
CREATE INDEX assignments_institution_class_due_idx ON public.assignments USING btree (institution_id, class_id, due_at);
CREATE INDEX assignments_institution_section_idx ON public.assignments USING btree (institution_id, section_id);
CREATE INDEX assignments_institution_staff_created_idx ON public.assignments USING btree (institution_id, staff_id, created_at);
CREATE UNIQUE INDEX assignments_pkey ON public.assignments USING btree (id);
```

Constraints:

- assignments_class_id_classes_id_fk: FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
- assignments_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- assignments_pkey: PRIMARY KEY (id)
- assignments_section_id_sections_id_fk: FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
- assignments_staff_id_staff_id_fk: FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
- assignments_subject_id_subjects_id_fk: FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL

## submissions (0 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('submissions_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| assignment_id | int4 | NO |  |
| student_id | int4 | NO |  |
| file_key | varchar | NO |  |
| created_at | timestamp | NO | now() |

```sql
CREATE UNIQUE INDEX student_assignment_unique ON public.submissions USING btree (assignment_id, student_id);
CREATE INDEX submissions_assignment_student_inst_idx ON public.submissions USING btree (assignment_id, student_id, institution_id);
CREATE INDEX submissions_institution_student_idx ON public.submissions USING btree (institution_id, student_id);
CREATE UNIQUE INDEX submissions_pkey ON public.submissions USING btree (id);
```

Constraints:

- student_assignment_unique: UNIQUE (assignment_id, student_id)
- submissions_assignment_id_assignments_id_fk: FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
- submissions_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- submissions_pkey: PRIMARY KEY (id)
- submissions_student_id_students_id_fk: FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE

## marks (0 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('marks_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| test_id | int4 | NO |  |
| student_id | int4 | NO |  |
| marks_obtained | float4 | NO |  |
| total_marks | float4 | NO |  |
| created_at | timestamp | NO | now() |

```sql
CREATE INDEX marks_institution_student_created_idx ON public.marks USING btree (institution_id, student_id, created_at);
CREATE INDEX marks_institution_test_id_idx ON public.marks USING btree (institution_id, test_id);
CREATE UNIQUE INDEX marks_pkey ON public.marks USING btree (id);
CREATE UNIQUE INDEX student_test_unique ON public.marks USING btree (test_id, student_id);
```

Constraints:

- marks_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- marks_pkey: PRIMARY KEY (id)
- marks_student_id_students_id_fk: FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
- marks_test_id_tests_id_fk: FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
- student_test_unique: UNIQUE (test_id, student_id)

## tests (0 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('tests_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| class_id | int4 | NO |  |
| section_id | int4 | YES |  |
| subject_id | int4 | NO |  |
| staff_id | int4 | YES |  |
| created_by_role | test_creator_role | NO |  |
| type | test_type | NO |  |
| title | varchar | NO |  |
| max_marks | float4 | NO |  |
| date | date | NO |  |
| end_date | date | YES |  |
| created_at | timestamp | NO | now() |
| results_published_at | timestamp | YES |  |

```sql
CREATE INDEX tests_institution_class_id_idx ON public.tests USING btree (institution_id, class_id);
CREATE INDEX tests_institution_class_role_idx ON public.tests USING btree (institution_id, class_id, created_by_role);
CREATE INDEX tests_institution_class_subject_date_idx ON public.tests USING btree (institution_id, class_id, subject_id, date);
CREATE INDEX tests_institution_date_idx ON public.tests USING btree (institution_id, date);
CREATE INDEX tests_institution_id_idx ON public.tests USING btree (institution_id);
CREATE INDEX tests_institution_section_id_idx ON public.tests USING btree (institution_id, section_id);
CREATE UNIQUE INDEX tests_pkey ON public.tests USING btree (id);
```

Constraints:

- tests_class_id_classes_id_fk: FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
- tests_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- tests_pkey: PRIMARY KEY (id)
- tests_section_id_sections_id_fk: FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
- tests_staff_id_staff_id_fk: FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL
- tests_subject_id_subjects_id_fk: FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE

## announcements (0 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('announcements_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| sender_role | user_role | NO |  |
| sender_id | int4 | NO |  |
| target_type | announcement_target | NO |  |
| target_campus_id | int4 | YES |  |
| target_class_id | int4 | YES |  |
| target_section_id | int4 | YES |  |
| target_user_role | user_role | YES |  |
| target_user_id | int4 | YES |  |
| title | varchar | NO |  |
| content | text | NO |  |
| created_at | timestamp | NO | now() |
| automation_key | varchar | YES |  |

```sql
CREATE UNIQUE INDEX announcements_automation_key_unique ON public.announcements USING btree (automation_key);
CREATE INDEX announcements_institution_created_idx ON public.announcements USING btree (institution_id, created_at);
CREATE UNIQUE INDEX announcements_pkey ON public.announcements USING btree (id);
```

Constraints:

- announcements_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- announcements_pkey: PRIMARY KEY (id)
- announcements_target_campus_id_campuses_id_fk: FOREIGN KEY (target_campus_id) REFERENCES campuses(id) ON DELETE CASCADE
- announcements_target_class_id_classes_id_fk: FOREIGN KEY (target_class_id) REFERENCES classes(id) ON DELETE CASCADE
- announcements_target_section_id_sections_id_fk: FOREIGN KEY (target_section_id) REFERENCES sections(id) ON DELETE CASCADE

## announcement_reads (0 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('announcement_reads_id_seq'::regclass) |
| announcement_id | int4 | NO |  |
| user_role | user_role | NO |  |
| user_id | int4 | NO |  |
| read_at | timestamp | NO | now() |

```sql
CREATE UNIQUE INDEX announcement_reads_pkey ON public.announcement_reads USING btree (id);
CREATE INDEX announcement_reads_user_idx ON public.announcement_reads USING btree (user_role, user_id, announcement_id);
CREATE UNIQUE INDEX user_announcement_unique ON public.announcement_reads USING btree (announcement_id, user_role, user_id);
```

Constraints:

- announcement_reads_announcement_id_announcements_id_fk: FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
- announcement_reads_pkey: PRIMARY KEY (id)
- user_announcement_unique: UNIQUE (announcement_id, user_role, user_id)

## campuses (1 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | int4 | NO | nextval('campuses_id_seq'::regclass) |
| institution_id | int4 | NO |  |
| name | varchar | NO |  |
| address | text | YES |  |
| created_at | timestamp | NO | now() |
| deleted_at | timestamp | YES |  |

```sql
CREATE INDEX campuses_institution_id_idx ON public.campuses USING btree (institution_id);
CREATE UNIQUE INDEX campuses_pkey ON public.campuses USING btree (id);
```

Constraints:

- campuses_institution_id_institutions_id_fk: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
- campuses_pkey: PRIMARY KEY (id)
