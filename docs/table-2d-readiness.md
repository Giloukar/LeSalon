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


## Coquille 3D plein écran

L’ouverture de la vue 3D privilégie désormais un affichage plein écran. Le navigateur tente d’utiliser l’API Fullscreen lorsqu’elle est disponible, avec repli automatique vers une couche CSS couvrant tout le viewport. La scène expose une croix de retour 2D et un contrôle de réduction vers une vue 3D intégrée à la page ; cette vue intégrée permet ensuite de repasser en plein écran sans recréer la partie.

Les contrôles HTML encore nécessaires au moteur (par exemple le choix de couleur après un 8 ou un Joker) sont transformés en tiroir flottant au-dessus de la scène plutôt que laissés hors écran. Les widgets globaux et effets 2D sont masqués pendant le plein écran pour éviter les chevauchements. Sur mobile, la navigation globale est remise dans le flux en 2D et le dock musical est compacté.

Le placement de la main du 8 américain utilise maintenant des lignes équilibrées avec un espacement basé sur la largeur réelle des cartes. Jusqu’à huit cartes, la main reste sur une seule ligne sans chevauchement important ; au-delà, elle se répartit automatiquement sur deux puis trois lignes. Cette logique est indépendante des futurs modèles GLB/GLTF et pourra donc être réutilisée avec les assets Astra.


## Cadrage mobile et retour 2D sécurisé

Le cadrage 3D n’est plus basé uniquement sur le champ de vision : chaque pose de caméra est désormais recalculée à partir du ratio réel du viewport. En portrait étroit, la caméra recule proportionnellement pour conserver la largeur du plateau, sans imposer une orientation paysage ni déformer fortement la perspective.

Sur les appareils à pointeur tactile, le mode plein écran utilise la couche CSS plein viewport mais n’appelle plus l’API Fullscreen native du navigateur. Cette séparation évite les transitions de contexte fragiles observées sur mobile au retour en 2D. Le retour suit maintenant un ordre déterministe : réduction de la couche 3D, sortie éventuelle du plein écran natif sur desktop, activation du renderer 2D, puis suppression de l’état de présentation 3D.


## Mise en scène des cartes et présence adverse

Le 8 américain utilise maintenant un layout de main qui évite de compter sur le chevauchement pour faire tenir les cartes : jusqu’à huit cartes, une rangée est conservée avec une réduction progressive ; de neuf à seize cartes, la main se répartit sur deux rangées espacées ; au-delà, trois rangées compactes sont utilisées avec un ajustement automatique de largeur. L’ordre vertical est légèrement décalé pour éviter les conflits visuels entre surfaces coplanaires.

La moitié opposée de la table reçoit davantage de lumière de remplissage et le brouillard commence plus loin, afin que les adversaires et leurs cartes restent lisibles même sur mobile portrait. Les adversaires sont également rapprochés vers le centre et leurs étiquettes sont agrandies pour que plusieurs joueurs restent visibles dans le champ.

Pour le 8 américain, le renderer conserve un instantané strictement visuel de l’état précédent. Quand un adversaire joue une carte confirmée, la carte publique se déplace de sa zone vers la défausse. Quand un adversaire pioche, un ou plusieurs dos de cartes se déplacent de la pioche vers sa main. Ces animations ne produisent aucune action de jeu et n’altèrent ni l’état ni le réseau ; elles ne font qu’interpoler entre deux états déjà validés par le moteur.


## Présence gestuelle en ligne

Le 8 américain transporte désormais un canal éphémère de présence pour les cartes. Un drag local en 2D ou en 3D émet uniquement un identifiant de geste, une progression normalisée vers la défausse et un décalage latéral ; aucun identifiant de carte, couleur, valeur ou autre information privée n’est envoyé. Ces messages ne modifient jamais la révision ni l’état autoritatif et sont ignorés lorsqu’ils ne correspondent plus au match ou à la révision courante.

Dans la vue 3D distante, un dos de carte sort alors de la main de l’adversaire et suit le geste avec interpolation. Si le joueur abandonne son drag, la carte revient dans sa main. S’il confirme, elle termine sa trajectoire vers la défausse jusqu’à ce que l’état validé prenne le relais et affiche la vraie carte publique. Un timeout ramène automatiquement une carte si le flux de présence s’interrompt, par exemple lors d’une perte réseau.


