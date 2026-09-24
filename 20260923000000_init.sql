create extension if not exists pgcrypto;

-- ── Tenancy ──────────────────────────────────────────────
create table agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  agency_id uuid not null references agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'recruiter' check (role in ('owner','recruiter','admin')),
  primary key (agency_id, user_id)
);

create function my_agencies() returns setof uuid
language sql stable security definer set search_path = public as $$
  select agency_id from members where user_id = auth.uid()
$$;

-- Single-agency convenience: new rows get your agency automatically.
-- When you go multi-agency, pass agency_id explicitly instead.
create function current_agency() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from members where user_id = auth.uid() order by agency_id limit 1
$$;

-- ── Clients, contacts, contracts, workflow templates ─────
create table clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  title text
);

create table msas (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  client_id uuid not null references clients(id) on delete cascade,
  fee_pct numeric(5,2) not null,
  guarantee_days int not null,
  payment_terms_days int not null default 30,
  noncirc_months int not null default 12,
  portal_views_covered boolean not null default true,
  signed_on date,
  renewal_date date,
  file_path text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table workflow_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  client_id uuid not null references clients(id) on delete cascade,
  stages jsonb not null   -- [{name, sla_days, waits_on: 'client'|'agency'|'candidate'|null}]
);

-- ── Reqs ─────────────────────────────────────────────────
create table reqs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  client_id uuid not null references clients(id),
  hiring_manager_id uuid references contacts(id),
  owner_id uuid references auth.users(id) default auth.uid(),
  title text not null,
  location text,
  work_model text check (work_model in ('onsite','hybrid','remote')),
  placement_type text not null default 'FTE' check (placement_type in ('FTE','contract','C2H')),
  pay_min int,
  pay_max int,
  bonus_note text,
  benefits_summary text,
  must_haves text[] not null default '{}',
  workflow jsonb not null default '[]',   -- cloned from the client template at creation
  status text not null default 'draft' check (status in ('draft','live','filled','closed')),
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  -- THE PAY-RANGE GATE: nothing leaves draft without a range and benefits
  constraint pay_gate check (
    status = 'draft' or (
      pay_min is not null and pay_max is not null and pay_max >= pay_min
      and length(trim(coalesce(benefits_summary, ''))) > 0
    )
  )
);

-- 5-year archive of every non-draft version (Illinois pay transparency records)
create table req_versions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  req_id uuid not null references reqs(id) on delete cascade,
  snapshot jsonb not null,
  published_at timestamptz not null default now()
);

create function snapshot_req() returns trigger language plpgsql as $$
begin
  insert into req_versions(agency_id, req_id, snapshot) values (new.agency_id, new.id, to_jsonb(new));
  return new;
end $$;

create trigger reqs_snapshot after insert or update on reqs
for each row when (new.status <> 'draft') execute function snapshot_req();

-- ── Candidates ───────────────────────────────────────────
create table candidates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  full_name text not null,
  email text,
  phone text,
  headline text,
  metro text,                       -- metro only. Never store ZIP for scoring (IL HB 3773).
  source text,
  owner_id uuid references auth.users(id) default auth.uid(),
  prefs jsonb not null default '{}',-- hard filters: comp_floor, work_models[], dealbreakers[]
  open_to_match boolean not null default false,
  open_to_match_at timestamptz,
  verification jsonb not null default '{}',
  status_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- ── Submissions (candidate × req) ────────────────────────
create table submissions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  candidate_id uuid not null references candidates(id) on delete cascade,
  req_id uuid not null references reqs(id) on delete cascade,
  stage_index int not null default 0,
  stage_name text not null,
  stage_entered_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','closed')),
  outcome text check (outcome in ('placed','not_selected','withdrew')),
  disposition text,
  disposition_sent_at timestamptz,
  source text,
  candidate_consent_at timestamptz not null,     -- "candidate agreed to be submitted"
  introduced_at timestamptz not null default now(),
  next_touch_at timestamptz,
  next_touch_note text,
  nudge_count int not null default 0,
  last_nudged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_id, req_id),
  -- REQUIRED CLOSURE: closed means placed or a disposition was sent
  constraint closure_needs_disposition check (
    status = 'active' or outcome = 'placed'
    or (disposition is not null and disposition_sent_at is not null)
  )
);

