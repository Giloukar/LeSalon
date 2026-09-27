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


## Adaptateurs 3D — Pouilleux, 99, Vingt-et-un et Bataille

Ces quatre jeux réutilisent les mêmes cartes procédurales mais gardent des adaptateurs distincts, car leur interaction centrale diffère.

Pouilleux :
- la main propre reste visible ;
- la main cible n’est représentée que par des dos de cartes et des indices de position ;
- toucher un dos appelle l’action `pick(index)` existante.

99 :
- le total, le sens et la dernière carte viennent de l’état ;
- la 3D ne fait que sélectionner une carte localement ;
- les choix As +1/+11 et la validation restent entièrement dans `play99()` et les commandes existantes.

Vingt-et-un :
- la main locale et la banque sont représentées depuis un payload explicitement filtré ;
- tant que `dealerRevealed` est faux, toute carte de banque après la première devient `{hidden:true}` dans le payload 3D, y compris en local ;
- la phase de mise conserve le panneau 2D existant pour ne pas dupliquer les contrôles de jetons.

Bataille :
- les paquets joueurs sont uniquement représentés par leur taille et des dos ;
- `battleReveal` est désormais aussi filtré dans `projectGame()` : une carte de guerre face cachée ne transporte plus sa valeur dans la projection cliente ;
- seules les cartes `hidden:false` peuvent être dessinées face visible ;
- l’action `battle` reste le seul déclencheur du moteur.

Cette PR renforce donc la confidentialité réseau de Bataille indépendamment de la 3D.

## Métropole 3D

Métropole réutilise désormais les primitives de plateau, pion et dés sans recopier son moteur économique.

Le payload 3D expose uniquement :
- les 24 cases et leurs métadonnées publiques ;
- propriétaires, maisons et hypothèques ;
- positions, soldes et statut de détention des joueurs ;
- les deux dés déjà décidés par le moteur ;
- la phase, le tour de table et les informations publiques d’achat/dette.

Le paquet d’événements reste supprimé par `projectGame()` en online et n’est jamais reconstruit par le renderer. La seule action directement déclenchée depuis le plateau 3D est `roll`, qui repasse par `dispatch()`. Achat, refus, hypothèque, construction, vente de maison, dette et faillite restent dans les contrôles 2D existants afin de conserver une seule implémentation des règles.

Le plateau 3D matérialise les rues, les couleurs de groupes, les propriétaires, jusqu’à trois maisons, les pions et les dés. Aucun modèle externe n’est requis à ce stade : ces éléments sont procéduraux et pourront être remplacés plus tard par des assets GLB sans changer le protocole de jeu.


## Écho néon 3D

Écho néon est le premier jeu d’arcade migré vers la couche Three.js. La scène utilise quatre pads lumineux procéduraux qui pourront être remplacés plus tard par des modèles GLB sans modifier le protocole d’interaction.

La 3D reste une vue du moteur existant :
- « À moi · cacher » délègue à l’action `memorized` ;
- toucher un pad délègue à `pad(index)` ;
- « Continuer » délègue à `continue` ;
- scores, manche, tour et résultat proviennent exclusivement de l’état du jeu.

La confidentialité est volontairement plus stricte que l’état solo brut : la séquence complète n’est exposée au renderer 3D que pendant la phase `watch` du joueur actif, puis à nouveau pendant `result`. Pendant `repeat`, le renderer ne reçoit que la longueur publique de la séquence et la progression saisie. Il ne peut donc pas lire la réponse correcte pour construire l’animation ou l’interface.


## Bulle ou double 3D

Bulle ou double dispose maintenant d’une scène Three.js jouable avec un ballon procédural, une jauge de risque et les commandes Gonfler, Encaisser et Continuer. Le ballon et ses fragments restent des placeholders remplaçables ultérieurement par un asset GLB/Astra sans changer les actions du jeu.

Le renderer ne tire aucun nombre aléatoire pour décider du résultat d’un souffle. Il affiche uniquement `pumps`, `pot`, `burst` et le risque dérivé de l’état. L’action `pump` repasse par `dispatch()`, donc le seul tirage qui puisse provoquer l’éclatement reste celui de `playArcade()` sur l’état autoritaire de l’hôte.

Le contrat Playwright vérifie également que plusieurs rendus 3D consécutifs ne consomment aucun appel à `Math.random()`, alors qu’un souffle moteur en consomme exactement un.


## Projection de confidentialité du payload 3D

La couche 3D ne reçoit désormais plus l’état moteur brut en solo/local. Avant d’être transmis au renderer, `state` passe par `projectGame()` avec l’index privé courant. En online, l’état déjà projeté est simplement cloné.

Cette frontière protège notamment les mains adverses et les réponses internes des jeux d’arcade. Par exemple, pendant la phase `repeat` d’Écho néon, la séquence reste présente dans l’état autoritaire utilisé par le moteur mais elle est absente à la fois de `viewData.echo.sequence` et de `payload.state.sequence`.


## Lettres en folie 3D

Lettres en folie utilise désormais des tuiles 3D procédurales. La composition du mot est un état d’interface local au renderer : toucher une lettre la place dans la réponse, toucher une lettre déjà composée la retire, et Effacer remet uniquement cette sélection locale à zéro.

Aucune lettre sélectionnée individuellement n’est envoyée au moteur. Seule l’action Valider transmet le mot composé à l’action `word` existante. Passer et Continuer délèguent respectivement à `giveup` et `continue`.

