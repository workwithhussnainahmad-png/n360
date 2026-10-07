# Exact generated SELECT statements

Bound parameters are listed separately. Source-handler probe uses one identity per role, disabled Redis and a direct read-only local database client; not a production query-count trace. Client elapsed values include Windows transport/scheduling and shared-client queueing. Use EXPLAIN server time for sampled execution.

## Q1: student/dashboard

Parameters: [101,true,1]

```sql
select "students"."is_active", "students"."academic_status", "institutions"."allow_graduated_student_access" from "students" inner join "institutions" on "students"."institution_id" = "institutions"."id" where ("students"."id" = $1 and "students"."is_active" = $2) limit $3
```

## Q2: student/dashboard

Parameters: [101,2,2,5,101,2,1,101,2,1]

```sql
select "name", "class_id", "section_id", "campus_id", "created_at", "academic_status", "expo_push_token", case when "academic_status" = 'GRADUATED' then '[]'::json else coalesce((select json_agg(row_to_json(child)) from ((select "assignments"."id", "assignments"."title", to_char("assignments"."due_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "dueAt" from "assignments" left join "submissions" on ("submissions"."assignment_id" = "assignments"."id" and "submissions"."student_id" = $1 and "submissions"."institution_id" = $2) where ("assignments"."institution_id" = $3 and "assignments"."class_id" = "students"."class_id" and ("assignments"."section_id" = "students"."section_id" or "assignments"."section_id" is null) and "submissions"."id" is null) order by "assignments"."due_at" limit $4)) child), '[]'::json) end, case when "academic_status" = 'GRADUATED' then null else (select row_to_json(child) from ((select "marks"."marks_obtained" as "marksObtained", "marks"."total_marks" as "totalMarks" from "marks" inner join "tests" on "marks"."test_id" = "tests"."id" where ("marks"."student_id" = $5 and "marks"."institution_id" = $6 and "tests"."results_published_at" is not null) order by "tests"."date" desc, "marks"."id" desc limit $7)) child) end from "students" where ("students"."id" = $8 and "students"."institution_id" = $9) limit $10
```

## Q3: student/dashboard

Parameters: [2,1]

```sql
select "course_streaming_provider", "course_streaming_credentials" from "institutions" where "institutions"."id" = $1 limit $2
```

## Q4: student/dashboard

Parameters: [11,2,4]

```sql
select "staff_assignments"."day_of_week", "staff_assignments"."start_time", "staff_assignments"."end_time", "subjects"."name", "staff"."name" from "staff_assignments" left join "subjects" on "staff_assignments"."subject_id" = "subjects"."id" left join "staff" on "staff_assignments"."staff_id" = "staff"."id" where ("staff_assignments"."section_id" = $1 and "staff_assignments"."institution_id" = $2 and "staff_assignments"."day_of_week" = $3)
```

## Q5: student/dashboard

Parameters: [2,"2026-09-28T12:01:06.643Z","ALL","CAMPUS",1,"CLASS",11,"SECTION",11,"USER","STUDENT",101,2]

```sql
select "id", "institution_id", "sender_role", "sender_id", "target_type", "target_campus_id", "target_class_id", "target_section_id", "target_user_role", "target_user_id", "automation_key", "title", "content", "created_at" from "announcements" where ("announcements"."institution_id" = $1 and "announcements"."created_at" >= $2 and ("announcements"."target_type" = $3 or ("announcements"."target_type" = $4 and "announcements"."target_campus_id" = $5) or ("announcements"."target_type" = $6 and "announcements"."target_class_id" = $7) or ("announcements"."target_type" = $8 and "announcements"."target_section_id" = $9) or ("announcements"."target_type" = $10 and "announcements"."target_user_role" = $11 and ("announcements"."target_user_id" = $12 or "announcements"."target_user_id" is null)))) order by "announcements"."created_at" desc limit $13
```

## Q6: student/timetable

Parameters: [101,2,1]

```sql
select "id", "section_id", "institution_id" from "students" where ("students"."id" = $1 and "students"."institution_id" = $2) limit $3
```

## Q7: student/timetable

Parameters: [11,2]

```sql
select "staff_assignments"."day_of_week", "staff_assignments"."start_time", "staff_assignments"."end_time", "subjects"."name", "staff"."name" from "staff_assignments" left join "subjects" on "staff_assignments"."subject_id" = "subjects"."id" left join "staff" on "staff_assignments"."staff_id" = "staff"."id" where ("staff_assignments"."section_id" = $1 and "staff_assignments"."institution_id" = $2)
```

## Q8: student/profile

Parameters: [101,2]

```sql
select "students"."id", "students"."name", "students"."father_name", "students"."phone", "students"."gender", "students"."profile_picture_url", "students"."emergency_contact", "students"."parental_whatsapp", "students"."login_roll_number", "students"."class_roll_number", "students"."academic_status", "students"."age", "classes"."name", "sections"."name", "campuses"."name" from "students" left join "classes" on "students"."class_id" = "classes"."id" left join "sections" on "students"."section_id" = "sections"."id" left join "campuses" on "students"."campus_id" = "campuses"."id" where ("students"."id" = $1 and "students"."institution_id" = $2)
```

## Q9: staff/dashboard

Parameters: [101,1]

```sql
select "is_active" from "staff" where "staff"."id" = $1 limit $2
```

## Q10: staff/dashboard

Parameters: [101,2,4,2,101,101,2,1,"2026-10-01T17:28:01.171Z",3,101,2,1]

