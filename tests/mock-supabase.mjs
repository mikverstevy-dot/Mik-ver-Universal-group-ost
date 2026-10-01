/* Mock Supabase : reproduit le comportement PostgREST + les triggers du schema.sql
   (règles photos, réactions, scores, poubelle storage) pour tester app.js sans projet réel. */

const DB = {
  profiles: [], contests: [], entries: [], photos: [], reactions: [],
  reaction_weights: [
    { key: 'coeur', emoji: '❤️', label: 'Cœur', points: 5 },
    { key: 'rire', emoji: '😂', label: 'Rire', points: 4 },
    { key: 'surprise', emoji: '😮', label: 'Surprise', points: 3 },
    { key: 'pitie', emoji: '🥺', label: 'Pitié', points: 2 },
    { key: 'peur', emoji: '😱', label: 'Peur', points: 2 },
    { key: 'tristesse', emoji: '😢', label: 'Tristesse', points: 1 }
  ],
  results: [], admin_log: [], storage_trash: [], payments: []
};
let seq = 1; const nid = () => seq++;
const store = new Map();
let CURRENT = null;
const PENDING = new Set();

const now = () => new Date().toISOString();

function recompute(photoId) {
  const p = DB.photos.find(x => x.id === photoId);
  if (!p) return;
  p.score = DB.reactions.filter(r => r.photo_id === photoId)
    .reduce((s, r) => s + (DB.reaction_weights.find(w => w.key === r.reaction_key)?.points || 0), 0);
  p.score_updated_at = now();
}
function contestOfPhoto(pid) {
  const p = DB.photos.find(x => x.id === pid);
  return p ? DB.contests.find(c => c.id === p.contest_id) : null;
}

/* vue v_leaderboard : meilleure photo de chaque personne + rang (comme la vue SQL) */
function leaderboardRows() {
  const groups = {};
  for (const p of DB.photos) {
    const k = p.contest_id + '|' + p.owner_id;
    (groups[k] = groups[k] || []).push(p);
  }
  const rows = Object.values(groups).map(ps => {
    const contest_id = ps[0].contest_id, owner_id = ps[0].owner_id;
    const best = ps.slice().sort((a, b) => b.score - a.score ||
      new Date(a.score_updated_at) - new Date(b.score_updated_at))[0];
    return {
      contest_id, owner_id,
      display_name: (DB.profiles.find(x => x.id === owner_id) || {}).display_name,
      score: Math.max(...ps.map(p => p.score)),
      best_photo_id: best.id,
      _ts: Math.min(...ps.map(p => new Date(p.score_updated_at).getTime()))
    };
  });
  for (const c of new Set(rows.map(r => r.contest_id))) {
    rows.filter(r => r.contest_id === c).sort((a, b) => b.score - a.score || a._ts - b._ts)
      .forEach((r, i) => { r.rang = i + 1; });
  }
  return rows;
}

class Builder {
  constructor(table, rows, opts = {}) { this.table = table; this.rows = rows; this.opts = opts; }
  eq(col, val) { this.rows = this.rows.filter(r => r[col] === val); return this; }
  in(col, arr) { this.rows = this.rows.filter(r => arr.includes(r[col])); return this; }
  order(col, o = {}) {
    const dir = o.ascending === false ? -1 : 1;
    this.rows = this.rows.slice().sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * dir);
    return this;
  }
  limit(n) { this.rows = this.rows.slice(0, n); return this; }
  single() { this.opts.single = true; return this; }
  then(resolve, reject) {
    if (this.opts.single) {
      return resolve({ data: this.rows[0] || null, error: this.rows[0] ? null : { message: 'aucune ligne' } });
    }
    return resolve({ data: this.rows, error: null });
  }
}

