# Préparation de la neutralité du rendu

Base contrôlée le 27 septembre 2026 : main à c60116b5392119aa733519b6816a7d4b380c2055, aucune PR ouverte au contrôle initial. Cette PR ne modifie pas jeux.html et reste 100 % 2D.

## Architecture constatée

Tout le moteur et le rendu sont dans jeux.html. Les dernières affectations sont déterminantes : createGame est surchargé pour les pendules, le 8 américain est restauré après l’implémentation initiale, puis Cactus et Oie remplacent encore createGame, act et ai. renderGame construit le DOM mais ses wrappers finaux appellent clockInit et reconcileTiming. dispatch reste le chemin des actions ordinaires ; la branche Oie différée met busy à true et consomme les dés dans un timeout.

En ligne, l’hôte possède net.state. Chaque client affiche S, une projection privée produite par projectGame. Les cartes adverses et la pioche sont masquées dans cette projection. PeerJS/WebRTC transporte les commandes ; le choix d’affichage ne doit jamais entrer dans ce protocole, dans net.state ou dans Supabase.

## Résultats reproductibles

Le harness charge le vrai document, y compris les surcharges finales, avec une horloge, un RNG et un transport de test déterministes.

- Les 22 définitions survivent à cinq rendus successifs sans action.
- Une trace IA reste identique avec ou sans trois rendus entre les actions.
- Aucun refresh de ces scénarios n’envoie de paquet ou ne consomme un tirage supplémentaire.
- Le rendu local et hôte débite aujourd’hui une pendule active de 4 000 ms ; un invité n’est pas autorité et ne la débite pas.
- La dernière surcharge `handleGuestAction(packet,index)` conserve désormais l’index du siège authentifié et délègue les actions normales avec cet index.
- La branche Cactus online utilise désormais le siège authentifié et `seat.lastSeq` pour son jet rapide hors tour ; un siège 2 ne peut plus être traité comme le siège 1.
- clockExpire utilise V10_ACT. Sous une attaque de six dans le 8, il ne pioche qu’une carte et conserve l’attaque alors que l’actuelle règle restaurée pioche six et l’efface.

Les trois derniers points sont des diagnostics séparés des tests requis. Ils ne sont pas corrigés dans cette PR.

## Frontières à préserver

La pendule doit être initialisée et réconciliée à la création, au démarrage, après un coup accepté, dans le tick métier de 250 ms, lors des transitions pause/gate/visibilité, pour les snapshots online, et au moment des sauvegardes/reprises. Un refresh, un tri, une sélection ou un futur changement de renderer ne doit provoquer aucune de ces transitions.

schedule et motionWait mélangent aujourd’hui délai d’IA et deadline d’animation. Pour l’Oie, dispatch diffère aussi le lancer et les deux tirages RNG selon l’animation. Ouvrir une modal pendant cette attente annule le timer et busy sans tirer les dés. Une extraction doit conserver ces annulations et délais avant de séparer la cadence de session du renderer.

Cactus possède un chemin UI direct parce que le jet rapide est autorisé hors tour ; le faire passer aveuglément par canPlay/dispatch serait une régression. En ligne, l’invité doit envoyer une seule commande et attendre la projection autoritaire. Le prochain correctif doit préserver owner, index, null slots, séquences, révisions, pause, pending et spectateur.

Math.random sert aux distributions, décisions IA, dés et règles, mais aussi aux confettis, particules, puff, catalogue et temporisations de reconnexion. Cette PR ne remplace aucun appel. Une future séparation devra introduire un visualRandom privé, sans consommer le RNG métier, puis migrer uniquement les effets prouvés visuels.

## Découpage recommandé

1. Isoler l’expiration des pendules de la référence V10_ACT sans modifier bonus, réserve ou rythme.
2. Déplacer la réconciliation des pendules hors de renderGame après tests de chaque frontière de session.
3. Séparer la cadence métier, les délais visuels et le hasard visuel.
4. Unifier Cactus dans un chemin de commande commun en conservant l’exception hors tour.

Le ViewController et le Renderer3D restent bloqués jusqu’à ce que renderGame soit une lecture de S et que ces invariants soient testés. La vue 2D reste la référence fonctionnelle et le fallback permanent.
