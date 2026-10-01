/* Mik-ver Universal group²oste — app V1 (statique + Supabase + fonctions Vercel) */
'use strict';

var sb = null, ME = null, PROFILE = null, CONTEST = null, WEIGHTS = [], CFG = {};
var $ = function (s) { return document.querySelector(s); };
var app = function () { return $('#app'); };

/* ---------- outils ---------- */
function toast(msg) {
  var t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2600);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmt(n) { return (n || 0).toLocaleString('fr-FR') + ' FCFA'; }
function countdown(iso) {
  var d = new Date(iso).getTime() - Date.now();
  if (d <= 0) return 'Terminé — clôture en cours…';
  var h = Math.floor(d / 3600000), m = Math.floor(d % 3600000 / 60000), s = Math.floor(d % 60000 / 1000);
  return '⏱ ' + h + 'h ' + m + 'm ' + s + 's restants';
}
function pubUrl(path) { return CFG.url + '/storage/v1/object/public/photos/' + path; }

/* ---------- démarrage ---------- */
async function boot() {
  CFG = await fetch('/api/config').then(function (r) { return r.json(); });
  if (!CFG.url || !CFG.anon) { app().innerHTML = '<div class="card center">Configuration manquante : renseigne SUPABASE_URL et SUPABASE_ANON_KEY dans Vercel → Environment Variables.</div>'; return; }
  var sup = await import('https://esm.sh/@supabase/supabase-js@2');
  sb = sup.createClient(CFG.url, CFG.anon);
  WEIGHTS = (await sb.from('reaction_weights').select('*').order('points', { ascending: false })).data || [];
  var sess = (await sb.auth.getSession()).session;
  if (sess) { ME = sess.user; await loadProfile(); }
  window.addEventListener('hashchange', route);
  setInterval(tick, 1000);
  setInterval(function () { fetch('/api/cloture').catch(function () {}); }, 300000);
  fetch('/api/cloture').catch(function () {});
  route();
}
async function loadProfile() {
  PROFILE = (await sb.from('profiles').select('*').eq('id', ME.id).single()).data;
}
async function loadContest() {
  CONTEST = (await sb.from('contests').select('*').eq('status', 'ouvert')
    .order('id', { ascending: false }).limit(1)).data?.[0] || null;
}

/* ---------- navigation ---------- */
var TABS = [
  ['accueil', '🏠', 'Accueil'],
  ['concours', '🏆', 'Concours'],
  ['resultats', '🥇', 'Résultats'],
  ['regles', '📖', 'Règles'],
  ['admin', '🛠️', 'Admin']
];
function nav() {
  var cur = (location.hash || '#accueil').slice(1).split('/')[0];
  $('#nav').innerHTML = TABS.map(function (t) {
    if (t[0] === 'admin' && (!PROFILE || !PROFILE.is_admin)) return '';
    return '<button class="' + (cur === t[0] ? 'on' : '') + '" onclick="location.hash=\'' + t[0] + '\'"><i>' + t[1] + '</i>' + t[2] + '</button>';
  }).join('');
}
function route() {
  nav();
  var h = (location.hash || '#accueil').slice(1).split('/');
  if (!ME) return renderAuth();
  if (h[0] === 'concours') return renderConcours();
  if (h[0] === 'photo') return renderPhoto(h[1]);
  if (h[0] === 'resultats') return renderResultats();
  if (h[0] === 'regles') return renderRegles();
  if (h[0] === 'admin') return renderAdmin();
  return renderAccueil();
}
function tick() {
  if (CONTEST && CONTEST.status === 'ouvert') $('#topcount').textContent = countdown(CONTEST.ends_at);
  else $('#topcount').textContent = PROFILE ? (PROFILE.is_admin ? 'mode admin' : '') : '';
}

