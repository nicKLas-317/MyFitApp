# Historique des versions

Ce qui a changé à chaque version de MyFitApp, de la plus récente à la plus ancienne, et ce qui n'est plus vrai. Les règles en vigueur sont dans `CLAUDE.md` ; le détail de chaque changement, dans le commit indiqué (`git show <commit>`).

Les commits sans changement de numéro (documentation, tests, workflow) sont rangés sous la version en cours à ce moment-là.

## 1.41.4 — 5 nov. 2026

- Changer la date d'une séance passée : début et fin au nouveau jour, à la même heure ; comptée dans sa nouvelle semaine partout (avant : le récapitulatif, les bilans et les séries par semaine la gardaient dans l'ancienne)
- CLAUDE.md : fin du §15 (« Les tests doivent vérifier… » et « Tests de bout en bout fiables ») remise après le dernier test ; la version B l'avait déplacée par erreur entre les tests 241 et 242

## 1.41.3 — 5 nov. 2026

- Calendrier, groupes, score et travail définis une seule fois ; code mort retiré (`51e4e69`)
- CLAUDE.md : sept contradictions corrigées (exceptions au « bouton inactif » écrites au §17), §0 réécrit pour la façon de travailler actuelle, sections et tests remis dans l'ordre ; historique des versions déplacé ici (`CHANGELOG.md`)
- Tests de bout en bout fiables : police fixée (DejaVu Sans, `e2e/fonts`), test 225 découpé en un test par écran, rechargement après l'enregistrement (`reloadAfterWrites`) ; workflow sur `ubuntu-24.04`

## 1.41.2 — 5 nov. 2026

- Réglages repris par les autres fenêtres, ordre du moteur dans l'historique et les récents (`9ff2be5`)

## 1.41.1 — 5 nov. 2026

- Accueil : titre du récapitulatif raccourci quand « Démarrer » ne tiendrait pas (`64e1663`)
- Historique : cas le plus chargé avec 50 min de cardio : en 1.41.0, « Démarrer » était 6 px sous la barre d'onglets à 320 × 711 px ; le titre raccourci le ramène à l'écran à toutes les tailles.

## 1.41.0 — 5 nov. 2026

- Récapitulatif : le cardio compte pour les jambes à partir de 45 min dans la semaine (`6bc87ac`)

## 1.40.3 — 4 nov. 2026

- Illustrations : tirage vertical devant la poitrine pour ses trois prises (`98f5e9b`)

## 1.40.2 — 4 nov. 2026

- Illustrations : pull-over à la poulie dessiné, presse à cuisses en pictogramme (`8db1d81`)

## 1.40.1 — 4 nov. 2026

- Séance pour compléter la semaine : échéance « D'ici dimanche », « Aujourd'hui » le dimanche (`2a4d4b6`)

## 1.40.0 — 3 nov. 2026

- Onglet Séance : boutons secondaires et cartes sous « Démarrer », haut compact (`d203cb4`)
- Historique : avant cette version, dans le cas le plus chargé, « Démarrer » était 61 px sous la barre d'onglets à 360 px.
- Historique : « Préparer ma prochaine séance », « Compléter la séance de ce matin » et « + Activité » étaient des liens discrets ; la séance prévue s'affichait en résumé avec un lien « Modifier ma séance prévue » ; la séance pour compléter la semaine était une ligne discrète (1.39.0).

## 1.39.0 — 3 nov. 2026

- Séance pour compléter la semaine : groupes sous l'objectif, exercices déjà faits, échauffement en tête (`7eba4a0`)

## 1.38.1 — 3 nov. 2026

- Alerte « groupe moins travaillé » : ses propres chiffres, sans soulignement (`99ab1a0`)

## 1.38.0 — 3 nov. 2026

- Alerte « groupe moins travaillé » : ligne discrète sous le récapitulatif, pastille sur Progrès, « Ignorer » (`cf9593e`)

## 1.37.1 — 3 nov. 2026

- Bâtons des groupes : noms sur une ligne, trois lettres si besoin (`f40ec24`)

