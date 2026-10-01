# Contrat d’intégration des modèles 3D

Cette couche permet de remplacer progressivement les géométries procédurales de la table par des modèles GLB/GLTF sans modifier les moteurs de jeu.

## Principe

Les règles, l’état autoritatif et le réseau ne connaissent jamais les modèles 3D. Le renderer demande un objet visuel au registre `window.SalonTable3DAssets`. Si aucun modèle n’est disponible, le placeholder procédural existant est utilisé.

Une factory doit retourner synchroniquement un `THREE.Object3D` neuf ou cloné. Pour un GLB chargé de manière asynchrone, chargez d’abord la ressource puis enregistrez la factory : le renderer actif se rafraîchit automatiquement dès l’enregistrement.

## Familles disponibles

| kind | Contexte principal | Taille canonique |
| --- | --- | --- |
| `card` | `card`, `back`, `id`, `playable` | 1.22 × 1.78 × 0.045 |
| `rummikub-tile` | `tile`, `selected` | 0.62 × 0.90 × 0.085 |
| `die` | `value`, `blank` | arête 0.68 |
| `pawn` | `color` | rayon 0.24, hauteur 0.46 |
| `golf-ball` | `sunk`, `stroke` | rayon 0.13 |
| `golf-obstacle` | `radius`, `source` | rayon fourni |
| `golf-portal` | `sunk` | rayon 0.31 |
| `code-gem` | `value`, `symbol`, `color`, `revealed`, `index` | rayon 0.50 |
| `balloon` | `pumps`, `pot`, `risk`, `scale` | rayon de base 1 |
| `metropole-house` | `cellIndex`, `houseIndex`, `count`, `owner` | 0.19 × 0.25 × 0.19 |
| `metropole-owner-marker` | `cellIndex`, `owner`, `color` | rayon 0.09, hauteur 0.22 |

Chaque contexte contient également `THREE`, `kind` et `canonicalSize`.

## Exemple de branchement d’un GLB déjà chargé

```js
const template = gltf.scene;

const unregister = window.SalonTable3DAssets.register('pawn', ({ color }) => {
  const model = template.clone(true);
  model.scale.setScalar(0.46);
  model.traverse(node => {
    if (node.isMesh && node.material) {
      node.material = node.material.clone();
      node.material.color?.set(color);
    }
  });
  return model;
});
```

Le modèle peut être un `Mesh`, un `Group` ou n’importe quel `Object3D`. Les enfants sont automatiquement pris en compte par le raycasting ; les interactions restent attachées à la racine logique de l’objet.

## Règles à respecter pour les futurs assets

- Ne jamais écrire dans `S`, `net.state`, Supabase ou PeerJS depuis une factory.
- Ne jamais calculer une règle ou un résultat de jeu dans le modèle.
- Ne pas utiliser `Math.random()` pour une décision qui pourrait influencer le gameplay.
- Retourner une instance indépendante lorsque l’objet peut être animé ou déplacé.
- Normaliser l’origine du modèle autour de son centre logique et utiliser l’axe Y comme verticale.
- Utiliser les dimensions canoniques comme cible de mise à l’échelle afin que les layouts existants restent valides.
- Les textures, matériaux et animations propres au modèle peuvent évoluer librement tant qu’ils restent purement visuels.

## Chargement progressif

Le registre est observable. Quand une factory est ajoutée ou retirée, la scène 3D active se reconstruit immédiatement à partir du même état autoritatif. Cela permet de charger un pack de modèles en arrière-plan puis de le rendre disponible sans redémarrer la partie.

Le fallback procédural reste permanent : retirer une factory ou rencontrer une erreur dans celle-ci ne doit jamais empêcher la partie de continuer.


## Packs déclaratifs GLB/GLTF

Pour les packs de modèles complets, `window.SalonTable3DModelPack` évite d'écrire une factory à la main pour chaque fichier. Le chargeur importe GLTFLoader uniquement lorsqu'un pack est demandé, précharge les modèles, prépare un clonage compatible avec les scènes skinnées, puis enregistre les factories prêtes dans `SalonTable3DAssets`.

Exemple :

```js
const pack = await window.SalonTable3DModelPack.load({
  id: 'salon-real-assets-v1',
  assets: {
    pawn: {
      src: './assets/3d/pawn.glb',
      scale: 0.46,
      rotationDeg: [0, 180, 0],
      tintFrom: 'color'
    },
    balloon: {
      src: './assets/3d/balloon.glb',
      scaleFrom: 'scale'
    },
    'golf-ball': {
      src: './assets/3d/golf-ball.glb'
    }
  }
});
```

Chaque entrée accepte :

