-- Candidate profiles + boolean search, clients as a CRM (client -> contacts), structured req benefits.

-- ═══ CANDIDATES ═════════════════════════════════════════════════════════════
alter table candidates
  add column first_name text,
  add column last_name text,
  add column preferred_name text,
  -- address_line and postal_code are for contact and paperwork only. They are NEVER searched or used
  -- for matching (Illinois HB 3773 flags ZIP codes as a proxy for protected classes). city + state are.
  add column address_line text,
  add column city text,
  add column state text,
  add column postal_code text,
  add column linkedin_url text,
  add column current_title text,
  add column current_employer text,
  add column years_experience int check (years_experience between 0 and 60),
  add column skills text[] not null default '{}',
  add column target_titles text[] not null default '{}',
  add column dealbreakers text[] not null default '{}',
  add column comp_floor int check (comp_floor >= 0),
  add column work_models text[] not null default '{}' check (work_models <@ array['onsite','hybrid','remote']::text[]),
  add column willing_to_relocate boolean not null default false,
  add column notice_period text check (notice_period in ('immediate','2w','3-4w','1-2m','3m+')),
  add column work_authorization text check (work_authorization in ('no_sponsorship_needed','needs_sponsorship','unsure')),
  add column referred_by text,
  add column resume_path text,
  add column resume_filename text,
  add column resume_text text,
  add column search_tsv tsvector;

-- Same cleaning on the indexed text and on the search query, so "Node.js", "CI/CD" and "C++" behave predictably
create function search_clean(t text) returns text language sql immutable as $$
  select regexp_replace(coalesce(t, ''), '[^[:alnum:]]+', ' ', 'g') $$;

create function candidates_biu() returns trigger language plpgsql as $$
begin
  if new.first_name is not null or new.last_name is not null then
    new.full_name := trim(concat_ws(' ', new.first_name, new.last_name));
  end if;
  new.search_tsv :=
    setweight(to_tsvector('english', search_clean(concat_ws(' ', new.full_name, new.preferred_name))), 'A') ||
    setweight(to_tsvector('english', search_clean(concat_ws(' ', new.headline, new.current_title, new.current_employer,
      array_to_string(new.skills, ' '), array_to_string(new.target_titles, ' '), new.city, new.state))), 'B') ||
    setweight(to_tsvector('english', search_clean(left(new.resume_text, 200000))), 'C');
  return new;
end $$;

create trigger candidates_biu before insert or update on candidates
for each row execute function candidates_biu();

-- Carry existing candidates over: split the old full name, and move preferences out of the prefs json
update candidates set
  first_name = split_part(full_name, ' ', 1),
  last_name  = nullif(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), '')
where first_name is null;

update candidates set
  comp_floor  = nullif(prefs ->> 'comp_floor', '')::int,
  work_models = case when jsonb_typeof(prefs -> 'work_models') = 'array'
                     then array(select jsonb_array_elements_text(prefs -> 'work_models')) else '{}' end,
  dealbreakers = case when jsonb_typeof(prefs -> 'dealbreakers') = 'array'
                      then array(select jsonb_array_elements_text(prefs -> 'dealbreakers')) else '{}' end
where prefs <> '{}'::jsonb;

-- New and edited candidates must be complete. NOT VALID means candidates saved before this
-- migration are left alone until someone edits them (the edit form asks for the missing fields).
alter table candidates add constraint candidate_profile_required check (
  length(trim(coalesce(first_name, ''))) > 0
  and length(trim(coalesce(last_name, ''))) > 0
  and length(trim(coalesce(city, ''))) > 0
  and coalesce(state, '') ~ '^[A-Z]{2}$'
) not valid;

alter table candidates add constraint candidate_source_valid
  check (source is null or source in ('sourced', 'referral', 'applicant')) not valid;

create index candidates_search_idx on candidates using gin (search_tsv);

-- Boolean search plus filters. The query is a tsquery string built (and sanitized) by the app.
-- security invoker: row level security still applies, so one agency can never see another's candidates.
create function search_candidates(
  q text default null, p_city text default null, p_state text default null,
  p_min int default null, p_max int default null, p_models text[] default null,
  p_source text default null, p_relocate boolean default null, p_has_resume boolean default null,
  p_limit int default 100
) returns setof candidates
language plpgsql stable security invoker set search_path = public as $$
declare tsq tsquery;
begin
  if q is not null and length(trim(q)) > 0 then
    begin
      tsq := to_tsquery('english', q);
    exception when others then
      tsq := plainto_tsquery('english', q);   -- a malformed query never becomes an error page
    end;
  end if;
  return query
    select c.* from candidates c
    where (tsq is null or c.search_tsv @@ tsq)
      and (p_city is null or lower(c.city) like lower(p_city) || '%')
      and (p_state is null or c.state = upper(p_state))
      and (p_min is null or c.comp_floor >= p_min)
      and (p_max is null or c.comp_floor <= p_max)
      and (p_models is null or c.work_models && p_models)
      and (p_source is null or c.source = p_source)
      and (p_relocate is null or c.willing_to_relocate = p_relocate)
      and (p_has_resume is null or (c.resume_path is not null) = p_has_resume)
    order by case when tsq is null then 0 else ts_rank(c.search_tsv, tsq) end desc, c.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200));