create table submission_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  submission_id uuid not null references submissions(id) on delete cascade,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create function on_submission_change() returns trigger language plpgsql as $$
begin
  if new.stage_index is distinct from old.stage_index or new.status is distinct from old.status then
    new.stage_entered_at := now();
    new.nudge_count := 0;
    insert into submission_events(agency_id, submission_id, kind, detail)
    values (new.agency_id, new.id, 'stage',
      jsonb_build_object('from', old.stage_name, 'to', new.stage_name, 'status', new.status));
  end if;
  return new;
end $$;

create trigger submissions_change before update on submissions
for each row execute function on_submission_change();

-- A req cannot close while anyone is still active on it
create function block_close() returns trigger language plpgsql as $$
begin
  if exists (select 1 from submissions where req_id = new.id and status = 'active') then
    raise exception 'Every candidate needs a disposition before this req can close';
  end if;
  return new;
end $$;

create trigger reqs_block_close before update on reqs
for each row when (new.status = 'closed' and old.status is distinct from 'closed')
execute function block_close();

-- ── Notes, feedback, links ───────────────────────────────
create table notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  candidate_id uuid not null references candidates(id) on delete cascade,
  submission_id uuid references submissions(id) on delete cascade,   -- null = General
  author_id uuid references auth.users(id) default auth.uid(),
  kind text not null default 'note' check (kind in ('note','call','email')),
  body text not null,
  ai_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create table feedback_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  contact_id uuid not null references contacts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  submission_id uuid not null references submissions(id) on delete cascade,
  contact_id uuid references contacts(id),
  decision text not null check (decision in ('interview','pass')),
  reason_code text,
  comment text,
  created_at timestamptz not null default now()
);

-- ── Placements and invoices ──────────────────────────────
create table placements (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  submission_id uuid not null unique references submissions(id),
  msa_id uuid references msas(id),
  type text not null default 'FTE' check (type in ('FTE','contract','C2H')),
  base_salary int not null,
  fee_pct numeric(5,2) not null,
  fee_amount numeric(12,2) not null,
  start_date date not null,
  guarantee_days int not null,
  guarantee_end date not null,
  payment_terms_days int not null,
  status text not null default 'active' check (status in ('active','fell_off','completed')),
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  placement_id uuid not null references placements(id) on delete cascade,
  amount numeric(12,2) not null,
  issue_date date not null,
  due_date date not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','paid'))
);

-- ── Today queue ──────────────────────────────────────────
create view today_queue with (security_invoker = true) as
with b as (
  select s.id as submission_id, s.agency_id, s.candidate_id, s.req_id,
         s.stage_index, s.stage_name, s.stage_entered_at, s.next_touch_at, s.next_touch_note,
         c.full_name as candidate_name, r.title as req_title, cl.name as client_name,
         r.workflow -> s.stage_index as stage,
         extract(epoch from now() - s.stage_entered_at) / 3600 as hrs
  from submissions s
  join candidates c on c.id = s.candidate_id
  join reqs r on r.id = s.req_id
  join clients cl on cl.id = r.client_id
  where s.status = 'active'
)
select submission_id, agency_id, candidate_id, req_id, candidate_name, req_title, client_name,
       'client_feedback'::text as kind, stage_name as detail, hrs as hours, hrs - 24 as overdue_hours
from b where stage->>'waits_on' = 'client' and hrs >= 24
union all
select submission_id, agency_id, candidate_id, req_id, candidate_name, req_title, client_name,
       'stalled', stage_name, hrs, hrs - ((stage->>'sla_days')::int * 24)
from b where coalesce(stage->>'waits_on','') <> 'client'
  and stage->>'sla_days' is not null
  and hrs > (stage->>'sla_days')::int * 24
union all
select submission_id, agency_id, candidate_id, req_id, candidate_name, req_title, client_name,
       'touch', coalesce(next_touch_note, 'Follow up'),
       extract(epoch from now() - next_touch_at) / 3600,
       extract(epoch from now() - next_touch_at) / 3600
from b where next_touch_at <= now();

-- ── Row Level Security: everything is tenant-scoped ──────
alter table agencies enable row level security;
alter table members enable row level security;
create policy "own agencies" on agencies for select using (id in (select my_agencies()));
create policy "own membership" on members for select using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'clients','contacts','msas','workflow_templates','reqs','req_versions','candidates',
    'submissions','submission_events','notes','feedback_links','feedback','placements','invoices'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "tenant_rw" on %I for all
         using (agency_id in (select my_agencies()))
         with check (agency_id in (select my_agencies()))', t);
  end loop;
end $$;