-- Required closure, uniqueness, consent, and stage-change behavior
begin;
select plan(12);

insert into agencies (id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Agency A');
insert into clients (id, agency_id, name) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Northwind');
insert into reqs (id, agency_id, client_id, title, pay_min, pay_max, benefits_summary, status, workflow) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
   'c0000000-0000-0000-0000-00000000000a', 'Staff Data Engineer', 170000, 200000, 'Medical', 'live',
   '[{"name":"Submitted","sla_days":null,"waits_on":null},{"name":"Client review","sla_days":3,"waits_on":"client"}]'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a',
   'c0000000-0000-0000-0000-00000000000a', 'Platform Engineer', 160000, 185000, 'Medical', 'live', '[]');

-- Submissions require approved criteria (migration 003), so seed a hiring manager and approvals
insert into contacts (id, agency_id, client_id, name, email) values
  ('ca000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Dana Whitaker', 'dana@example.com');
insert into req_criteria_sets (agency_id, req_id, version, status, criteria, approved_by_contact_id, approved_at)
select 'a0000000-0000-0000-0000-00000000000a', id, 1, 'approved',
       '[{"id":"11111111-1111-1111-1111-111111111111","name":"Spark at scale","kind":"must","weight":3,"definition":"Ran production Spark jobs on billions of rows"}]',
       'ca000000-0000-0000-0000-000000000001', now()
from reqs;

insert into candidates (id, agency_id, full_name) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Priya Raman'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Kenji Watanabe'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Samir Haddad');

insert into submissions (id, agency_id, candidate_id, req_id, stage_name, candidate_consent_at, nudge_count, stage_entered_at) values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
   'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Submitted', now(), 2, now() - interval '30 hours'),
  ('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a',
   'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'Submitted', now(), 0, now()),
  ('50000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a',
   'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'Submitted', now(), 0, now());

-- consent and uniqueness
select throws_ok(
  $$ insert into submissions (agency_id, candidate_id, req_id, stage_name)
     values ('a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','Submitted') $$,
  '23502', null, 'a submission requires the candidate consent timestamp');
select throws_ok(
  $$ insert into submissions (agency_id, candidate_id, req_id, stage_name, candidate_consent_at)
     values ('a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Submitted', now()) $$,
  '23505', null, 'the same candidate cannot be submitted to the same req twice');

-- required closure
select throws_ok(
  $$ update submissions set status = 'closed', outcome = 'not_selected' where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'cannot close without a disposition');
select throws_ok(
  $$ update submissions set status = 'closed', outcome = 'not_selected', disposition = 'Sorry' where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'cannot close with a disposition that was never sent');
select lives_ok(
  $$ update submissions set status = 'closed', outcome = 'placed' where id = '50000000-0000-0000-0000-000000000003' $$,
  'a placed candidate may close without a rejection message');

-- a req cannot close while anyone is active
select throws_ok(
  $$ update reqs set status = 'closed' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Every candidate needs a disposition before this req can close',
  'req cannot close with active submissions');
select lives_ok(
  $$ update submissions set status = 'closed', outcome = 'not_selected', disposition = 'Sorry', disposition_sent_at = now()
     where id in ('50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002') $$,
  'closing with a sent disposition works');
select lives_ok(
  $$ update reqs set status = 'closed' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'req closes once everyone has a disposition');

-- stage trigger: use a fresh active submission on the other req
insert into submissions (id, agency_id, candidate_id, req_id, stage_name, candidate_consent_at, nudge_count, stage_entered_at) values
  ('50000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a',
   'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'Submitted', now(), 2, now() - interval '30 hours');

update submissions set next_touch_note = 'just a note' where id = '50000000-0000-0000-0000-000000000004';
select is((select nudge_count from submissions where id = '50000000-0000-0000-0000-000000000004'), 2,
  'editing a non-stage field does not reset the nudge counter');

update submissions set stage_index = 1, stage_name = 'Client review' where id = '50000000-0000-0000-0000-000000000004';
select is((select nudge_count from submissions where id = '50000000-0000-0000-0000-000000000004'), 0,
  'changing stage resets the nudge counter');
select is((select stage_entered_at from submissions where id = '50000000-0000-0000-0000-000000000004'), now(),
  'changing stage restarts the stage clock');
select is((select count(*) from submission_events where submission_id = '50000000-0000-0000-0000-000000000004'), 1::bigint,
  'a stage change writes one history event');

select * from finish();
rollback;
