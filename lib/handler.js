'use strict';
// All app rules live here. The database is passed in, so the same code runs
// against Supabase in production and an in-memory fake in tests.
const auth = require('./auth');

const EMOJI = ['👍', '❤️', '😂', '🎁'];
const MODES = ['one', 'several', 'group'];
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const MAX_PEOPLE = 20;
const COOKIE = 'bdx';
const APP_VERSION = '2026.11.25';
const SEEN_EVERY_MS = 5 * 60 * 1000;

function fail(http, msg) { const e = new Error(msg); e.http = http; return e; }
function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    return (x.protocol === 'http:' || x.protocol === 'https:') && x.href.length <= 2000 ? x.href : '';
  } catch (e) { return ''; }
}
function cookieHeader(value, maxAgeSec) {
  return COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAgeSec;
}

function cleanItem(b) {
  const name = str(b.name, 120);
  if (!name) throw fail(400, 'Give the item a name.');
  const links = [];
  const raw = Array.isArray(b.links) ? b.links.slice(0, 8) : [];
  raw.forEach(function (l) {
    if (!l) return;
    const given = String(l.url || '').trim();
    const u = safeUrl(given);
    if (given && !u) throw fail(400, 'One of the links does not look right. Check the address.');
    if (u) links.push({ label: str(l.label, 60), url: u });
  });
  return {
    name: name, specs: str(b.specs, 600), price: str(b.price, 60), notes: str(b.notes, 800),
    mode: MODES.indexOf(b.mode) > -1 ? b.mode : 'one', links: links
  };
}

