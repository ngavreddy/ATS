-- Criteria sets: the single source of truth for what "good" means on a req.
-- They drive the recruiter's assessment at submission and the hiring manager's scorecards.

alter table reqs add column brief text;   -- intake transcript or notes: input to criteria generation
alter table ai_audit_log add column decided_by_contact_id uuid references contacts(id);

create table req_criteria_sets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  req_id uuid not null references reqs(id) on delete cascade,
  version int not null,
  status text not null default 'draft'
    check (status in ('draft','pending_approval','changes_requested','approved','superseded')),
  -- [{ id, name, kind: 'must'|'nice', weight: 1|2|3, definition }]
  criteria jsonb not null default '[]',
  source text not null default 'recruiter' check (source in ('ai','recruiter')),
  ai_audit_id uuid references ai_audit_log(id),
  hm_comment text,
  sent_at timestamptz,
  approved_by_contact_id uuid references contacts(id),
  approved_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (req_id, version),
  -- Only a hiring manager approves, and approval is timestamped
  constraint approved_by_hm check (
    status <> 'approved' or (approved_by_contact_id is not null and approved_at is not null)
  ),
  -- Nothing goes to the hiring manager, or gets approved, without real content
  constraint has_criteria check (
    status in ('draft','changes_requested','superseded')
    or jsonb_array_length(criteria) between 1 and 10
  )
);

-- Approved criteria are frozen. Editing means a new version and a new approval.
create function guard_criteria_set() returns trigger language plpgsql as $$
begin
  if old.status in ('approved', 'superseded') then
    if new.criteria is distinct from old.criteria or new.version <> old.version or new.req_id <> old.req_id then
      raise exception 'Approved criteria cannot be edited. Create a new version instead';
    end if;
    if old.status = 'approved' and new.status not in ('approved', 'superseded') then
      raise exception 'Approved criteria can only be replaced by a newer approved version';
    end if;
    if old.status = 'superseded' and new.status <> 'superseded' then
      raise exception 'Superseded criteria cannot be reopened';
    end if;
  elsif old.status = 'pending_approval' and new.criteria is distinct from old.criteria then
    raise exception 'Criteria are with the hiring manager for approval and cannot be edited';
  end if;
  return new;
end $$;

create trigger criteria_guard before update on req_criteria_sets
for each row execute function guard_criteria_set();

-- Approving a new version retires the previous one
create function supersede_older_criteria() returns trigger language plpgsql as $$
begin
  update req_criteria_sets set status = 'superseded'
   where req_id = new.req_id and id <> new.id and status = 'approved';
  return new;
end $$;

create trigger criteria_supersede after insert or update of status on req_criteria_sets
for each row when (new.status = 'approved') execute function supersede_older_criteria();

-- THE GATE: no candidate can be submitted to a req until its hiring manager approved the criteria
create function require_approved_criteria() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from req_criteria_sets where req_id = new.req_id and status = 'approved') then
    raise exception 'The hiring manager must approve the req criteria before candidates can be submitted';
  end if;
  return new;
end $$;

create trigger submissions_need_criteria before insert on submissions
for each row execute function require_approved_criteria();

-- The recruiter's assessment of a candidate against each criterion, at submission
create table submission_assessments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  submission_id uuid not null unique references submissions(id) on delete cascade,
  criteria_set_id uuid not null references req_criteria_sets(id),
  -- { criterionId: { status: 'met'|'partial'|'not_met'|'unknown', evidence: text } }
  ratings jsonb not null,
  assessed_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- The hiring manager's scorecard for an interview stage
create table scorecards (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  submission_id uuid not null references submissions(id) on delete cascade,
  criteria_set_id uuid not null references req_criteria_sets(id),
  contact_id uuid not null references contacts(id),
  stage_name text not null,
  -- { criterionId: { level: 0|1|2|3, note?: text } }   0 No evidence, 1 Some, 2 Strong, 3 Exceptional
  ratings jsonb not null default '{}',
  recommendation text check (recommendation in ('advance','another_round','pass')),
  comment text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (submission_id, contact_id, stage_name),
  constraint submitted_needs_recommendation check (submitted_at is null or recommendation is not null)
);

-- AUTOMATIC SCORECARDS: when a submission enters a stage flagged "scorecard" in the req's workflow,
-- a blank scorecard is opened for the hiring manager, tied to the approved criteria.
create function open_scorecard() returns trigger language plpgsql as $$
declare hm uuid; wants boolean; sid uuid;
begin
  if new.stage_index is not distinct from old.stage_index then return new; end if;
  select r.hiring_manager_id, coalesce((r.workflow -> new.stage_index ->> 'scorecard')::boolean, false)
    into hm, wants from reqs r where r.id = new.req_id;
  if not wants or hm is null then return new; end if;
  select id into sid from req_criteria_sets where req_id = new.req_id and status = 'approved' limit 1;
  if sid is null then return new; end if;
  insert into scorecards (agency_id, submission_id, criteria_set_id, contact_id, stage_name)
  values (new.agency_id, new.id, sid, hm, new.stage_name)
  on conflict (submission_id, contact_id, stage_name) do nothing;
  return new;
end $$;

create trigger submissions_open_scorecard after update on submissions
for each row execute function open_scorecard();

do $$
declare t text;
begin
  foreach t in array array['req_criteria_sets','submission_assessments','scorecards'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "tenant_rw" on %I for all
         using (agency_id in (select my_agencies()))
         with check (agency_id in (select my_agencies()))', t);
  end loop;
end $$;