end $$;

-- A resume that has been uploaded and read, waiting for the recruiter to review the pre-filled form
create table resume_uploads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  storage_path text not null,
  filename text not null,
  size_bytes int not null,
  extracted_text text,
  parsed jsonb,
  parsed_by text check (parsed_by in ('claude', 'regex')),
  ai_audit_id uuid references ai_audit_log(id),
  candidate_id uuid references candidates(id) on delete set null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ═══ CLIENTS AS A CRM: client (company) -> contacts (people) ═══════════════
alter table clients
  add column industry text,
  add column website text,
  add column city text,
  add column state text,
  add column owner_id uuid references auth.users(id) default auth.uid();
alter table clients add constraint client_status_valid check (status in ('prospect', 'active', 'inactive')) not valid;

alter table contacts
  add column role text not null default 'hiring_manager'
    check (role in ('hiring_manager', 'hr', 'billing', 'executive', 'interviewer', 'other')),
  add column is_primary boolean not null default false,
  add column status text not null default 'active' check (status in ('active', 'inactive')),
  add column notes text,
  add constraint contacts_primary_is_active check (not is_primary or status = 'active');

-- At most one active primary contact per client
create unique index contacts_one_primary on contacts (client_id) where is_primary and status = 'active';

-- Making someone the primary contact swaps the old one out in a single step
create function set_primary_contact(p_contact uuid) returns void language plpgsql security invoker set search_path = public as $$
declare cid uuid;
begin
  select client_id into cid from contacts where id = p_contact and status = 'active';
  if cid is null then raise exception 'Only an active contact can be the primary contact'; end if;
  update contacts set is_primary = false where client_id = cid and is_primary;
  update contacts set is_primary = true where id = p_contact;
end $$;

-- A contact belongs to one client for life (reqs and history point at them)
create function contacts_no_move() returns trigger language plpgsql as $$
begin
  if new.client_id <> old.client_id then raise exception 'A contact cannot be moved to another client'; end if;
  return new;
end $$;
create trigger contacts_no_move before update on contacts for each row execute function contacts_no_move();

-- A req's hiring manager must be an active contact of THE SAME client
create function reqs_check_hm() returns trigger language plpgsql as $$
declare c record;
begin
  if new.hiring_manager_id is null then return new; end if;
  select client_id, status into c from contacts where id = new.hiring_manager_id;
  if c.client_id is distinct from new.client_id then
    raise exception 'The hiring manager must belong to the same client as the req';
  end if;
  if (tg_op = 'INSERT' or new.hiring_manager_id is distinct from old.hiring_manager_id) and c.status <> 'active' then
    raise exception 'That contact is inactive. Pick an active hiring manager';
  end if;
  return new;
end $$;
create trigger reqs_check_hm before insert or update on reqs for each row execute function reqs_check_hm();

create table client_notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null default current_agency() references agencies(id),
  client_id uuid not null references clients(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,   -- null = about the client in general
  author_id uuid references auth.users(id) default auth.uid(),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

-- Contract terms: one active MSA per client, and replacing terms is a single atomic step.
-- (Old MSAs are kept as 'superseded' so placements made under them keep their terms.)
create unique index msas_one_active on msas (client_id) where status = 'active';

create function replace_msa(
  p_client uuid, p_fee numeric, p_guarantee int, p_terms int, p_noncirc int,
  p_renewal date default null, p_signed date default null, p_portal boolean default true
) returns uuid language plpgsql security invoker set search_path = public as $$
declare new_id uuid;
begin
  update msas set status = 'superseded' where client_id = p_client and status = 'active';
  insert into msas (client_id, fee_pct, guarantee_days, payment_terms_days, noncirc_months, renewal_date, signed_on, portal_views_covered)
  values (p_client, p_fee, p_guarantee, p_terms, p_noncirc, p_renewal, p_signed, p_portal)
  returning id into new_id;
  return new_id;
end $$;

-- ═══ REQ BENEFITS: pick from a list instead of free text ══════════════════
alter table reqs
  add column benefits jsonb not null default '{}'::jsonb,
  add column benefits_other text;
-- reqs.benefits_summary (still required to publish, and archived for 5 years) is now generated by the app from these.

-- ═══ Row level security for the new tables ═════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['resume_uploads', 'client_notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "tenant_rw" on %I for all
         using (agency_id in (select my_agencies()))
         with check (agency_id in (select my_agencies()))', t);
  end loop;
end $$;
