# CinéToulouse

Agrégateur & calendrier des séances cinéma à **Toulouse et sa métropole** (13 salles), orienté **films cultes, patrimoine, rétrospectives et Art & Essai**, avec intégration **Letterboxd** (notes, affiches, Watchlist) et export en 1 clic vers **Google Agenda**.

## Lancement en local (Bun + SQLite)

```bash
bun install
bun run sync     # scrape les 13 cinémas, enrichit Letterboxd et exporte public/data/program.json
bun run build    # compile le frontend Vite
bun run start    # lance l'app sur http://localhost:3001
```

## Déploiement sur Vercel

Le projet fonctionne en **zéro configuration** sur Vercel :
- Le frontend Vite lit la programmation pré-générée depuis `/data/program.json` (`public/data/program.json`).
- La synchronisation de ta **Watchlist Letterboxd** passe par la fonction serverless Node.js [`api/watchlist/sync.ts`](./api/watchlist/sync.ts) et reste enregistrée localement dans ton navigateur (`localStorage`). L’import `watchlist.csv` fonctionne également 100 % côté client.
- Le workflow GitHub Actions [`.github/workflows/sync-program.yml`](./.github/workflows/sync-program.yml) met à jour `public/data/program.json` automatiquement chaque matin à `06h15 UTC` (et manuellement via *Actions → Run workflow*), déclenchant un redéploiement Vercel automatique.

Aucune variable d'environnement ni base de données externe n'est requise.
