# Le Salon — jeu de 54 cartes

Création originale : 52 faces françaises (A, 2–10, V, D, R), deux jokers distincts et un dos bleu nuit / or symétrique. Les figures sont réversibles ; les cartes 2–10 portent leur nombre exact d'enseignes.

- `LeSalon_Card.glb` : modèle exporté avec as de pique, dos et tranche ; trois matériaux sémantiques compatibles avec `SalonTable3DModelPack`.
- `S-1.png` … `C-13.png`, `joker-0.png`, `joker-1.png` : 54 faces 630 × 920 px.
- `back.png` : dos commun.
- `deck-preview.png`, `table-preview.png` : aperçus de contrôle.

Le modèle est centré, face sur +Z, hauteur sur Y. Dimensions internes : 1,22 × 1,78 × 0,0068, correspondant approximativement à 63 × 92 × 0,35 mm. Coins arrondis, biseau périphérique, UV distincts au recto et au verso ; 352 triangles. Aucun modificateur requis.

Le site utilise directement la même géométrie dans `shared/playing-card.js`, sans téléchargement GLB supplémentaire. Les faces sont dessinées à la demande et mises en cache dans le renderer. Un grain de papier partagé ajoute un microrelief au matériau satiné. Les modèles externes enregistrés restent prioritaires. Les cartes adverses conservent le dos sur les deux faces : retourner leur modèle ne révèle aucune information.

`shared/playing-card.js` est la source éditable du modèle et des illustrations vectorielles. Pour régénérer les PNG, le GLB et les aperçus depuis cette source :

```sh
cd tests/table
CARD_EXPORT=1 node --test playing-card.test.mjs
```

Playwright Chromium doit être installé ; `TABLE_BROWSER_EXECUTABLE` peut désigner un Chromium existant. Le GLB transporte les textures recto/verso ; le micrograin partagé est ajouté par le renderer du site.