function createHandler(db, getEnv) {
  getEnv = getEnv || function () { return process.env; };

  // Product analytics. Best effort: a logging problem must never break the app.
  // Never log PINs, comment text, or item names. Ids and counts only.
  function makeCtx() { return { logs: [], act: '', me: null }; }
  function log(ctx, type, person, details) {
    if (!db.logEvent) return;
    ctx.logs.push(Promise.resolve().then(function () {
      return db.logEvent({ type: type, person: person || null, details: details || {}, version: APP_VERSION });
    }).catch(function (e) { console.error('event log failed:', e && e.message); }));
  }
  function dev(b) {
    const d = b && typeof b.dev === 'object' && b.dev ? b.dev : {};
    return { device: d.mobile ? 'mobile' : 'desktop', installed: !!d.standalone };
  }

  async function publicPeople() {
    const rows = await db.listPeople();
    return rows.map(function (p) { return { name: p.name, hasPin: !!p.pin_hash }; });
  }

  async function snapshot(me) {
    const all = await Promise.all([db.listPeople(), db.listItems(), db.listClaims(), db.listComments(), db.listReactions()]);
    const people = all[0], items = all[1], claims = all[2], comments = all[3], reactions = all[4];
    const claimsBy = {}, commentsBy = {}, reactBy = {};
    claims.forEach(function (c) { (claimsBy[c.item_id] = claimsBy[c.item_id] || []).push(c.person); });
    reactions.forEach(function (r) {
      const m = (reactBy[r.comment_id] = reactBy[r.comment_id] || {});
      (m[r.emoji] = m[r.emoji] || []).push(r.person);
    });
    comments.forEach(function (c) {
      (commentsBy[c.item_id] = commentsBy[c.item_id] || []).push({ id: c.id, by: c.author, text: c.body, at: c.created_at, reacts: reactBy[c.id] || {} });
    });
    const out = [];
    items.forEach(function (it) {
      const base = { id: it.id, owner: it.owner, name: it.name, specs: it.specs, price: it.price, notes: it.notes,
        links: it.links || [], mode: it.mode, removed: false, claims: [], comments: [] };
      // The owner never receives claims or comments for their own items.
      if (it.owner === me) { if (!it.removed) out.push(base); return; }
      const cl = claimsBy[it.id] || [];
      if (it.removed && cl.indexOf(me) < 0) return;
      base.removed = !!it.removed;
      base.claims = cl;
      base.comments = commentsBy[it.id] || [];
      out.push(base);
    });
    return { me: me, people: people.map(function (p) { return p.name; }), items: out };
  }

  async function login(b, secret, ctx) {
    const name = str(b.name, 30), pin = String(b.pin == null ? '' : b.pin).trim();
    const p = await db.getPerson(name);
    if (!p) throw fail(404, 'Pick your name from the list.');
    if (p.locked_until && new Date(p.locked_until).getTime() > Date.now()) {
      const mins = Math.max(1, Math.ceil((new Date(p.locked_until).getTime() - Date.now()) / 60000));
      log(ctx, 'login_blocked', name, dev(b));
      throw fail(429, 'Too many wrong tries. Wait about ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' and try again.');
    }
    if (!/^\d{4}$/.test(pin)) throw fail(400, 'Enter exactly 4 digits.');
    if (!p.pin_hash) {
      await db.setPin(name, auth.hashPin(pin));
      log(ctx, 'pin_set', name, dev(b));
    } else if (!auth.checkPin(pin, p.pin_hash)) {
      const fails = (p.fails || 0) + 1;
      const locked = fails >= MAX_FAILS;
      if (locked) { await db.setFails(name, 0, new Date(Date.now() + LOCK_MS).toISOString()); }
      else { await db.setFails(name, fails, null); }
      log(ctx, 'login_fail', name, Object.assign({ fails: fails }, dev(b)));
      if (locked) log(ctx, 'lockout', name, {});
      throw fail(401, 'That PIN does not match. Try again.');
    } else if (p.fails) {
      await db.setFails(name, 0, null);
    }
    log(ctx, 'login_ok', name, Object.assign({ after_fails: p.fails || 0, first: !p.pin_hash }, dev(b)));
    if (db.touchSeen) ctx.logs.push(db.touchSeen(name).catch(function () {}));
    const token = auth.sign({ n: name, e: Date.now() + SESSION_MS }, secret);
    return { cookie: cookieHeader(token, SESSION_MS / 1000), body: await snapshot(name) };
  }

  async function addPerson(rawName, ctx) {
    const name = str(rawName, 30);
    if (!name) throw fail(400, 'Type a name first.');
    if (/[\u0000-\u001f<>]/.test(name)) throw fail(400, 'That name has characters we can\'t use.');
    const people = await db.listPeople();
    if (people.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) throw fail(409, name + ' is already on the list.');
    if (people.length >= MAX_PEOPLE) throw fail(400, 'The list is full.');
    await db.createPerson(name);
    log(ctx, 'person_added', null, { added: name });
    return publicPeople();
  }

  async function run(req, ctx) {
    if (req.method !== 'POST') throw fail(405, 'Use POST.');
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const secret = getEnv().SESSION_SECRET;
    if (!secret) throw fail(500, 'The server is missing SESSION_SECRET.');
    const act = String(b.action || '');
    ctx.act = act;

    if (act === 'people') return { body: { people: await publicPeople() } };
    if (act === 'addPerson') return { body: { people: await addPerson(b.name, ctx) } };
    if (act === 'login') return login(b, secret, ctx);
    if (act === 'logout') {
      const so = auth.verify(auth.parseCookies(req.headers && req.headers.cookie)[COOKIE], secret);
      if (so) log(ctx, 'logout', so.n, {});
      return { cookie: cookieHeader('', 0), body: { ok: true } };
    }

    const cookies = auth.parseCookies(req.headers && req.headers.cookie);
    const sess = auth.verify(cookies[COOKIE], secret);
    if (!sess) throw fail(401, 'Please sign in.');
    const me = sess.n;
    ctx.me = me;
    const meRow = await db.getPerson(me);
    if (!meRow) throw fail(401, 'Please sign in.');
    if (db.touchSeen && (!meRow.last_seen || Date.now() - new Date(meRow.last_seen).getTime() > SEEN_EVERY_MS)) {
      ctx.logs.push(db.touchSeen(me).catch(function () {}));
    }

    let item, claims;
    switch (act) {
      case 'bootstrap':
        if (b.open) log(ctx, 'app_open', me, dev(b));
        break;

      case 'claim':
        item = await db.getItem(str(b.itemId, 60));
        if (!item || item.owner === me || item.removed) throw fail(400, 'That item is not available.');
        claims = await db.listClaimsForItem(item.id);
        if (claims.indexOf(me) < 0) {
          if (item.mode === 'one' && claims.length > 0) throw fail(409, claims[0] + ' just claimed this.');
          await db.insertClaim(item.id, me);
          log(ctx, 'claim', me, { item: item.id, owner: item.owner, mode: item.mode });
        }
        break;

      case 'unclaim':
      case 'dismiss':
        item = await db.getItem(str(b.itemId, 60));
        if (!item) break;
        await db.deleteClaim(item.id, me);
        log(ctx, act, me, { item: item.id });
        break;

      case 'setMode':
        item = await db.getItem(str(b.itemId, 60));
        if (!item || item.owner === me) throw fail(400, 'You can\'t change that.');
        if (MODES.indexOf(b.mode) < 0) throw fail(400, 'Unknown mode.');
        claims = await db.listClaimsForItem(item.id);
        if (b.mode === 'one' && claims.length > 1) throw fail(409, 'More than one person has already claimed this, so it can\'t be one-person-only.');
        await db.updateItem(item.id, { mode: b.mode });
        log(ctx, 'set_mode', me, { item: item.id, mode: b.mode });
        break;

      case 'comment': {
        item = await db.getItem(str(b.itemId, 60));
        const text = str(b.text, 500);
        if (!item || item.owner === me || item.removed) throw fail(400, 'You can\'t comment there.');
        if (!text) throw fail(400, 'Write something first.');
        await db.insertComment(item.id, me, text);
        log(ctx, 'comment', me, { item: item.id, owner: item.owner, length: text.length });
        break;
      }

      case 'react': {
        const c = await db.getComment(str(b.commentId, 60));
        if (!c) throw fail(400, 'That comment is gone.');
        item = await db.getItem(c.item_id);
        if (!item || item.owner === me) throw fail(400, 'You can\'t react there.');
        if (EMOJI.indexOf(b.emoji) < 0) throw fail(400, 'Unknown reaction.');
        if (await db.hasReaction(c.id, me, b.emoji)) await db.deleteReaction(c.id, me, b.emoji);
        else await db.insertReaction(c.id, me, b.emoji);
        log(ctx, 'react', me, { item: item.id, emoji: b.emoji });
        break;
      }

      case 'saveItem': {
        const clean = cleanItem(b);
        if (b.id) {
          item = await db.getItem(str(b.id, 60));
          if (!item || item.owner !== me) throw fail(403, 'That is not your item.');
          await db.updateItem(item.id, clean);
          log(ctx, 'item_edit', me, { item: item.id });
        } else {
          const made = await db.insertItem(Object.assign({ owner: me, position: Math.floor(Date.now() / 1000) }, clean));
          log(ctx, 'item_add', me, { item: made && made.id });
        }
        break;
      }

      case 'removeItem':
        item = await db.getItem(str(b.id, 60));
        if (!item || item.owner !== me) throw fail(403, 'That is not your item.');
        claims = await db.listClaimsForItem(item.id);
        if (claims.length) await db.updateItem(item.id, { removed: true });
        else await db.deleteItem(item.id);
        log(ctx, 'item_remove', me, { item: item.id, had_claims: claims.length > 0 });
        break;

      case 'reorder': {
        // The owner's order is their priority list. Everyone else sees it as is.
        const mineIds = (await db.listItems()).filter(function (i) { return i.owner === me && !i.removed; }).map(function (i) { return i.id; });
        const seen = {}, order = [];
        (Array.isArray(b.ids) ? b.ids : []).forEach(function (x) {
          const id = str(x, 60);
          if (mineIds.indexOf(id) > -1 && !seen[id]) { seen[id] = 1; order.push(id); }
        });
        mineIds.forEach(function (id) { if (!seen[id]) order.push(id); });
        await db.setOrder(order);
        log(ctx, 'reorder', me, { count: order.length });
        break;
      }

      default:
        throw fail(400, 'Unknown action.');
    }
    return { body: await snapshot(me) };
  }

  return async function handler(req, res) {
    const ctx = makeCtx();
    try {
      const out = await run(req, ctx);
      await Promise.all(ctx.logs);
      if (out.cookie) res.setHeader('Set-Cookie', out.cookie);
      res.setHeader('Cache-Control', 'no-store');
      res.status(out.status || 200).json(out.body);
    } catch (e) {
      res.setHeader('Cache-Control', 'no-store');
      if (e && e.http === 409) log(ctx, 'conflict', ctx.me, { action: ctx.act });
      if (!(e && e.http)) { console.error(e); log(ctx, 'error', ctx.me, { action: ctx.act, message: String(e && e.message).slice(0, 200) }); }
      await Promise.all(ctx.logs);
      if (e && e.http) return res.status(e.http).json({ error: e.message });
      res.status(500).json({ error: 'Something went wrong on our side. Try again in a moment.' });
    }
  };
}

module.exports = { createHandler, safeUrl };
