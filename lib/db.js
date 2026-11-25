'use strict';
// Supabase data layer. Runs only on the server, with the secret key.
const { createClient } = require('@supabase/supabase-js');

let client = null;
function sb() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

async function ok(query) {
  const r = await query;
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

module.exports = {
  getPerson: (name) => ok(sb().from('people').select('*').eq('name', name).maybeSingle()),
  listPeople: () => ok(sb().from('people').select('name,pin_hash,created_at').order('created_at').order('name')),
  createPerson: (name) => ok(sb().from('people').insert({ name })),
  setPin: (name, pin_hash) => ok(sb().from('people').update({ pin_hash, fails: 0, locked_until: null }).eq('name', name)),
  setFails: (name, fails, locked_until) => ok(sb().from('people').update({ fails, locked_until }).eq('name', name)),

  touchSeen: (name) => ok(sb().from('people').update({ last_seen: new Date().toISOString() }).eq('name', name)),
  logEvent: (row) => ok(sb().from('events').insert(row)),
  setOrder: (ids) => Promise.all(ids.map((id, i) => ok(sb().from('items').update({ position: (i + 1) * 10 }).eq('id', id)))),

  listItems: () => ok(sb().from('items').select('*').order('position').order('created_at')),
  getItem: (id) => ok(sb().from('items').select('*').eq('id', id).maybeSingle()),
  insertItem: (row) => ok(sb().from('items').insert(row).select().single()),
  updateItem: (id, patch) => ok(sb().from('items').update(patch).eq('id', id)),
  deleteItem: (id) => ok(sb().from('items').delete().eq('id', id)),

  listClaims: () => ok(sb().from('claims').select('item_id,person').order('created_at')),
  listClaimsForItem: async (itemId) => (await ok(sb().from('claims').select('person').eq('item_id', itemId).order('created_at'))).map((r) => r.person),
  insertClaim: (item_id, person) => ok(sb().from('claims').upsert({ item_id, person }, { onConflict: 'item_id,person', ignoreDuplicates: true })),
  deleteClaim: (item_id, person) => ok(sb().from('claims').delete().eq('item_id', item_id).eq('person', person)),

  listComments: () => ok(sb().from('comments').select('id,item_id,author,body,created_at').order('created_at')),
  getComment: (id) => ok(sb().from('comments').select('id,item_id').eq('id', id).maybeSingle()),
  insertComment: (item_id, author, body) => ok(sb().from('comments').insert({ item_id, author, body })),

  listReactions: () => ok(sb().from('reactions').select('comment_id,person,emoji')),
  hasReaction: async (comment_id, person, emoji) => !!(await ok(sb().from('reactions').select('comment_id').eq('comment_id', comment_id).eq('person', person).eq('emoji', emoji).maybeSingle())),
  insertReaction: (comment_id, person, emoji) => ok(sb().from('reactions').insert({ comment_id, person, emoji })),
  deleteReaction: (comment_id, person, emoji) => ok(sb().from('reactions').delete().eq('comment_id', comment_id).eq('person', person).eq('emoji', emoji))
};
