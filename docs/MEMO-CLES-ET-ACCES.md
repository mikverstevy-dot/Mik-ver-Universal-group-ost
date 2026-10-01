# Mik-ver — Mémo clés & accès : qui détient quoi, où, et jamais où

> Le point qui embrouille tout le monde au départ, réglé une fois pour toutes.
> Règle d'or : **une clé ne voyage jamais.** Elle vit dans UN seul tableau de bord
> (Vercel, Supabase ou agrégateur) et la machine vient la chercher au moment où elle tourne.
> Elle ne passe jamais par : un chat (WhatsApp, Claude, Arena), le code GitHub, une capture d'écran.

---

## 1. Le principe qui dissipe ta confusion

Coder ≠ être connecté. On écrit le code **hors ligne**, avec des *trous nommés* :

```js
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
//                                        ^^^^^^^^^^^^^^^^  un NOM, pas une valeur
```

Les **valeurs**, tu les colles **une seule fois** dans les tableaux de bord (Vercel / Supabase /
agrégateur). Au moment où l'app tourne sur Vercel, la machine remplit les trous toute seule.

Donc :
- **Moi (Arena)** : je peux écrire 100 % du code sans aucune clé. Je ne suis connecté à rien
  (ni GitHub, ni Vercel, ni Supabase, ni Cardflux) et je n'ai besoin d'aucun secret.
- **Ton agent IA codeur** : il lui faut le **dépôt GitHub** (le code), pas les clés.
  Il écrit des trous nommés, exactement comme moi.
- **GitHub** : ne contient **que du code**. Zéro clé dedans. Jamais.
- **Toi** : seul humain à voir les valeurs, dans les tableaux de bord, sur ton téléphone.

---

## 2. Tableau des clés

| Clé | Ce qu'elle ouvre | Où elle vit | Qui peut la voir | Gravité si fuite |
|---|---|---|---|---|
| Supabase `URL` + `anon` | Ce que les règles RLS autorisent (l'app normale) | Vercel env + code de l'app | Tout le monde (elle est conçue pour être publique) | Faible (RLS protège) |
| Supabase `service_role` | TOUT, contourne toutes les règles | Vercel env (côté serveur) + secrets Supabase pour les Edge Functions | Toi + le serveur | **Critique** |
| Clé API agrégateur (payin/payout) | L'argent réel : encaisser, rembourser, payer le gagnant | Vercel env (côté serveur) | Toi + le serveur | **Critique** |
| Secret webhook | Prouver « c'est bien l'agrégateur qui appelle » | Dashboard agrégateur + Vercel env | Toi + le serveur | **Critique** |
| Accès GitHub (token de l'agent) | Modifier le code | Ta plateforme agent | Toi + l'agent | Moyenne |
| Mots de passe GitHub/Vercel/Supabase | Tes comptes | Ta tête ou ton gestionnaire de mots de passe | Toi seul | **Critique** |

---

## 3. Ce que tu peux me donner (à moi, Arena)

**Aucun secret.** Ce dont j'ai besoin pour travailler, tu l'as déjà ou c'est sans risque :
- tes règles métier (déjà dans le cahier de specs) ;
- les noms de tables/colonnes du schéma ;
- des messages d'erreur copiés-collés (« ERROR: 42P01 … ») ;
- des extraits de code qui buguent.

Si un jour tu veux me montrer une clé « pour voir » : **ne le fais pas.** Une clé collée dans un
chat est considérée comme brûlée → il faut la régénérer dans le dashboard.

---

## 4. Ce que tu donnes à l'agent codeur ( = moi, Arena )

- **Rien de secret.** Je n'ai besoin d'aucune clé pour écrire tout le code.
- Le code que je produis contient des *trous nommés* (`process.env.SUPABASE_URL`…) que Vercel remplit.
- Optionnel, seulement au moment du premier push : un accès au dépôt GitHub
  (voir §5 et la fin de la feuille de route pour les méthodes de transfert).
- Pas de clés Supabase, pas de clés Cardflux.
- Exception rare : s'il doit exécuter du SQL lui-même via l'outil CLI de Supabase, tu crées un token
  **temporaire**, tu le révoques juste après. Sinon, méthode simple : copier-coller du SQL dans
  l'éditeur Supabase, fait par toi, en 30 secondes.

---

## 4bis. EXCEPTION CONSENTIE (décidée ensemble) : le token GitHub unique

Pour simplifier au maximum, Mikala a choisi de **ne jamais toucher GitHub lui-même** :
il me confie un token, et je m'occupe de tous les push. Cadre strict de cette exception :

- **Fine-grained personal access token**, limité à **UN seul dépôt** (`mik-ver`).
- **Une seule permission** : Contents = Read and write.
- **Durée de vie courte** : 7 jours.
- **Révoqué** dans GitHub → Settings → Developer settings → Tokens, dès que le projet
  est en ligne (ou à l'expiration, simplement ne pas le renouveler).
- Il ne sert **qu'à pousser du code**. Jamais pour autre chose.
- Toutes les autres clés (Supabase `service_role`, Cardflux, webhook) restent
  INTERDITES de chat : elles vont uniquement dans les tableaux de bord Vercel / agrégateur.

Pourquoi c'est acceptable : un token finement limité à un dépôt de code publicable,
révocable en 1 clic, ne donne accès ni à l'argent, ni à la base, ni aux autres comptes.

## 5. Branchement complet, dans l'ordre (≈ 15 minutes, depuis ton téléphone)

1. **Supabase** → créer le projet → copier `URL` et `anon` (le `service_role` reste chez toi).
2. **Vercel** → ton projet → Settings → Environment Variables → coller :
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` ; plus tard `SUPABASE_SERVICE_ROLE_KEY`,
   `PAYMENT_API_KEY`, `WEBHOOK_SECRET`.
3. **Agrégateur (Cardflux ou autre)** → dashboard → créer les clés API → déclarer l'URL du webhook :
   `https://ton-app.vercel.app/api/webhook/paiement` → copier le secret webhook → Vercel env.
4. **GitHub** → push du code → Vercel déploie tout seul. Les secrets ne sont jamais dans le code.
5. **Test sandbox** : paiement de 1 FCFA → regarder les logs Vercel → le webhook doit apparaître.

---

## 6. Trois réflexes de survie

1. Clé collée au mauvais endroit (chat, GitHub, capture) = **brûlée** → la régénérer immédiatement
   dans son dashboard (rotation).
2. Voir la clé `anon` dans le code de l'app est **normal** : ce n'est pas une fuite, les règles RLS
   de la base font le policier.
3. `service_role` ou clé de paiement retrouvée dans GitHub = urgence : rotation + nettoyage de
   l'historique du dépôt.

---

## 7. Résumé en une phrase

**Le code circule (GitHub ↔ agent ↔ moi), les secrets restent immobiles (tableaux de bord),
et Vercel fait le pont entre les deux au moment de l'exécution.**