/* ---------- authentification ---------- */
var authMode = 'email', authSent = false;
function renderAuth() {
  app().innerHTML =
    '<div class="card center" style="margin-top:20px">' +
    '<img src="assets/logo/mik-ver-logo-256.png" style="width:110px;border-radius:16px" alt="logo">' +
    '<h2 style="margin-top:8px">Bienvenue dans le groupe</h2>' +
    '<p class="muted">Un gagnant · 24 heures · 1 seule voix par personne</p>' +
    '<div style="display:flex;gap:6px;margin-top:12px">' +
    '<button class="btn ' + (authMode === 'email' ? '' : 'ghost') + '" onclick="setAuthMode(\'email\')">Email</button>' +
    '<button class="btn ' + (authMode === 'phone' ? '' : 'ghost') + '" onclick="setAuthMode(\'phone\')">Téléphone</button>' +
    '</div>' +
    (authMode === 'email'
      ? '<input id="authid" type="email" placeholder="ton@email.com">'
      : '<input id="authid" type="tel" placeholder="+241 XX XX XX XX">') +
    (authSent ? '<input id="authcode" inputmode="numeric" placeholder="Code reçu (6 chiffres)">' : '') +
    '<button class="btn" onclick="authStep()">' + (authSent ? 'Vérifier le code' : 'Recevoir mon code') + '</button>' +
    '<p class="muted" style="margin-top:10px">Email : le lien/code arrive par mail (fonctionne tout de suite).<br>Téléphone : active après configuration SMS du projet.</p>' +
    '</div>';
}
function setAuthMode(m) { authMode = m; authSent = false; renderAuth(); }
async function authStep() {
  var id = $('#authid').value.trim();
  if (!authSent) {
    var opt = authMode === 'email' ? { email: id } : { phone: id.replace(/\s/g, '') };
    var r = await sb.auth.signInWithOtp(opt);
    if (r.error) return toast('Erreur : ' + r.error.message);
    authSent = true; toast('Code envoyé ✅'); renderAuth();
  } else {
    var code = $('#authcode').value.trim();
    var v = authMode === 'email'
      ? await sb.auth.verifyOtp({ email: id, token: code, type: 'email' })
      : await sb.auth.verifyOtp({ phone: id.replace(/\s/g, ''), token: code, type: 'sms' });
    if (v.error) return toast('Erreur : ' + v.error.message);
    ME = v.user; await loadProfile(); toast('Bienvenue 🎉'); location.hash = 'accueil'; route();
  }
}

/* ---------- accueil ---------- */
async function renderAccueil() {
  await loadContest();
  if (!CONTEST) { app().innerHTML = '<div class="card center" style="margin-top:20px"><div class="big">💤</div><h2>Aucun concours en cours</h2><p class="muted">Prochain concours bientôt — l’organisateur peut le lancer depuis l’onglet Admin.</p></div>'; return; }
  var c = CONTEST;
  var entries = (await sb.from('entries').select('user_id,net_fcfa,status').eq('contest_id', c.id).eq('status', 'paye')).data || [];
  var n = entries.length;
  var net = entries.reduce(function (s, e) { return s + (e.net_fcfa || 0); }, 0);
  var winnerPot = c.gain_mode === 0 ? 0 : Math.floor(net * c.winner_pct / 100);
  var mine = entries.some(function (e) { return e.user_id === ME.id; });
  app().innerHTML =
    '<div class="card center">' +
    '<h2>Concours du jour</h2><p class="muted">' + countdown(c.ends_at) + '</p>' +
    '<div style="margin:12px 0"><div class="muted">' + (c.gain_mode === 0 ? 'Concours gratuit' : 'Cagnotte du gagnant') + '</div>' +
    '<div class="big">' + (c.gain_mode === 0 ? '0 FCFA' : fmt(winnerPot)) + '</div>' +
    '<div class="muted">à ' + n + ' participant' + (n > 1 ? 's' : '') + '</div></div>' +
    '</div>' +
    '<div class="card">' +
    '<h2>Comment la cagnotte est calculée</h2>' +
    '<div class="rowline"><span class="k">Frais par participation</span><span class="v">' + (c.gain_mode === 0 ? 'Gratuit' : fmt(c.fee_fcfa)) + '</span></div>' +
    '<div class="rowline"><span class="k">Participants</span><span class="v">' + n + '</span></div>' +
    '<div class="rowline"><span class="k">Total net (après frais prestataire)</span><span class="v">' + fmt(net) + '</span></div>' +
    '<div class="rowline hl"><span class="k">Gagnant ' + c.winner_pct + ' %</span><span class="v">' + fmt(winnerPot) + '</span></div>' +
    '<div class="rowline"><span class="k">Organisateur ' + c.organizer_pct + ' %</span><span class="v">' + fmt(net - winnerPot) + '</span></div>' +
    '<div class="rowline"><span class="k">Minimum de participants</span><span class="v">' + c.min_participants + '</span></div>' +
    '<p class="muted" style="margin-top:8px">Sous le minimum, le concours est annulé et tout le monde est remboursé. Règles visibles avant de jouer : transparence totale.</p>' +
    '</div>' +
    (c.gain_mode === 0
      ? '<button class="btn" ' + (mine ? 'disabled' : '') + ' onclick="joinFree()">' + (mine ? 'Inscrit ✅ — place au concours' : 'Participer (gratuit)') + '</button>'
      : '<div class="card center"><span class="badge warn">PAIEMENT MOBILE — activation V2</span><p class="muted" style="margin-top:6px">L’encaissement Cardflux arrive avec la V2. En attendant, l’organisateur lance des concours gratuits.</p></div>') +
    '<button class="btn ghost" onclick="location.hash=\'concours\'">Voir le concours 🏆</button>';
}
async function joinFree() {
  var r = await sb.from('entries').insert({ contest_id: CONTEST.id, user_id: ME.id, amount_fcfa: 0, net_fcfa: 0, status: 'paye' });
  if (r.error) return toast('Erreur : ' + r.error.message);
  toast('Inscrit ✅ Bonne chance !'); renderAccueil();
}

