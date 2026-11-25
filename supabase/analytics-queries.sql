-- Handy queries. Paste one at a time into Supabase > SQL Editor.
-- Times are shown in Eastern.

-- 1) Who has signed in, and when did they last show up?
select p.name,
       p.pin_hash is not null as has_pin,
       min(e.at) filter (where e.type = 'login_ok') at time zone 'America/New_York' as first_sign_in,
       p.last_seen at time zone 'America/New_York' as last_seen
from people p
left join events e on e.person = p.name
group by p.name, p.pin_hash, p.last_seen
order by p.last_seen desc nulls last;

-- 2) Who has never signed in?
select name from people where pin_hash is null order by name;

-- 3) PIN trouble: wrong tries and lockouts per person
select person,
       count(*) filter (where type = 'login_fail') as wrong_pins,
       count(*) filter (where type = 'lockout') as lockouts,
       count(*) filter (where type = 'login_ok') as successful_logins,
       max(at) filter (where type = 'login_fail') at time zone 'America/New_York' as last_wrong_pin
from events
where type in ('login_fail', 'lockout', 'login_ok')
group by person
order by wrong_pins desc;

-- 4) Gave up: wrong PIN(s) and no successful sign-in afterward
select f.person, count(*) as wrong_pins, max(f.at) at time zone 'America/New_York' as last_try
from events f
where f.type = 'login_fail'
  and not exists (select 1 from events s where s.person = f.person and s.type = 'login_ok' and s.at > f.at)
group by f.person;

-- 5) Active people per day (opens and sign-ins)
select (at at time zone 'America/New_York')::date as day, count(distinct person) as people
from events where type in ('app_open', 'login_ok')
group by 1 order by 1 desc;

-- 6) Did people come back? Days each person was active
select person, count(distinct (at at time zone 'America/New_York')::date) as active_days
from events where type in ('app_open', 'login_ok') and person is not null
group by person order by active_days desc;

-- 7) What features get used?
select type, count(*) as times, count(distinct person) as people
from events
where type in ('claim','unclaim','comment','react','item_add','item_edit','item_remove','reorder','set_mode')
group by type order by times desc;

-- 8) Phone vs computer, installed vs browser
select details->>'device' as device, details->>'installed' as installed, count(*) as opens
from events where type = 'app_open' group by 1, 2 order by opens desc;

-- 9) Problems: server errors and claim conflicts
select at at time zone 'America/New_York' as time, type, person, details
from events where type in ('error', 'conflict') order by at desc limit 50;

-- 10) How many items are still unclaimed, per list?
select i.owner, count(*) as items,
       count(*) filter (where not exists (select 1 from claims c where c.item_id = i.id)) as unclaimed
from items i where not i.removed group by i.owner order by i.owner;

-- 11) Everything one person did, newest first (change the name)
select at at time zone 'America/New_York' as time, type, details
from events where person = 'Kat' order by at desc limit 100;