function applyInsert(table, obj) {
  const row = { ...obj };
  if (table === 'contests') {
    row.id = nid(); row.status = row.status || 'ouvert';
    row.starts_at = row.starts_at || now(); row.created_at = now();
    if (row.winner_pct + row.organizer_pct !== 100) return { error: { message: 'check winner+organizer=100' } };
    if (new Date(row.ends_at) <= new Date(row.starts_at)) return { error: { message: 'check ends>starts' } };
    DB.contests.push(row); return { data: row };
  }
  if (table === 'photos') {
    const c = DB.contests.find(x => x.id === row.contest_id);
    if (!c || c.status !== 'ouvert' || new Date() > new Date(c.ends_at))
      return { error: { message: 'Concours clos : publication impossible' } };
    const n = DB.photos.filter(p => p.contest_id === row.contest_id && p.owner_id === row.owner_id).length;
    if (n >= 5) return { error: { message: 'Maximum 5 photos par personne et par concours' } };
    row.id = nid(); row.score = 0; row.score_updated_at = now(); row.created_at = now();
    DB.photos.push(row); return { data: row };
  }
  if (table === 'reactions') {
    const p = DB.photos.find(x => x.id === row.photo_id);
    if (!p) return { error: { message: 'Photo introuvable' } };
    if (p.owner_id === row.user_id) return { error: { message: 'Interdit de réagir à sa propre photo' } };
    const c = DB.contests.find(x => x.id === p.contest_id);
    if (!c || c.status !== 'ouvert' || new Date() > new Date(c.ends_at))
      return { error: { message: 'Concours clos : réaction impossible' } };
    if (DB.reactions.some(r => r.photo_id === row.photo_id && r.user_id === row.user_id && r.reaction_key === row.reaction_key))
      return { error: { message: 'duplicate key value violates unique constraint' } };
    row.id = nid(); row.created_at = now();
    DB.reactions.push(row); recompute(row.photo_id);
    return { data: row };
  }
  if (table === 'entries') {
    if (DB.entries.some(e => e.contest_id === row.contest_id && e.user_id === row.user_id))
      return { error: { message: 'duplicate key value violates unique constraint' } };
    row.id = nid(); row.created_at = now();
    DB.entries.push(row); return { data: row };
  }
  row.id = row.id || nid(); row.created_at = row.created_at || now();
  DB[table].push(row); return { data: row };
}

function applyDelete(table, filters) {
  let rows = DB[table];
  for (const [col, val] of Object.entries(filters)) rows = rows.filter(r => r[col] === val);
  if (table === 'photos') {
    for (const p of rows) {
      const c = DB.contests.find(x => x.id === p.contest_id);
      if (c && c.status === 'ouvert' && new Date() > new Date(new Date(c.ends_at).getTime() - 3 * 3600000))
        return { error: { message: 'Suppression bloquée pendant les 3 dernières heures du concours' } };
    }
    for (const p of rows) {
      DB.storage_trash.push({ id: nid(), storage_path: p.storage_path, queued_at: now() });
      DB.reactions = DB.reactions.filter(r => r.photo_id !== p.id); // cascade
    }
  }
  DB[table] = DB[table].filter(r => !rows.includes(r));
  return { data: rows, error: null };
}

class TableAPI {
  constructor(table) { this.table = table; }
  select() {
    if (this.table === 'v_leaderboard') return new Builder('v_leaderboard', leaderboardRows());
    return new Builder(this.table, DB[this.table].slice());
  }
  insert(obj) { return applyInsert(this.table, obj); }
  update(patch) {
    this.patch = patch;
    return {
      eq: (col, val) => {
        const rows = DB[this.table].filter(r => r[col] === val);
        rows.forEach(r => Object.assign(r, patch));
        return { data: rows, error: null };
      }
    };
  }
  delete() {
    return { eq: (col, val) => applyDelete(this.table, { [col]: val }) };
  }
}

export function createClient() {
  return {
    from: t => new TableAPI(t),
    auth: {
      async getSession() { return { session: CURRENT ? { user: CURRENT } : null }; },
      async signInWithOtp(opt) {
        const id = opt.email || opt.phone;
        PENDING.add(id); return { data: {}, error: null };
      },
      async verifyOtp(opt) {
        const id = opt.email || opt.phone;
        if (!PENDING.has(id)) return { error: { message: 'Token has expired or is invalid' } };
        PENDING.delete(id);
        let u = DB.profiles.find(p => p.phone === id || p.email === id);
        if (!u) {
          u = { id: 'u' + nid(), phone: opt.phone || null, email: opt.email || null,
                display_name: 'Membre ' + id.slice(0, 4), is_admin: false, can_win: true };
          DB.profiles.push(u); // = trigger handle_new_user
        }
        CURRENT = { id: u.id, email: u.email, phone: u.phone };
        return { user: CURRENT, error: null };
      },
      async signOut() { CURRENT = null; return { error: null }; }
    },
    storage: {
      from: bucket => ({
        async upload(path, file) {
          if (store.has(path)) return { error: { message: 'duplicate' } };
          store.set(path, file); return { data: { path }, error: null };
        },
        async remove(paths) {
          paths.forEach(p => store.delete(p)); return { data: paths, error: null };
        }
      })
    }
  };
}

/* outils de test exposés au harness */
export const __mock = {
  DB, store,
  setAdmin: uid => { const p = DB.profiles.find(x => x.id === uid); if (p) { p.is_admin = true; p.can_win = false; } },
  currentUser: () => CURRENT,
  switchTo: uid => { CURRENT = DB.profiles.find(x => x.id === uid) ? { id: uid } : null; },
  contestOfPhoto
};
