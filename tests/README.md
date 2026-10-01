# Tests d’intégration Mik-ver

Exécute le VRAI `app.js` et les VRAIES fonctions `/api/*` du dépôt contre un mock Supabase
qui reproduit les règles du `schema.sql` (5 photos, réactions pondérées uniques, propre photo,
blocage 3 h, poubelle storage, clôture, admin exclu du gain).

```
npm install
npm test
```

34 tests. À relancer après chaque modification de `app.js` ou des fonctions `api/`.
