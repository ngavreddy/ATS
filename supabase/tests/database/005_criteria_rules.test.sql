-- Criteria approval, the submission gate, frozen versions, and automatic scorecards
begin;
select plan(24);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@example.com');
insert into agencies (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Agency A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Agency B');
insert into members (agency_id, user_id, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner');
insert into clients (id, agency_id, name) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Northwind');
insert into contacts (id, agency_id, client_id, name, email) values
  ('ca000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Dana Whitaker', 'dana@example.com');

-- req 1 has a hiring manager and scorecards on stages 2 and 3; req 2 has no hiring manager
insert into reqs (id, agency_id, client_id, hiring_manager_id, title, pay_min, pay_max, benefits_summary, status, workflow) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
   'ca000000-0000-0000-0000-000000000001', 'Staff Data Engineer', 170000, 200000, 'Medical', 'live',
   '[{"name":"Submitted"},{"name":"Client review","sla_days":3,"waits_on":"client"},
     {"name":"Interview 1","scorecard":true},{"name":"Final round","scorecard":true},{"name":"Offer"}]'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
   null, 'Platform Engineer', 160000, 185000, 'Medical', 'live',
   '[{"name":"Submitted"},{"name":"Interview 1","scorecard":true}]');
insert into candidates (id, agency_id, full_name) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Priya Raman');

-- ── The gate ────────────────────────────────────────────
select throws_ok(
  $$ insert into submissions (agency_id, candidate_id, req_id, stage_name, candidate_consent_at)
     values ('a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Submitted', now()) $$,
  'P0001', 'The hiring manager must approve the req criteria before candidates can be submitted',
  'cannot submit when the req has no criteria at all');

insert into req_criteria_sets (id, agency_id, req_id, version, status, criteria) values
  ('c5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 1, 'draft',
   '[{"id":"11111111-1111-1111-1111-111111111111","name":"Spark at scale","kind":"must","weight":3,"definition":"Ran production Spark on billions of rows"},
     {"id":"22222222-2222-2222-2222-222222222222","name":"Led a warehouse migration","kind":"must","weight":2,"definition":"Owned a Teradata to Snowflake move"}]');

select throws_ok(
  $$ insert into submissions (agency_id, candidate_id, req_id, stage_name, candidate_consent_at)
     values ('a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Submitted', now()) $$,
  'P0001', null, 'a draft set does not satisfy the gate');

-- ── Sending for approval and approving ──────────────────
select lives_ok(
  $$ update req_criteria_sets set status = 'pending_approval', sent_at = now() where id = 'c5000000-0000-0000-0000-000000000001' $$,
  'a draft can be sent for approval');

select throws_ok(
  $$ insert into submissions (agency_id, candidate_id, req_id, stage_name, candidate_consent_at)
     values ('a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Submitted', now()) $$,
  'P0001', null, 'a set still pending approval does not satisfy the gate');

select throws_ok(
  $$ update req_criteria_sets set criteria = '[]' where id = 'c5000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Criteria are with the hiring manager for approval and cannot be edited',
  'criteria cannot be edited while the hiring manager is reviewing them');

