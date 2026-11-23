'use strict';
// Runs the real client and the real handler together with an in-memory database.
// Usage: node test/test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createHandler } = require('../lib/handler');

// ---------- in-memory database with the same interface as lib/db.js ----------
function fakeDb() {
  const t = { people: [], items: [], claims: [], comments: [], reactions: [] };
  let clock = 0;
  const now = () => new Date(Date.now() + (clock++)).toISOString();
  const db = {
    getPerson: async (n) => t.people.find((p) => p.name === n) || null,
    listPeople: async () => t.people.map((p) => ({ name: p.name, pin_hash: p.pin_hash, created_at: p.created_at })),
    createPerson: async (name) => { t.people.push({ name, pin_hash: null, fails: 0, locked_until: null, created_at: now() }); },
    setPin: async (n, h) => { const p = t.people.find((x) => x.name === n); p.pin_hash = h; p.fails = 0; p.locked_until = null; },
    setFails: async (n, f, l) => { const p = t.people.find((x) => x.name === n); p.fails = f; p.locked_until = l; },
    listItems: async () => t.items.slice().sort((a, b) => a.position - b.position),
    getItem: async (id) => t.items.find((i) => i.id === id) || null,
    insertItem: async (row) => { const r = Object.assign({ id: crypto.randomUUID(), removed: false }, row); t.items.push(r); return r; },
    updateItem: async (id, patch) => { Object.assign(t.items.find((i) => i.id === id), patch); },
    deleteItem: async (id) => { t.items = t.items.filter((i) => i.id !== id); t.claims = t.claims.filter((c) => c.item_id !== id); },
    listClaims: async () => t.claims.slice(),
    listClaimsForItem: async (id) => t.claims.filter((c) => c.item_id === id).map((c) => c.person),
    insertClaim: async (item_id, person) => { if (!t.claims.some((c) => c.item_id === item_id && c.person === person)) t.claims.push({ item_id, person }); },
    deleteClaim: async (item_id, person) => { t.claims = t.claims.filter((c) => !(c.item_id === item_id && c.person === person)); },
    listComments: async () => t.comments.slice(),
    getComment: async (id) => t.comments.find((c) => c.id === id) || null,
    insertComment: async (item_id, author, body) => { t.comments.push({ id: crypto.randomUUID(), item_id, author, body, created_at: now() }); },
    listReactions: async () => t.reactions.slice(),
    hasReaction: async (c, p, e) => t.reactions.some((r) => r.comment_id === c && r.person === p && r.emoji === e),
    insertReaction: async (c, p, e) => { t.reactions.push({ comment_id: c, person: p, emoji: e }); },
    deleteReaction: async (c, p, e) => { t.reactions = t.reactions.filter((r) => !(r.comment_id === c && r.person === p && r.emoji === e)); }
  };
  ['Mom', 'Jake', 'Kat', 'Devin'].forEach((n) => t.people.push({ name: n, pin_hash: null, fails: 0, locked_until: null, created_at: now() }));
  let pos = 0;
  const add = (owner, name, mode) => t.items.push({ id: crypto.randomUUID(), owner, name, specs: '', price: '', notes: '', links: [], mode: mode || 'one', removed: false, position: ++pos });
  add('Kat', 'Quilt'); add('Kat', 'Espresso'); add('Kat', 'Backpack');
  add('Jake', 'Darts'); add('Mom', 'CDs', 'several');
  return { db, t };
}

const { db, t } = fakeDb();
const handler = createHandler(db, () => ({ SESSION_SECRET: 'test-secret-value' }));

// ---------- browser simulator ----------
const clientSrc = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8').match(/<script>\n([\s\S]*?)<\/script>/)[1];

function makeBrowser() {
  let jar = '';
  const els = {};
  const appEl = { innerHTML: '', style: {}, addEventListener() {}, setAttribute() {} };
  async function rawFetch(url, opts) {
    const req = { method: opts.method, body: JSON.parse(opts.body), headers: { cookie: jar } };
    let status = 200, payload = null;
    const res = {
      setHeader(k, v) { if (k === 'Set-Cookie') { const m = /^bdx=([^;]*)/.exec(v); jar = m && m[1] ? 'bdx=' + m[1] : ''; } },
      status(s) { status = s; return res; },
      json(o) { payload = o; return res; }
    };
    await handler(req, res);
    return { ok: status < 400, status, json: async () => payload };
  }
  const sandbox = {
    document: {
      getElementById: (id) => (id === 'app' ? appEl : (id in els ? { value: els[id] } : null)),
      addEventListener() {}, activeElement: null, visibilityState: 'visible'
    },
    window: { scrollTo() {} }, fetch: rawFetch, console, setInterval: () => 0, URL, JSON, Promise, Date, Object, String, Array, Math, parseInt, Error
  };
  vm.createContext(sandbox);
  vm.runInContext(clientSrc, sandbox);
  const gt = sandbox.window.__gt;
  return { gt, els, appEl, raw: (body) => rawFetch('/api', { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() })), ready: () => new Promise((r) => setTimeout(r, 30)) };
}

