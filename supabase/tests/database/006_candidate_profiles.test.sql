-- Candidate profiles: required fields, name handling, boolean search + filters, and what is (not) searchable
begin;
select plan(36);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@example.com');
insert into agencies (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Agency A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Agency B');
insert into members (agency_id, user_id, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner');

-- ── Required fields ─────────────────────────────────────
select throws_ok($$ insert into candidates (agency_id, first_name, last_name, state) values ('a0000000-0000-0000-0000-00000000000a','A','B','IL') $$,
  '23514', null, 'city is required');
select throws_ok($$ insert into candidates (agency_id, first_name, last_name, city) values ('a0000000-0000-0000-0000-00000000000a','A','B','Chicago') $$,
  '23514', null, 'state is required (a missing state is not silently accepted)');
select throws_ok($$ insert into candidates (agency_id, first_name, last_name, city, state) values ('a0000000-0000-0000-0000-00000000000a','A','B','Chicago','Illinois') $$,
  '23514', null, 'state must be the 2-letter code');
select throws_ok($$ insert into candidates (agency_id, first_name, last_name, city, state) values ('a0000000-0000-0000-0000-00000000000a','A','B','Chicago','il') $$,
  '23514', null, 'state must be upper case');
select throws_ok($$ insert into candidates (agency_id, first_name, city, state) values ('a0000000-0000-0000-0000-00000000000a','A','Chicago','IL') $$,
  '23514', null, 'last name is required');
select throws_ok($$ insert into candidates (agency_id, first_name, last_name, city, state, source) values ('a0000000-0000-0000-0000-00000000000a','A','B','Chicago','IL','cold call') $$,
  '23514', null, 'source must be sourced, referral or applicant');
select throws_ok($$ insert into candidates (agency_id, first_name, last_name, city, state, work_models) values ('a0000000-0000-0000-0000-00000000000a','A','B','Chicago','IL','{onsite,teleport}') $$,
  '23514', null, 'work models must be onsite, hybrid or remote');
select throws_ok($$ insert into candidates (agency_id, first_name, last_name, city, state, notice_period) values ('a0000000-0000-0000-0000-00000000000a','A','B','Chicago','IL','whenever') $$,
  '23514', null, 'notice period must be one of the listed choices');

-- ── Names ───────────────────────────────────────────────
insert into candidates (id, agency_id, first_name, last_name, preferred_name, city, state, source, referred_by,
                        current_title, current_employer, years_experience, skills, target_titles, comp_floor, work_models, willing_to_relocate,
                        address_line, postal_code, resume_path, resume_text, headline)
values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','Priya','Raman','Pri','Chicago','IL','referral','Jordan Kim',
        'Senior Data Engineer','Meridian Grocers',8,'{Spark,Python,"Node.js"}','{"Staff Data Engineer"}',185000,'{hybrid,remote}',false,
        '742 Evergreen Terrace','60614','a/1.pdf','Rebuilt batch pipelines on Databricks and led a Snowflake migration. Certified in CI/CD.','Senior Data Engineer at Meridian Grocers'),
       ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','Marcus','Bell',null,'Naperville','IL','sourced',null,
        'Product Designer','Halvorsen Health',6,'{Figma,"User research"}','{}',150000,'{onsite}',true,
        null,null,null,null,'Product Designer at Halvorsen Health'),
       ('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-00000000000a','Ana','Lindqvist',null,'Madison','WI','applicant',null,
        'Data Engineer','Cheese Corp',3,'{SQL,Python}','{}',120000,'{hybrid,onsite,remote}',true,
        null,null,'a/3.pdf','Intern turned engineer. Built dashboards in Tableau. Databricks certified.','Data Engineer at Cheese Corp');
insert into candidates (agency_id, first_name, last_name, city, state, skills) values
  ('b0000000-0000-0000-0000-00000000000b','Zed','Hidden','Chicago','IL','{Spark}');