Le payload 3D contient l’indice, les lettres mélangées, le nombre d’essais et les scores, mais jamais `answer` pendant la phase de jeu. Le test couvre également Écho néon en solo afin de vérifier que la projection de confidentialité retire réellement la séquence de `payload.state` pendant `repeat`, tout en la laissant intacte dans l’état moteur autoritaire.


## L’Intrus 3D

L’Intrus dispose désormais d’une constellation Three.js jouable de 9 à 25 symboles. Chaque manche utilise une famille de symbole procédurale et une petite anomalie géométrique ; les cases déjà essayées sont atténuées et l’anomalie n’est explicitement mise en évidence qu’à la phase de résultat.

La frontière de données ne transmet jamais `intrusIndex` au renderer, y compris après révélation. Le tableau booléen `intrusTiles` / `viewData.intrus.tiles` ne sert qu’à construire la différence visuelle que le joueur doit observer, comme dans la vue 2D. Le renderer ne décide jamais si un clic est correct : chaque case envoie uniquement `spot(index)` au moteur, qui gère les essais, le score et la fin du tour.

Les symboles actuels sont procéduraux et pourront être remplacés par des objets GLB/Astra sans modifier l’action `spot` ni le protocole de projection.


## Code secret 3D

Code secret dispose désormais d’un coffre Three.js avec trois gemmes manipulables. Toucher une gemme fait défiler localement les six symboles ; cette sélection reste entièrement dans le renderer jusqu’à l’appui sur « Tester le code ». À ce moment seulement, les trois valeurs sont transmises au moteur par l’action `codeGuess`.

L’historique 3D affiche exclusivement les propositions déjà validées ainsi que les compteurs `exact` et `near` calculés par `codeFeedback()`. Le renderer ne recalcule donc jamais les indices.

Pendant la phase `play`, `secret` est absent de `payload.state` et `viewData.code3d.secret` reste vide. Le code n’est transmis à la vue qu’une fois la phase `result` atteinte, lorsqu’il est légitime de le révéler. Les gemmes procédurales pourront être remplacées par un coffre et des symboles GLB/Astra sans modifier les actions métier.


## Mini-golf cosmique 3D

Mini-golf cosmique dispose désormais d’un parcours Three.js complet : surface, rochers, portail, balle, trace du dernier coup et réglage local de la visée. La direction est initialisée vers le portail puis peut être affinée par pas de 5°, tout comme la puissance par pas de 5 %.

La scène 3D ne contient aucune physique de golf. Lors de « Tirer », elle transmet uniquement `{angle, power}` à l’action `shoot`. La fonction `golfShot()` du moteur reste seule responsable des murs, collisions avec les obstacles, friction, détection du portail et calcul du chemin. Three.js transforme ensuite `golfPath` en trace et en animation de balle.

Le contrat Playwright place la balle à proximité du portail et vérifie qu’un tir 3D produit, via le moteur, un chemin autoritaire, un coup réussi et les 100 points du premier coup, sans consommer de hasard. Parcours, rochers, portail et balle sont des placeholders procéduraux remplaçables par des modèles GLB/Astra.


## Passe de durcissement 3D

Les 22 jeux exposent maintenant une vue 3D compatible avec la bascule locale 2D/3D. La passe finale de robustesse traite les points transverses qui deviennent visibles quand on enchaîne plusieurs parties ou quand on joue sur téléphone :

- la caméra adapte son champ de vision aux écrans étroits afin d’éviter de couper les bords des plateaux et des mains ;
- le renderer plafonne automatiquement le pixel ratio sur les appareils tactiles ou à mémoire plus limitée, tout en conservant une qualité supérieure sur desktop ;
- les animations Three.js respectent à la fois `prefers-reduced-motion` et le réglage global `data-motion="off"` du site ;
- les géométries très réutilisées (tuiles Rummikub, pions de propriété, gemmes, ballon, balle de golf, etc.) sont partagées au lieu d’être recréées à chaque rendu ;
- les géométries réellement temporaires sont explicitement libérées lors du prochain rendu ;
- la hauteur de la scène utilise les unités de viewport mobile modernes (`svh`) pour limiter les sauts liés aux barres du navigateur.

Cette étape ne touche ni aux règles ni au protocole réseau. Elle prépare aussi le remplacement progressif des placeholders par des modèles GLB/GLTF Astra : les futures ressources doivent rester purement visuelles et ne jamais devenir une source d’état ou de règles.


## Vue exclusive et gestes tactiles

La bascule de rendu est désormais visuellement exclusive : en mode 3D, le plateau et la main 2D restent synchronisés en arrière-plan pour le fallback mais ne sont plus affichés. Les commandes métier nécessaires restent disponibles sous la scène. Le sélecteur 2D/3D n’affiche plus deux boutons simultanés : il ne montre que la destination disponible (3D depuis la vue 2D, 2D depuis la vue 3D).

Le glisser-déposer du 8 américain est renforcé sur mobile, en 2D comme en 3D. La capture de pointeur est tolérante aux navigateurs qui la refusent, les pertes de capture / changements de visibilité annulent proprement le geste, les fantômes de carte sont toujours supprimés, et la zone de dépose 3D est élargie pour les pointeurs tactiles. Un 8 déposé correctement ouvre le choix de couleur sans laisser la carte dans un état visuel intermédiaire.