```sql
select "name", coalesce((select json_agg(row_to_json(child)) from ((select "staff_assignments"."day_of_week" as "dayOfWeek", "staff_assignments"."start_time" as "startTime", "staff_assignments"."end_time" as "endTime", "subjects"."name" as "subjectName", "classes"."name" as "className", "sections"."name" as "sectionName" from "staff_assignments" left join "subjects" on "staff_assignments"."subject_id" = "subjects"."id" left join "sections" on "staff_assignments"."section_id" = "sections"."id" left join "classes" on "sections"."class_id" = "classes"."id" where ("staff_assignments"."staff_id" = $1 and "staff_assignments"."institution_id" = $2 and "staff_assignments"."day_of_week" = $3))) child), '[]'::json), coalesce((select json_agg(row_to_json(child)) from ((select "assignments"."id", "assignments"."title", to_char("assignments"."due_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "dueAt", "classes"."name" as "className", "sections"."name" as "sectionName", "subjects"."name" as "subjectName" from "assignments" inner join "classes" on "assignments"."class_id" = "classes"."id" left join "sections" on "assignments"."section_id" = "sections"."id" left join "subjects" on "assignments"."subject_id" = "subjects"."id" where ("assignments"."institution_id" = $4 and "assignments"."staff_id" = $5 and "assignments"."section_id" = ((select "section_id" from "staff_assignments" where ("staff_assignments"."staff_id" = $6 and "staff_assignments"."institution_id" = $7) order by "staff_assignments"."section_id" asc limit $8)) and "assignments"."due_at" > $9) order by "assignments"."due_at" limit $10)) child), '[]'::json) from "staff" where ("staff"."id" = $11 and "staff"."institution_id" = $12) limit $13
```

## Q11: staff/dashboard

Parameters: [2,1]

```sql
select "course_streaming_provider", "course_streaming_credentials" from "institutions" where "institutions"."id" = $1 limit $2
```

## Q12: staff/dashboard

Parameters: [2,101,2,"INSTITUTION","ALL","CAMPUS",101,2,"CLASS",101,2,"SECTION",101,2,"USER","STAFF",101,3]

```sql
select "id", "institution_id", "sender_role", "sender_id", "target_type", "target_campus_id", "target_class_id", "target_section_id", "target_user_role", "target_user_id", "automation_key", "title", "content", "created_at" from "announcements" where ("announcements"."institution_id" = $1 and exists (select 1 from "staff" where "staff"."id" = $2
            and "staff"."institution_id" = $3 and "announcements"."created_at" >= "staff"."created_at") and "announcements"."sender_role" = $4 and ("announcements"."target_type" = $5 or ("announcements"."target_type" = $6 and exists (select 1 from "staff"
              where "staff"."id" = $7 and "staff"."institution_id" = $8
              and "staff"."campus_id" = "announcements"."target_campus_id")) or ("announcements"."target_type" = $9 and exists (select 1 from "staff_assignments"
              inner join "sections" on "staff_assignments"."section_id" = "sections"."id"
              where "staff_assignments"."staff_id" = $10 and "staff_assignments"."institution_id" = $11
              and "sections"."class_id" = "announcements"."target_class_id")) or ("announcements"."target_type" = $12 and exists (select 1 from "staff_assignments"
              where "staff_assignments"."staff_id" = $13 and "staff_assignments"."institution_id" = $14
              and "staff_assignments"."section_id" = "announcements"."target_section_id")) or ("announcements"."target_type" = $15 and "announcements"."target_user_role" = $16 and ("announcements"."target_user_id" = $17 or "announcements"."target_user_id" is null)))) order by "announcements"."created_at" desc limit $18
```

## Q13: staff/timetable

Parameters: [101,2]

```sql
select "staff_assignments"."day_of_week", "staff_assignments"."start_time", "staff_assignments"."end_time", "subjects"."name", "classes"."name", "sections"."name" from "staff_assignments" left join "subjects" on "staff_assignments"."subject_id" = "subjects"."id" left join "sections" on "staff_assignments"."section_id" = "sections"."id" left join "classes" on "sections"."class_id" = "classes"."id" where ("staff_assignments"."staff_id" = $1 and "staff_assignments"."institution_id" = $2)
```

## Q14: staff/profile

Parameters: [101,2]

```sql
select "staff"."id", "staff"."name", "staff"."email", "staff"."phone", "staff"."profile_picture_url", "campuses"."name" from "staff" left join "campuses" on "staff"."campus_id" = "campuses"."id" where ("staff"."id" = $1 and "staff"."institution_id" = $2)
```

## Conditional staff announcement read status (not executed: notices empty)

Example parameters: ["STAFF",1,1,2,3]

```sql
select "id", "announcement_id", "user_role", "user_id", "read_at" from "announcement_reads" where ("announcement_reads"."user_role" = $1 and "announcement_reads"."user_id" = $2 and "announcement_reads"."announcement_id" in ($3, $4, $5))
```

## Legacy student token missing academic claims: src/lib/auth.ts enrichSession

Compiled, not executed. Parameters: [101,1]

```sql
select "students"."academic_status", "institutions"."allow_graduated_student_access" from "students" inner join "institutions" on "students"."institution_id" = "institutions"."id" where "students"."id" = $1 limit $2
```

## Student announcements called without studentInfo; dashboard supplies it so this query is skipped

Compiled, not executed. Parameters: [101,2,1]

```sql
select "campus_id", "class_id", "section_id", "created_at" from "students" where ("students"."id" = $1 and "students"."institution_id" = $2) limit $3
```
