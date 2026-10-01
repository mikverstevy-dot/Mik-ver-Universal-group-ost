// Vide la poubelle Storage : supprime les fichiers images des concours clos
// (la base met les chemins dans storage_trash, cette fonction efface les fichiers).
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ ok: false, error: 'env manquant' });

  const h = { apikey: key, authorization: 'Bearer ' + key };
  const q = await fetch(url + '/rest/v1/storage_trash?select=id,storage_path&limit=50', { headers: h });
  const rows = await q.json();
  if (!Array.isArray(rows) || rows.length === 0) return res.json({ ok: true, deleted: 0 });

  const prefixes = rows.map(r => r.storage_path);
  const del = await fetch(url + '/storage/v1/object/delete/photos', {
    method: 'POST',
    headers: { ...h, 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes })
  });
  const ids = rows.map(r => r.id).join(',');
  const clean = await fetch(url + '/rest/v1/storage_trash?id=in.(' + ids + ')', {
    method: 'DELETE',
    headers: h
  });
  res.json({ ok: del.ok && clean.ok, deleted: prefixes.length });
}
