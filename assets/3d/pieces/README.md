# Pièces physiques Le Salon

Dix modèles originaux sont intégrés au renderer, construits à partir de `shared/table-3d-pieces.js` et exportés individuellement en GLB :

| Fichier | Modèle |
| --- | --- |
| die.glb | Dé en résine, angles arrondis, points géométriquement creusés et pigmentés |
| pawn.glb | Pion tourné laqué avec semelle feutrée |
| rummikub-tile.glb | Tuile arrondie, matériaux recto/dos/tranche sémantiques |
| metropole-house.glb | Maison avec toit à deux pans, porte et fenêtres |
| metropole-owner-marker.glb | Marqueur de propriété, tige métallique et couleur du joueur |
| code-gem.glb | Gemme taillée à huit facettes |
| golf-ball.glb | Balle avec 180 alvéoles géométriques |
| golf-obstacle.glb | Obstacle rocheux facetté |
| golf-portal.glb | Bord métallique du trou |
| balloon.glb | Enveloppe de ballon ovoïde satinée |

Les GLB sont des modèles de référence : dé exporté sur 5, couleurs représentatives et tuile sans numéro. Le renderer fournit les numéros des tuiles, les couleurs des joueurs et le résultat de chaque dé. Le nœud du ballon reste celui de la scène existante.

Les faces du dé restent complémentaires à 7 ; la face +Y porte le résultat autoritatif. Les points sont réalisés dans la géométrie et les couleurs de sommets, sans texture externe. Les cartes et tuiles masquées restent masquées lorsque retournées.

Le pack interne conserve un cache de géométries et de matériaux, détruit avec le renderer. Chaque instance possède ses propres transformations. Les factories GLB enregistrées par l'utilisateur restent prioritaires sur ce pack.

Régénération : `PIECE_EXPORT=1 node --test physical-pieces.test.mjs` depuis `tests/table`, avec Chromium Playwright installé (ou `TABLE_BROWSER_EXECUTABLE`).
