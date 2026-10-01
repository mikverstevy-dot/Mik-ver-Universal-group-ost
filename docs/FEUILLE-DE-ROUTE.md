# Mik-ver Universal group²oste — Feuille de route : de la maquette à la mise en ligne

> « Comment faire, quand faire, pourquoi faire, et passer par qui. »
> Document compagnon du `CAHIER-DE-SPECIFICATIONS.md`. Tout est réalisable depuis ton téléphone.

---

## 0. La chaîne complète, en un schéma

```
        TOI (téléphone)
          │  décisions, tests, lancements, modération, sponsors
          ▼
        MOI (Arena) = TON AGENT CODEUR
          │  spécifications, SQL, code de l'app, Edge Functions,
          │  maquettes, exports PNG, comparatifs
          ▼
        GITHUB (dépôt mik-ver)  ◄── toi : tu colles / pousses les fichiers
          │  chaque push déclenche…
          ▼
        VERCEL (hébergement) ◄── variables secrètes (clés, webhook)
          │  l'app en ligne : https://mik-ver.vercel.app
          ▼
   SUPABASE (base + images + tâches 5 min)   AGGRÉGATEUR PAIEMENT
          │                                          │
          └────────────── utilisateurs ──────────────┘
                 jouent, publient, réagissent, paient
```

**Réponse directe à ta question « je dois passer par toi ? » :**
- **Oui** pour tout ce qui est *matière première* : cahier des charges, schéma SQL, fonctions de nettoyage, maquettes, images, comparatifs, checklists. Je te donne des fichiers prêts à coller.
- **Oui aussi** si tu veux que j'écrive directement le code de l'app ici (je peux).
- **L'agent IA codeur** (celui qui est relié à ton GitHub) est utile pour *maintenir* le dépôt : il lit mes spécifications et produit/corrige le code dans le repo.
- **Ni toi ni moi** ne touchons aux serveurs : Vercel et Supabase font tourner la machine tout seuls.

---

## 1. Qui fait quoi (tableau des rôles)

| Acteur | Rôle | Quand intervient-il | Pourquoi lui |
|---|---|---|---|
| **Toi** | Décide, teste sur téléphone, lance les concours, modère, vend les posts sponsorisés | Tout le temps | C'est ton groupe, ta crédibilité |
| **Moi (Arena)** | Spécifications, SQL Supabase, Edge Functions, maquettes HTML, exports PNG, comparatifs paiement/juridique | Avant chaque phase | Je produis des fichiers prêts à coller, sans consommer tes crédits Claude |
| **Agent IA codeur (Claude Code)** | Écrit et maintient le code de l'app dans le dépôt GitHub | Phase 2 puis maintenance | Il est branché sur ton repo : il committe et pousse à ta place |
| **GitHub** | Coffre-fort du code + déclencheur des déploiements | Dès la phase 0 | Relie l'agent codeur à Vercel : un push = une mise en ligne |
| **Vercel** | Héberge l'app (site + fonctions serveur pour les webhooks) | Phase 3 | Zéro serveur à gérer, déploiement automatique, offre gratuite au départ |
| **Supabase** | Base de données, comptes (téléphone), stockage des photos, tâche toutes les 5 min | Phase 1 | Tout le cerveau du concours vit là : règles, scores, clôture |
| **Agrégateur mobile money** | Encaisse les 300 FCFA, rembourse, verse la cagnotte au gagnant | Phase 4 seulement | Seul acteur autorisé à toucher l'argent ; toi jamais en direct |

---

## 2. Phase 0 — Créer les comptes (jour 1, gratuit, ~1 h)

Checklist, dans cet ordre :

- [ ] **GitHub** : compte + dépôt privé nommé `mik-ver`.
- [ ] **Supabase** : compte + projet `mik-ver` (région la plus proche : Europe).
      Note ailleurs (pas dans le code !) : l'URL du projet, la clé `anon`, la clé `service_role`.
      ⚠️ La clé `service_role` ne va **jamais** dans l'app ni sur le téléphone : elle ouvre toute la base.
- [ ] **Vercel** : compte, puis « Import Project » → choisis le dépôt `mik-ver`.
      Ne déploie rien encore : le premier déploiement partira tout seul au premier push.
