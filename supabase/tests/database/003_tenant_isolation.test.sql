-- Row Level Security: one agency can never see or touch another's data
begin;
select plan(10);

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
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'A client'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'B client');
insert into candidates (agency_id, full_name) values
  ('b0000000-0000-0000-0000-00000000000b', 'B secret candidate');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select is((select count(*) from clients), 1::bigint, 'user A sees only their own clients');
select is((select name from clients), 'A client', 'and it is the right one');
select is((select count(*) from candidates), 0::bigint, 'user A cannot see agency B candidates');
select is((select count(*) from agencies), 1::bigint, 'user A sees only their own agency');
select is((select count(*) from members), 1::bigint, 'user A sees only their own membership');
select is(current_agency(), 'a0000000-0000-0000-0000-00000000000a'::uuid, 'current_agency() resolves to A');

insert into clients (name) values ('Defaulted');
select is((select agency_id from clients where name = 'Defaulted'), 'a0000000-0000-0000-0000-00000000000a'::uuid,
  'new rows default to the user''s agency');

select throws_ok(
  $$ insert into clients (agency_id, name) values ('b0000000-0000-0000-0000-00000000000b', 'Sneaky') $$,
  '42501', null, 'user A cannot insert a row into agency B');

update clients set name = 'hacked' where id = 'c0000000-0000-0000-0000-00000000000b';
delete from clients where id = 'c0000000-0000-0000-0000-00000000000b';

reset role;
select is((select name from clients where id = 'c0000000-0000-0000-0000-00000000000b'), 'B client',
  'user A could not update or delete agency B''s client');

set local request.jwt.claim.sub = '';
set local role anon;
select is((select count(*) from clients), 0::bigint, 'an unauthenticated visitor sees nothing');
reset role;

select * from finish();
rollback;