## Audit 3D après stabilisation du 8 américain

La couverture 3D existe sur les 22 jeux, mais le niveau de mise en scène n'est pas encore homogène.

| Famille | Jeux | État 3D actuel | Prochaine amélioration utile |
| --- | --- | --- | --- |
| Cartes à main | 8 américain, Président, Menteur, Quatre Suites, Chasse aux plis, Enchères, 99 | mains, adversaires et centre de table rendus en 3D | généraliser les animations de cartes confirmées et la présence réseau du 8 |
| Cartes spécialisées | Pouilleux, Vingt-et-un, Bataille, Cactus | scènes dédiées et interactions principales disponibles | transitions de distribution/pioche, meilleure mise en scène des phases |
| Tuiles | Rummikub | chevalet et groupes manipulables | layout de groupes plus adaptatif quand la table devient dense |
| Dés / plateau | Jeu de l'oie, Yam, Ferme la boîte, Métropole | plateaux, dés et pions synchronisés, plusieurs animations déjà présentes | ajouter davantage d'animations de déplacement et réduire la dépendance aux commandes HTML |
| Mini-jeux | Echo, Ballon, Anagrammes, Intrus, Code Secret, Mini Golf | scènes 3D interactives et état autoritatif respecté | identité visuelle plus riche et transitions de phase plus cinématiques |

Le 8 américain reste actuellement la référence pour les interactions de cartes : drag tactile, présence distante, pioche et pose animées. Les layouts adaptatifs de main sont maintenant partagés avec les autres jeux de cartes afin d'éviter de reproduire les problèmes de chevauchement. La priorité suivante est Rummikub, puis la généralisation des mouvements de cartes et des transitions de phase aux jeux de cartes spécialisés.


## Manipulation physique des cartes

La couche 3D ne limite plus toutes les cartes à un simple clic. Dans les jeux à sélection (Président, Menteur, Quatre Suites, Chasse aux plis, Enchères, ainsi que le 99), une carte peut maintenant être saisie et déplacée librement au-dessus de la table. Tant qu'aucune action de règle n'est validée, ce déplacement reste purement visuel : relâcher la carte la fait revenir vers sa place avec une trajectoire inertielle qui dépend de la vitesse du geste. Cela permet déjà de tester le ressenti de « prendre / déplacer / lancer » une carte sans introduire d'action illégale ou de mutation réseau.

Président, Menteur, Quatre Suites, Chasse aux plis et Enchères exposent également leurs validations principales directement dans la scène 3D. La sélection reste gérée par le moteur existant, puis un contrôle 3D déclenche l'action autoritative correspondante : poser, passer, croire/challenger, ramasser un pli ou confirmer une enchère.

Cette séparation entre **manipulation libre** et **action autoritative** est volontaire. Elle permet de brancher plus tard des modèles de cartes et des mains beaucoup plus riches, avec rotations, lâchers ou gestes libres, sans confondre la physique locale du rendu avec les règles de jeu.


## Manipulation libre généralisée des objets de table

La couche de manipulation locale n'est plus limitée aux jeux de cartes à sélection. Elle couvre maintenant les objets que le joueur doit pouvoir « prendre en main » avant l'arrivée des modèles GLB/GLTF définitifs :

- toutes les cartes de la main du 8 américain sont saisissables, y compris lorsqu'elles ne sont pas jouables ; seules les cartes légalement jouables peuvent encore être validées vers la défausse ;
- Président, Menteur, Quatre Suites, Chasse aux plis, Enchères et 99 conservent le clic de sélection, mais un vrai glisser reste purement visuel ;
- les cartes propres de Pouilleux et Vingt-et-un peuvent être déplacées librement sans produire d'action ;
- les cartes du joueur dans Cactus sont manipulables même lorsqu'aucune action métier n'est disponible ; un simple toucher ne déclenche une action que lorsque le moteur l'autorise ;
- les tuiles du chevalet Rummikub, ainsi que les tuiles communes réellement déplaçables, utilisent la même couche physique locale.

Le mouvement libre est volontairement séparé du moteur : la position, la rotation, la vitesse et le retour inertiel ne sont jamais écrits dans l'état de partie et ne partent pas sur le réseau. Cette frontière prépare le branchement de modèles 3D externes plus riches (mains, cartes, tuiles, animations de lancer) sans transformer la physique de présentation en source de vérité.