## 1.37.0 — 3 nov. 2026

- Bilan de la période : groupes travaillés en bâtons verticaux au-dessus du tableau (`f08ab74`)

## 1.36.0 — 3 nov. 2026

- Bilan de la période : groupes travaillés en petit tableau (`50b3bbc`)
- Historique : le petit tableau des groupes remplace les barres segmentées de la 1.35.0.

## 1.35.1 — 3 nov. 2026

- Mail du bilan : « premier mois suivi » / « première semaine suivie » au lieu de l'écart (`47fd79a`)

## 1.35.0 — 2 nov. 2026

- Bilan de la période en images : tuiles comparées, barres des groupes, calendrier du mois, échelle du cycle (`df9aa6a`)

## 1.34.0 — 30 oct. 2026

- Séries par semaine : depuis la première séance, moyenne en pointillés, semaine en cours distinguée (`013a043`)

## 1.33.0 — 30 oct. 2026

- Bilan par groupe : axe de 95 à 105, séances incomplètes hors de l'indice, onglet Abdominaux (`e6a8dad`)

## 1.32.0 — 30 oct. 2026

- Nom de séance calculé : lieu et groupes principaux (`9c770a9`)

## 1.31.0 — 30 oct. 2026

- Type d'un exercice à la création (charge, poids du corps, durée) et la chaise (`50df704`)
- docs/bibliotheque.md : inventaire de la bibliothèque version 14 (`83b2529`)

## 1.30.2 — 28 oct. 2026

- « kg / haltère » partout pour les exercices aux haltères (`e0b5523`)

## 1.30.1 — 28 oct. 2026

- Poids de départ demandé au changement de lieu ; charges aux haltères en « kg / haltère » (`8a3317d`)

## 1.30.0 — 28 oct. 2026

- Changer le lieu d'une séance en cours : « Passer à la salle / à la maison » (`0532407`)

## 1.29.0 — 27 oct. 2026

- « Plus tard » en séance : l'élément passe en fin de liste (`e9ac7e2`)

## 1.28.0 — 27 oct. 2026

- Maison au nombre de séries et séance complétée le jour même (`4961a5c`)
- Test 266 : attendre l'écriture de la fin de séance avant de recharger (`3d6d674`)
- CLAUDE.md : captures toujours dans perso/captures/, jamais dans test-results/ (`bc3d64e`)
- Historique : la maison compte au nombre de séries (1/12 par série, ½ par semaine au plus), au lieu de ½ par séance (1.26.1 à 1.27.0).
- Historique : jusqu'à la 1.27.0, « Annuler » rétablissait les exercices sans série retirés à la fin, comme séances incomplètes.

## 1.27.0 — 27 oct. 2026

- Pompes au poids du corps et annulation d'une séance en cours (`83c7aaa`)

## 1.26.2 — 27 oct. 2026

- Récapitulatif : plafond de 1 par jour et par groupe entre salle et maison (`0e8e834`)

## 1.26.1 — 27 oct. 2026

- Récapitulatif : une séance à la maison compte ½ pour le groupe principal (`770b525`)
- Test 225 : remonter en haut de la page après le défilement vers l'exercice ajouté (`7fc53fd`)

## 1.26.0 — 27 oct. 2026

- Salle ou maison : séance libre à la maison, suivi à part pour les charges (`5c16acf`)

## 1.25.0 — 27 oct. 2026

- Planche en secondes : gainage, progression par pas de 5 s (`dfdfa32`)

## 1.24.0 — 27 oct. 2026

- Abdos au poids du corps : crunch au sol, crunch oblique, relevés de jambes (`4ab806c`)

## 1.23.2 — 27 oct. 2026

- Séance prévue : musculation et cardio dans un seul ordre, cardio déplaçable (`6903e76`)

## 1.23.1 — 27 oct. 2026

- Ressenti donné : l'exercice suivant non terminé s'ouvre tout seul (`7445be5`)

## 1.23.0 — 27 oct. 2026