select is((select full_name from candidates where id = 'd0000000-0000-0000-0000-000000000001'), 'Priya Raman', 'full name is built from first + last');
update candidates set first_name = 'Priyanka' where id = 'd0000000-0000-0000-0000-000000000001';
select is((select full_name from candidates where id = 'd0000000-0000-0000-0000-000000000001'), 'Priyanka Raman', 'renaming a candidate updates the full name everywhere');
update candidates set first_name = 'Priya' where id = 'd0000000-0000-0000-0000-000000000001';

-- ── Search, as a signed-in user of agency A ─────────────
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

create function pg_temp.names(q text default null, p_city text default null, p_state text default null, p_min int default null, p_max int default null,
                              p_models text[] default null, p_source text default null, p_relocate boolean default null, p_has_resume boolean default null)
returns text language sql as $$
  select coalesce(string_agg(first_name, ',' order by first_name), '') from search_candidates(q, p_city, p_state, p_min, p_max, p_models, p_source, p_relocate, p_has_resume) $$;

select is(pg_temp.names(), 'Ana,Marcus,Priya', 'no query returns everyone in my agency, and nobody from another');
select is(pg_temp.names('spark'), 'Priya', 'a single keyword matches a skill');
select is(pg_temp.names($$'databricks'$$), 'Ana,Priya', 'keywords are found inside the resume text');
select is(pg_temp.names($$'databricks' & 'snowflake'$$), 'Priya', 'AND narrows');
select is(pg_temp.names($$'spark' | 'figma'$$), 'Marcus,Priya', 'OR widens');
select is(pg_temp.names($$'databricks' & !'intern'$$), 'Priya', 'NOT excludes');
select is(pg_temp.names($$'user' <-> 'research'$$), 'Marcus', 'a phrase matches only the words next to each other');
select is(pg_temp.names($$'research' <-> 'user'$$), '', 'and not in the reverse order');
select is(pg_temp.names($$!('user' <-> 'research')$$), 'Ana,Priya', 'NOT applied to a bracketed phrase excludes only people who have the whole phrase');
select is(pg_temp.names($$!'user' <-> 'research'$$), '', 'unbracketed, the same text means something else entirely, which is why the app always adds the brackets');
select is(pg_temp.names($$'engin':*$$), 'Ana,Priya', 'a prefix (engin*) matches engineer and engineering, stemming included');
select is(pg_temp.names($$'node' <-> 'js'$$), 'Priya', 'Node.js is findable as node js (punctuation is cleaned the same way on both sides)');
select is(pg_temp.names($$'ci' <-> 'cd'$$), 'Priya', 'CI/CD is findable');
select is(pg_temp.names($$'pri'$$), 'Priya', 'a preferred name is searchable');
select is(pg_temp.names($$'evergreen' | '60614' | 'terrace'$$), '', 'street address and ZIP are NOT searchable (Illinois HB 3773)');
select is(pg_temp.names('this is (( not & valid | tsquery !!'), '', 'a malformed query returns nothing instead of an error');

-- ── Filters ─────────────────────────────────────────────
select is(pg_temp.names(p_city => 'chi'), 'Priya', 'city filter matches the start of the name, any case');
select is(pg_temp.names(p_state => 'wi'), 'Ana', 'state filter');
select is(pg_temp.names(p_min => 140000, p_max => 160000), 'Marcus', 'salary range on the base floor');
select is(pg_temp.names(p_max => 130000), 'Ana', 'salary ceiling');
select is(pg_temp.names(p_models => '{remote}'), 'Ana,Priya', 'work model: any candidate open to remote');
select is(pg_temp.names(p_models => '{onsite}'), 'Ana,Marcus', 'work model: onsite');
select is(pg_temp.names(p_source => 'referral'), 'Priya', 'source filter');
select is(pg_temp.names(p_relocate => true), 'Ana,Marcus', 'willing to relocate');
select is(pg_temp.names(p_has_resume => true), 'Ana,Priya', 'has a resume on file');
select is(pg_temp.names('databricks', p_state => 'IL', p_models => '{hybrid}'), 'Priya', 'a keyword and filters combine');

reset role;
select * from finish();
rollback;
