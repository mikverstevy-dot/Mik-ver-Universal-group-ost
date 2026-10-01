# Mik-ver Universal group²oste — Cahier de spécifications (état des lieux)

> Document de synthèse consolidé à partir de la conversation Claude partagée
> et du fichier `Mik-ver Universal group²oste (1).html`.
> Date de consolidation : 1er octobre 2026.

---

## 1. Concept en une phrase

Un « groupe WhatsApp » spécifique : une salle de concours temporaire de **24 heures**,
où les membres publient des photos, les autres réagissent avec des émojis pondérés,
le score définit un classement, **un seul gagnant**, puis tout est nettoyé et on peut relancer.

Le cycle : **Admin configure → concours 24 h → photos → réactions → classement → clôture → nettoyage → relance**

---

## 2. Règles métier validées

### 2.1 Publications
- Un compte peut publier **n photos, plafond 5**.
- Un compte peut **supprimer une de ses photos** pour la remplacer par une meilleure.
- Les points (réactions) **partent avec la photo supprimée**.
- Suppression **bloquée pendant les 3 dernières heures** du concours (anti-perturbation du classement).

### 2.2 Réactions (pondérées)
| Réaction | Points |
|---|---|
| ❤️ Cœur | 5 |
| 😂 Rire | 4 |
| 😮 Surprise | 3 |
| 🥺 Pitié | 2 |
| 😱 Peur | 2 |
| 😢 Tristesse | 1 |

- **Une seule réaction de chaque type** par personne et par photo → contrainte d'unicité `(compte, photo, type)`.
- Plusieurs types différents sur une même photo = autorisé.
- **Jamais sur sa propre photo.**
- Aucune réaction ne retire de points (sinon sabotage possible).
- Barème stocké dans une table modifiable **sans toucher au code**.

### 2.3 Classement
- Compte **la meilleure photo de chaque personne** (sinon celui qui publie le plus gagne, pas celui qui a la meilleure photo).
- **Égalité** : la photo qui a atteint le score **en premier** gagne.
- **1 seul gagnant** : le 1er.

### 2.4 Clôture automatique
- Tâche automatique **toutes les 5 minutes** (pg_cron) qui ferme les concours terminés.
- Si le **minimum de participants** n'est pas atteint → concours **annulé et marqué à rembourser**.
- Sinon → calcul de la cagnotte, conservation du résultat (gagnant + score), puis **suppression des photos et réactions**.
- Les **fichiers images** dans Storage doivent être supprimés par une **Edge Function** (le SQL ne supprime que les lignes).

---

## 3. Modèle économique

### 3.1 Deux modes, configurables par concours
- **`gain_mode = 0` → GRATUIT** : frais 0, cagnotte 0, organisateur 0 %.
- **`gain_mode = 1` (ou plus) → PAYANT** : frais `f`, gagnant `w` %, organisateur `o` %.

Volonté affichée : garder longtemps la possibilité de lancer en **0 / 0 / 0**,
et basculer en payant quand le groupe grossit.

### 3.2 Répartition retenue
- **Gagnant : 85 %**
- **Organisateur : 15 %**
- Calcul sur le **net** : frais − 15 FCFA de frais prestataire.
  - Exemple : 300 FCFA de frais → **285 FCFA nets** par participant.
- **Minimum de participants : 5** (sous ce seuil → annulation + remboursement).

### 3.3 Frais de participation
- **300 FCFA** en régime normal.
- **50 FCFA** uniquement pour le **premier lancement** (coût de promotion, limité à un concours).
- Cagnotte fixe de référence au départ : **2 000 FCFA** (remplacée depuis par le calcul en %).

### 3.4 Projections (net = 285 FCFA × participants)
| Participants | Net | Gagnant 85 % | Organisateur 15 % |
|---|---|---|---|
| 7 | 1 995 | 1 695 | 300 |
| 20 | 5 700 | 4 845 | 855 |
| 50 | 14 250 | 12 112 | 2 138 |

Le gagnant reçoit ≈ **16 fois sa mise** à 20 participants → très attractif pour le bouche-à-oreille.
Recettes organisateur : ≈ 25 000 FCFA/mois (1 concours/jour à 20 participants), ≈ 64 000 FCFA/mois à 50.

### 3.5 Autres sources de revenus
1. **Posts sponsorisés** (probablement la meilleure source à 20 utilisateurs, avant AdMob) :
   marqués « Sponsorisé », **exclus du classement**, tarif fixe selon la durée d'affichage.