/* ---------- concours ---------- */
async function renderConcours() {
  await loadContest();
  if (!CONTEST) { app().innerHTML = '<div class="card center">Aucun concours ouvert.</div>'; return; }
  var photos = (await sb.from('photos').select('id,storage_path,caption,score,owner_id').eq('contest_id', CONTEST.id).order('score', { ascending: false })).data || [];
  var board = (await sb.from('v_leaderboard').select('*').eq('contest_id', CONTEST.id).order('rang').limit(6)).data || [];
  var mine = photos.filter(function (p) { return p.owner_id === ME.id; });
  var names = {};
  var ids = board.map(function (b) { return b.owner_id; });
  if (ids.length) (await sb.from('profiles').select('id,display_name').in('id', ids)).data.forEach(function (p) { names[p.id] = p.display_name; });

  var grid = '';
  photos.forEach(function (p, i) {
    if (i === 3) grid += '<div class="sponsor" style="grid-column:1/-1"><b>SPONSORISÉ</b><div>Publication partenaire — exclue du classement.<br><span class="muted">Votre pub ici : contactez l’organisateur.</span></div></div>';
    grid += '<div class="pcard" onclick="location.hash=\'photo/' + p.id + '\'">' +
      (p.owner_id === ME.id ? '<button class="del" onclick="event.stopPropagation();delPhoto(' + p.id + ')">🗑</button>' : '') +
      '<img src="' + pubUrl(p.storage_path) + '" alt="photo" loading="lazy">' +
      '<div class="score">' + p.score + ' pts</div></div>';
  });
  if (mine.length < 5) grid += '<div class="pcard add" onclick="pickFile()"><b>➕</b>Ajouter (' + mine.length + '/5)</div>';

  app().innerHTML =
    '<div class="card"><h2>Classement (meilleure photo de chacun)</h2>' +
    '<div class="ranking">' + [1, 2, 3, 4, 5, 6].map(function (i) {
      var b = board[i - 1];
      return '<div class="' + (i === 1 ? 'first' : '') + '" title="' + esc(b ? names[b.owner_id] : '') + '">' + (b ? b.score : '·') + '</div>';
    }).join('') + '</div>' +
    '<p class="muted center">' + board.slice(0, 3).map(function (b, i) { return (i + 1) + '. ' + esc(names[b.owner_id] || '?') + ' (' + b.score + ')'; }).join(' · ') + '</p>' +
    '</div>' +
    '<div class="card"><h2>Publications (' + photos.length + ')</h2>' +
    '<div class="grid3">' + grid + '</div>' +
    '<div class="inputbar" style="display:flex;gap:6px;margin-top:10px">' +
    '<input id="caption" placeholder="Ajoute une légende" style="margin:0">' +
    '<button class="btn" style="width:52px;margin:0" onclick="pickFile()">📷</button></div>' +
    '<p class="muted" style="margin-top:6px">Mes photos : ' + mine.length + '/5 · supprimer = perdre les points de la photo · blocage les 3 dernières heures.</p>' +
    '</div>';
}
function pickFile() { $('#filepick').click(); }
$('#filepick') ? null : null;
document.addEventListener('DOMContentLoaded', function () {
  $('#filepick').addEventListener('change', uploadPhoto);
});
async function uploadPhoto(ev) {
  var f = ev.target.files[0]; ev.target.value = '';
  if (!f || !CONTEST) return;
  var path = ME.id + '/' + Date.now() + '.jpg';
  var up = await sb.storage.from('photos').upload(path, f, { contentType: f.type || 'image/jpeg' });
  if (up.error) return toast('Upload : ' + up.error.message);
  var r = await sb.from('photos').insert({ contest_id: CONTEST.id, owner_id: ME.id, storage_path: path, caption: ($('#caption') ? $('#caption').value : '') || null });
  if (r.error) { await sb.storage.from('photos').remove([path]); return toast(r.error.message); }
  toast('Publiée ✅'); renderConcours();
}
async function delPhoto(id) {
  if (!confirm('Supprimer cette photo ? Elle perd tous ses points.')) return;
  var r = await sb.from('photos').delete().eq('id', id);
  if (r.error) return toast(r.error.message);
  toast('Photo supprimée'); renderConcours();
}

