# Mik-ver Universal group²oste

Concours photo de 24 h façon « groupe WhatsApp » : publications, réactions émoji
pondérées, classement, un seul gagnant, nettoyage automatique, relance.

## Contenu du dépôt

```
supabase/schema.sql      Schéma Supabase complet (règles métier côté base)
docs/                    Cahier des specs, feuille de route, mémo clés & accès
assets/logo/             Logo officiel + déclinaisons (icône app, favicon)
(api/ , index.html …)    Code de l'app — arrive au prochain commit
```

## Stack

Supabase (base + storage + auth téléphone) · Vercel (hébergement + fonctions serveur)
· GitHub (dépôt) · agrégateur mobile money (encaissements + versement gagnant, webhook serveur)

## Règles clés (rappel)

- 5 photos max/personne/concours · suppression = perte des points, bloquée les 3 dernières heures
- 1 réaction de chaque type max par photo, jamais sur sa propre photo · barème modifiable en base
- Classement = meilleure photo de chaque personne · égalité = première arrivée · 1 seul gagnant
- `gain_mode` 0 = gratuit / 1+ = payant (frais, % gagnant, % organisateur, minimum configurables par concours)
- Clôture automatique toutes les 5 min · annulation + remboursement sous le minimum de participants
- L'admin participe mais ne gagne pas (`can_win = false`) · journal public des actions

## Statut

🚧 V1 en construction — schéma SQL prêt, app en cours de codage.