## Registre d'assets 3D remplaçables

Le renderer possède désormais une frontière explicite entre **objet de jeu** et **modèle 3D**. Le fichier `shared/table-3d-assets.js` expose `window.SalonTable3DAssets` avec les opérations `register`, `registerMany`, `unregister`, `create`, `has`, `list` et `subscribe`.

Les premières familles branchées sont :

- `card` : cartes de tous les jeux utilisant la primitive commune ;
- `rummikub-tile` : tuiles Rummikub ;
- `die` : dés communs, y compris l'état neutre avant lancer ;
- `pawn` : pions du Jeu de l'oie et de Métropole.

Une factory reçoit uniquement le contexte visuel nécessaire, ainsi que `THREE` et des dimensions canoniques. Le renderer accepte un `Object3D` ou un groupe complet : le raycasting remonte automatiquement vers la racine interactive. Si aucune factory n'est enregistrée, si elle retourne une valeur invalide ou si elle échoue, la géométrie procédurale actuelle reste le fallback.

Cette API est volontairement extérieure aux règles, à `S`, à `net.state` et au protocole PeerJS. Elle constitue le point d'entrée prévu pour les futurs modèles GLB/GLTF : les assets pourront être remplacés progressivement sans modifier les moteurs ni les interactions autoritatives.


## Assets spécialisés et remplacement à chaud

Le registre d'assets couvre maintenant aussi les objets propres à plusieurs scènes : balle, obstacles et portail du Mini-golf, gemmes de Code Secret, ballon de Bulle ou Double, maisons et marqueurs de propriétaire de Métropole.

Le renderer s'abonne au registre pendant sa durée de vie. Une factory enregistrée après l'ouverture de la vue 3D provoque une reconstruction purement visuelle de la scène depuis la même projection autoritative ; retirer la factory rétablit le placeholder procédural. Le chargement d'un GLB peut donc être asynchrone sans bloquer la partie : seule la factory finale doit être synchrone une fois le modèle disponible.

Le contrat complet des factories, leurs contextes et leurs dimensions canoniques est décrit dans `docs/table-3d-assets.md`.


## Présence gestuelle multijoueur des cartes

Le canal de présence éphémère initialement réservé au 8 américain couvre désormais aussi Président, Menteur, Quatre Suites, Chasse aux plis, Enchères et 99.

Pendant qu'un joueur actif déplace librement une carte, les autres clients peuvent voir un dos de carte interpolé depuis son siège vers la zone logique du jeu. Ce flux ne contient jamais l'identifiant, la famille, la valeur ni le contenu de la carte : uniquement le jeu courant, l'acteur, un identifiant de geste, la phase du geste et deux coordonnées normalisées de progression.

Le serveur hôte relaie le geste uniquement si la connexion correspond au siège authentifié, si le jeu courant accepte ce canal, si la révision correspond et si l'acteur est bien le joueur actif. Le geste ne modifie ni l'état autoritatif, ni le RNG, ni la révision de partie. Le mouvement confirmé continue d'être animé depuis le changement d'état réel.


## Chargeur déclaratif de packs GLB/GLTF

La préparation aux futurs modèles ne nécessite plus d'écrire les factories à la main. `shared/table-3d-model-pack.js` expose `window.SalonTable3DModelPack` et accepte un manifest associant les kinds du registre à des fichiers GLB/GLTF.

Le chargement se fait hors du moteur de jeu et GLTFLoader n'est importé qu'à la demande. Les scènes skinnées sont clonées via SkeletonUtils, les corrections de scale/rotation/offset restent à l'intérieur d'un wrapper manipulé par le renderer, et un échec individuel laisse automatiquement le placeholder procédural de cet asset.

Le chargeur expose aussi un cycle de vie explicite (`load`, `unload`, `unloadAll`, `active`) et des événements de progression, ce qui permettra de connecter les futurs fichiers fournis au site sans modifier les jeux ni redémarrer une partie.


## Flux physique des cartes — passe 2

Le 8 américain anime maintenant aussi les transitions du joueur local à partir de l'état confirmé : lorsqu'une carte est jouée par clic ou déposée légalement, son ancienne position dans la main est reconstruite depuis le snapshot précédent puis la carte rejoint la défausse avec une trajectoire en arc. Lors d'une pioche, les nouvelles cartes sont identifiées par leurs IDs projetés, masquées à leur emplacement final pendant le vol, puis révélées une fois arrivées. Ces animations restent déterministes et strictement postérieures à la validation du moteur.