- `src` : chemin GLB/GLTF ;
- `fit: 'canonical'` : ajuste automatiquement le modèle en conservant ses proportions pour qu'il rentre dans les dimensions canoniques du `kind` ;
- `origin: 'center'` ou `origin: 'floor-center'` : recentre automatiquement l'origine géométrique, soit au centre du modèle, soit au centre de sa base ;
- `scale` : facteur uniforme ou tableau `[x, y, z]` ; avec `fit: 'canonical'`, il devient un multiplicateur fin appliqué après l'ajustement automatique ;
- `rotationDeg` : rotation de correction en degrés, appliquée avant le calcul de l'encombrement canonique ;
- `offset` : décalage local `[x, y, z]`, appliqué après le recentrage ;
- `scaleFrom` : nom d'un champ numérique du contexte à multiplier à l'échelle courante, utile par exemple pour le ballon ;
- `tintFrom` : nom d'un champ couleur du contexte, utile pour les pions et marqueurs ;
- `configure(object, context)` : hook optionnel lorsque le manifest est défini en JavaScript et qu'une adaptation plus spécifique est nécessaire.

Les transformations ne sont appliquées que lorsqu'elles sont déclarées : les transformations natives du fichier restent donc intactes par défaut. Avec le chargeur GLB intégré, le modèle corrigé est placé dans un `THREE.Group` externe. Le renderer déplace, tourne et redimensionne ce wrapper, ce qui évite d'écraser les corrections internes du fichier ou du manifest.

Pour les modèles que tu vas produire, la voie recommandée sera désormais `fit: 'canonical'` avec `origin: 'floor-center'` pour les objets posés sur la table (pions, dés, maisons) et `origin: 'center'` pour les cartes et tuiles. Cela évite d'avoir à exporter chaque GLB exactement à l'échelle interne attendue : le fichier doit surtout conserver de bonnes proportions, un axe Y vertical et une géométrie propre. Les dimensions finales sont imposées par le contrat du renderer.

Le chargement est tolérant aux erreurs par asset. Un fichier qui échoue apparaît dans `result.failed` et conserve son placeholder procédural, pendant que les autres modèles du pack sont activés. `result.unload()` ou `SalonTable3DModelPack.unload(id)` retire les factories du pack et revient immédiatement aux placeholders.

L'événement `salon:table-3d-model-pack` publie les phases `loading`, `progress`, `ready` et `unloaded`, ce qui permettra d'ajouter plus tard une interface de progression sans coupler cette interface au renderer.


## Métropole entièrement pilotable en 3D

Métropole n'a plus besoin du panneau 2D pour terminer un tour. Le payload 3D expose uniquement les permissions déjà calculées à partir du moteur courant : lancer, caution, achat ou refus, règlement d'une dette, faillite, fin de tour et reprise après détention.

Les rues du joueur courant deviennent sélectionnables sur le plateau pendant son tour. Une rue sélectionnée affiche seulement les opérations actuellement légales — hypothéquer, lever l'hypothèque, construire ou vendre une maison — avec les montants issus des règles existantes. Les boutons 3D appellent exclusivement interactions.city(...), qui redirige vers le même dispatch autoritatif que l'interface 2D.

La sélection visuelle d'une rue (cityFocusIndex) est locale au renderer et n'est jamais envoyée au réseau. Les règles de propriété, d'équilibrage des maisons, de dette, de faillite et de coût restent dans le moteur Métropole.


## Retournement local recto / verso

Les cartes et tuiles possédant une pose locale peuvent être retournées sans aucune action de jeu. Sur ordinateur, placez le pointeur sur l'objet puis appuyez sur F ; le même raccourci fonctionne pendant un drag. Sur tactile, maintenez l'objet avec un doigt puis faites un tap bref avec un second doigt. Si le second doigt se déplace, le geste reste une rotation à deux doigts et aucun retournement n'est déclenché.

Le côté visible est conservé dans la pose locale, y compris après un lancer inertiel. Les tuiles Rummikub procédurales disposent maintenant d'un vrai matériau de dos afin que le retournement soit visuellement lisible avant même l'arrivée des modèles GLB définitifs.

Le retournement est désactivé pendant le déplacement volontaire d'une pile complète afin de ne pas introduire une inversion implicite de l'ordre du paquet. Il ne déclenche ni dispatch, ni action en ligne, ni publication de présence.


## Caméra libre de la table 3D

La caméra peut maintenant être repositionnée sans modifier la disposition ou l'état du jeu. Un glisser sur une zone vide de la table fait orbiter la vue ; la molette au-dessus du tapis zoome. La molette conserve sa priorité historique lorsqu'elle est utilisée au-dessus d'une carte ou d'une tuile libre : elle tourne alors l'objet et ne déplace pas la caméra.

Sur écran tactile, un doigt sur le tapis fait orbiter la caméra. Un second doigt transforme le geste en pincement pour zoomer, tout en permettant un léger déplacement orbital du centre du geste. Les gestes commencés sur un objet manipulable restent réservés à cet objet.

Dès que la caméra quitte sa pose par défaut, un contrôle ◎ apparaît dans la fenêtre 3D pour recentrer immédiatement la vue spécifique au jeu courant. Le réglage caméra est local au renderer, survit aux rerenders d'une même partie et se réinitialise lors du passage à un autre jeu. Aucun angle, zoom ou geste caméra n'est envoyé au moteur ou au réseau.
