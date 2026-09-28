# Caractérisation 2D

Ces tests chargent le vrai jeux.html dans Chromium avec ses surcharges finales. Ils n’ajoutent aucun état au jeu et ne modifient aucune règle.

## Exécuter

Depuis ce dossier :

    pnpm install
    pnpm exec playwright install chromium
    pnpm test

La CI installe Chromium avec ses dépendances système. La variable TABLE_BROWSER_EXECUTABLE permet d’utiliser un Chrome local.

Le harness fige l’horloge et le hasard dans le navigateur de test, enregistre les timers, intercepte les ressources externes et remplace le transport par un espion. Aucun salon PeerJS, compte, appel Supabase ou stockage utilisateur réel n’est utilisé.

## Ce qui est vérifié

- les 22 définitions de jeu et plusieurs rendus successifs ;
- une trace IA identique avec ou sans rendus supplémentaires ;
- l’absence de paquets et de tirages RNG ajoutés par un refresh ;
- la projection online et les surcharges finales réellement chargées ;
- la reproduction de la pendule modifiée par le rendu ;
- le contrat d’identité du siège invité, y compris le jet rapide Cactus hors tour.

Le scénario de pendule reste un diagnostic du comportement actuel. Les scénarios d’identité de siège sont désormais des contrats de régression. Les tests ne valident pas exhaustivement les règles, le drag, WebRTC réel, l’audio, le puff ou la qualité visuelle.

Voir le diagnostic d’architecture dans docs/table-2d-readiness.md.

`puff-model.test.mjs` vérifie aussi dans Chromium/WebGL le chargement du modèle
commun sans capuchon, les quatre habillages et goûts conservés, la transparence,
le socle argenté invariant, l’écran et les actions de tirage. Les modules Three.js
0.169.0 sont servis localement par le test, sans dépendre du CDN. Pour conserver
les quatre rendus de contrôle, définir `PUFF_SCREENSHOT_DIR` vers un dossier existant.