2. **AdMob** plus tard : intégré dès maintenant, mais ne rapportera presque rien à cette taille.
   - ❌ Interdit d'inciter aux clics ou de récompenser un clic (trafic incorrect).
   - ❌ Interdit de camoufler l'annonce en publication utilisateur → doit rester identifiable.
   - ✅ Formats natifs intégrés au flux, avec la mention « Ad / Sponsor ».
   - Les deux compteurs ne se mélangent **jamais** : ❤️ réactions → classement / 👆 pub → revenus.
3. **Créateur participant** : il participe comme un habitant du groupe, mais une règle
   l'**empêche de gagner la cagnotte** (crédibilité). Journal public des suppressions/résultats conseillé.

---

## 4. Stack technique (100 % gratuite au départ)

| Rôle | Outil | Point de vigilance |
|---|---|---|
| Code / versions | GitHub | — |
| Génération du code par IA | agents IA + Claude Code (via la plateforme citée en conversation) | — |
| Hébergement | Vercel | ⚠️ Le plan **Hobby est réservé à un usage non commercial** → à vérifier dès que tu encaisses des frais |
| Base + auth + storage | Supabase | ⚠️ Le projet gratuit est **mis en pause après inactivité** → gênant en plein concours |
| Paiements mobile money | Agrégateur (Cardflux / « Boulié »), ≈ 15 FCFA par transaction | ⚠️ Vérifier qu'il gère aussi les **retraits** (payer le gagnant), pas seulement les dépôts |
| Tâches planifiées | pg_cron (Supabase) | — |
| Nettoyage des fichiers | Supabase Edge Function | À écrire |

**Paiement : la confirmation doit arriver côté serveur (webhook), jamais depuis le téléphone.**

Contexte de taille actuel : **≈ 20 utilisateurs maximum**, soit au plus 100 photos →
les offres gratuites suffisent largement.

---

## 5. Maquette HTML actuelle (4 écrans)

Fichier : `Mik-ver Universal group²oste (1).html` (13 Ko, autonome, lisible sur téléphone).

1. **Écran 0 — Admin** : choix Gratuit / Payant, puis `f` (frais), `w` (% gagnant), `o` (% organisateur), `m` (minimum), bouton « Lancer le concours ».
2. **Écran 1 — Accueil** : cagnotte `x FCFA`, participants `y`, frais **300 FCFA**, total net `z`, gagnant 85 %, organisateur 15 %, bouton « Participer ».
3. **Écran 2 — Concours** : temps restant `t h`, classement des 6 premiers, grille de photos à 3 colonnes avec `a…h pts`, bloc « Sponsorisé » entre deux rangées, case « ➕ Ajouter », barre « Ajoute une légende » + bouton 📷.
4. **Écran 3 — Réagir** : la photo, son score `x pts`, les 6 émojis avec leurs points.

Identité visuelle : logo **M∞** en dégradé `#0066cc → #cc33ff`, fond clair `#f5f5f5`, accents bleu `#0066cc`, bloc sponsorisé ambre.

---

## 6. Points ouverts / à trancher

| # | Sujet | État |
|---|---|---|
| 1 | **Logo réel** (photo fournie à Claude, masquée dans le partage) | La maquette utilise un logo CSS « M∞ ». À régénérer ou à réintégrer. |
| 2 | **Accès admin** | Tu as évoqué « un code, ou le plus simple possible » → pas encore défini. |
| 3 | **Écran Admin** | Les variables sont affichées en texte (`f`, `w`, `o`, `m`) au lieu de champs de saisie. |
| 4 | **Schéma SQL** | Rédigé dans la conversation Claude mais **non livré en fichier** ici. À produire. |
| 5 | **Export image** | Tu voulais une vraie génération d'image PNG de la maquette. Claude n'a pas pu. |
| 6 | **Cadre juridique au Gabon** | Participation payante + gain en argent peut relever des jeux d'argent/loteries. Les paris sportifs sont sous licence. À faire vérifier (je ne suis pas juriste). |
| 7 | **Écran « Règles du concours »** | Proposé, jamais créé : réactions, 5 photos, égalité, suppression. |
| 8 | **Écran « Résultat / gagnant »** | Proposé, jamais créé. |
| 9 | **Edge Function de nettoyage Storage** | « L'étape suivante » annoncée, jamais écrite. |

---

## 7. Prochaines étapes logiques

1. Produire le **schéma Supabase complet** en fichier `.sql` (participants, contests, photos, reactions, reaction_weights, payments, results, RLS, pg_cron).
2. Écrire l'**Edge Function** de suppression des fichiers Storage à la clôture.
3. **Finaliser la maquette** : écran Admin avec vrais champs, écran Règles, écran Résultat, logo.
4. **Exporter en PNG/PDF** pour partager.
5. Vérifier les **3 points de vigilance gratuits** (Vercel Hobby, pause Supabase, retraits du prestataire).
6. Consulter sur le **cadre juridique gabonais** avant de passer en payant à grande échelle.
