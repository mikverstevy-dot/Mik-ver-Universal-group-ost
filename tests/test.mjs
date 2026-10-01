/* Banc de test d'intégration : exécute le VRAI app.js du dépôt contre un mock Supabase. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/[/\\]$/, '');
const html = readFileSync(REPO + '/index.html', 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.confirm = () => true;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('/api/config')) return { json: async () => ({ url: 'http://mock.supabase', anon: 'anon-key' }) };
  return { ok: true, json: async () => ({ ok: true }), text: async () => 'ok' };
};

/* transformation : l'import esm.sh -> mock local + exposition des fonctions internes */
let src = readFileSync(REPO + '/app.js', 'utf8')
  .replace('https://esm.sh/@supabase/supabase-js@2', './mock-supabase.mjs');
src += `
;globalThis.__T = {
  boot, authStep, setAuthMode, joinFree, launch, setGain, react, delPhoto, uploadPhoto,
  renderAccueil, renderConcours, renderPhoto, renderResultats, renderRegles, renderAdmin,
  route, nav, loadProfile,
  state: () => ({ ME, PROFILE, CONTEST, WEIGHTS }),
  setME: (u) => { ME = u; }
};`;
writeFileSync(new URL('./app-under-test.mjs', import.meta.url), src);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };
const view = () => document.querySelector('#app').innerHTML;

await import('./app-under-test.mjs');
await sleep(120);
const T = globalThis.__T;
const { __mock } = await import('./mock-supabase.mjs');

console.log('— authentification —');
ok('écran d’accueil auth affiché', view().includes('Bienvenue'));
T.setAuthMode('email');
document.querySelector('#authid').value = 'mik@x.com';
await T.authStep(); await sleep(30);
ok('champ code apparu après envoi', !!document.querySelector('#authcode'));
document.querySelector('#authcode').value = '123456';
await T.authStep(); await sleep(60);
ok('connexion réussie (profil chargé)', !!T.state().ME && !!T.state().PROFILE);
ok('accueil sans concours = message attente', view().includes('Aucun concours'));

console.log('— admin : lancement d’un concours gratuit —');
__mock.setAdmin(T.state().ME.id);
await T.loadProfile(); await sleep(10);
location.hash = 'admin'; await T.renderAdmin(); await sleep(30);
ok('écran admin visible', view().includes('Lancer un concours'));
T.setGain(0);
await T.launch(); await sleep(40);
ok('concours créé en base', __mock.DB.contests.length === 1 && __mock.DB.contests[0].gain_mode === 0);
const cid = __mock.DB.contests[0].id;
ok('pourcentages 85/15 par défaut', __mock.DB.contests[0].winner_pct === 85 && __mock.DB.contests[0].organizer_pct === 15);
await T.renderAccueil(); await sleep(30);
ok('accueil affiche le concours + bouton gratuit', view().includes('Concours du jour') && view().includes('Participer (gratuit)'));
ok('règle de transparence affichée (minimum)', view().includes('Minimum de participants'));

console.log('— participation & publication —');
await T.joinFree(); await sleep(20); await T.renderAccueil(); await sleep(20);
ok('inscription gratuite enregistrée', __mock.DB.entries.length === 1 && view().includes('Inscrit'));
await T.renderConcours(); await sleep(30);
ok('grille vide + case ajouter (0/5)', view().includes('Ajouter (0/5)'));
const fakeFile = { name: 'a.jpg', type: 'image/jpeg', size: 10 };
await T.uploadPhoto({ target: { files: [fakeFile], value: '' } }); await sleep(30);
await T.renderConcours(); await sleep(20);
ok('photo publiée (storage + base)', __mock.DB.photos.length === 1 && __mock.store.size === 1);
ok('score initial 0 affiché', view().includes('0 pts'));
ok('bloc sponsorisé présent dans le fil', view().includes('SPONSORISÉ'));
const photoId = __mock.DB.photos[0].id;