Les vols de cartes utilisent désormais une légère inclinaison sur les axes X/Y en plus de la rotation de table, ce qui évite l'effet de translation parfaitement plate tout en conservant une orientation exacte à l'atterrissage. Aucun aléa de gameplay n'est introduit.

Cactus bénéficie d'un geste physique spécifique : une carte éligible au jet rapide peut être glissée vers la défausse pour tenter le jet au lieu de devoir uniquement la toucher. Le mouvement est visible en direct par les autres joueurs, même hors tour, mais le paquet de présence ne contient toujours aucune identité, valeur ou couleur de carte. L'hôte autorise ce flux hors tour uniquement dans les phases où le jet rapide est réellement disponible ; le coup lui-même continue de passer par l'interaction Cactus autoritative existante.


## Cactus — transitions physiques autoritatives

La scène Cactus conserve désormais un snapshot visuel minimal de l'état précédent : compteur de pioche, sommet public de défausse, carte tirée lorsqu'elle est visible pour le client, phase, tour et nombres de cartes. La scène compare ce snapshot à l'état confirmé suivant pour reconstruire des mouvements sans inventer d'action.

Les transitions couvertes sont : pioche vers carte tirée pour le joueur concerné, prise de la défausse, carte tirée ensuite jetée sur la défausse, jet rapide depuis une main vers la pile, ainsi que des versions masquées destinées aux observateurs lorsqu'une carte adverse ne doit pas être révélée. Une carte déjà publique peut rester face visible pendant son déplacement ; une carte privée adverse reste un dos de carte.

Cette couche n'appelle aucune règle et ne modifie jamais l'état : elle ne démarre qu'après observation d'une transition autoritative entre deux snapshots.


## Flux physiques partagés — cartes et tuiles

La couche de présentation commune poursuit la suppression des téléportations visuelles.

Pour Président, Menteur, Quatre Suites, Chasse aux plis et Enchères, le snapshot conserve maintenant aussi les IDs de la main locale. Lorsqu'une carte du joueur est confirmée, son départ est reconstruit depuis son emplacement exact dans la main précédente au lieu d'utiliser un point générique. Président évacue physiquement un pli terminé vers le bord de table. Chasse aux plis ramasse les cartes du pli vers le siège du gagnant après l'action autoritative `collect`. Enchères débarrasse les cartes du tour précédent et déplace symboliquement la carte-prix vers le gagnant lorsque le tour suivant commence.

Le 99 possède désormais une pioche visible en 3D. Après un coup confirmé, la carte jouée rejoint la défausse, puis, si la pioche contient encore des cartes, la carte de remplacement part de la pioche vers la main. La carte tirée est face visible uniquement dans la main privée du joueur concerné ; pour les autres sièges, le trajet reste représenté par un dos de carte.

Rummikub conserve un snapshot des positions et échelles de chaque tuile visible. Une tuile déplacée entre le chevalet et un groupe, entre deux groupes, ou réorganisée par le recalcul du layout glisse depuis sa position précédente vers sa nouvelle position. Le changement d'échelle est interpolé lorsque la densité du groupe évolue. Une pioche physique de tuiles masquées est affichée près du chevalet et une nouvelle tuile arrive depuis cette pile après confirmation du moteur.

Ces animations utilisent uniquement les différences entre états déjà confirmés. Elles ne produisent aucun coup, ne modifient aucune règle et restent désactivables avec les préférences de mouvement.


## Dépôt physique comme action de jeu

La manipulation 3D peut désormais se terminer directement par une action autoritative lorsque l'objet est lâché dans une zone cohérente.

Pour Président, Menteur, Quatre Suites, Chasse aux plis et Enchères, une carte peut être glissée jusqu'à la zone centrale. Le renderer ne décide pas si le coup est légal : il transmet l'ID au nouvel adaptateur `cardDrop`, qui réutilise les fonctions de légalité et les actions déjà employées par les contrôles 2D. Président et Menteur conservent la sélection multiple : si la carte lâchée fait partie de la sélection, tout le groupe sélectionné est proposé au moteur ; sinon seule la carte réellement manipulée est proposée.

