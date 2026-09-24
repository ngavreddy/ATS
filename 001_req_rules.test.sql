-- Pay-range gate and 5-year req archive
begin;
select plan(9);

insert into agencies (id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Agency A');
insert into clients (id, agency_id, name) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Northwind');
insert into reqs (id, agency_id, client_id, title) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
   'c0000000-0000-0000-0000-00000000000a', 'Staff Data Engineer');

select is((select count(*) from req_versions), 0::bigint, 'a draft is not archived');

select throws_ok(
  $$ update reqs set status = 'live' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'cannot publish without a pay range or benefits');

select throws_ok(
  $$ update reqs set status = 'live', pay_min = 200000, pay_max = 170000, benefits_summary = 'Medical'
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'cannot publish when max is below min');

select throws_ok(
  $$ update reqs set status = 'live', pay_min = 170000, pay_max = 200000, benefits_summary = '   '
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'cannot publish with a blank benefits summary');

select throws_ok(
  $$ update reqs set status = 'live', pay_min = 170000, benefits_summary = 'Medical'
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'cannot publish with only half a range');

select lives_ok(
  $$ update reqs set status = 'live', pay_min = 170000, pay_max = 200000,
       benefits_summary = 'Medical, dental, 401k match'
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'publishing with a range and benefits works');

select is((select count(*) from req_versions), 1::bigint, 'publishing archives a version');

update reqs set pay_max = 210000 where id = 'e0000000-0000-0000-0000-000000000001';
select is((select count(*) from req_versions), 2::bigint, 'editing a live req archives another version');
select ok(
  exists (select 1 from req_versions where (snapshot->>'pay_max')::int = 210000),
  'an archived version records the new pay_max');

select * from finish();
rollback;