select throws_ok(
  $$ update req_criteria_sets set status = 'approved' where id = 'c5000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'approval requires the approving hiring manager and a timestamp');

select lives_ok(
  $$ update req_criteria_sets set status = 'approved', approved_by_contact_id = 'ca000000-0000-0000-0000-000000000001', approved_at = now()
     where id = 'c5000000-0000-0000-0000-000000000001' $$,
  'the hiring manager can approve');

select lives_ok(
  $$ insert into submissions (id, agency_id, candidate_id, req_id, stage_name, candidate_consent_at)
     values ('50000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Submitted', now()) $$,
  'once approved, candidates can be submitted');

-- ── Approved criteria are frozen ────────────────────────
select throws_ok(
  $$ update req_criteria_sets set criteria = '[]' where id = 'c5000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Approved criteria cannot be edited. Create a new version instead', 'approved criteria cannot be edited');
select throws_ok(
  $$ update req_criteria_sets set status = 'draft' where id = 'c5000000-0000-0000-0000-000000000001' $$,
  'P0001', null, 'approved criteria cannot be quietly reopened');

-- ── Structure rules ─────────────────────────────────────
select throws_ok(
  $$ insert into req_criteria_sets (agency_id, req_id, version, status, criteria)
     values ('a0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000002', 1, 'pending_approval', '[]') $$,
  '23514', null, 'an empty set cannot be sent for approval');
select throws_ok(
  $$ insert into req_criteria_sets (agency_id, req_id, version, criteria)
     values ('a0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000001', 1, '[]') $$,
  '23505', null, 'version numbers are unique per req');

-- ── New version replaces the old one once approved ──────
insert into req_criteria_sets (id, agency_id, req_id, version, status, criteria) values
  ('c5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 2, 'draft',
   '[{"id":"11111111-1111-1111-1111-111111111111","name":"Spark at scale","kind":"must","weight":3,"definition":"Ran production Spark on billions of rows"}]');
select is((select status from req_criteria_sets where id = 'c5000000-0000-0000-0000-000000000001'), 'approved',
  'the old version stays approved while the new one is only a draft');
update req_criteria_sets set status = 'pending_approval' where id = 'c5000000-0000-0000-0000-000000000002';
update req_criteria_sets set status = 'approved', approved_by_contact_id = 'ca000000-0000-0000-0000-000000000001', approved_at = now()
  where id = 'c5000000-0000-0000-0000-000000000002';
select is((select status from req_criteria_sets where id = 'c5000000-0000-0000-0000-000000000001'), 'superseded',
  'approving version 2 retires version 1');
select is((select count(*) from req_criteria_sets where req_id = 'e0000000-0000-0000-0000-000000000001' and status = 'approved'), 1::bigint,
  'exactly one approved version at a time');

-- ── Starting a new draft retires unfinished sets ────────
insert into req_criteria_sets (id, agency_id, req_id, version, status, criteria) values
  ('c5000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 3, 'pending_approval',
   '[{"id":"11111111-1111-1111-1111-111111111111","name":"Spark","kind":"must","weight":3,"definition":"x"}]');
select lives_ok(
  $$ update req_criteria_sets set status = 'superseded' where id = 'c5000000-0000-0000-0000-000000000003' $$,
  'a pending set can be retired when a newer draft replaces it');
select is((select status from req_criteria_sets where id = 'c5000000-0000-0000-0000-000000000002'), 'approved',
  'retiring an unfinished set never touches the approved one');

-- ── Automatic scorecards ────────────────────────────────
select is((select count(*) from scorecards), 0::bigint, 'no scorecard before an interview stage');

update submissions set stage_index = 1, stage_name = 'Client review' where id = '50000000-0000-0000-0000-000000000001';
select is((select count(*) from scorecards), 0::bigint, 'no scorecard for a stage that is not flagged');

update submissions set stage_index = 2, stage_name = 'Interview 1' where id = '50000000-0000-0000-0000-000000000001';
select is((select count(*) from scorecards where stage_name = 'Interview 1'), 1::bigint,
  'entering an interview stage opens a scorecard automatically');
select is((select criteria_set_id from scorecards where stage_name = 'Interview 1'), 'c5000000-0000-0000-0000-000000000002'::uuid,
  'the scorecard is tied to the CURRENT approved criteria and the hiring manager');

update submissions set stage_index = 1, stage_name = 'Client review' where id = '50000000-0000-0000-0000-000000000001';
update submissions set stage_index = 2, stage_name = 'Interview 1' where id = '50000000-0000-0000-0000-000000000001';
select is((select count(*) from scorecards where stage_name = 'Interview 1'), 1::bigint,
  're-entering the same stage does not create a duplicate');

select throws_ok(
  $$ update scorecards set submitted_at = now() where stage_name = 'Interview 1' $$,
  '23514', null, 'a scorecard cannot be submitted without a recommendation');

-- ── Tenant isolation ────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((select count(*) from req_criteria_sets) + (select count(*) from scorecards) + (select count(*) from submission_assessments), 0::bigint,
  'another agency sees none of the criteria, assessments or scorecards');
reset role;

select * from finish();
rollback;
