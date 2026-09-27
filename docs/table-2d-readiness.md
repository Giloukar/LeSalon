# Préparation de la neutralité du rendu

Base de travail au 27 septembre 2026 : les contrats de caractérisation, l’identité des sièges invités, l’expiration des pendules et la neutralité temporelle de `renderGame()` sont fusionnés. Le contrôleur de vue est introduit sans activer encore de renderer 3D.

## Architecture constatée

Le moteur historique reste principalement dans `jeux.html` et les dernières affectations restent déterminantes : le 8 américain, Cactus et l’Oie possèdent leurs moteurs restaurés finaux. `dispatch()` reste le chemin des actions ordinaires. `renderGame()` est maintenant neutre vis-à-vis des pendules et sa fonction 2D finale est enregistrée comme renderer de base dans `SalonTableView`.

En ligne, l’hôte possède net.state. Chaque client affiche S, une projection privée produite par projectGame. Les cartes adverses et la pioche sont masquées dans cette projection. PeerJS/WebRTC transporte les commandes ; le choix d’affichage ne doit jamais entrer dans ce protocole, dans net.state ou dans Supabase.

## Résultats reproductibles

Le harness charge le vrai document, y compris les surcharges finales, avec une horloge, un RNG et un transport de test déterministes.

- Les 22 définitions survivent à cinq rendus successifs sans action.
- Une trace IA reste identique avec ou sans trois rendus entre les actions.
- Aucun refresh de ces scénarios n’envoie de paquet ou ne consomme un tirage supplémentaire.
- `renderGame()` est désormais neutre vis-à-vis des pendules : un rendu répété ne débite plus le temps. La réconciliation appartient à l’orchestration de session (`schedule()`, tick métier, publication, pause et sauvegarde).
- La dernière surcharge `handleGuestAction(packet,index)` conserve désormais l’index du siège authentifié et délègue les actions normales avec cet index.
- La branche Cactus online utilise désormais le siège authentifié et `seat.lastSeq` pour son jet rapide hors tour ; un siège 2 ne peut plus être traité comme le siège 1.
- `clockExpire` utilise désormais un chemin de règles actif : `houseEightAct` pour le 8, `legacyGooseAct` pour l’oie et le moteur historique approprié pour les autres jeux minutés. Une expiration sous attaque cumulée du 8 applique donc bien toute la pénalité et efface l’attaque.

Ces comportements sont désormais couverts par les contrats Playwright. Le contrôleur de vue ajoute en plus des contrats de bascule locale : aucun changement de renderer ne doit modifier l’état, le RNG ou les paquets réseau.

## Frontières à préserver

La pendule doit être initialisée et réconciliée à la création, au démarrage, après un coup accepté, dans le tick métier de 250 ms, lors des transitions pause/gate/visibilité, pour les snapshots online, et au moment des sauvegardes/reprises. Un refresh, un tri, une sélection ou un futur changement de renderer ne doit provoquer aucune de ces transitions.

schedule et motionWait mélangent aujourd’hui délai d’IA et deadline d’animation. Pour l’Oie, dispatch diffère aussi le lancer et les deux tirages RNG selon l’animation. Ouvrir une modal pendant cette attente annule le timer et busy sans tirer les dés. Une extraction doit conserver ces annulations et délais avant de séparer la cadence de session du renderer.

Cactus possède un chemin UI direct parce que le jet rapide est autorisé hors tour ; le faire passer aveuglément par canPlay/dispatch serait une régression. En ligne, l’invité doit envoyer une seule commande et attendre la projection autoritaire. Le prochain correctif doit préserver owner, index, null slots, séquences, révisions, pause, pending et spectateur.

Math.random sert aux distributions, décisions IA, dés et règles, mais aussi aux confettis, particules, puff, catalogue et temporisations de reconnexion. Cette PR ne remplace aucun appel. Une future séparation devra introduire un visualRandom privé, sans consommer le RNG métier, puis migrer uniquement les effets prouvés visuels.

## Contrôleur de vue local

`shared/table-view.js` possède la préférence locale de présentation et le registre des renderers. Le renderer `2d` est la couche de base permanente : il continue d’être synchronisé même lorsqu’un futur renderer 3D sera actif. Cette stratégie garde le DOM 2D prêt comme fallback instantané et préserve les contrôles existants.

Le contrôleur ne lit ni `net.state` ni Supabase et n’écrit aucun champ dans `S`. Il reçoit uniquement la projection courante déjà autorisée dans `S`. Un changement de vue est annulable : une préparation 3D asynchrone terminée après un retour en 2D ne peut pas réactiver tardivement la 3D.

La préférence est stockée sous `salon_table_view_v1`. Elle n’appartient ni à la sauvegarde de partie, ni aux messages PeerJS/WebRTC, ni au profil cloud. Le mode 3D n’est pas encore enregistré dans l’interface utilisateur tant qu’un renderer 3D fonctionnel n’existe pas.

## Découpage recommandé

1. Valider et fusionner le View Controller local avec la 2D comme renderer de base permanent.
2. Séparer la cadence métier des délais purement visuels, notamment le lancer différé de l’Oie.
3. Introduire un hasard visuel indépendant pour les effets et les futurs placements 3D.
4. Construire le renderer Three.js générique avec des meshes procéduraux de remplacement et un fallback automatique 2D.
5. Brancher le 8 américain comme premier jeu 3D sans modifier son moteur ni son protocole d’action.
6. Généraliser ensuite cartes, dés, pions et tuiles aux autres jeux.

