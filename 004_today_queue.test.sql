-- The Today queue view surfaces the right items and respects tenant isolation
begin;
select plan(8);

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
insert into reqs (id, agency_id, client_id, title, pay_min, pay_max, benefits_summary, status, workflow) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
   'c0000000-0000-0000-0000-00000000000a', 'Staff Data Engineer', 170000, 200000, 'Medical', 'live',
   '[{"name":"Submitted","sla_days":null,"waits_on":null},
     {"name":"Client review","sla_days":3,"waits_on":"client"},
     {"name":"Screen","sla_days":2,"waits_on":"agency"},
     {"name":"Offer","sla_days":null,"waits_on":null}]');

insert into contacts (id, agency_id, client_id, name, email) values
  ('ca000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Dana Whitaker', 'dana@example.com');
insert into req_criteria_sets (agency_id, req_id, version, status, criteria, approved_by_contact_id, approved_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 1, 'approved',
   '[{"id":"11111111-1111-1111-1111-111111111111","name":"Spark at scale","kind":"must","weight":3,"definition":"Ran production Spark jobs"}]',
   'ca000000-0000-0000-0000-000000000001', now());

insert into candidates (id, agency_id, full_name)
select ('d0000000-0000-0000-0000-00000000000' || i)::uuid, 'a0000000-0000-0000-0000-00000000000a', 'Cand ' || i
from generate_series(1, 8) i;

-- (candidate, stage_index, stage_name, entered, next_touch_at, status)
insert into submissions (agency_id, candidate_id, req_id, stage_index, stage_name, stage_entered_at, next_touch_at, status, outcome, disposition, disposition_sent_at, candidate_consent_at)
select 'a0000000-0000-0000-0000-00000000000a', ('d0000000-0000-0000-0000-00000000000' || n)::uuid,
       'e0000000-0000-0000-0000-000000000001', idx, nm, now() - ent, touch, st,
       case when st = 'closed' then 'not_selected' end, case when st = 'closed' then 'x' end,
       case when st = 'closed' then now() end, now()
from (values
  (1, 1, 'Client review', interval '30 hours', null::timestamptz,           'active'),  -- client waiting > 24h  -> client_feedback
  (2, 1, 'Client review', interval '10 hours', null,                          'active'),  -- client waiting < 24h  -> nothing
  (3, 2, 'Screen',        interval '3 days',   null,                          'active'),  -- past 2d SLA           -> stalled
  (4, 2, 'Screen',        interval '1 day',    null,                          'active'),  -- inside SLA            -> nothing
  (5, 0, 'Submitted',     interval '0',        now() - interval '2 days',     'active'),  -- overdue touch         -> touch
  (6, 0, 'Submitted',     interval '0',        now() + interval '1 day',      'active'),  -- future touch          -> nothing
  (7, 1, 'Client review', interval '200 hours', null,                         'closed'),  -- closed                -> nothing
  (8, 0, 'Submitted',     interval '100 days', null,                          'active')   -- no SLA on stage       -> nothing
) as t(n, idx, nm, ent, touch, st);

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select is((select count(*) from today_queue), 3::bigint, 'exactly three items need attention');
select is((select count(*) from today_queue where kind = 'client_feedback'), 1::bigint, 'one client-feedback item');
select is((select count(*) from today_queue where kind = 'stalled'), 1::bigint, 'one stalled item');
select is((select count(*) from today_queue where kind = 'touch'), 1::bigint, 'one overdue touch');
select is((select candidate_name from today_queue where kind = 'client_feedback'), 'Cand 1', 'the 30h wait is the client-feedback item');
select is((select round(overdue_hours)::int from today_queue where kind = 'client_feedback'), 6, '30h waiting is 6h past the 24h nudge point');
select is((select candidate_name from today_queue where kind = 'stalled'), 'Cand 3', 'the 3-day stall is the stalled item');

set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((select count(*) from today_queue), 0::bigint, 'another agency sees none of it (view respects RLS)');

reset role;
select * from finish();
rollback;