- [ ] **Agrégateur de paiement** : ouvre un compte marchand *en test/sandbox* chez celui que tu as cité
      (Cardflux / son nouveau nom), **et** compare avec les acteurs gabonais documentés :
      - **MyPayGA** : encaissement mobile money Airtel/Moov (2,75 %/transaction) et surtout une API
        `cashout` pour envoyer de l'argent à un numéro → c'est ce qui te servira à **payer le gagnant**.
      - **PVit** : payin 2–2,5 %, payout 0,5–1 % (Airtel/Moov), minimum 150 FCFA.
      - **SingPay** : agrégateur créé au Gabon (Société d'Incubation Numérique du Gabon).
      Critère éliminatoire : **pas d'API de payout = pas de cagnotte versable = pas de mode payant.**
      Ton repère « 15 FCFA par transaction » : fais-le confirmer par écrit, car les tarifs publics
      des agrégateurs sont en pourcentage (2 à 2,75 %), ce qui changerait ton calcul de net (285 FCFA).
- [ ] Un **numéro de téléphone dédié** pour le compte admin (celui qui configurera les concours).

**Pourquoi cet ordre :** chaque phase suivante consomme un compte de cette liste ; les créer d'un coup
t'évite les allers-retours, et le sandbox paiement se valide pendant que le reste se construit.

---

## 3. Phase 1 — La base de données (jour 2) : je produis, tu colles

1. Je te génère `schema.sql` complet : tables `contests`, `participants`, `photos`, `reactions`,
   `reaction_weights`, `payments`, `results` + règles RLS + clôture `pg_cron` + déclencheurs de score.
2. Tu le colles dans **Supabase → SQL Editor** d'un projet de test, puis du projet réel.
3. Tu vérifies 3 lignes dans l'éditeur : `winner_pct = 85`, `organizer_pct = 15`, `min_participants = 5`.

**Pourquoi la base avant le code :** l'app n'est qu'un miroir de la base. Si les règles vivent dans la
base (barème d'émojis, pourcentages, minimum), tu changes un chiffre **sans redeployer l'app** —
exactement ta demande de « modifier à chaque moment les valeurs de chaque concours ».

---

## 4. Phase 2 — Le code de l'app (jours 3 à 5)

Deux chemins possibles, au choix :

- **Chemin A (recommandé) :** ton agent IA codeur, branché sur GitHub, reçoit en consigne :
  « construis l'app décrite dans `CAHIER-DE-SPECIFICATIONS.md` + `schema.sql`, écrans Admin / Accueil /
  Concours / Réagir / Résultat / Règles ». Il committe, tu relis sur ton téléphone.
- **Chemin B :** je t'écris le code ici, écran par écran, et tu le pousses sur GitHub
  (l'app GitHub mobile permet de téléverser des fichiers).

Points non négociables du code :
- Connexion par **numéro de téléphone + code SMS** (Supabase Auth) → 1 compte = 1 voix, anti faux comptes.
- Confirmation de paiement **uniquement par webhook serveur** (route Vercel), jamais depuis le téléphone.
- Photos dans **Supabase Storage**, bucket `photos/`, supprimées à la clôture par l'**Edge Function**
  que je te fournis.
- Compte admin = ton numéro, protégé par un code d'accès simple dans l'app (ton « côté WhatsApp »).
- Règle « le créateur participe mais ne gagne pas la cagnotte » activée par défaut, retirable en 1 ligne.

**Pourquoi maintenant :** sans base il n'y a rien à coder ; sans code il n'y a rien à héberger.

---

## 5. Phase 3 — Mise en ligne (jour 6)

1. Premier push sur GitHub → Vercel déploie automatiquement → tu reçois une URL `*.vercel.app`.
2. Dans Vercel → Settings → Environment Variables : colle l'URL Supabase, la clé `anon`,
   le secret du webhook. (Jamais dans le code.)
3. Ouvre l'URL sur ton téléphone : l'app tourne. Invite tes 20 membres.

**Pourquoi Vercel et pas un serveur :** aucun serveur à acheter ni surveiller ; chaque correction de
l'agent codeur part en ligne en 1 minute ; l'offre gratuite suffit à 20–100 utilisateurs.
⚠️ Garde en tête : le plan Hobby de Vercel est réservé à l'usage **non commercial** — tant que tu es en
`gain_mode = 0` (gratuit), tu es dans les clous ; le jour du mode payant, vérifie leurs conditions.
⚠️ Supabase gratuit met en pause les projets inactifs : lance un concours régulièrement, ou programme
une petite requête de réveil (je peux te la fournir).

---

## 6. Phase 4 — L'argent (seulement quand tu passes en payant)

Séquence d'un paiement, à connaître par cœur :

```
participant paie 300 F (Airtel/Moov) → agrégateur → webhook → route Vercel
→ Supabase marque payments.status = 'payé' → le participant est inscrit
```

```
clôture (pg_cron, toutes les 5 min) → score figé → gagnant déclaré
→ Edge Function appelle l'API cashout de l'agrégateur → 85 % du net sur le numéro du gagnant
→ 15 % restent sur ton compte marchand
```

Règles de sécurité :
- Teste d'abord en sandbox avec des montants de 1 F.
- Un paiement n'est valable que confirmé par webhook signé (secret partagé agrégateur ↔ Vercel).
- Journal public des remboursements : concours annulé (< 5 participants) → remboursement automatique
  marqué, puis exécuté par l'API cashout.

**Pourquoi si tard :** l'argent attire les tricheurs et les ennuis juridiques ; valide d'abord que le
groupe joue, puis ouvre le robinet.

---

## 7. Phase 5 — Premier concours (jour 7) en `gain_mode = 0`

- Lancement **gratuit** avec tes 20 membres : zéro risque juridique, zéro frais, zéro remboursement.
- Ce que tu observes : combien publient (≥ 1 photo ?), combien réagissent, qui revient le lendemain.
- Concours n°2 : frais **50 FCFA** (ton prix de lancement) avec cagnotte fixe 2 000 FCFA assumée comme
  coût de promotion.
- Concours n°3 et suivants : **300 FCFA**, répartition 85/15 sur le net, minimum 5 participants.

**Pourquoi commencer gratuit :** c'est ta répétition générale technique (photos, scores, clôture,
nettoyage) sans argent en jeu, et c'est exactement le réglage `gain = 0` que tu voulais garder
modifiable à chaque concours.

---

## 8. Phase 6 — Rentabiliser au-delà des frais

1. **Posts sponsorisés** dès maintenant : un commerçant paie un tarif fixe pour un encart « Sponsorisé »
   dans le fil, exclu du classement. À 20 membres, c'est probablement ta 1ʳᵉ vraie recette.
2. **AdMob** plus tard (audience grande) : bannières/native intégrées au fil, toujours identifiables,
   jamais liées aux points.
3. **Extensions du groupe** : autres salles de concours (thématiques), puis seulement élargir au-delà
   des 20 membres.

---

## 9. Calendrier indicatif (une semaine tranquille)

| Jour | Étape | Livrable |
|---|---|---|
| 1 | Comptes GitHub / Supabase / Vercel / agrégateur sandbox | Phase 0 cochée |
| 2 | `schema.sql` collé dans Supabase | Base vivante |
| 3-5 | Code de l'app (agent codeur ou moi) | Dépôt rempli |
| 6 | Push → Vercel en ligne, tests sur téléphone | URL publique |
| 7 | Concours gratuit n°1 avec les 20 membres | Preuve que ça marche |
| 8+ | Concours 50 F puis 300 F, premiers sponsors | Revenus |

---

## 10. Ce que tu peux me demander à tout moment (phrases déclencheurs)

- « Génère le schema.sql » → je produis le fichier SQL complet.
- « Écris l'Edge Function de nettoyage » → suppression des fichiers Storage à la clôture.
- « Écris l'écran Accueil / Admin / Résultat » → code de l'écran, prêt à pousser.
- « Exporte la maquette en PNG » → images partageables depuis ton téléphone.
- « Compare-moi les agrégateurs gabonais » → tableau frais payin/payout à jour.
- « Note juridique Gabon » → synthèse du cadre loteries/jeux d'argent + règles Google Play.
- « Réveille-moi Supabase » → petite routine anti-pause du plan gratuit.

---

## 11. Les 4 pièges à éviter avant de grossir (rappel)

1. **Vercel Hobby = non commercial** → à reconsidérer dès que les frais payants coulent.
2. **Supabase gratuit = pause après inactivité** → concours interrompu = membres fâchés.
3. **Agrégateur sans payout** = tu encaisses mais tu ne peux pas payer le gagnant.
4. **Cadre juridique gabonais** : participation payante + gain en argent peut relever des loteries/jeux
   d'argent (les paris sportifs sont sous licence). Une consultation unique chez un juriste local
   avant de passer en 300 FCFA à grande échelle. Je ne suis pas juriste.