La vue 2D reste la référence fonctionnelle, la couche sémantique et le fallback permanent. Les modèles 3D externes ne sont pas encore requis : des géométries procédurales suffiront jusqu’à la phase de finition visuelle.


## Premier renderer Three.js — 8 américain

Le premier renderer 3D est volontairement procédural et ne dépend d’aucun modèle externe. Il est chargé à la demande par `shared/table-3d-loader.js`, qui importe `shared/table-3d.js` uniquement lorsqu’un utilisateur demande la vue 3D. Les utilisateurs restant en 2D ne chargent donc ni Three.js ni les ressources du renderer.

Le prototype couvre :
- table 3D, caméra perspective, éclairage et ombres ;
- cartes avec faible épaisseur et textures Canvas mises en cache ;
- dos de cartes, pioche, défausse, main locale en éventail et mains adverses masquées ;
- dérivation des cartes jouables depuis `eightLegal()` sans réimplémenter les règles dans Three.js ;
- clic et glisser-déposer d’une carte vers la défausse ;
- clic sur la pioche ;
- retour vers `eightPlayCardUI()` et `dispatch()`, donc exactement le même moteur en 2D et 3D ;
- choix de couleur toujours géré par l’UI métier existante ;
- désactivation des interactions 3D pendant ce choix ;
- état de confidentialité local non transmis au renderer (`state: null` lorsque `gate` est actif) ;
- spectateurs sans reconstruction de main privée ;
- perte WebGL ou échec de chargement ramenant localement en 2D.

Le switch 2D/3D a d’abord été validé sur le 8 américain, puis étendu progressivement aux jeux dont la projection 3D est explicitement adaptée. Les modèles finaux ne sont pas encore nécessaires : les géométries procédurales restent des remplaçants sûrs jusqu’à la phase de finition.


## Dice3D et Jeu de l’oie

Le renderer commun couvre désormais une deuxième famille de jeux : plateau + pions + dés.

Pour le Jeu de l’oie :
- les 63 coordonnées viennent de `CELL_COORDS` existant ;
- les destinations autorisées viennent de `legacyGooseTarget()` ;
- les valeurs des dés viennent exclusivement de `S.dice` ;
- les dés 3D tournent visuellement mais terminent sur les valeurs déjà décidées par le moteur ;
- les cases autorisées sont éclairées et cliquables ;
- les pions utilisent `S.path` pour suivre visuellement le déplacement déjà résolu par les règles ;
- grains, cases Oie et cases spéciales sont des représentations de données fournies au renderer, pas une seconde implémentation des règles ;
- le renderer Three.js n’utilise aucun `Math.random()`.

Cette couche `Dice3D` et les géométries de pion/tile sont conçues pour être réutilisées ensuite par Yam, Ferme la boîte et les autres jeux concernés.


## Réutilisation Dice3D — Yam et Ferme la boîte

La même primitive de dé est réutilisée sans nouvelle logique aléatoire.

Pour Yam :
- les cinq valeurs viennent directement de `S.dice` ;
- les dés conservés viennent de `S.held` et sont signalés par un support visuel ;
- toucher un dé appelle l’action `hold` existante ;
- « Lancer / Relancer » appelle l’action `roll` existante ;
- les catégories et leur score restent dans l’interface 2D synchronisée et sont toujours calculés par `yamScore()`.

Pour Ferme la boîte :
- les dés viennent de `S.boxDice` ;
- les volets ouverts viennent de `S.boxNumbers` ;
- sélectionner un volet ne modifie que la sélection UI locale ;
- le moteur `playBox()` reste seul responsable de valider que la somme choisie égale le lancer ;
- la possibilité de lancer un seul dé est dérivée de l’état existant (7, 8 et 9 fermés), sans règle dupliquée dans Three.js.

Le `pointercancel` du renderer est désormais générique : il resynchronise le jeu actif au lieu de supposer qu’il s’agit du 8 américain.


## Renderer générique de jeux de cartes

La primitive de carte créée pour le 8 américain sert désormais de base commune à cinq jeux supplémentaires : Président, Menteur, Quatre suites, Chasse aux plis et Enchères.

Le renderer ne contient aucune règle propre à ces jeux. Le pont dans `jeux.html` fournit :
- la main visible déjà autorisée par la projection ;
- les IDs sélectionnables ;
- les IDs jouables lorsqu’une règle existante sait les calculer (`suitesLegal()`, `tricksLegal()`) ;
- la sélection UI locale ;
- une description minimale du centre de table.

Toucher une carte 3D appelle uniquement `cardSelect(id)`, qui reproduit la sélection locale existante. Le coup n’est pas envoyé et l’état métier n’est pas modifié à ce moment-là. Les boutons habituels restent responsables de la validation finale par le moteur.

Adaptations de centre de table :
- Président : pli actuel, révolution et joueurs ayant passé ;
- Menteur : tas face cachée, annonce courante et éventuelles cartes révélées ;
- Quatre suites : quatre rangées issues directement de `S.lanes` ;
- Chasse aux plis : cartes du pli courant ou du dernier pli, avec atout fourni par l’état ;
- Enchères : lot courant et enchères telles qu’elles existent dans la projection cliente.

Pour Enchères, un bid adverse projeté sous la forme `{hidden:true}` reste un simple dos de carte dans Three.js. Le renderer ne tente jamais de retrouver sa valeur depuis un identifiant ou depuis l’état hôte.