console.log('— règles de réaction —');
await T.react(photoId, 'coeur'); await sleep(20);
ok('réaction sur SA PROPRE photo refusée', __mock.DB.photos[0].score === 0);
__mock.DB.profiles.push({ id: 'u99', email: 'ami@x.com', display_name: 'Ami', is_admin: false, can_win: true });
T.setME({ id: 'u99' });
await T.renderPhoto(photoId); await sleep(30);
ok('écran réagir avec barème', view().includes('Cœur') && view().includes('+5'));
await T.react(photoId, 'coeur'); await sleep(20);
ok('cœur = +5', __mock.DB.photos[0].score === 5);
await T.react(photoId, 'coeur'); await sleep(20);
ok('unicité : 2ᵉ cœur refusé', __mock.DB.photos[0].score === 5);
await T.react(photoId, 'rire'); await sleep(20);
ok('rire cumulé = +9', __mock.DB.photos[0].score === 9);
await T.renderPhoto(photoId); await sleep(20);
ok('boutons déjà utilisés désactivés', (view().match(/class="reac mine/g) || []).length >= 1);

console.log('— suppression & blocage 3 h —');
const c1 = __mock.DB.contests.find(c => c.id === cid);
c1.ends_at = new Date(Date.now() + 2 * 3600000).toISOString();   // entre dans la fenêtre bloquée
await T.delPhoto(photoId); await sleep(20);
ok('suppression BLOQUÉE les 3 dernières heures', __mock.DB.photos.some(p => p.id === photoId));
c1.ends_at = new Date(Date.now() + 24 * 3600000).toISOString();  // hors fenêtre
await T.delPhoto(photoId); await sleep(20);
ok('suppression hors blocage = photo partie + points perdus', !__mock.DB.photos.some(p => p.id === photoId));
ok('fichier en attente dans la poubelle (nettoyage serveur après)',
  __mock.DB.storage_trash.length === 1 && __mock.store.size === 1);
ok('réactions supprimées en cascade', __mock.DB.reactions.length === 0);

console.log('— serveur : clôture 24 h + nettoyage (vraies fonctions /api) —');
/* préparation : u99 publie (9 pts), l’admin u1 publie une MEILLEURE photo (12 pts)
   → le gagnant DOIT rester u99 puisque l’admin ne peut pas gagner */
T.setME({ id: 'u99' });
await T.uploadPhoto({ target: { files: [{ name: 'b.jpg', type: 'image/jpeg' }], value: '' } }); await sleep(20);
const photo2 = __mock.DB.photos.slice(-1)[0].id;
T.setME({ id: 'u1' });
await T.react(photo2, 'coeur'); await T.react(photo2, 'rire'); await sleep(20);
await T.uploadPhoto({ target: { files: [{ name: 'c.jpg', type: 'image/jpeg' }], value: '' } }); await sleep(20);
const photo3 = __mock.DB.photos.slice(-1)[0].id;
T.setME({ id: 'u99' });
await T.react(photo3, 'coeur'); await T.react(photo3, 'rire'); await T.react(photo3, 'surprise'); await sleep(20);
ok('scores en place (admin 12, u99 9)',
  __mock.DB.photos.find(p => p.id === photo3).score === 12 &&
  __mock.DB.photos.find(p => p.id === photo2).score === 9);

/* le temps passe : fin du concours 1 */
__mock.DB.contests.find(c => c.id === cid).ends_at = new Date(Date.now() - 1000).toISOString();

/* mini-moteur de clôture côté "Supabase" (même logique que close_contests()) */
function miniClose() {
  const D = __mock.DB; let done = 0;
  for (const c of D.contests.filter(c => c.status === 'ouvert' && new Date(c.ends_at) <= new Date())) {
    let nPart, gross = 0, net = 0;
    if (c.gain_mode === 0) nPart = new Set(D.photos.filter(p => p.contest_id === c.id).map(p => p.owner_id)).size;
    else {
      const es = D.entries.filter(e => e.contest_id === c.id && e.status === 'paye');
      nPart = es.length; gross = es.reduce((s, e) => s + e.amount_fcfa, 0); net = es.reduce((s, e) => s + e.net_fcfa, 0);
    }
    if (c.gain_mode > 0 && nPart < c.min_participants) {
      c.status = 'annule';
      D.entries.forEach(e => { if (e.contest_id === c.id && e.status === 'paye') e.status = 'rembourse'; });
    } else {
      const byOwner = {};
      D.photos.filter(p => p.contest_id === c.id &&
        (D.profiles.find(x => x.id === p.owner_id) || {}).can_win !== false)
        .forEach(p => { (byOwner[p.owner_id] = byOwner[p.owner_id] || []).push(p); });
      const bests = Object.values(byOwner).map(ps => ps.slice()
        .sort((a, b) => b.score - a.score || new Date(a.score_updated_at) - new Date(b.score_updated_at))[0]);
      bests.sort((a, b) => b.score - a.score || new Date(a.score_updated_at) - new Date(b.score_updated_at));
      const w = bests[0] || null;
      D.results.push({ contest_id: c.id, winner_photo_id: w ? w.id : null, winner_user_id: w ? w.owner_id : null,
        winner_score: w ? w.score : 0, participants: nPart, gross_fcfa: gross, net_fcfa: net,
        winner_amount_fcfa: Math.floor(net * c.winner_pct / 100),
        organizer_amount_fcfa: net - Math.floor(net * c.winner_pct / 100),
        closed_at: new Date().toISOString() });
      c.status = 'clos';
    }
    for (const p of D.photos.filter(p => p.contest_id === c.id).slice()) {
      D.storage_trash.push({ id: Date.now() + Math.random(), storage_path: p.storage_path, queued_at: new Date().toISOString() });
      D.reactions = D.reactions.filter(r => r.photo_id !== p.id);
      D.photos = D.photos.filter(x => x !== p);
    }
    done++;
  }
  return { ok: true, detail: 'fermés : ' + done };
}
/* routage fetch pour les fonctions serveur */
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('/api/config')) return { json: async () => ({ url: 'http://mock.supabase', anon: 'anon-key' }) };
  if (u.includes('/rest/v1/rpc/close_contests')) return { ok: true, text: async () => JSON.stringify(miniClose()) };
  if (u.includes('/rest/v1/storage_trash') && (!opts.method || opts.method === 'GET'))
    return { ok: true, json: async () => __mock.DB.storage_trash.slice(0, 50).map(r => ({ id: r.id, storage_path: r.storage_path })) };
  if (u.includes('/storage/v1/object/delete/photos')) {
    JSON.parse(opts.body).prefixes.forEach(p => __mock.store.delete(p));
    return { ok: true, json: async () => ({}) };
  }
  if (u.includes('/rest/v1/storage_trash?id=in.')) { __mock.DB.storage_trash = []; return { ok: true, json: async () => ({}) }; }
  return { ok: true, json: async () => ({}), text: async () => '' };
};
process.env.SUPABASE_URL = 'http://mock.supabase';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
writeFileSync(new URL('./api-cloture-under-test.mjs', import.meta.url), readFileSync(REPO + '/api/cloture.js', 'utf8'));
writeFileSync(new URL('./api-nettoyage-under-test.mjs', import.meta.url), readFileSync(REPO + '/api/nettoyage.js', 'utf8'));
const cloture = (await import('./api-cloture-under-test.mjs')).default;
const nettoyage = (await import('./api-nettoyage-under-test.mjs')).default;
const mkRes = () => ({ code: 0, body: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });

const res1 = mkRes(); await cloture({}, res1); await sleep(20);
ok('/api/cloture répond OK', res1.code === 200 && res1.body && res1.body.ok);
ok('concours passé à clos', __mock.DB.contests.find(c => c.id === cid).status === 'clos');
ok('GAGNANT = u99 (l’admin exclu malgré 12 pts > 9 pts)',
  __mock.DB.results[0] && __mock.DB.results[0].winner_user_id === 'u99' && __mock.DB.results[0].winner_score === 9);
ok('photos du concours clos sorties de la base', __mock.DB.photos.filter(p => p.contest_id === cid).length === 0);
ok('fichiers correspondants en poubelle', __mock.DB.storage_trash.length >= 3 && __mock.store.size >= 3);
const res2 = mkRes(); await nettoyage({}, res2); await sleep(20);
ok('/api/nettoyage vide le stockage ET la poubelle',
  res2.body && res2.body.deleted >= 3 && __mock.store.size === 0 && __mock.DB.storage_trash.length === 0);

console.log('— écrans restants —');
await T.renderResultats(); await sleep(30);
ok('écran résultats affiche le gagnant + journal', view().includes('Gagnants') && view().includes('Ami'));
await T.renderRegles(); await sleep(20);
ok('écran règles + barème complet + déconnexion', view().includes('Barème') && view().includes('Se déconnecter'));
__mock.DB.contests.push({ id: 900, status: 'ouvert', gain_mode: 0, fee_fcfa: 0, winner_pct: 85,
  organizer_pct: 15, min_participants: 5, starts_at: new Date(Date.now() - 25 * 3600000).toISOString(),
  ends_at: new Date(Date.now() - 1000).toISOString() });
await T.renderAccueil(); await sleep(20);
ok('compte à rebours terminé détecté', view().includes('Terminé'));

console.log('');
console.log(pass + ' tests OK, ' + fail + ' échec(s)');
process.exit(fail ? 1 : 0);