- Séance prévue : préparer sa prochaine séance au calme, la démarrer en un appui (`a916da5`)

## 1.22.2 — 23 oct. 2026

- Ton de l'appli : tutoiement partout (`bf67d23`)

## 1.22.1 — 23 oct. 2026

- « + Activité » : activités hors habitude active en tête et présélectionnées (`1cfc4b9`)

## 1.22.0 — 23 oct. 2026

- Activités ponctuelles : « + Activité » sur l'onglet Séance (`377d9a7`)

## 1.21.3 — 23 oct. 2026

- Bilan de la période : durées inconnues jamais à 0 min, période en cours comparée à la même portion (`277802a`)

## 1.21.2 — 23 oct. 2026

- Mon poids : date courte, une pesée par ligne ; « Taille » sans séparateur isolé (`d7ac4e5`)

## 1.21.1 — 23 oct. 2026

- Mon poids : « Corriger » à 8 px au moins de son voisin ; test 225 complété (`a5d4b38`)

## 1.21.0 — 23 oct. 2026

- Ergonomie, étape 3 : écrans au calme allégés (`a040472`)
- Historique : hauteur en nombre d'écrans (412 px, données simulées) avant → après : historique 6 → 3,9 ; bibliothèque 6 → 5,7 (1,4 avec un filtre) ; fiche 3,7 → 2 ; bilan 2,8 → 2,4 ; réglages 3,2 → 1,1.
- Historique : « Trop tôt pour conclure » devient « Trop tôt » dans le bilan de progression.

## 1.20.0 — 23 oct. 2026

- Ergonomie, étape 2 : barre d'onglets et mode salle (`7faf4c5`)

## 1.19.0 — 23 oct. 2026

- Ergonomie, étape 1 : saisie à la salle et style harmonisé (`83ddcd1`)
- Test 221 : séries préremplies à 8 après saisie d'un poids supérieur (`115e45c`)

## 1.18.2 — 23 oct. 2026

- Indice assisté : poids du corps interpolé entre les pesées (`bc93a9d`)

## 1.18.1 — 23 oct. 2026

- Indice par groupe : charge réelle des exercices assistés d'après les pesées (`c63c610`)

## 1.18.0 — 22 oct. 2026

- Bilan par groupe musculaire : indice de progression (Epley, base 100) et séries par semaine (`4e6234f`)

## 1.17.0 — 22 oct. 2026

- Records personnels marqués d'une couronne dorée (`6d0b974`)
- CLAUDE.md : captures d'écran toujours dans perso/captures/, jamais à la racine (`fb4a4d5`)

## 1.16.0 — 22 oct. 2026

- Activités habituelles hors salle (badminton) confirmées en un geste, comptées en indirect (`cd1a1d1`)
- Tests de bout en bout : lanceur Playwright à l'heure de Paris, quelle que soit la machine (`2657d5b`)
- Configuration Playwright : déclaration locale de process.env (compilation sans types Node) (`5417ab5`)

## 1.15.1 — 22 oct. 2026

- Bilan de la période : bandeau en haut de l'accueil, éléments importants en évidence, « En difficulté » reformulé (`50d9dc5`)

## 1.15.0 — 22 oct. 2026

- Bilans de la semaine et du mois envoyables par mail, bandeau sur l'accueil (`074ddb0`)
- Adresse de test en clair (domaine réservé example.org) ; règles de vérification avant publication dans CLAUDE.md (`f8902c6`)

## 1.14.2 — 22 oct. 2026

- Récapitulatif hebdomadaire : à couleur égale, mention « hier » / « aujourd'hui » avant le score (`a3a1a1b`)

## 1.14.1 — 22 oct. 2026

- Récapitulatif hebdomadaire : une seule séance indirecte reste verte (score < 1), tri selon le score (`84be3d4`)

## 1.14.0 — 22 oct. 2026

- Récapitulatif hebdomadaire : groupes secondaires comptés ½ (travail indirect), écartés sans épaules (`864cc54`)

