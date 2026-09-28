# Crédits audio

- `cough.mp3` — extrait (2,95 s → 4,75 s, normalisé) de « Coughing actresses 150.ogg » par Krishtpt35,
  Wikimedia Commons, licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Source : https://commons.wikimedia.org/wiki/File:Coughing_actresses_150.ogg
  Cet extrait modifié est redistribué sous la même licence.

Les autres sons (tirage, expiration, jingles) sont synthétisés en WebAudio dans `shared/puff-audio.js`.

# Crédits image

- `hawk.webp` — détourage (fond ciel retiré, image retournée, couleurs légèrement renforcées) de
  « Buteo jamaicensis calurus in flight, Squaw Valley, California.jpg » par Frank Schulenburg,
  Wikimedia Commons, licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Source : https://commons.wikimedia.org/wiki/File:Buteo_jamaicensis_calurus_in_flight,_Squaw_Valley,_California.jpg
  Cette image modifiée est redistribuée sous la même licence.

# Modèle 3D de la puff

- `jnr-falcon-uncapped.glb` — nouvelle géométrie reconstruite à partir des quatre
  photographies fournies par Mathis le 28 septembre 2026 : corps ovale aplati,
  socle argenté, coque et embout transparents, conduit creux, sans capuchon gris.
  Dimensions estimées : 64 × 121,35 × 32 mm, axe Y vertical, face avant vers +Z.
  Le dessous et les parties internes non photographiées sont approximatifs.
- Les quatre habillages du site restent Blackberry / Red Raspberry,
  Golden Falcon / Mango Passion Fruit, Cherry Ice et Blue Razz. L’impression
  Blackberry embarquée provient du modèle `jnr.glb` déjà fourni ; les autres
  décors conservent le générateur et l’image `hawk.webp` créditée ci-dessus.
- Le matériau `Printed_wrap_original_Blackberry` reçoit seul la texture de goût ;
  `Flavor_colored_upper_housing` reçoit la couleur assortie. Le socle métallique
  et le polycarbonate transparent sont indépendants du choix de goût.
- glTF 2.0 avec textures embarquées, unités en mètres, extensions de matériaux
  transmission / volume / IOR / clearcoat. Le widget utilise GLTFLoader 0.169.0.
  Le GLB source reste éditable avec des pièces nommées distinctes.

Révision de l’embout : longueur au-dessus de l’épaule ramenée de 22,7 à 11,35 mm ; conduit et bagues internes en polycarbonate transparent, avec parois creuses et réfraction (aucune pièce blanche dans l’embout).