Au 99, une carte non ambiguë peut être déposée directement sur la défausse. Un As reste volontairement soumis aux boutons lorsque +1 et +11 sont tous deux légaux ; si un seul choix est possible, le dépôt direct utilise automatiquement cet unique effet légal.

Rummikub accepte le dépôt d'une tuile sur une combinaison existante, dans l'espace de table pour créer un nouveau groupe, ou sur le chevalet. La destination est déterminée géométriquement par la couche 3D, mais le déplacement est ensuite envoyé par la même action `move` que l'interface classique. Les anciennes tuiles restent protégées par les contraintes d'ouverture et une tuile de table de référence ne peut pas être ramenée illicitement au chevalet.

Avant le dispatch, la couche de présentation mémorise la position exacte du relâchement. Le snapshot suivant peut ainsi continuer l'animation depuis la main de l'utilisateur plutôt que de faire revenir brièvement l'objet à son emplacement d'origine.

Le ciblage visuel est maintenant explicite : pendant un drag qui peut devenir un vrai coup, un anneau apparaît uniquement sur une zone de dépôt reconnue. Pour Rummikub, les groupes utilisent les cellules réelles du layout, le chevalet possède une zone dédiée et la création d'un nouveau groupe est limitée à l'espace libre de la table. Un lâcher hors zone revient donc visuellement à son origine au lieu d'être interprété trop largement.


## Manipulation groupée des sélections

Les sélections multiples ne se comportent plus comme une simple liste logique pendant un drag. Dans Président et Menteur, si la carte saisie appartient à la sélection courante, les autres cartes sélectionnées deviennent des compagnons visuels et se resserrent autour d'elle comme un petit paquet. Rummikub applique le même principe aux tuiles sélectionnées.

Cette cohésion reste strictement locale et visuelle. Un seul geste de présence est émis et aucune information supplémentaire n'est envoyée sur le réseau. Au relâchement, les IDs réellement sélectionnés sont toujours récupérés par les adaptateurs autoritatifs existants ; la couche Three.js ne compose donc jamais elle-même un coup.

Si le drag est annulé ou lâché hors d'une zone valide, chaque compagnon revient avec inertie vers sa propre position et sa propre échelle d'origine. Lors d'un dépôt accepté, les positions exactes de toutes les cartes/tuiles du groupe sont mémorisées dans le snapshot visuel précédent afin que l'animation confirmée reparte du paquet réellement tenu par l'utilisateur plutôt que de leurs anciens emplacements.


## Rummikub — tour complet depuis la table 3D

Le chantier Rummikub peut désormais être piloté sans revenir aux commandes 2D pour les opérations courantes. La tuile supérieure de la pioche est interactive : un toucher déclenche la pioche existante et un glissement jusqu'à la zone du chevalet exprime la même intention. Le moteur reste responsable d'annuler le chantier courant, de piocher réellement la tuile et de terminer le tour.

La scène expose également les commandes autoritatives déjà existantes : **Valider le tour** lorsque le diagnostic du moteur est valide, **Annuler le dernier** lorsqu'un historique de déplacement existe, **Recommencer le tour** pour revenir au snapshot de début de tour, et **Passer** lorsque la pioche est vide.

La projection 3D ne reçoit que deux informations supplémentaires du joueur actif : le nombre d'annulations disponibles et le booléen `canCommit`. Aucune information privée adverse n'est ajoutée. Tous les contrôles appellent `rummi('draw'|'commit'|'undoStep'|'undo')` ; aucune règle de combinaison, d'ouverture à 30 points ou de pendule n'est dupliquée dans Three.js.

Cette couche est construite au-dessus de la manipulation groupée : sélectionner plusieurs tuiles puis saisir l'une d'elles continue de déplacer tout le groupe physique, tandis que la pioche reste un objet isolé qui ne rejoint jamais la sélection.


## Pouilleux et Vingt-et-un — manipulation physique

Le Pouilleux accepte désormais une pioche réellement gestuelle : la carte cachée du voisin peut toujours être touchée, mais elle peut aussi être saisie puis ramenée vers la zone de main. Le relâchement ne choisit jamais lui-même la carte côté moteur : il appelle l'adaptateur autoritatif `specialCard('pick', index)` déjà utilisé par le jeu. Après confirmation, la carte rejoint la main visuellement ; si une paire est formée immédiatement, les deux cartes projetées comme défaussées quittent ensuite la main vers une pile de paires dédiée.