## 1.13.0 — 22 oct. 2026

- Tirage horizontal machine (appui pectoral) et tirage horizontal poulie basse distincts (`9917464`)

## 1.12.2 — 20 oct. 2026

- Ressenti « += » toujours Moyen : aperçu cohérent, correction unique des données (`2d80f3b`)

## 1.12.1 — 19 oct. 2026

- Cardio jamais écrasé par une autre fenêtre de l'appli, cardio non validé proposé à la fin (`29eaa13`)

## 1.12.0 — 16 oct. 2026

- Fiche à la couleur du groupe, cadres neutres, bloc dernière fois / prochaine cible (`3d11869`)
- Test 162 : attendre l'affichage avant de lire les couleurs (machine d'intégration plus lente) (`647ddab`)

## 1.11.0 — 16 oct. 2026

- Couleur fixe par groupe musculaire (`a8a7195`)

## 1.10.0 — 16 oct. 2026

- Bibliothèque version 8 : 19 exercices, mollets assis, extension poulie à la barre (`e12be53`)

## 1.9.0 — 16 oct. 2026

- Curl à la barre, mollets, abducteurs et adducteurs dans la bibliothèque (`2bcc2a1`)

## 1.8.0 — 16 oct. 2026

- Cadres de section colorés dans toute l'application, filtres du bilan (`a30146c`)
- Échecs des tests de bout en bout publiés en annotations dans le workflow (`66b26b7`)

## 1.7.1 — 16 oct. 2026

- Bouton « Bilan de progression » parmi les boutons de l'accueil (`56fe3b5`)

## 1.7.0 — 16 oct. 2026

- Bilan lisible et accessible depuis l'accueil, graphiques dès une séance, import de fichier sur Android (`187b2c7`)

## 1.6.0 — 16 oct. 2026

- Repère de progression en haut de l'exercice et sur la fiche (`4829f6a`)

## 1.5.0 — 16 oct. 2026

- Trois prises par exercice à prise, prise moyenne par défaut (`d5831e7`)

## 1.4.1 — 16 oct. 2026

- Sous-groupes des jambes dans le lexique, presse sans ischio-jambiers (`b93b473`)

## 1.4.0 — 16 oct. 2026

- Lexique d'équivalences pour la recherche et l'import (`67fb0d4`)

## 1.3.0 — 16 oct. 2026

- Enregistrement fiable à la fermeture, vélo classique, Android seul (`b708f37`)

## 1.2.0 — 16 oct. 2026

- Cardio en version minimale (`e6eab26`)

## 1.1.0 — 15 oct. 2026

- Bibliothèque v4 : élévations latérales haltères et machine, sans « Tirage nuque » (`26d632c`)

## 1.0.0 — 15 oct. 2026 (phase 6, première publication)

- Phase 6 : PWA hors ligne, GitHub Pages et README (`f7dd3b9`)
- Inventaire de la bibliothèque d'exercices (docs/bibliotheque.md) (`daed89b`)

## 0.1.0 — 14 oct. 2026 (phases 1 à 5)

- Phase 1 : moteur de progression (fonctions pures) et tests (`da2fde0`)
- Phase 2 : séance, persistance IndexedDB et chronomètre (`d518c51`)
- Ajustements : ressentis manquants, Node 24 LTS, accès réseau local (`7def872`)
- Phase 3 : import et export (notes en texte brut, JSON, sauvegarde) (`7551045`)
- Précisions validées §11.11 : variante d'angle par défaut à l'import (`c332fe5`)
- Phase 4 : bibliothèque illustrée et recherche (`0a493ad`)
- Illustrations : dessins Everkinetic (CC BY-SA 3.0) pour 15 exercices (`c1f96c2`)
- Exercices assistés, nouveaux exercices, symbole « += » et données de départ (`0da4a6d`)
- Phase 5 : historique, analyse de la progression et « Mon poids » (`0b16586`)
- Récapitulatif hebdomadaire, curl ischios, données personnelles hors dépôt (`d9b942d`)