/* ---------- réagir ---------- */
async function renderPhoto(id) {
  var p = (await sb.from('photos').select('*').eq('id', id).single()).data;
  if (!p) { location.hash = 'concours'; return; }
  var owner = (await sb.from('profiles').select('display_name').eq('id', p.owner_id).single()).data;
  var myRe = (await sb.from('reactions').select('reaction_key').eq('photo_id', p.id).eq('user_id', ME.id)).data || [];
  var have = myRe.map(function (r) { return r.reaction_key; });
  app().innerHTML =
    '<div class="card center">' +
    '<img class="photobig" src="' + pubUrl(p.storage_path) + '" alt="photo">' +
    (p.caption ? '<p style="margin-top:6px;font-size:13px">' + esc(p.caption) + '</p>' : '') +
    '<p class="muted" style="margin-top:4px">' + esc(owner ? owner.display_name : '?') + ' · <b style="color:#0066cc">' + p.score + ' pts</b></p>' +
    '<p class="muted">Une seule réaction de chaque type · jamais sur sa propre photo</p>' +
    '<div class="reacgrid">' + WEIGHTS.map(function (w) {
      var dis = have.indexOf(w.key) >= 0 || p.owner_id === ME.id;
      return '<button class="reac ' + (have.indexOf(w.key) >= 0 ? 'mine' : '') + '" ' + (dis ? 'disabled' : '') +
        ' onclick="react(' + p.id + ',\'' + w.key + '\')"><i>' + w.emoji + '</i>' + esc(w.label) + '<b>+' + w.points + '</b></button>';
    }).join('') + '</div>' +
    '<button class="btn ghost" onclick="location.hash=\'concours\'">← Retour au concours</button>' +
    '</div>';
}
async function react(photoId, key) {
  var r = await sb.from('reactions').insert({ photo_id: photoId, user_id: ME.id, reaction_key: key });
  if (r.error) return toast(r.error.message);
  toast('Réaction envoyée ✅'); renderPhoto(photoId);
}

/* ---------- résultats ---------- */
async function renderResultats() {
  var res = (await sb.from('results').select('*').order('closed_at', { ascending: false }).limit(10)).data || [];
  var names = {};
  var ids = res.map(function (r) { return r.winner_user_id; }).filter(Boolean);
  if (ids.length) (await sb.from('profiles').select('id,display_name').in('id', ids)).data.forEach(function (p) { names[p.id] = p.display_name; });
  app().innerHTML = '<div class="card"><h2>🥇 Gagnants des concours clos</h2>' +
    (res.length === 0 ? '<p class="muted">Aucun concours clos pour l’instant.</p>' : res.map(function (r) {
      return '<div class="rowline"><span class="k">Concours #' + r.contest_id + ' · ' + esc(names[r.winner_user_id] || '?') + ' · ' + r.winner_score + ' pts</span><span class="v">' + fmt(r.winner_amount_fcfa) + '</span></div>';
    }).join('')) + '</div>' +
    '<div class="card"><h2>Journal public (transparence)</h2><div id="logbox"><p class="muted">chargement…</p></div></div>';
  var logs = (await sb.from('admin_log').select('*').order('created_at', { ascending: false }).limit(15)).data || [];
  $('#logbox').innerHTML = logs.length === 0 ? '<p class="muted">Rien pour l’instant.</p>' : logs.map(function (l) {
    return '<div class="logline">' + new Date(l.created_at).toLocaleString('fr-FR') + ' · <b>' + esc(l.action) + '</b> · ' + esc(JSON.stringify(l.details)) + '</div>';
  }).join('');
}