Le Vingt-et-un dispose maintenant d'un sabot 3D représentant le nombre de cartes restantes. La distribution initiale, les tirages du joueur et les tirages de la banque partent physiquement de ce sabot. Les cartes déjà présentes se recentrent par animation au lieu de sauter lorsque la main s'agrandit. La carte cachée de la banque reste un dos de carte dans la projection ; lors de sa révélation, le dos effectue un mouvement de retournement avant de laisser apparaître la face projetée.

Aucune carte privée supplémentaire n'est exposée : le seul nouveau champ de projection du Vingt-et-un est `deckCount`, qui ne contient qu'un nombre. Toutes les actions restent celles du moteur existant.


## Bataille — carte supérieure et pli physique

La Bataille n'est plus limitée au bouton « Retourner le pli ». La carte supérieure du paquet du joueur actif est maintenant manipulable dans la scène 3D : un toucher conserve l'action rapide historique, tandis qu'un glissement vers le centre exprime la même intention via l'adaptateur autoritatif `specialCard('battle')`.

Après confirmation du moteur, chaque carte du pli part du paquet de son propriétaire vers sa position centrale. Les cartes explicitement projetées comme cachées pendant une bataille restent des dos de carte : la couche Three.js ne reçoit ni ne reconstruit leur valeur. La carte réellement déplacée par le joueur peut reprendre son animation depuis la position exacte où elle a été relâchée.

Lorsque le moteur désigne un gagnant, une seconde phase d'animation rassemble ensuite les cartes visibles du pli vers son paquet. Les vols de ramassage démarrent seulement après la fin de la séquence de révélation grâce aux départs différés de la couche d'animation. L'état affiché reste néanmoins l'état confirmé : le mouvement est une reconstruction visuelle postérieure au coup, pas une simulation parallèle des règles de bataille.


## Menteur — résolution physique d'un défi

Lorsqu'un joueur conteste une annonce, le tas ne disparaît plus instantanément de la table 3D. La scène compare le snapshot de la phase `challenge` avec l'état `play` confirmé suivant : si la défausse est passée à zéro et qu'une main a grossi, cette main est identifiée comme destinataire du tas.

Le ramassage part de la pile centrale et rejoint le siège du perdant. Les cartes du dernier mensonge que le moteur a explicitement placées dans `revealed` peuvent être montrées face visible ; toutes les autres cartes du tas restent des dos pour les autres joueurs. Si le spectateur courant est lui-même le perdant, ses nouvelles cartes privées peuvent devenir visibles pendant leur trajet vers leurs positions finales, puisqu'elles appartiennent déjà à sa main projetée.

Les cartes révélées conservées par la vue 2D comme historique du défi ne sont plus recréées physiquement au centre de la table 3D une fois le tas ramassé. L'action de défi elle-même continue de passer exclusivement par `cardAction('challenge')`.


## Chasse aux plis — ramassage gestuel du pli

Le gagnant d'un pli peut désormais saisir directement l'une des cartes du pli terminé. Les autres cartes deviennent des compagnons visuels du drag et suivent le mouvement comme un petit paquet physique. Un toucher garde l'action rapide historique ; un glissement du groupe vers la zone du joueur exprime l'intention de ramasser.

Le relâchement valide appelle uniquement `cardAction('collect')`. Avant cet appel, la couche de présentation mémorise les positions, rotations et échelles exactes des cartes déplacées. Quand l'état confirmé suivant montre que le pli a quitté la table, l'animation de ramassage repart de ces positions réelles au lieu de faire revenir brièvement les cartes au centre.

Un relâchement hors de la zone valide n'envoie aucune action et toutes les cartes du groupe reviennent avec l'inertie locale existante. La logique de gagnant, de score, de manche et de distribution suivante reste entièrement dans le moteur Chasse aux plis.


## Lancer libre local des cartes et tuiles

Une manipulation qui ne se termine pas dans une zone de jeu valide n'est plus obligatoirement ramenée immédiatement par une courbe prédéfinie. Le renderer mesure maintenant la vitesse réelle du pointeur dans le plan 3D de la table. Si le relâchement est suffisamment rapide, l'objet conserve cette impulsion localement : il glisse sur le tapis, prend une légère inclinaison et une rotation, ralentit par friction et rebondit de façon amortie sur les bords de la table.