const fails = [];
function check(cond, msg) { if (!cond) fails.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const jake = makeBrowser(), kat = makeBrowser(), mom = makeBrowser(), devin = makeBrowser();
  await sleep(50);
  check(jake.gt.ui.view === 'signin' && jake.gt.state().people.length === 4, 'sign-in screen lists the people');
  check(!jake.gt.state().people[0].pin_hash, 'client never receives pin hashes');

  async function login(b, name, pin) { b.els.pin = pin; await b.gt.act('pickName', name); await b.gt.act('signin'); }
  await login(jake, 'Jake', '1111'); await login(kat, 'Kat', '2222'); await login(mom, 'Mom', '3333'); await login(devin, 'Devin', '4444');
  check(jake.gt.state().me === 'Jake' && kat.gt.state().me === 'Kat', 'first login sets PIN and signs in');
  check(t.people.find((p) => p.name === 'Jake').pin_hash.startsWith('s1$'), 'PIN is stored hashed');

  // wrong pin, lockout
  const bad = makeBrowser(); await sleep(30);
  for (let i = 0; i < 5; i++) { bad.els.pin = '9999'; await bad.gt.act('pickName', 'Jake'); await bad.gt.act('signin'); }
  check(/Too many|does not match/.test(bad.gt.ui.err), 'wrong PIN rejected');
  bad.els.pin = '1111'; await bad.gt.act('signin');
  check(bad.gt.state().me === null && /Wait about/.test(bad.gt.ui.err), 'account locks after 5 wrong PINs');
  t.people.find((p) => p.name === 'Jake').locked_until = null; // simulate waiting it out

  // claim flow
  const quilt = t.items.find((i) => i.name === 'Quilt'), espresso = t.items.find((i) => i.name === 'Espresso'), cds = t.items.find((i) => i.name === 'CDs');
  await jake.gt.act('person', 'Kat'); await jake.gt.act('claim', quilt.id);
  check(t.claims.some((c) => c.item_id === quilt.id && c.person === 'Jake'), 'Jake claims the quilt');
  await jake.gt.act('open', quilt.id); jake.els.cmt = 'Getting this today'; await jake.gt.act('post');
  const cmt = t.comments[0]; await jake.gt.act('react', cmt.id + '|🎁');
  check(t.reactions.length === 1, 'emoji reaction saved');

  // second claimer on a one-person item is refused
  await mom.gt.act('person', 'Kat'); await mom.gt.act('claim', quilt.id);
  check(!t.claims.some((c) => c.person === 'Mom' && c.item_id === quilt.id) && /Jake just claimed/.test(mom.gt.ui.err), 'one-person item blocks a second claimer');
  check(/Jake's getting this/.test(mom.appEl.innerHTML.replace(/&#39;/g, "'")), 'Mom sees Jake has it');

  // the owner sees nothing
  await kat.gt.act('tab', 'mylist');
  const katView = kat.gt.state().items.filter((i) => i.owner === 'Kat');
  check(katView.length === 3 && katView.every((i) => i.claims.length === 0 && i.comments.length === 0), 'Kat receives no claims or comments on her items');
  check(!/Getting this today|Jake/.test(kat.appEl.innerHTML.replace(/Signed in as Kat/g, '')) || !/Getting this today/.test(kat.appEl.innerHTML), 'Kat\'s My list page has no comment text');
  check(!kat.appEl.innerHTML.includes('Getting this today') && !kat.appEl.innerHTML.includes("Jake's getting"), 'no leak in Kat\'s page');
  await kat.gt.act('open', quilt.id);
  check(kat.gt.ui.view === 'edit', 'owner tapping her own item opens the edit form');
  const rawKat = (await kat.raw({ action: 'bootstrap' })).body;
  check(JSON.stringify(rawKat).indexOf('Getting this today') === -1, 'API response to Kat has no comment text anywhere');

  // owner-restricted actions refused at the server
  check((await kat.raw({ action: 'claim', itemId: quilt.id })).status === 400, 'owner cannot claim own item');
  check((await kat.raw({ action: 'comment', itemId: quilt.id, text: 'hi' })).status === 400, 'owner cannot comment on own item');
  check((await kat.raw({ action: 'react', commentId: cmt.id, emoji: '👍' })).status === 400, 'owner cannot react on own item');
  check((await kat.raw({ action: 'setMode', itemId: quilt.id, mode: 'several' })).status === 400, 'owner cannot change mode via claim path');
  check((await jake.raw({ action: 'saveItem', id: quilt.id, name: 'Hacked' })).status === 403, 'cannot edit someone else\'s item');
  check((await jake.raw({ action: 'removeItem', id: quilt.id })).status === 403, 'cannot remove someone else\'s item');

  // unauthenticated and tampered sessions
  const anon = makeBrowser(); await sleep(30);
  check((await anon.raw({ action: 'bootstrap' })).status === 401, 'bootstrap needs a session');
  check((await anon.raw({ action: 'claim', itemId: quilt.id })).status === 401, 'claim needs a session');
  const forged = createHandler(db, () => ({ SESSION_SECRET: 'other-secret' }));
  let st = 0; await forged({ method: 'POST', body: { action: 'bootstrap' }, headers: { cookie: 'bdx=abc.def' } }, { setHeader() {}, status(s) { st = s; return this; }, json() {} });
  check(st === 401, 'forged cookie rejected');

  // several-mode item
  await jake.gt.act('person', 'Mom'); await jake.gt.act('claim', cds.id); await devin.gt.act('person', 'Mom'); await devin.gt.act('claim', cds.id);
  check(t.claims.filter((c) => c.item_id === cds.id).length === 2, 'several-mode item allows two claimers');
  await jake.gt.act('open', cds.id); await jake.gt.act('mode', 'one');
  check(cds.mode === 'several' && /More than one/.test(jake.gt.ui.err), 'cannot switch to one-person with 2 claimers');

  // add / edit / bad link / remove
  await jake.gt.act('tab', 'mylist'); await jake.gt.act('new');
  jake.els['f-name'] = '<b>Hat</b>'; jake.els['l-label-0'] = 'x'; jake.els['l-url-0'] = 'javascript:alert(1)';
  await jake.gt.act('saveItem'); check(jake.gt.ui.view === 'edit' && /link/.test(jake.gt.ui.err), 'bad link rejected');
  jake.els['l-url-0'] = 'example.com/hat'; await jake.gt.act('saveItem');
  const hat = t.items.find((i) => i.owner === 'Jake' && i.name === '<b>Hat</b>');
  check(hat && hat.links[0].url === 'https://example.com/hat', 'item saved with normalized link');
  check(!jake.appEl.innerHTML.includes('<b>Hat</b>'), 'item name is escaped in HTML');

  // removal: claimer is told, bystander is not
  await kat.gt.act('edit', espresso.id); await devin.gt.act('person', 'Kat'); await devin.gt.act('claim', espresso.id);
  await kat.gt.act('edit', espresso.id); await kat.gt.act('remove'); await kat.gt.act('remove');
  check(espresso.removed === true, 'removing a claimed item soft-deletes it');
  await devin.gt.refresh(); await devin.gt.act('tab', 'lists'); await devin.gt.act('person', 'Kat');
  check(devin.appEl.innerHTML.includes('Removed by Kat'), 'claimer sees the removal');
  await mom.gt.refresh(); await mom.gt.act('tab', 'lists'); await mom.gt.act('person', 'Kat');
  check(!mom.appEl.innerHTML.includes('Espresso'), 'bystander does not see removed item');
  check(!kat.gt.state().items.some((i) => i.id === espresso.id), 'owner no longer sees removed item');
  const backpack = t.items.find((i) => i.name === 'Backpack'); await kat.gt.act('edit', backpack.id); await kat.gt.act('remove'); await kat.gt.act('remove');
  check(!t.items.some((i) => i.id === backpack.id), 'unclaimed item is deleted outright');

  // add a person from the sign-in screen
  const newbie = makeBrowser(); await sleep(30); newbie.els.newName = 'Haley'; await newbie.gt.act('toggleAdd'); await newbie.gt.act('addPerson');
  check(t.people.some((p) => p.name === 'Haley') && newbie.gt.ui.selName === 'Haley', 'new person can be added');
  newbie.els.newName = 'haley'; await newbie.gt.act('addPerson'); check(/already/.test(newbie.gt.ui.err), 'duplicate names refused');

  // sign out
  await jake.gt.act('switch'); check(jake.gt.state().me === null && jake.gt.ui.view === 'signin', 'sign out returns to sign-in');
  check((await jake.raw({ action: 'bootstrap' })).status === 401, 'session cookie cleared on sign out');

  console.log(fails.length ? 'FAILURES:\n - ' + fails.join('\n - ') : 'ALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
