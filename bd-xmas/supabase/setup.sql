-- Berberian-Downs Christmas 2026 gift tracker: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to run once on a fresh project.

create table people (
  name text primary key,
  pin_hash text,
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  owner text not null references people(name) on update cascade on delete cascade,
  name text not null,
  specs text not null default '',
  price text not null default '',
  notes text not null default '',
  links jsonb not null default '[]',
  mode text not null default 'one' check (mode in ('one','several','group')),
  removed boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table claims (
  item_id uuid not null references items(id) on delete cascade,
  person text not null references people(name) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, person)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  author text not null references people(name) on update cascade on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table reactions (
  comment_id uuid not null references comments(id) on delete cascade,
  person text not null references people(name) on update cascade on delete cascade,
  emoji text not null,
  primary key (comment_id, person, emoji)
);

create index items_owner_idx on items(owner);
create index claims_item_idx on claims(item_id);
create index comments_item_idx on comments(item_id);

-- Lock the tables down. Only the server (using the secret key) can read or write.
-- With row level security on and no policies, the public keys can do nothing.
alter table people enable row level security;
alter table items enable row level security;
alter table claims enable row level security;
alter table comments enable row level security;
alter table reactions enable row level security;

-- Starting data, imported from the Google Sheet.
insert into people (name, created_at) values
  ($q$Mom$q$, now() + interval '0 seconds'),
  ($q$Dad$q$, now() + interval '1 seconds'),
  ($q$Jake$q$, now() + interval '2 seconds'),
  ($q$Kat$q$, now() + interval '3 seconds'),
  ($q$Elizabeth$q$, now() + interval '4 seconds'),
  ($q$Devin$q$, now() + interval '5 seconds');

insert into items (owner, name, specs, price, notes, links, mode, position) values
  ($q$Mom$q$, $q$Long USB-C power cord$q$, $q$Longer than 6' I guess$q$, $q$$q$, $q$$q$, $q$[]$q$::jsonb, $q$one$q$, 1),
  ($q$Mom$q$, $q$External/flash drive for photos$q$, $q$$q$, $q$$q$, $q$I need to free up storage space on my phone & gmail$q$, $q$[]$q$::jsonb, $q$one$q$, 2),
  ($q$Mom$q$, $q$Small teapot with built-in strainer$q$, $q$$q$, $q$$25-30$q$, $q$I don't have a strong preference other than wanting it to be a personal size one, 24 ounces or less$q$, $q$[{"label":"Teapot 1","url":"https://looseleafteamarket.com/products/tealyra-pluto-porcelain-teapot?variant=29157377769577"},{"label":"Teapot 2","url":"https://teaforte.com/products/tea-accessories-teapots-fiore-teapot-with-infuser-stone-blue-715860"},{"label":"Teapot 3","url":"https://www.englishteastore.com/products/amsterdam-2-cup-infuser-teapot-cadet-blue?variant=49793444905238"}]$q$::jsonb, $q$one$q$, 3),
  ($q$Mom$q$, $q$Low rise ankle socks - not no shows (they don't need to be fancy)$q$, $q$Like these Bombas$q$, $q$$5-10/pair$q$, $q$They don't have to be Bombas but they are having a 25% off everything sale right now$q$, $q$[{"label":"Bombas","url":"https://bombas.com/products/womens-classic-marls-ankle-four-pack?variant=plum-moss-mix&size=m"}]$q$::jsonb, $q$one$q$, 4),
  ($q$Dad$q$, $q$AmazonBasics 3 Speed Air Circulator$q$, $q$$q$, $q$$16$q$, $q$$q$, $q$[{"label":"Amazon","url":"https://www.amazon.com/gp/product/B082MY2MX3/ref=ox_sc_saved_title_10?smid=ATVPDKIKX0DER&th=1"}]$q$::jsonb, $q$one$q$, 5),
  ($q$Jake$q$, $q$Klein Impact Screwdriver/Nut Driver$q$, $q$$q$, $q$$20$q$, $q$$q$, $q$[{"label":"Lowe's","url":"https://www.lowes.com/pd/Klein-Tools-11-in-1-Blackout-Impact-Rated-Multi-Bit-Screwdriver-Nut-Driver/5019573433"}]$q$::jsonb, $q$one$q$, 6),
  ($q$Jake$q$, $q$EA FC 27 - PS5 (disc)$q$, $q$$q$, $q$$30$q$, $q$$q$, $q$[{"label":"Amazon","url":"https://www.amazon.com/gp/product/B0H9SYK5Q7?th=1"}]$q$::jsonb, $q$one$q$, 7),
  ($q$Jake$q$, $q$RED DRAGON Pegasus Series darts$q$, $q$Switch Point, 23G$q$, $q$$45$q$, $q$$q$, $q$[{"label":"Amazon","url":"https://www.amazon.com/dp/B0GYDLF1BC/?th=1"}]$q$::jsonb, $q$one$q$, 8),
  ($q$Jake$q$, $q$Newcastle dart flights$q$, $q$Set of 3$q$, $q$$2.19$q$, $q$Kat may get these while in England$q$, $q$[]$q$::jsonb, $q$one$q$, 9),
  ($q$Jake$q$, $q$DEWALT Keyring Bit Holder Set$q$, $q$$q$, $q$$15$q$, $q$$q$, $q$[{"label":"Amazon","url":"https://www.amazon.com/DEWALT-Keyring-Holder-Durable-DWAFHLDKC5/dp/B0FSNXD7YR/"}]$q$::jsonb, $q$one$q$, 10),
  ($q$Jake$q$, $q$Madden 27 - PS5 (disc)$q$, $q$$q$, $q$$30$q$, $q$$q$, $q$[{"label":"Amazon","url":"https://www.amazon.com/gp/product/B0H2K3RD7C/?th=1"}]$q$::jsonb, $q$one$q$, 11),
  ($q$Jake$q$, $q$DEWALT Right Angle Attachment, Flex Shaft$q$, $q$$q$, $q$$24$q$, $q$$q$, $q$[{"label":"Amazon","url":"https://www.amazon.com/DEWALT-DWARAFS-Right-Angle-Shaft/dp/B013UBXU3E?th=1"}]$q$::jsonb, $q$one$q$, 12),
  ($q$Kat$q$, $q$Katabatic Alsek 22 F Quilt$q$, $q$Size: 6'
Fill: 850 FP
Color: Blue$q$, $q$$409$q$, $q$Should go down to $327-$348 on November 23rd
Not worth it if the deal isn't there$q$, $q$[{"label":"Katabatic","url":"https://katabaticgear.com/products/alsek-ultralight-quilt?variant=34495163629613"}]$q$::jsonb, $q$one$q$, 13),
  ($q$Kat$q$, $q$Burrow Top Quilt$q$, $q$Outershell color: Blue
Innershell color: Gray
Fill: 850
Temperature: 20
Size: Standard
Footbox Style: Sewn
Include draft collar and ground pad$q$, $q$$379 (pre black friday)$q$, $q$Other sleeping quilt option if the Katabatic isn't on sale/out of stock
Color doesn't matter that much just go for 10D
If not on sale, then maybe not worth it?$q$, $q$[{"label":"Hammock Gear","url":"https://hammockgear.com/product/burrow/"}]$q$::jsonb, $q$one$q$, 14),
  ($q$Kat$q$, $q$Zen bivy$q$, $q$Need to check spec$q$, $q$$q$, $q$$q$, $q$[]$q$::jsonb, $q$one$q$, 15),
  ($q$Kat$q$, $q$Beale Espresso$q$, $q$$q$, $q$$73$q$, $q$probably cheaper w REI sale$q$, $q$[{"label":"REI","url":"https://www.rei.com/product/C02802/beal-expresso-fit-lanyard?sku=C028020001"}]$q$::jsonb, $q$one$q$, 16),
  ($q$Kat$q$, $q$Shell jacket (3 options)$q$, $q$Medium$q$, $q$$180 / $146 / $185$q$, $q$On sale, diff website, also have it on backcountry$q$, $q$[{"label":"#1 Shell Jacket ($180)","url":"https://rab.equipment/us/womens-firewall-waterproof-jacket"},{"label":"#2 Cyclone Shell Jacket ($146)","url":"https://www.revolutionrace.com/women/jackets/shell-jackets/cyclone-3l-shell-jacket-women?size=3XL&color=2593"},{"label":"#3 Helly Hansen Shell ($185)","url":"https://www.hellyhansen.com/en_us/w-verglas-infinity-jkt-20-63381?color=627688"},{"label":"On sale at CampSaver","url":"https://www.campsaver.com/rab-firewall-jacket-womens.html?_iv_color=plum&_iv_womens-clothing-size=medium-us&_iv_code=1CC-W3J-RAB0797-QWI-09-PMU-12"}]$q$::jsonb, $q$one$q$, 17),
  ($q$Kat$q$, $q$Shoes$q$, $q$$q$, $q$$q$, $q$$q$, $q$[]$q$::jsonb, $q$one$q$, 18),
  ($q$Kat$q$, $q$Black Diamond Sequence Pants$q$, $q$$q$, $q$$q$, $q$$q$, $q$[]$q$::jsonb, $q$one$q$, 19),
  ($q$Kat$q$, $q$Teva slip-ons$q$, $q$$q$, $q$$q$, $q$$q$, $q$[]$q$::jsonb, $q$one$q$, 20),
  ($q$Kat$q$, $q$Black Diamond 15L backpack$q$, $q$Blue, good for multi pitch climbing$q$, $q$$159 with sale$q$, $q$Check this out!$q$, $q$[{"label":"REI","url":"https://mobile.rei.com/AkCd/91uit3zz"}]$q$::jsonb, $q$one$q$, 21),
  ($q$Elizabeth$q$, $q$Dossier Silver Rain Perfume$q$, $q$$q$, $q$$19.50 (sale)$q$, $q$$q$, $q$[{"label":"Link","url":"https://ctrk.klclick.com/l/01M7WSF253AP4PTXYQ1DGYAWXE_4"}]$q$::jsonb, $q$one$q$, 22),
  ($q$Elizabeth$q$, $q$British GP Tickets$q$, $q$7/02-7/04, obviously just like 1 big present, could also get some UK college tours in if I have offers anywhere...$q$, $q$$q$, $q$$q$, $q$[]$q$::jsonb, $q$group$q$, 23),
  ($q$Elizabeth$q$, $q$Clothes$q$, $q$Size small for basically anything$q$, $q$$q$, $q$$q$, $q$[{"label":"Sizing doc","url":"https://docs.google.com/document/d/1-FSOmZgVmgW1yEoZ-0kRM0eswd8hyBNLq9nkLt-ECao/edit?usp=drivesdk"}]$q$::jsonb, $q$several$q$, 24),
  ($q$Elizabeth$q$, $q$Tomodachi Life: Living the Dream$q$, $q$$q$, $q$$30 (sale on this link)$q$, $q$$q$, $q$[{"label":"Link","url":"https://azdiscountusa.com/product/tomodachi-life-living-the-dream-nintendo-switch-nintendo-switch-oled-model-nintendo-switch-lite-nintendo-switch-2/?attribute_software-format=Physical&variation_id=49412"}]$q$::jsonb, $q$one$q$, 25),
  ($q$Elizabeth$q$, $q$CDs$q$, $q$Literally anything$q$, $q$$q$, $q$$q$, $q$[]$q$::jsonb, $q$several$q$, 26),
  ($q$Elizabeth$q$, $q$Any Lego set$q$, $q$$q$, $q$$q$, $q$$q$, $q$[]$q$::jsonb, $q$several$q$, 27);
