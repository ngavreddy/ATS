-- Clients as a CRM: contacts belong to one client, a req's hiring manager must be from the same client,
-- one active contract per client, notes, and structured benefits
begin;
select plan(22);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@example.com');
insert into agencies (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Agency A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Agency B');
insert into members (agency_id, user_id, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner');
insert into clients (id, agency_id, name, status) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Northwind', 'active'),
  ('c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'Halvorsen', 'active');
insert into contacts (id, agency_id, client_id, name, email, role, is_primary) values
  ('ca000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Dana Whitaker', 'dana@nw.com', 'hiring_manager', true),
  ('ca000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Rob Castillo', 'rob@nw.com', 'hiring_manager', false),
  ('ca000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b', 'Marcus Ortiz', 'marcus@hh.com', 'hiring_manager', true);

-- ── Contacts ────────────────────────────────────────────
select throws_ok($$ insert into contacts (agency_id, client_id, name, is_primary) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','Second Primary', true) $$,
  '23505', null, 'a client can have only one active primary contact');
select throws_ok($$ insert into contacts (agency_id, client_id, name, role) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','X','janitor') $$,
  '23514', null, 'contact roles are a fixed list');
select throws_ok($$ update contacts set client_id = 'c0000000-0000-0000-0000-00000000000b' where id = 'ca000000-0000-0000-0000-000000000002' $$,
  'P0001', 'A contact cannot be moved to another client', 'a contact can never move to another client');
select throws_ok($$ update contacts set status = 'inactive' where id = 'ca000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a primary contact must be made non-primary before being deactivated');
select lives_ok($$ update contacts set is_primary = false, status = 'inactive' where id = 'ca000000-0000-0000-0000-000000000001' $$,
  'a contact who left can be deactivated');
select lives_ok($$ insert into contacts (agency_id, client_id, name, is_primary) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','New Primary', true) $$,
  'once the old primary is inactive, a new primary is allowed');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select lives_ok($$ select set_primary_contact('ca000000-0000-0000-0000-000000000002') $$, 'make another contact primary in one step');
select is((select array_agg(name order by name) from contacts where client_id = 'c0000000-0000-0000-0000-00000000000a' and is_primary), array['Rob Castillo'], 'the old primary was swapped out and exactly one primary remains');
select throws_ok($$ select set_primary_contact('ca000000-0000-0000-0000-000000000001') $$, 'P0001', 'Only an active contact can be the primary contact', 'an inactive contact cannot be primary');
reset role;
update contacts set is_primary = false where id = 'ca000000-0000-0000-0000-000000000002';

-- ── Reqs and their hiring manager ───────────────────────
select lives_ok($$ insert into reqs (agency_id, client_id, hiring_manager_id, title) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','ca000000-0000-0000-0000-000000000002','Staff Data Engineer') $$,
  'a req can use a hiring manager from its own client');
select throws_ok($$ insert into reqs (agency_id, client_id, hiring_manager_id, title) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','ca000000-0000-0000-0000-000000000003','Wrong Manager') $$,
  'P0001', 'The hiring manager must belong to the same client as the req', 'a req cannot use another client''s hiring manager');
select throws_ok($$ insert into reqs (agency_id, client_id, hiring_manager_id, title) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','ca000000-0000-0000-0000-000000000001','Departed Manager') $$,
  'P0001', 'That contact is inactive. Pick an active hiring manager', 'a req cannot be given an inactive contact');
select lives_ok($$ insert into reqs (agency_id, client_id, title) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','No Manager Yet') $$,
  'a req may be created before a hiring manager is chosen');
select throws_ok($$ update reqs set hiring_manager_id = 'ca000000-0000-0000-0000-000000000003' where title = 'Staff Data Engineer' $$,
  'P0001', 'The hiring manager must belong to the same client as the req', 'the same rule applies when editing a req');
update contacts set status = 'inactive' where id = 'ca000000-0000-0000-0000-000000000002';
select lives_ok($$ update reqs set location = 'Chicago' where title = 'Staff Data Engineer' $$,
  'a manager leaving does not block edits to reqs they already own');

-- ── Contracts ───────────────────────────────────────────
insert into msas (agency_id, client_id, fee_pct, guarantee_days, payment_terms_days, noncirc_months) values
  ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a', 20, 90, 30, 12);
select throws_ok($$ insert into msas (agency_id, client_id, fee_pct, guarantee_days, payment_terms_days, noncirc_months) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a', 25, 60, 15, 12) $$,
  '23505', null, 'a client can have only one active contract');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select isnt(replace_msa('c0000000-0000-0000-0000-00000000000a', 22, 60, 15, 12, '2027-03-01', '2026-09-24'), null, 'replacing terms creates a new contract');
select is((select count(*) from msas where client_id = 'c0000000-0000-0000-0000-00000000000a' and status = 'active'), 1::bigint, 'exactly one contract is active afterwards');
select is((select fee_pct from msas where client_id = 'c0000000-0000-0000-0000-00000000000a' and status = 'active'), 22.00, 'and it has the new terms');
select is((select count(*) from msas where client_id = 'c0000000-0000-0000-0000-00000000000a' and status = 'superseded'), 1::bigint, 'the old contract is kept, so past placements keep their terms');

-- ── Notes and isolation ─────────────────────────────────
insert into client_notes (client_id, contact_id, body) values ('c0000000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-000000000003'::uuid, 'x') on conflict do nothing;
reset role;
select throws_ok($$ insert into client_notes (agency_id, client_id, body) values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','   ') $$,
  '23514', null, 'a blank note is rejected');
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((select count(*) from client_notes) + (select count(*) from resume_uploads) + (select count(*) from contacts), 0::bigint, 'another agency sees none of the notes, resumes or contacts');
reset role;

select * from finish();
rollback;