Cette physique est volontairement non autoritative. Elle ne change ni la position logique d'une carte, ni une sélection, ni un groupe Rummikub, ni la révision réseau. Lorsqu'un vrai dépôt légal est détecté — défausse, groupe Rummikub, ramassage de pli, pioche du Pouilleux, etc. — l'action moteur garde toujours la priorité. Le lancer libre n'est utilisé que lorsqu'aucun coup n'a été accepté.

Après immobilisation, l'objet revient doucement à sa position logique courante. Les sélections groupées peuvent être lancées comme un petit paquet avec de légers écarts entre les éléments. Un objet en mouvement peut être repris immédiatement : son animation physique locale est alors interrompue au point exact où il se trouve.

La vitesse de lancer est réduite lorsque l'utilisateur marque une pause avant de relâcher, afin qu'un simple placement précis ne soit pas interprété comme un jet. Le canal multijoueur de présence reste inchangé : aucun vecteur de vitesse, angle, rebond ou position libre n'est transmis aux autres clients.


## Poses locales persistantes

Les cartes de la main du joueur et les tuiles de son chevalet peuvent maintenant conserver une position libre locale. Un déplacement lent hors d'une zone d'action ne provoque plus nécessairement un retour au rangement automatique : l'objet se pose sur le tapis à l'endroit choisi. Un lancer rapide utilise la physique d'inertie, puis sa position d'arrêt devient également sa pose locale.

La pose est indexée par partie, joueur et identifiant d'objet. Elle survit donc aux simples rerenders de sélection, de HUD ou de layout, sans devenir une donnée de jeu. Si la carte ou la tuile quitte réellement la main à la suite d'une action autoritative, sa pose locale est automatiquement supprimée. Si elle revient plus tard dans la partie, elle repart du layout logique normal et non d'une ancienne position obsolète.

Les actions confirmées tiennent compte de cette position purement visuelle : une carte laissée sur le bord de la table puis jouée part visuellement de cet endroit vers la pile de jeu. Le 8 américain, le 99, Cactus et les jeux de cartes partagés utilisent cette origine lorsqu'elle existe. Les cartes du Vingt-et-un volontairement posées ailleurs ne sont pas recentrées de force lorsqu'une nouvelle carte est tirée.

Les poses ne sont jamais envoyées aux autres joueurs, ne changent aucun état sauvegardé et ne remplacent pas les règles. Une zone de dépôt légale garde toujours la priorité sur le placement libre. Le changement de partie ou de joueur utilise un espace de poses distinct, ce qui empêche toute fuite visuelle entre mains privées.


## Empilement et rangement des poses locales

Les objets librement posés utilisent maintenant un ordre local de dépôt. Lorsque plusieurs cartes ou plusieurs tuiles sont laissées presque au même endroit, les poses antérieures restent légèrement plus basses et la dernière pose est rendue au-dessus. Le décalage vertical est faible et plafonné : il supprime le scintillement des surfaces coplanaires sans transformer une pile de cartes en tour artificielle.

Un contrôle **↺ Ranger mes objets** apparaît dans les commandes de la fenêtre 3D dès que le joueur courant possède au moins une pose libre. Ce bouton supprime uniquement les poses visuelles du joueur et reconstruit immédiatement la scène depuis le layout logique du moteur. Il n'est ni un undo, ni un nouveau tour, ni une action réseau.

Le bouton reste masqué lorsqu'aucune pose locale n'existe. Les poses des autres joueurs locaux ou d'une autre partie ne sont pas touchées par le rangement courant.


## Rotation manuelle locale des objets

Les objets manipulables peuvent maintenant être orientés volontairement sur la table, indépendamment de la petite inclinaison produite par leur mouvement. Sur ordinateur, la molette fait pivoter l'objet tenu par pas de 10 degrés ; lorsqu'aucun drag n'est actif, la même molette au-dessus d'une carte ou d'une tuile possédant une pose locale la tourne directement sur place.

Sur écran tactile, un second doigt pendant le drag active une rotation à deux doigts. L'angle entre le pointeur principal et le second pointeur est suivi continûment, ce qui permet de tourner une carte ou une tuile sans interrompre son déplacement. Relâcher le second doigt conserve le drag principal.

