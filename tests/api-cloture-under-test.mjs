// Clôture automatique des concours terminés (appelée par le cron Vercel toutes les 5 min
// ET par l'app au chargement, en ceinture-bretelles).
// Sécurité : la fonction SQL ne ferme QUE les concours dont ends_at est passé → sans danger.
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ ok: false, error: 'env manquant' });

  const r = await fetch(url + '/rest/v1/rpc/close_contests', {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: 'Bearer ' + key,
      'content-type': 'application/json'
    },
    body: '{}'
  });
  const txt = await r.text();
  res.status(r.ok ? 200 : 500).json({ ok: r.ok, detail: txt.slice(0, 300) });
}
