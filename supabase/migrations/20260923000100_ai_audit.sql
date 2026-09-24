alter table reqs add column job_description text, add column sourcing_string text;

create table ai_audit_log (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  feature text not null,
  model text not null,
  input_summary text,
  output jsonb not null,
  ref_type text, ref_id uuid,
  human_decision text,            -- 'accepted' | 'edited' | 'rejected'
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table ai_audit_log enable row level security;
create policy "tenant_rw" on ai_audit_log for all
  using (agency_id in (select my_agencies())) with check (agency_id in (select my_agencies()));