Une rotation volontaire annule le comportement de simple « tap » : tourner une carte ne déclenche donc pas accidentellement une sélection ou un coup. Au relâchement, l'angle choisi est stocké avec la pose locale ; la légère inclinaison visuelle liée à la vitesse du drag n'est pas conservée comme orientation permanente.

Cette rotation n'est jamais une action de jeu. Aucun angle n'est envoyé au réseau, aucune révision n'est créée et les dépôts autoritatifs conservent leur priorité. Le bouton **↺ Ranger mes objets** réinitialise aussi ces orientations avec les autres poses locales.


## Prise et déplacement d'une pile locale

Les empilements de poses locales peuvent désormais être saisis comme un paquet physique. Sur ordinateur, maintenir **Shift** au début du drag d'une carte ou tuile située au sommet d'une pile prend tous les objets locaux empilés sous elle. Sur tactile, un appui long d'environ 340 ms avant le déplacement active le même mode.

Le mode pile est volontairement distinct des actions de jeu : tant qu'il est actif, aucune zone de défausse, combinaison Rummikub, jet Cactus, collecte de pli ou autre dépôt autoritatif n'est exécuté. Le paquet ne sert qu'à réorganiser localement la table. Il peut être posé doucement ou lancé avec la même inertie que les objets individuels.

Seul l'objet réellement au sommet peut initier la prise de pile. L'ordre de dépôt existant est conservé pendant le déplacement et lors de l'enregistrement des nouvelles poses, afin que la carte supérieure ne devienne pas artificiellement la carte inférieure après un déplacement collectif.

Un mouvement normal avant la fin de l'appui long annule le mode pile et conserve le comportement habituel de la carte seule. Un second doigt destiné à la rotation annule également l'attente d'appui long : les gestes tactiles restent donc non ambigus.


## Rummikub — layout dense adaptatif

La table commune Rummikub n'utilise plus une grille de colonnes uniformes. Chaque groupe reçoit maintenant une largeur dérivée de son nombre réel de tuiles, puis les groupes sont empaquetés dans des lignes successives tant que leur largeur cumulée reste compatible avec la table.

Cette disposition permet notamment à une longue suite de partager une ligne avec un petit groupe lorsqu'il reste assez d'espace, et permet à quatre groupes courts de tenir sur une même ligne. Quand le nombre de lignes augmente, l'échelle des tuiles tient aussi compte de la profondeur disponible afin d'éviter les recouvrements verticaux.

Les cellules calculées sont la source unique pour le rendu, les boutons d'ajout à un groupe et les zones de dépôt pendant un drag. Une tuile ne peut donc pas sembler appartenir à une zone visuelle différente de celle reconnue au relâchement. Cette adaptation reste entièrement dans la présentation 3D et ne modifie ni les groupes du moteur, ni leurs indices, ni la validation d'un coup.


## Cactus — échange et défausse physiques de la carte tirée

Pendant la phase `swap`, la carte tirée devient un objet manipulable dans la scène 3D. Elle peut être saisie puis glissée directement sur l’une des cartes de la main : le renderer ne fait qu’identifier le slot visé et appelle l’action Cactus autoritative `swap(index)` déjà utilisée par l’interface existante.

Lorsque la carte vient réellement de la pioche, elle peut aussi être glissée vers la défausse centrale pour appeler l’action `discard`. Une carte prise depuis la défausse ne peut pas être rejetée par ce raccourci, conformément aux règles existantes. Un relâchement hors de toute zone valide n’envoie aucune action et remet simplement la carte à sa position visuelle. Les échanges, la carte rejetée et les effets éventuels — notamment le pouvoir du 8 — restent entièrement calculés par le moteur Cactus.


## 8 Américain — choix de couleur directement en 3D

Le choix déclenché par un 8 ou un Joker reste maintenant dans la table 3D. Dès que le moteur demande une couleur, les cartes et la pioche sont temporairement verrouillées et quatre commandes ♠, ♥, ♦ et ♣ apparaissent sur la table, avec une commande d’annulation. Le clic appelle exactement l’action de carte existante avec la couleur choisie ; aucune règle n’est dupliquée dans Three.js.

La carte qui a ouvert le choix reste légèrement mise en évidence pendant cette étape. Une fois la couleur choisie, le moteur reprend le tour normal et les interactions physiques de la main et de la pioche sont réactivées.
