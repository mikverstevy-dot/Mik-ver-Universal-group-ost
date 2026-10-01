// Webhook paiement — SEUL endroit où un paiement peut être marqué « confirmé ».
// L'agrégateur (Cardflux ou autre) appelle cette URL après chaque transaction.
// Protection : secret partagé dans l'en-tête x-webhook-secret.
//
// Dans le dashboard de l'agrégateur, déclarer :
//   https://TON-APP.vercel.app/api/webhook/paiement
// Attendu dans le corps (mapping à ajuster selon la doc Cardflux le jour venu) :
//   { provider_ref, status, amount, phone }
export default async function handler(req, res) {
  const secret = process.env.WEBHOOK_SECRET;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !key) return res.status(500).json({ ok: false, error: 'env manquant' });

  const provided = req.headers['x-webhook-secret'] || req.headers['x-signature'];
  if (provided !== secret) return res.status(401).json({ ok: false, error: 'non autorisé' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const ref = body.provider_ref || body.transaction_id || body.unique_id;
  if (!ref) return res.status(400).json({ ok: false, error: 'provider_ref manquant' });
  const success = ['success', 'succes', 'paid', 'paye', 'confirme', 'confirmed', '200']
    .includes(String(body.status).toLowerCase());

  const h = { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  const found = await (await fetch(
    url + '/rest/v1/payments?provider_ref=eq.' + encodeURIComponent(ref) +
    '&select=id,contest_id,user_id,amount_fcfa,status', { headers: h })).json();

  if (!Array.isArray(found) || found.length !== 1) {
    return res.status(404).json({ ok: false, error: 'paiement inconnu' });
  }
  const pay = found[0];
  if (pay.status === 'confirme') return res.json({ ok: true, already: true });

  if (success) {
    await fetch(url + '/rest/v1/payments?id=eq.' + pay.id, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ status: 'confirme', confirmed_at: new Date().toISOString(), meta: body })
    });
    // inscription effective du participant (net = montant - frais prestataire, 15 F par défaut)
    await fetch(url + '/rest/v1/entries', {
      method: 'POST',
      headers: { ...h, prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        contest_id: pay.contest_id, user_id: pay.user_id,
        amount_fcfa: pay.amount_fcfa, net_fcfa: Math.max(0, pay.amount_fcfa - 15), status: 'paye'
      })
    });
  } else {
    await fetch(url + '/rest/v1/payments?id=eq.' + pay.id, {
      method: 'PATCH', headers: h, body: JSON.stringify({ status: 'echec', meta: body })
    });
  }
  res.json({ ok: true });
}