/* ---------- règles ---------- */
function renderRegles() {
  app().innerHTML =
    '<div class="card"><h2>📖 Règles du concours</h2>' +
    '<div class="rowline"><span class="k">Durée</span><span class="v">24 heures</span></div>' +
    '<div class="rowline"><span class="k">Photos</span><span class="v">5 max par personne</span></div>' +
    '<div class="rowline"><span class="k">Suppression</span><span class="v">points perdus · bloquée les 3 dernières h</span></div>' +
    '<div class="rowline"><span class="k">Réactions</span><span class="v">1 de chaque type max · pas sur soi</span></div>' +
    '<div class="rowline"><span class="k">Classement</span><span class="v">meilleure photo de chacun</span></div>' +
    '<div class="rowline"><span class="k">Égalité</span><span class="v">la 1ʳ arrivée à ce score gagne</span></div>' +
    '<div class="rowline"><span class="k">Gagnant</span><span class="v">1 seul · le 1ᵉ</span></div>' +
    '<div class="rowline"><span class="k">Cagnotte</span><span class="v">% du net affichés à l’accueil</span></div>' +
    '<div class="rowline"><span class="k">Minimum non atteint</span><span class="v">annulation + remboursement</span></div>' +
    '<div class="rowline"><span class="k">Organisateur</span><span class="v">participe mais ne gagne pas</span></div>' +
    '<div class="rowline"><span class="k">Sponsorisé</span><span class="v">exclu du classement</span></div>' +
    '</div>' +
    '<div class="card"><h2>Barème des réactions</h2>' +
    '<div class="reacgrid">' + WEIGHTS.map(function (w) {
      return '<div class="reac" style="pointer-events:none"><i>' + w.emoji + '</i>' + esc(w.label) + '<b>+' + w.points + '</b></div>';
    }).join('') + '</div>' +
    '<p class="muted" style="margin-top:8px">Aucune réaction ne retire de points : ici on ne sabote pas, on encourage.</p></div>';
}

/* ---------- admin ---------- */
async function renderAdmin() {
  if (!PROFILE || !PROFILE.is_admin) { app().innerHTML = '<div class="card center">Accès réservé à l’organisateur.</div>'; return; }
  app().innerHTML =
    '<div class="card"><h2>🛠️ Lancer un concours</h2>' +
    '<label>Mode de gain</label>' +
    '<div style="display:flex;gap:6px"><button id="m0" class="btn" onclick="setGain(0)"> Gratuit</button>' +
    '<button id="m1" class="btn ghost" onclick="setGain(1)">💰 Payant</button></div>' +
    '<div id="payopts" style="display:none">' +
    '<label>Frais par participant (FCFA)</label><input id="f_fee" type="number" value="300">' +
    '<label>% gagnant</label><input id="f_win" type="number" value="85">' +
    '<label>Minimum de participants</label><input id="f_min" type="number" value="5">' +
    '</div>' +
    '<label>Durée (heures)</label><input id="f_h" type="number" value="24">' +
    '<button class="btn" onclick="launch()">🚀 Lancer le concours</button>' +
    '<p class="muted" style="margin-top:8px">% organisateur = 100 − % gagnant, calculé automatiquement. Tout reste modifiable par concours.</p>' +
    '</div>' +
    '<div class="card"><h2>Concours existants</h2><div id="clist">chargement…</div></div>';
  var cs = (await sb.from('contests').select('*').order('id', { ascending: false }).limit(10)).data || [];
  $('#clist').innerHTML = cs.map(function (c) {
    return '<div class="rowline"><span class="k">#' + c.id + ' · ' + (c.gain_mode === 0 ? 'gratuit' : c.fee_fcfa + ' F') + ' · ' + new Date(c.ends_at).toLocaleString('fr-FR') + '</span><span class="v"><span class="badge ' + (c.status === 'ouvert' ? '' : c.status === 'annule' ? 'warn' : 'off') + '">' + c.status + '</span></span></div>';
  }).join('') || '<p class="muted">Aucun.</p>';
}
var gainMode = 0;
function setGain(g) {
  gainMode = g;
  $('#m0').className = 'btn' + (g === 0 ? '' : ' ghost');
  $('#m1').className = 'btn' + (g === 1 ? '' : ' ghost');
  $('#payopts').style.display = g === 0 ? 'none' : 'block';
}
async function launch() {
  var fee = parseInt($('#f_fee') ? $('#f_fee').value : 0, 10) || 0;
  var win = parseInt($('#f_win') ? $('#f_win').value : 85, 10) || 85;
  var min = parseInt($('#f_min') ? $('#f_min').value : 5, 10) || 5;
  var h = parseInt($('#f_h').value, 10) || 24;
  var r = await sb.from('contests').insert({
    gain_mode: gainMode,
    fee_fcfa: gainMode === 0 ? 0 : fee,
    winner_pct: win, organizer_pct: 100 - win,
    min_participants: min,
    ends_at: new Date(Date.now() + h * 3600000).toISOString(),
    created_by: ME.id
  });
  if (r.error) return toast('Erreur : ' + r.error.message);
  toast('Concours lancé 🚀'); location.hash = 'accueil'; route();
}

boot();
