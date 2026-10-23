# PROMPT CLAUDE CODE — Application PWA de suivi sportif « MyFitApp »

## 0. Mode de travail

Ce document est la référence complète du projet. Garde-le à la racine du dépôt (par exemple dans `CLAUDE.md`) et relis-le avant chaque phase.

**Ne développe pas tout d'un coup.** Travaille par phases, dans cet ordre. Chaque phase doit compiler, passer ses tests et être commitée avant de commencer la suivante :

1. **Moteur de progression** (§7 et §8) : logique pure, sans interface, couverte par tous les tests du moteur (§15).
2. **Séance, persistance et chronomètre** (§5, §6, §12, §13).
3. **Import et export** (§11).
4. **Bibliothèque illustrée et recherche** (§4).
5. **Historique, analyse et suivi corporel** (§10, §19, §20).
6. **Déploiement GitHub Pages et vérifications finales** (§16, §17, §21).

À la fin de chaque phase, résume ce qui est fait, ce qui est testé et ce qui reste, puis attends ma validation avant de passer à la suivante.

Si le projet existe déjà, commence par examiner son architecture, ses fichiers, ses fonctionnalités et ses tests. Conserve ce qui fonctionne, puis implémente les exigences manquantes sans réécrire inutilement l'application.

Ne te contente pas de proposer un plan, des maquettes ou des exemples de code : implémente réellement l'application, exécute les tests disponibles, corrige les problèmes détectés et vérifie les principaux parcours utilisateur.

Le projet se trouve dans le dossier `MyFitApp`. Initialise un dépôt git s'il n'existe pas encore, et commite à la fin de chaque phase avec un message clair.

Si une règle de ce brief est ambiguë ou contradictoire, pose-moi la question au lieu de choisir silencieusement.

## 1. Objectif général

Développer une application personnelle de suivi de musculation appelée **MyFitApp**.

Toute l'interface est en **français**. Les dates et heures sont affichées au format français et calculées dans le fuseau horaire local de l'appareil, qui est et restera celui de Paris (`Europe/Paris`) ; les tests automatisés s'exécutent eux aussi à l'heure de Paris, quelle que soit la machine. Les poids sont exprimés en **kilogrammes**, avec une décimale possible (par exemple 52,5 kg).

L'application doit être simple, rapide, mobile-first, installable sur smartphone et utilisable hors ligne. Elle doit me permettre de suivre mes séances, conserver mon historique et gérer automatiquement ma surcharge progressive.

Mon objectif à la salle est simple : ouvrir l'application, retrouver rapidement un exercice, voir le poids et les répétitions à réaliser, enregistrer mes séries en quelques secondes et passer à l'exercice suivant.

L'application doit apprendre de mon historique pour recommander automatiquement la prochaine cible : consolider les répétitions, augmenter les répétitions, augmenter ou réduire le poids lorsque les conditions sont réunies.

Je ne veux pas avoir à analyser des statistiques ni à déterminer manuellement ma progression après chaque séance.

### Principes prioritaires

- Simplicité et rapidité d'utilisation.
- Saisie minimale pendant l'entraînement.
- Recherche efficace par nom d'exercice, machine ou groupe musculaire.
- Bibliothèque illustrée permettant d'identifier les exercices.
- Progression automatique fondée sur les performances réelles.
- Import facile de mon historique existant, y compris depuis des notes en texte brut.
- Conservation fiable des données.
- Fonctionnement hors ligne.
- Aucune création de compte nécessaire.
- Aucune dépendance à une API payante.
- Aucune progression déclenchée par une seule bonne séance.
- Pas de fonctionnalités complexes sans utilité directe.

## 2. Technologies et architecture

Utiliser de préférence :

- React.
- TypeScript.
- Vite.
- Une solution PWA fiable avec manifeste et service worker (par exemple `vite-plugin-pwa`).
- IndexedDB pour le stockage persistant local.
- Vitest pour les tests unitaires et Playwright pour les tests de bout en bout.
- Une bibliothèque légère pour les graphiques uniquement si nécessaire.

L'application doit :

- Être installable sur smartphone.
- Fonctionner hors ligne après son premier chargement complet.
- Conserver les séances, les exercices, les réglages et les historiques après fermeture ou redémarrage.
- Restaurer une séance en cours après rechargement ou fermeture accidentelle.
- Être utilisable sur smartphone et ordinateur. Plateforme mobile visée : **Chrome sur Android** uniquement (précision validée : Safari sur iOS n'est plus une cible).
- Proposer un thème sombre confortable.
- Stocker les données localement.
- Permettre l'export et l'import des données.
- Ne nécessiter ni serveur personnel, ni compte utilisateur, ni abonnement.
- Être hébergée gratuitement sur **GitHub Pages** (voir §21).

Prévoir une architecture modulaire séparant clairement :

1. L'interface utilisateur.
2. La bibliothèque d'exercices.
3. La gestion des séances.
4. Le stockage et la persistance.
5. Le moteur de progression.
6. L'import, l'export et la restauration.
7. Le suivi corporel.
8. Les tests automatisés.

**Le moteur de progression doit être indépendant de l'interface et constituer l'unique source de vérité** pour les statuts, les validations de paliers et les recommandations futures. C'est un module de fonctions pures : il reçoit l'historique et les réglages, et renvoie statuts, compteurs et prochaine cible.

Ne pas disperser les règles de progression dans plusieurs composants de l'interface.

## 3. Interface générale

Créer une interface moderne, sobre, lisible et rapide.

L'application est organisée en quatre onglets (§3.4, version 1.20.0), qui séparent l'usage « à la salle » (saisie rapide, écran épuré) de l'usage « au calme » (bilans, historique, réglages) :

- **Séance** (onglet par défaut, l'accueil) : la question d'une activité habituelle en haut s'il y en a une (« Badminton lundi soir (21 h – 22 h 30) ? », §19.8), le récapitulatif de la semaine (§19.6), puis « Démarrer une séance » / « Reprendre la séance » (toujours 1 appui), le lien discret « + Activité » (activité ponctuelle, §19.8) et le rappel de sauvegarde éventuel (§12).
- **Historique** : la liste des séances et des activités, regroupée par mois (§10, §3.5).
- **Progrès** : en haut, le bandeau « Ton bilan de la semaine / du mois est prêt » quand un bilan est à voir (§19.7) ; puis le bilan de progression (§19.3), les bilans de la semaine et du mois (§19.7), le bilan par groupe musculaire (§19.10) et « Mon poids » (§20), avec une pesée rapide.
- **Plus** : la bibliothèque d'exercices et sa recherche (§4), les réglages (§14), « Importer / exporter » (§11 ; l'écran porte le même nom).

Éviter les menus profonds, les écrans superflus, les animations inutiles et les longs textes explicatifs.

Les boutons doivent être suffisamment grands pour une utilisation entre deux séries.

L'utilisateur doit comprendre immédiatement :

- Quel exercice il réalise.
- Quel poids utiliser.
- Combien de séries et de répétitions viser.
- Ce qu'il a réellement effectué.
- Quelle est la prochaine cible recommandée.

L'application doit rester lisible en mode sombre, notamment pour les trois couleurs de progression.

Ne pas ajouter de fonctionnalités sociales, de calories, de programmes complexes ou de tableaux de bord encombrants.

### 3.4. Barre d'onglets et bouton retour (précision validée, version 1.20.0)

- **Barre d'onglets** fixe en bas de l'écran, 56 px de haut, au-dessus de la zone système d'Android (`env(safe-area-inset-bottom)`) : Séance · Historique · Progrès · Plus, chacun avec une icône et un libellé, 8 px entre deux onglets. L'onglet actif est en couleur d'accent, en gras, avec un trait au-dessus ; les écrans ouverts depuis un onglet le gardent actif (`tabOf`, `src/ui/TabBar.tsx`). Masquée en mode salle (§5.8).
- **Pastille** sur l'onglet Progrès quand un bilan de la semaine ou du mois est prêt (§19.7) : point discret couleur d'accent, nom accessible « Progrès : bilan prêt ».
- **Bouton retour d'Android** (`src/app/navigation.ts`) : chaque entrée de l'historique connaît sa profondeur.
  - Il suit la navigation : la fiche ouverte depuis la séance revient à la séance, le détail revient à l'historique, etc. ; les flèches « ‹ » font de même (à défaut d'écran précédent, elles mènent à l'écran parent de l'onglet).
  - Un onglet s'ouvre toujours juste au-dessus de l'onglet Séance : « retour » depuis un onglet (ou un écran d'onglet atteint par un autre onglet) ramène à la Séance. Une adresse ouverte directement reçoit une entrée Séance en dessous.
  - Après « Ajouter un exercice », « retour » ne rouvre pas la recherche ; après la fin d'une séance, il ne ramène pas dans la séance terminée.
  - Il ne ferme jamais l'appli en pleine séance : sur l'onglet Séance, une entrée de garde absorbe « retour » tant qu'une séance est en cours.
  - Il ne perd aucune saisie : un poids tapé sans quitter le champ est enregistré en quittant l'écran (même protection au-delà de 50 %, §5.3), les répétitions ajustées (− / +) de la série en cours, l'exercice ouvert et le cardio en cours de saisie sont retrouvés au retour dans la séance, et le nom saisi au récapitulatif est enregistré.
- **Nombre d'appuis** : aucune action de saisie n'en demande plus qu'avant les onglets, et aucune ne demande de défiler (test 230) : démarrer ou reprendre une séance 1, ajouter un exercice récent 2, valider une série 1, ressenti 1, cardio 2 (+ la durée), terminer 2, pesée 2 (+ le poids), corriger une séance passée 3.

### 3.5. Écrans au calme allégés (précision validée, version 1.21.0)

Moins de défilement sur les écrans de consultation ; navigation, moteur de progression et données inchangés.

- **Historique** (§10) : regroupé par mois, un intertitre par mois (« Octobre 2026 », style des titres de section) et un seul cadre neutre par mois. Une ligne compacte par séance : jour à gauche (« lun. 19 »), titre sur une ligne au plus (tronqué « … » si besoin), puis le contenu (« 5 ex. · 20 min cardio », « · importée ») ; par activité : « Badminton · 1 h 30 », « activité ». Heures et durée sont dans le détail. Aucun bouton dans la liste : « Supprimer » n'est proposé que dans le détail (séance ou activité), avec confirmation.
- **Bibliothèque et ajout d'un exercice** (§4.2, §4.3.1) : sous la recherche, une rangée de puces de filtre (« Tous », puis chaque groupe qui a des exercices), sur une seule ligne qui défile horizontalement si besoin. Un appui n'affiche que ce groupe ; un nouvel appui, ou « Tous », réaffiche tout ; le filtre est gardé le temps de l'ouverture de l'appli (retour depuis une fiche). « Récents » reste en tête, puis « Favoris », puis les groupes ; avec un filtre, récents et favoris sont limités au groupe choisi. Pendant une recherche, les puces sont masquées et les résultats ne sont pas filtrés. Les prises d'un même exercice présentes dans une liste (au moins deux) sont regroupées en une seule entrée : nom et groupe une fois, puis une puce par prise, dans l'ordre très large · moyenne · serrée, avec le dernier poids et le statut de chaque prise. Un appui sur une puce agit sur cette variante : ajout à la séance (poids de départ demandé si besoin ; « dans la séance » rouvre l'exercice) ou fiche dans la bibliothèque. C'est un regroupement d'affichage (`groupGrips`, `src/library/catalog.ts`) : chaque prise reste un exercice-variante distinct (données, moteur, historique). Une seule prise dans une liste (récents, « tirage vertical wide grip ») reste une entrée simple ; les autres variantes (assis / debout, barre / haltères…) ne sont pas regroupées.
- **Fiche d'un exercice** (§4, §19.1) : la prochaine cible et la dernière fois en premier, puis « Ajouter à la séance » / « Modifier », puis l'exercice (illustration réduite à une vignette, groupes, matériel, favori). Un appui sur la vignette agrandit l'illustration, avec l'attribution sous l'image agrandie ; un nouvel appui la réduit. Puis l'évolution, l'historique, les variantes et les autres noms. Historique : lignes compactes dans un seul cadre (« 19/10 · 45 kg · 11-11-11 », statut, puis « cible 3 × 11 · Bien passé (+=) · importée »), les 5 dernières séances, puis « Voir tout (17 séances) » (et « Voir les 5 dernières »).
- **Bilan de progression** (§19.3) : les filtres sur une seule rangée (défilement horizontal si besoin) ; « Trop tôt pour conclure » devient « Trop tôt » ; « Dernières évolutions » : une ligne par évolution (« 19/10 Pec deck 10 → 11 rép. », « 30 → 27,5 kg », « 40 → 45 kg, 12 → 8 rép. »), le nom tronqué si besoin.
- **Réglages** (§14) : « Exercices, variantes et réglages par exercice » en haut ; puis des sections repliables, toutes fermées à l'ouverture sauf la première : Taille, Récapitulatif de la semaine, Bilans de la semaine et du mois, Activités habituelles, Machines de cardio (titre au style des titres de section, chevron). Stockage persistant et version restent affichés en bas (information, pas un réglage), puis « Importer / exporter ». Activités habituelles : jour, début et fin sur une ligne à 360 px (le jour à la largeur de sa valeur, les heures à cinq caractères) ; le jour n'est jamais tronqué : avec le texte agrandi, l'heure de fin (avec son tiret) passe dessous. Machines de cardio : lignes espacées de 8 px, « Retirer » dans le menu « ⋯ » de chaque machine (effectif à « Enregistrer les machines », annulable) ; pas de menu quand il ne reste qu'une machine.
- Hauteur en nombre d'écrans (412 px, données simulées) avant → après : historique 6 → 3,9 ; bibliothèque 6 → 5,7 (1,4 avec un filtre) ; fiche 3,7 → 2 ; bilan 2,8 → 2,4 ; réglages 3,2 → 1,1.

### 3.1. Cadres de section (précision validée)

Toutes les sections de l'application (cartes d'exercice, éléments de liste, graphiques, bandeaux d'information, blocs des réglages, de l'import/export, de « Mon poids », de la fiche et du bilan, fenêtres et volets de confirmation, menus « ⋯ ») sont encadrées selon **une seule règle commune** :

- Bordure sur les quatre côtés, de même épaisseur (2 px) et de même couleur, coins arrondis (même rayon que les boutons).
- Règle définie une seule fois : la liste des éléments encadrés est unique (`FRAME_SELECTOR`, `src/ui/frames.ts`, qui les marque `data-frame`) et le style est la seule règle `[data-frame]` de `styles.css`. Aucun écran ne définit sa propre bordure de section (pas de bordure gauche seule).
- **Couleur (précision validée, version 1.19.0)** : plus d'alternance « arc-en-ciel ». Un cadre est **neutre** (gris foncé discret `--frame-neutral`) ; seul ce qui concerne un groupe musculaire prend la couleur de ce groupe (§3.2). Sont donc neutres : bandeaux (onglets Séance et Progrès) et récapitulatif de l'accueil, « Mon poids » (une simple liste dans un seul cadre, sans un cadre par pesée), réglages, import/export, liste des séances, catégories du bilan, cardio, confirmations, volet de fin de séance, menus.
- Ne sont pas des cadres : les pastilles de statut (§8) et les cases du récapitulatif hebdomadaire (§19.6), qui gardent leurs couleurs de statut.
- Rien ne dépasse de l'écran d'un smartphone (vérifié à 412, 360 et 320 px de large, et à 360 px avec le texte agrandi à 115 %) : les cartes d'exercice s'adaptent à la largeur ; dans la ligne de série, « Série 1 » ne se coupe jamais, les boutons `+` et `−` gardent 48 px, et si la ligne ne tient pas (écran étroit, texte agrandi), « Valider » passe dessous, sur toute la largeur, à 8 px au moins du `+`.

### 3.2. Couleurs des groupes musculaires (précision validée)

Chaque groupe musculaire a sa propre couleur **fixe**, la même partout où elle apparaît :

| Groupe | Couleur |
|---|---|
| Épaules | jaune |
| Pectoraux | cyan |
| Triceps | bleu clair |
| Dos | mauve / violet |
| Biceps | rose / magenta |
| Jambes (et ses sous-groupes : quadriceps, ischio-jambiers, mollets, fessiers, adducteurs) | blanc |
| Abdominaux | gris clair |

- Un exercice prend la couleur de son groupe principal. Elle s'applique :
  - au cadre de chaque exercice de la bibliothèque, dans les sections de groupe comme dans les récents, les favoris, les résultats de recherche et l'écran « Ajouter un exercice » ;
  - au fond des pictogrammes d'exercice, avec un trait sombre ;
  - à la carte de chaque exercice dans l'écran de séance, le récapitulatif de fin et le détail d'une séance passée, cadres intérieurs compris (repère de progression, confirmations) ;
  - à chaque exercice listé dans le bilan ;
  - sur la fiche d'un exercice et sur l'écran de modification d'un exercice : à **tous** les cadres (dernière fois / prochaine cible, variantes, autres noms, graphiques, historique), et à la prochaine cible elle-même (§5.3.2).
- Aucun cadre d'une couleur de groupe n'apparaît sur un exercice d'un autre groupe. Tout cadre qui ne concerne pas un groupe précis est **neutre** : gris foncé discret `--frame-neutral`, distinct des sept couleurs (§3.1).
- Le bilan par groupe musculaire (§19.10) : cadres, courbe et barres dans la couleur du groupe choisi.
- Les pastilles de statut et les cases du récapitulatif hebdomadaire ne changent pas : elles restent vert, orange ou rouge.
- La correspondance est définie une seule fois : `GROUP_COLORS` dans `src/ui/groupColors.ts`.
  - Les teintes sont des jetons de `styles.css` : les cinq couleurs de la palette, plus le blanc `--frame-white` et le gris clair `--frame-grey`.
  - Le neutre est la couleur de la règle commune `[data-frame]` ; une seule règle CSS donne la couleur du groupe à un cadre d'exercice et aux cadres qu'il contient (`[data-group-color]`, posé par `groupColorProps`). La couleur du groupe l'emporte sur le neutre.
- Les sept couleurs sont toutes distinctes et lisibles sur le fond noir (contraste d'au moins 7:1). Aucune n'est un vert, un orange ou un rouge.

### 3.3. Échelle typographique, espacements et éléments tactiles (précision validée, version 1.19.0)

Une seule échelle, définie dans `styles.css` (jetons `--fs-1` à `--fs-5` et `--space-1` à `--space-3`), sur toute l'application :

- **Cinq tailles de police seulement**, en rem pour suivre la taille de police du téléphone : 13 px (étiquettes des graphiques, mentions annexes), 15 px (textes secondaires, titres de section), 17 px (texte courant, boutons), 22 px (titres d'écran, valeurs saisies), 28 px (chiffres clés : cible, chronomètre).
- **Espacements fixes** de 8, 16 et 24 px (marges, marges intérieures, écarts) ; les valeurs par défaut du navigateur (paragraphes, boutons, champs) y sont ramenées.
- **Un seul style de titre de section** (15 px, gras, majuscules, gris clair) : bibliothèque, fiche, bilans, réglages, import/export, catégories du bilan. Le résumé de la semaine (accueil) est une phrase, pas un titre de section.
- **Graphiques** : dessinés à la largeur réelle de l'écran, étiquettes de 13 px (jamais moins de 12 px), sans chevauchement.
- **Éléments tactiles** : au moins 48 px de haut et 8 px d'écart avec leur voisin (liens d'action, cases à cocher et leur libellé, puces, liens de licence des illustrations compris).
- Vérifié à 412, 360 et 320 px, et à 360 px avec le texte agrandi à 115 % (simulation de la taille de police Android).

## 4. Bibliothèque d'exercices illustrée

Créer une bibliothèque d'exercices permettant d'identifier rapidement le mouvement, le groupe musculaire et le matériel utilisé.

Chaque exercice doit comporter, dans la mesure du possible :

- Un nom principal.
- Des synonymes et noms alternatifs (français et anglais).
- Une illustration ou une image adaptée.
- Le groupe musculaire principal.
- Les groupes musculaires secondaires.
- Le type de matériel.
- Les variantes disponibles.
- La dernière performance connue.
- La prochaine cible calculée.
- Un indicateur de couleur de progression.
- Un accès à l'historique de l'exercice.

### 4.0. Contenu initial de la bibliothèque

Pré-charger au minimum les exercices suivants, avec leurs synonymes et groupes musculaires :

- Tirage horizontal machine (appui pectoral) / Seated row (dos), avec ses trois prises (§4.3.1) : voir la version 9 ci-dessous.
- Tirage vertical / Lat pulldown (dos). « Tirage nuque » n'en est pas un synonyme : c'est un mouvement différent.
- Rowing haltère / Dumbbell row (dos).
- Chest press / Développé assis machine (pectoraux).
- Pec deck / Butterfly (pectoraux).
- Développé couché / Bench press (pectoraux).
- Développé épaules machine / Shoulder press (épaules).
- Élévations latérales haltères (épaules, haltères). Synonymes : élévations latérales haltères, lateral raise haltères, dumbbell lateral raise.
- Élévations latérales machine (épaules, machine) : exercice distinct, avec son propre historique (charges non comparables). Synonymes : élévations latérales machine, lateral raise machine, machine lateral raise.
- Curl biceps poulie corde / Cable rope curl (biceps).
- Curl biceps haltères (biceps).
- Curl biceps banc incliné (biceps).
- Extension triceps poulie / Triceps pushdown (triceps) : variante standard « Corde » ; la variante « Barre » est distincte, avec son propre historique (version 8).
- Extension triceps haltère assis / Overhead dumbbell extension (triceps).
- Presse à cuisses / Leg press (jambes).
- Leg extension (jambes, quadriceps).
- Leg curl : la version **assise** (jambes, ischio-jambiers). Synonymes : leg curl, leg curl assis, seated leg curl.
- Curl ischios : la version **allongée**, à plat ventre (jambes, ischio-jambiers), machine distincte avec son propre historique. Synonymes : curl ischios, curl ischio allongé, leg curl allongé, lying leg curl.
- Crunch machine / Abdominaux (abdominaux).
- Dips assistés / Assisted dips (triceps et pectoraux), réglage « assisté » activé (§7.12).
- Écarté couché haltères / Dumbbell fly (pectoraux).

Ajouts de la bibliothèque version 7 :

- Curl biceps barre droite (biceps, barre), distinct du curl aux haltères, du curl à la poulie et du curl à la barre EZ. Synonymes : curl barre, curl barre droite, curl à la barre, barbell curl, straight bar curl.
- Mollets machine (jambes, sous-groupe mollets, machine). Synonymes : mollets, calf press, calf raise, extension mollets, presse mollets, machine à mollets. Version 8 : variante standard « Debout » (« Mollets machine — Debout » : mollets seul, mollets debout, standing calf raise, calf press) et variante distincte « Assis », avec son propre historique et son dessin (mollets assis, seated calf raise, calf assis).
- Abducteurs machine (jambes, sous-groupe fessiers, machine) : assis, on écarte les jambes. Synonymes : abducteurs, abduction, machine abducteurs, hip abduction, abductor machine, fessiers machine.
- Adducteurs machine (jambes, sous-groupe adducteurs, machine) : assis, on ramène les jambes. Synonymes : adducteurs, adduction, machine adducteurs, hip adduction, adductor machine. Abducteurs et adducteurs ne sont jamais confondus (abduction ≠ adduction).

Ajouts de la bibliothèque version 8 (groupe principal, groupes secondaires, matériel ; synonymes dans docs/bibliotheque.md). Quand deux versions ne sont pas comparables en charge, ce sont deux variantes distinctes, avec historiques séparés :

- Pectoraux : Développé incliné (pectoraux ; épaules, triceps ; barre), variantes « Barre » (standard) et « Haltères » ; Développé couché haltères (pectoraux ; triceps, épaules ; haltères), distinct du développé couché à la barre ; Écarté à la poulie, vis-à-vis, cable crossover (pectoraux ; épaules ; poulie).
- Dos : Tractions assistées (dos ; biceps ; machine), réglage « assisté » activé comme les dips assistés (§7.12) ; Rowing barre (dos ; biceps ; barre) ; Pull-over à la poulie (dos ; poulie) ; Lombaires au banc (dos ; banc) ; Shrugs (dos ; haltères).
- Épaules : Développé militaire haltères (épaules ; triceps ; haltères) ; Oiseau / reverse pec deck (épaules ; dos), variantes « Machine » (standard, reverse pec deck) et « Haltères » (oiseau buste penché) ; Face pull (épaules ; dos ; poulie) ; Élévations frontales (épaules ; haltères).
- Biceps : Curl marteau (haltères) ; Curl pupitre / Larry Scott (barre) ; Curl biceps barre EZ (barre), exercice distinct du curl à la barre droite.
- Triceps : Barre au front / skull crusher (barre) ; Kickback (haltère) ; Extension triceps poulie à la barre (variante « Barre » de l'extension triceps poulie, ci-dessus).
- Jambes : Hack squat (jambes ; quadriceps ; machine) ; Squat kettlebell, goblet squat : kettlebell tenu à deux mains contre la poitrine, sans machine (jambes ; quadriceps ; kettlebell). « squat » seul désigne le squat kettlebell.

Bibliothèque version 9 (précision validée) : le « Tirage horizontal » de l'utilisateur n'est pas le tirage à la poulie basse, mais une machine de rowing assis avec appui pectoral (assis, poitrine contre un coussin, poignées sur bras articulés, pile de poids, machine courante chez Basic-Fit). Toutes ses séances de « Tirage horizontal » ont été faites sur cette machine.

- **Tirage horizontal machine (appui pectoral)** : même identifiant que l'ancien « Tirage horizontal » (`tirage-horizontal`), donc même historique, mêmes prises et mêmes compteurs. Dos ; biceps ; machine. Synonymes : tirage horizontal, tirage horizontal machine, rowing machine, rowing assis machine, seated row, seated row machine, chest supported row, machine row ; les synonymes appris des notes (« Seated row horizontal ») sont gardés. Pictogramme : aucun dessin de cette machine sous licence vérifiable.
- **Tirage horizontal poulie basse** (`tirage-horizontal-poulie-basse`), nouvel exercice distinct, sans historique. Dos ; biceps ; poulie. Synonymes : tirage poulie basse, rowing poulie basse, seated cable row, cable row, low row, tirage horizontal poulie. Il reprend le dessin du tirage à la poulie (« Seated cable rows ») ; trois prises.
- Sur une base existante, une seule fois : le tirage horizontal est renommé et ses synonymes d'origine remplacés, même s'il a été personnalisé (un nom personnalisé et les synonymes ajoutés à la main sont gardés) ; la poulie basse est ajoutée (jamais recréée si elle est supprimée ensuite). Les séances passées restent rattachées à la machine. Une sauvegarde antérieure reçoit la même correction : elle ne réintroduit ni l'ancien nom ni « Tirage poulie basse » sur la machine.

Bibliothèque version 10 (précision validée) : un groupe secondaire doit être réellement sollicité, pas anecdotique, puisqu'il compte pour ½ séance dans le récapitulatif hebdomadaire (§19.6). Les trois écartés (pec deck, écarté couché haltères, écarté à la poulie) perdent les épaules : ce sont des mouvements d'isolation des pectoraux. Les mouvements composés gardent leur second groupe : tirages, rowings et tractions assistées → biceps ; développés → triceps et épaules ; dips assistés → pectoraux ; oiseau et face pull → dos. Sur une base existante, la correction est appliquée une seule fois, seulement si les groupes n'ont pas été personnalisés ; une sauvegarde antérieure, fusionnée, ne remet pas les épaules.

Volontairement non ajoutés (choix de l'utilisateur) : abdominaux (crunch à la poulie, relevés de jambes), squat à la barre, hip thrust, soulevé de terre jambes tendues, fentes. Les exercices au poids du corps (pompes, tractions et dips sans aide) et le gainage ne sont pas intégrés : l'utilisateur les fait hors application.

Chaque version de la bibliothèque est installée une seule fois sur une base existante, sans perte de données et sans recréer un exercice supprimé ensuite. Une variante ajoutée à un exercice existant (mollets assis, extension poulie à la barre) l'est aussi une seule fois, sauf si une variante du même nom existe déjà ; la variante standard prend son nom (« Debout », « Corde ») si elle s'appelle encore « Standard », et ses synonymes appris sont conservés.

Dans les notes de l'utilisateur, « leg curl » désigne toujours la version assise et « curl ischios » la version allongée. Pour les élévations latérales, le matériel est précisé dans le nom (« haltères » ou « machine ») ; s'il ne l'est pas (« latéral raise », « élévations latérales »), l'aperçu d'import demande de choisir, sans rattachement par défaut. Le choix fait dans l'aperçu est mémorisé comme synonyme pour les imports suivants. Un nom importé identique, mot pour mot, à un nom ou à un synonyme de la bibliothèque est reconnu directement (« leg curl allongé » → Curl ischios) ; en cas de doute entre les deux machines, l'aperçu d'import demande de choisir.

Cette liste est un point de départ modifiable dans les réglages. Les exercices ajoutés à cette liste après une première installation sont installés une seule fois sur une base existante, sans recréer ceux que l'utilisateur a supprimés. Une correction de nom ou de synonymes de la bibliothèque n'est appliquée à une base existante que si l'utilisateur ne les a pas personnalisés ; identifiants, variantes, synonymes appris et historique sont toujours conservés. Une sauvegarde d'une version antérieure ne réintroduit jamais d'anciens noms ou synonymes de la bibliothèque.

### 4.0.1. Illustrations

Les illustrations doivent aider à distinguer les machines et les variantes proches. Elles doivent être embarquées dans l'application et utilisables hors ligne.

N'utiliser que des ressources dont la licence autorise explicitement la réutilisation (domaine public, CC0 ou licence libre compatible). Indiquer la source et la licence dans le dépôt. Ne pas télécharger d'images sans licence vérifiable.

Si aucune illustration fiable n'est disponible, utiliser des pictogrammes SVG simples et cohérents par groupe musculaire et type de matériel, plutôt qu'une image trompeuse.

Sur la fiche, l'illustration est réduite à une vignette, agrandie au toucher avec son attribution dessous (§3.5).

### 4.1. Recherche unique par exercice, machine ou groupe musculaire

La bibliothèque doit comporter **une seule barre de recherche polyvalente**, accessible rapidement pendant une séance.

Cette barre doit permettre deux types de recherche complémentaires.

**A. Recherche par nom d'exercice ou de machine**

Exemples :

- `chest press`
- `pec deck`
- `seated row`
- `lat pulldown`
- `curl biceps`
- `tirage vertical`
- `biceps poulie corde`

L'application doit afficher les exercices et variantes correspondants.

Si plusieurs machines ou variantes correspondent, présenter plusieurs résultats distincts. Ne pas choisir arbitrairement une machine pour l'utilisateur.

**B. Recherche par groupe musculaire**

Exemples :

- `dos`
- `pectoraux`
- `biceps`
- `triceps`
- `épaules`
- `jambes`
- `abdominaux`

La recherche doit comprendre qu'un terme comme `dos` désigne un groupe musculaire et proposer les exercices associés, même si le mot « dos » ne figure pas dans leur nom.

La liste doit présenter les exercices réellement présents dans la bibliothèque, et non des résultats inventés.

Un exercice peut appartenir à plusieurs groupes musculaires. Distinguer le groupe principal des groupes secondaires lorsque cela améliore la pertinence des résultats (groupe principal classé en premier).

### 4.2. Exigences techniques de recherche

La recherche doit :

- Afficher les résultats instantanément pendant la saisie, sans devoir appuyer sur Entrée.
- Fonctionner avec une correspondance partielle.
- Ignorer les majuscules et les minuscules.
- Tolérer les accents et les variantes courantes d'écriture.
- Reconnaître les synonymes français et anglais.
- Rechercher dans les noms, les synonymes, les groupes musculaires, les variantes et le matériel.
- Fonctionner hors ligne.
- Afficher une liste claire avec nom, illustration si disponible, groupe musculaire principal et variante éventuelle.
- Permettre d'ajouter directement un résultat à la séance en cours.
- Mettre en avant les exercices récents et favoris lorsque la recherche est vide, avec des puces de filtre par groupe musculaire et les prises d'un même exercice regroupées en une entrée (§3.5).

La recherche doit reposer sur des métadonnées structurées, et non sur une simple recherche textuelle dans le nom affiché.

Si aucun résultat n'est trouvé, afficher un message discret et permettre de créer un exercice personnalisé.

### 4.2.1. Lexique d'équivalences (précision validée)

Les notes mélangent le français, l'anglais et l'argot de salle : « latéral raise haltère » doit trouver « Élévations latérales haltères », exactement comme « élévation latérale haltères ».

- Un lexique d'équivalences mot à mot, dans un fichier de données séparé et facile à compléter (`src/library/lexique.json`), associe chaque forme de référence à ses autres écritures. Il est appliqué après la normalisation (accents, majuscules, pluriels) et avant la comparaison, de la même façon sur la saisie et sur les noms et synonymes de la bibliothèque, en recherche comme à l'import. L'expression la plus longue l'emporte (« lat pulldown » avant « lats »).
- Matériel et mouvements : haltère, haltères, dumbbell, dumbbells, DB → haltères ; poulie, câble, cable → poulie ; barre, barbell, bar → barre ; élévation, élévations, raise → élévation ; latéral, latérale, latéraux, latérales, lateral → latéral ; développé, press → développé ; écarté, fly, flye → écarté ; tirage vertical, pulldown, lat pulldown, lat pull → tirage vertical ; tirage horizontal, seated row → tirage horizontal ; incliné, inclinée, incline → incliné ; assis, seated → assis ; allongé, lying → allongé ; assisté, assisted → assisté ; corde, rope → corde ; rowing, row → rowing ; kettlebell, kettle bell, KB → kettlebell ; hack, hack squat → hack squat ; debout, standing → debout ; traction(s), pull-up, pull up, chin-up → traction ; pull-over, pullover → pull-over ; lombaire(s), lower back, back extension, hyperextension → lombaire ; shrug(s), haussement d'épaules → shrug ; oiseau, reverse pec deck, pec deck inversé, reverse fly, rear delt fly → oiseau ; frontal(e)(s), front → frontal ; marteau, hammer → marteau ; pupitre, preacher, Larry Scott → pupitre ; EZ, barre EZ, EZ bar → EZ ; kickback, kick back → kickback.
- Groupes musculaires : pec, pecs, pecto, pectos, pectoraux, chest → pectoraux ; épaule, épaules, shoulder, shoulders, delto, deltoïdes, delts → épaules ; dos, back, dorsaux, lats → dos ; biceps, bi, bis → biceps ; triceps, tri, tris → triceps ; jambe, jambes, leg, legs → jambes ; quadri, quadriceps, quads → quadriceps ; ischio, ischios, ischio-jambiers, hamstrings → ischio-jambiers ; mollet, mollets, calf, calves → mollets ; fessier, fessiers, fesses, glutes → fessiers ; adducteur, adducteurs, adductor, adductors → adducteurs ; abdo, abdos, abdominaux, abs → abdominaux. Autre équivalence : abducteur, abducteurs, abductor, abductors → abducteurs (pas un groupe).
- Expressions protégées, gardées mot pour mot : « pec deck » et « pec fly » trouvent toujours ces exercices précis, pas seulement le groupe pectoraux ; « leg curl » et « curl ischios » restent deux machines distinctes.
- Un mot de matériel (haltères, machine, poulie, barre) départage les variantes : si des résultats ou des candidats ont ce matériel, les autres sont écartés (« latéral raise haltère » → haltères, jamais la machine). Si aucun ne l'a, il n'exclut rien (« tirage vertical machine » trouve le tirage vertical, à la poulie).
- Mots inconnus de la bibliothèque et du lexique : la recherche ignore un mot inconnu si au moins deux autres mots sont reconnus et plus nombreux, et le signale discrètement (« Mot non reconnu, ignoré : xyz ») ; « tirage nuque » ne trouve rien. L'import propose l'exercice mais demande une confirmation explicite (« Mot non reconnu… Vérifiez l'exercice proposé », bouton « J'ai vérifié »), jamais retenu d'office.
- À l'import, un nom de groupe seul (« pec », « pecs », « pectoraux ») désigne un groupe : les exercices du groupe sont proposés et le choix est obligatoire. Un nom identique à un nom ou synonyme de la bibliothèque une fois le lexique appliqué, dans n'importe quel ordre (« lateral raise dumbbell »), est reconnu directement.
- Sous-groupes des jambes (précision validée) : « ischios » trouve le leg curl et le curl ischios ; « quadri » trouve le leg extension et la presse à cuisses ; « jambes » trouve tous les exercices de jambes. Pour cela, la presse à cuisses n'a que les quadriceps en groupe secondaire (bibliothèque version 5 : correction appliquée une seule fois à une base existante si ses groupes n'ont pas été personnalisés ; une ancienne sauvegarde ne réintroduit pas les ischio-jambiers). « mollets » trouve les mollets machine, « fessiers » les abducteurs machine, « adducteurs » les adducteurs machine (bibliothèque version 7). Le récapitulatif hebdomadaire n'est pas concerné : tout reste compté dans « Jambes » (§19.6).
- Version 8 : « squat » seul, goblet squat, squat kettlebell, squat KB → Squat kettlebell ; « hack », « hack squat » → Hack squat ; « quadri » trouve aussi le hack squat et le squat kettlebell. « barre au front » est une expression protégée (le mot « front » n'y devient pas « frontal »). « pec deck » ne trouve toujours que le pec deck, jamais l'oiseau (reverse pec deck).
- Matériel d'une variante : une variante dont le nom désigne un matériel (« Haltères », « Barre ») a ce matériel, et non celui de son exercice : « développé incliné barre » ne trouve pas la variante haltères. À égalité, la recherche présente la variante standard d'abord (« mollets » : debout, puis assis).
- Import : un mot inconnu est écarté du rapprochement quand au moins deux autres mots sont reconnus et plus nombreux (« shoulder press xyz » propose le développé épaules machine, à confirmer) ; un nom identique à un exercice une fois sa prise ou son angle retirés (« Développé couché prise serrée ») désigne cet exercice et sa variante, même si un exercice voisin partage des mots (« Développé couché haltères »).
- Fautes de frappe : la recherche tolère une lettre de différence dans un mot inconnu (« extenzion »), mais un mot connu de la bibliothèque n'est jamais lu comme une faute de frappe d'un autre : « abducteurs » ne trouve jamais les adducteurs, ni « abduction » l'adduction.
- « seated row », « row assis » et « tirage horizontal » trouvent le Tirage horizontal machine (appui pectoral) en premier, pas le Rowing haltère, malgré l'équivalence row → rowing (l'expression la plus longue l'emporte, et « assis » doit correspondre).
- Version 9 : « tirage horizontal » et « seated row » seuls désignent la machine à appui pectoral, en recherche comme à l'import ; « poulie basse », « cable row », « câble » (« tirage horizontal câble ») désignent le tirage à la poulie basse. « row assis » convient aux deux : l'import demande de choisir. « appui pectoral » et « chest supported » sont des expressions protégées : la machine n'est jamais un résultat de « pec », « chest » ou « pectoraux ».

### 4.3. Gestion des variantes

Chaque variante dont les performances ne sont pas directement comparables doit posséder son propre historique.

Exemples :

- Curl biceps à la poulie avec corde.
- Curl biceps avec haltères.
- Tirage vertical avec une prise différente (§4.3.1).
- Machines différentes pour un même groupe musculaire.

Ne jamais mélanger automatiquement les performances de variantes distinctes.

### 4.3.1. Prises (précision validée)

- Trois prises seulement, chacune une variante distincte avec son propre historique : **prise très large**, **prise moyenne**, **prise serrée**. Pas de supination, de pronation ni de prise neutre (ces mots ne créent aucune variante).
- Sans précision de prise, un exercice est en prise moyenne : pour un exercice à prise, la variante standard s'appelle « Prise moyenne » (identifiant et historique inchangés) et s'affiche « Tirage vertical — Prise moyenne ». Un exercice sans prise (pec deck, crunch…) garde sa variante standard sans nom affiché.
- Exercices à prise : le tirage vertical, le tirage horizontal machine et le tirage horizontal poulie basse (version 9), avec leurs trois prises créées d'avance (bibliothèque version 6 ; sur une base existante, la variante standard est renommée si elle s'appelle encore « Standard » et les prises manquantes sont ajoutées une seule fois, sans doublon d'une prise déjà créée par un import), puis tout exercice qui reçoit une prise très large ou serrée (import, création d'une variante).
- Équivalences d'écriture du lexique (§4.2.1), sans jamais fusionner deux prises différentes : prise très large, très large, prise large, large, wide, wide grip, extra wide → prise très large ; prise moyenne, moyenne, normale, classique, standard → prise moyenne ; prise serrée, serrée, serré, très serrée, close, close grip, narrow → prise serrée. Une variante créée prend le nom de référence de sa prise ; deux écritures d'une même prise ne créent jamais deux variantes.
- Le récapitulatif hebdomadaire ne change pas : toutes les prises d'un exercice de dos comptent comme « Dos » (groupe principal de l'exercice).

Permettre d'ajouter, modifier et personnaliser des exercices, des variantes et leurs métadonnées.

Chaque exercice et chaque variante a un **identifiant interne stable**, indépendant de son nom. Renommer un exercice ou modifier ses synonymes ne doit jamais casser ni séparer son historique.

Un exercice ou une variante qui possède un historique ne peut pas être supprimé : il peut seulement être archivé (masqué de la recherche, historique conservé et toujours consultable). Un exercice sans historique peut être supprimé après confirmation.

## 5. Démarrage et déroulement d'une séance

Le déroulement doit être aussi fluide que possible.

### 5.1. Démarrer une séance

Au démarrage :

- Créer une nouvelle séance avec un identifiant unique.
- Enregistrer la date et l'heure de début.
- Démarrer automatiquement le chronomètre global.
- Permettre l'ajout rapide d'exercices.
- Enregistrer automatiquement les modifications importantes.

### 5.2. Sélectionner un exercice

Depuis la bibliothèque ou la barre de recherche, sélectionner l'exercice souhaité.

Afficher immédiatement :

- L'image ou l'illustration.
- Le nom et la variante exacte.
- Le dernier poids utilisé.
- Les dernières répétitions réellement réalisées, série par série.
- Le statut couleur.
- La prochaine cible calculée par le moteur.

Les exercices récemment utilisés doivent être particulièrement faciles à retrouver.

Un même exercice-variante ne peut être ajouté qu'une seule fois par séance. S'il est déjà présent, l'application ouvre l'exercice existant au lieu d'en créer un second.

Les exercices de la séance sont affichés dans l'ordre où je les ai ajoutés.

### 5.3. Préparer l'exercice

Valeurs par défaut :

- 3 séries.
- Une cible comprise entre 8 et 12 répétitions par série.
- Le dernier poids utilisé, prérempli.
- La prochaine cible déterminée par le moteur de progression.

Lorsque le moteur recommande un changement de charge (§7.6, §7.8), afficher clairement « Poids supérieur » ou « Poids inférieur » et mettre en évidence le champ de poids pour que je saisisse la nouvelle charge. Le moteur n'indique jamais de valeur précise : c'est moi qui saisis le poids réellement disponible sur la machine ou en poids libres.

Pour un exercice jamais réalisé, demander uniquement le poids de départ ; la cible est 3×8.

Ne pas demander à l'utilisateur de remplir un formulaire pour déterminer la cible.

Le poids doit être modifiable facilement. Le nombre de séries et la cible peuvent être ajustés ponctuellement si nécessaire (voir §7.7 pour l'effet sur les validations).

**Protection contre les fautes de frappe :** si le poids saisi diffère de plus de 50 % du dernier poids utilisé sur cet exercice-variante (par exemple 520 au lieu de 52), demander une confirmation simple avant de l'enregistrer. Refuser un poids nul, négatif ou non numérique.

Prévoir une validation rapide de la préparation de l'exercice.

**Actions secondaires (précision validée, version 1.19.0)** : « Ajuster séries et répétitions », « Voir la fiche de l'exercice » et « Retirer de la séance » sont dans un menu « ⋯ » en haut de la carte ouverte, jamais affichés en permanence sous le pouce. Retirer un exercice demande une confirmation (« Retirer cet exercice de la séance ? », « Oui, retirer » / « Non ») ; « Annuler » reste proposé quelques secondes après (§13). Même chose pour un bloc de cardio (« Corriger », « Retirer »).

### 5.3.1. Repère de progression (précision validée)

Quand j'ajoute un exercice à la séance et que sa cible a changé depuis ma dernière séance sur cet exercice-variante, une courte mention s'affiche sous la ligne de cible (§5.3.2), en blanc et en gras (version 1.19.0 : plus d'encadré) :

- « ↑ +1 rép. » pour une hausse de répétitions recommandée par le moteur (« ↑ +2 rép. » si l'écart est de deux) ;
- « ↑ Poids supérieur » et « ↓ Poids inférieur » (« ↑ Moins d'aide » et « ↓ Plus d'aide » pour un exercice assisté, §7.12). Dans la carte de séance, tant que la charge n'a pas été changée, la mention donne aussi la cible qui suivra : « ↑ Poids supérieur → 3 × 8 ».

Pas de repère quand la cible ne change pas (palier conservé, exercice jamais réalisé, nouvelle cible déjà faite à la séance précédente). Le repère disparaît si je saisis une autre charge ou une autre cible : ce n'est plus la progression recommandée. Même repère sur la fiche de l'exercice, sous « Prochaine cible ». Il est dérivé de la recommandation du moteur et de la dernière performance réelle, sans règle nouvelle. Pas de vert, d'orange ni de rouge : ces couleurs sont réservées aux statuts (§8).

### 5.3.2. Dernière fois / Prochaine cible (précision validée)

Sur la fiche d'un exercice et en haut de sa carte dans l'écran de séance (au-dessus du champ de poids), le bloc est séparé en deux zones, avec un fin séparateur entre elles :

- **Dernière fois** : zone secondaire. Libellé et texte gris clair, en plus petit : poids · répétitions · date courte numérique (« 15/10 ») · pastille de statut. **Jamais tronquée** (version 1.19.0) : sur un écran étroit ou avec un texte agrandi, la ligne passe à la ligne entre deux éléments, chaque élément restant entier. Pour un exercice jamais réalisé : « jamais réalisé ».
- **Record** (fiche seulement, §19.9) : sous « Dernière fois », une ligne « 👑 Record : 3 × 9 à 20 kg (16 oct.) », couronne dorée.
- **Prochaine cible** : zone principale. Libellé visible, puis **une seule ligne de cible**, en grand et en gras, dans la couleur du groupe de l'exercice (§3.2), **avec la charge** : « 3 × 9 à 12 kg », « 3 × 9 avec 25 kg d'aide ». Dans la carte de séance, cette ligne suit la charge et la cible réellement saisies (elle remplace l'ancienne ligne « Cible : 3 × 9 », supprimée) ; sur la fiche, c'est la cible recommandée, sans charge quand le moteur recommande d'en changer (« 3 × 8 »). Sous la cible, une courte mention :
  - quand la cible change : le repère de progression (§5.3.1) ;
  - quand la cible est identique à la dernière fois : une mention discrète « = Même cible : consolide » ;
  - pour un exercice jamais réalisé : « Poids de départ à saisir ».
- Pendant la séance, si je saisis une autre charge ou une autre cible que celle recommandée, le repère disparaît (§5.3.1) et aucune mention ne le remplace : ce n'est plus la progression recommandée.
- Pas de vert, d'orange ni de rouge en dehors de la pastille de statut.

### 5.4. Enregistrer les séries

Afficher directement les séries prévues et préremplir les répétitions avec la cible actuelle.

Exemple pour une cible de 9 :

- Série 1 : 9 répétitions.
- Série 2 : 9 répétitions.
- Série 3 : 9 répétitions.

Permettre de corriger rapidement le nombre de répétitions réellement effectuées avec des boutons `+` et `−` ou un contrôle équivalent.

**Je ne dépasse jamais la cible fixée.** Le nombre de répétitions d'une série ne peut donc pas dépasser la cible de l'exercice : le bouton `+` est bloqué à la valeur cible. Il n'y a pas de cas « au-dessus de la cible » à gérer.

Les répétitions réellement réalisées doivent être enregistrées. Ne jamais remplacer les performances réelles par les valeurs théoriques prévues.

Ne pas imposer de ressenti individuel pour chaque série.

Permettre de corriger facilement une série enregistrée par erreur.

### 5.5. Ressenti global de l'exercice

À la fin de l'exercice, proposer une seule évaluation globale sur cinq niveaux :

- Très mal passé.
- Mal passé.
- Moyen.
- Bien passé.
- Très bien passé.

Cette évaluation porte sur l'ensemble de l'exercice, pas sur une série individuelle.

Elle doit être rapide à sélectionner et enregistrée avec les performances.

Ne pas ajouter de commentaire obligatoire, de justification écrite ou de questionnaire supplémentaire.

Le ressenti global contribue au calcul du statut (§7.4), mais ne suffit jamais à lui seul pour valider une augmentation.

Si aucun ressenti n'est sélectionné, il est enregistré comme « inconnu » (voir §7.4).

**Précisions validées :**

- Un ressenti sélectionné peut être remplacé par un autre niveau, mais jamais effacé : un nouvel appui sur le niveau déjà sélectionné ne change rien.
- Un ressenti « inconnu » rend la performance orange et remet le compteur de validations à 0. Pour éviter un oubli, la confirmation de fin de séance (§5.6) liste les exercices ayant au moins une série enregistrée mais sans ressenti, et permet de choisir le ressenti de chacun directement dans cette confirmation. L'utilisateur peut ensuite terminer la séance, que les ressentis aient été complétés ou non.
- Boutons de ressenti (version 1.19.0) : 48 px de haut au moins, 8 px d'écart, libellé sur une seule ligne (deux rangées si l'écran est étroit). Dans la confirmation de fin, tant qu'un ressenti manque, ses cinq boutons sont l'action principale (bleus) ; une fois un niveau choisi, seul celui-ci reste bleu.

### 5.6. Terminer une séance

Prévoir une action claire pour terminer la séance.

**Confirmation en volet (précision validée, version 1.19.0)** : « Terminer la séance » ouvre un volet fixé en bas de l'écran, toujours visible sans défiler, sur un fond assombri : « Terminer la séance ? », les ressentis manquants (§5.5), le cardio non validé, puis « Oui, terminer » (bouton principal, bleu) ou, s'il manque encore un ressenti, « Terminer sans compléter » (bouton secondaire) ; « Non, continuer la séance » (ou le fond, ou Échap) referme le volet.

À la fin :

- Arrêter le chronomètre global.
- Enregistrer l'heure de fin et la durée totale.
- Conserver tous les exercices, séries, répétitions, charges et ressentis.
- Mettre à jour le profil global de progression.
- Recalculer les recommandations futures.
- Afficher un récapitulatif simple.

**Exercices sans série (précision validée).** À la fin de la séance, les exercices auxquels aucune série n'a été enregistrée sont retirés automatiquement de la séance terminée : ils n'entrent pas dans l'historique et n'ont aucun effet sur le moteur. Le récapitulatif l'indique et propose « Annuler » : les exercices sont alors rétablis dans la séance et comptent comme séances incomplètes (§7.4, §7.11 F).

La séance doit être enregistrée avant de demander un éventuel nom personnalisé.

Proposer un nom généré automatiquement, par exemple :

`Séance du 12 octobre 2026 — 15 h 45`

Le nom doit pouvoir être modifié facilement, par exemple en « Haut du corps » ou « Pectoraux et dos ».

L'utilisateur doit pouvoir conserver le nom par défaut en une action. Le nommage ne doit jamais entraîner la perte d'une séance. Le récapitulatif se termine par un bouton « Retour à l'accueil » (version 1.19.0), qui garde le nom saisi.

### 5.7. Cardio (précision validée)

Version minimale : le cardio est un simple enregistrement dans la séance.

**Saisie**

- Dans une séance, en plus des exercices de musculation, un bloc de cardio peut être ajouté à tout moment (début, milieu, fin). Une séance peut en contenir plusieurs, affichés dans l'ordre d'ajout.
- Machines proposées par défaut : Tapis de marche, Rameur, Vélo elliptique, Vélo (vélo classique, sans inclinaison), Autre. La liste est modifiable dans les réglages (ajouter, renommer, retirer, indiquer si la machine se règle en inclinaison). Un bloc enregistré garde le nom de sa machine : renommer ou retirer une machine ne modifie pas l'historique. Une machine ajoutée à la liste par défaut après une première installation (comme « Vélo ») est ajoutée une seule fois à une liste déjà enregistrée, avant « Autre », sans doublon de nom et sans recréer une machine que l'utilisateur a retirée ensuite.
- Tapis de marche uniquement : inclinaison en trois niveaux, Neutre, Moyenne ou Haute, avec trois boutons (Neutre par défaut). Aucune valeur en pourcentage.
- Durée en minutes entières (1 à 600), seule donnée obligatoire. Distance en km facultative.
- Saisie en quelques secondes : machine (la première de la liste est présélectionnée), inclinaison si tapis, durée, « Valider ». Un bloc peut être corrigé ou retiré depuis son menu « ⋯ » ; le retrait est toujours confirmé, et annulable quelques secondes pendant la séance.
- Bloc rempli mais pas validé au moment de « Terminer la séance » (précision validée) : la confirmation l'affiche (« Cardio non validé : Vélo elliptique · 11 min ») et le bouton devient « Enregistrer le cardio et terminer » ; une saisie invalide bloque la fin avec un message (« Non, continuer la séance » pour la corriger ou l'annuler). Un formulaire ouvert mais vide ne change rien.

**Règles**

- Ni progression, ni couleur, ni ressenti, ni calories. Aucun effet sur le moteur (§7) : profil, statuts et recommandations sont identiques avec ou sans cardio.
- Le cardio n'entre dans aucun groupe musculaire du récapitulatif hebdomadaire ; l'en-tête affiche le total de la semaine (§19.6).
- Une séance ne contenant que du cardio est une séance comme une autre : elle est enregistrée à la fin et compte dans l'en-tête du récapitulatif.
- Réutiliser une séance (§10) ne reprend que ses exercices, pas son cardio.

**Affichage** : la séance en cours, le récapitulatif de fin de séance, l'historique (liste : « 2 ex. · 20 min cardio ») et le détail d'une séance passée affichent les blocs : machine, inclinaison, durée et distance éventuelle (« Tapis de marche · inclinaison haute · 20 min »).

**Import de notes** : une ligne avec une durée en minutes est un bloc de cardio (« Tapis 15 min », « Tapis incliné 20 min », « Marche inclinée haute 20min », « Rameur 10 min », « Elliptique 15 min », « Vélo elliptique 20 min ») ; la machine peut aussi être sur la ligne précédente. La machine est reconnue d'après la liste des réglages et des noms usuels (« tapis » et « marche » → tapis ; « vélo » seul → Vélo, le vélo classique ; « elliptique » ou « vélo elliptique » → Vélo elliptique). « Tapis » ou « marche » sans précision : inclinaison Neutre. « Incliné » ou « inclinée » sans niveau : l'aperçu demande de choisir Moyenne ou Haute (import bloqué jusque-là). Une machine non reconnue est à choisir dans l'aperçu (ou le bloc est exclu), jamais devinée. Un JSON simple peut contenir une liste `cardio` (`machine`, `minutes`, `inclinaison`, `distanceKm`).

**Données** : les blocs sont inclus dans l'export et l'import JSON (format `schemaVersion` 3, puis 4 avec les activités habituelles, §19.8) ; une sauvegarde au format 2 est migrée sans perte. Une installation existante n'a aucune migration de base à subir : ses séances, sans cardio, restent intactes, et la liste de machines par défaut s'applique. Deux séances qui ne diffèrent que par leur cardio ne sont pas des doublons (§11.9).

### 5.8. Mode salle (précision validée, version 1.20.0)

Pendant la saisie d'une séance (écran de séance, ajout d'un exercice), l'écran est plein et la barre d'onglets masquée :

- En haut, l'en-tête collant (flèche « ‹ », nom de la séance, chronomètre, « Enregistré »), puis la liste compacte des exercices : nom, charge et séries faites (« 30 kg · 0/3 »), avec la couronne d'un nouveau record ; un seul exercice ouvert à la fois, comme avant. Les blocs de cardio suivent.
- En bas, une barre fixe dans la zone du pouce, au-dessus de la zone système : « + Exercice » (bouton principal, un peu plus large), « + Cardio » (ouvre le formulaire et l'amène à l'écran), « Terminer » (ouvre le volet de fin, §5.6). Libellés en 15 px sur une ligne, même à 360 px avec le texte agrandi.
- La flèche « ‹ » ramène à l'onglet Séance sans terminer la séance, qui reste enregistrée et se reprend en un appui (« Reprendre la séance »), sur l'exercice qui était ouvert.

## 6. Chronomètre global de séance

Mettre en place un seul chronomètre global.

Il démarre automatiquement au début de la séance et s'arrête uniquement lorsque la séance est terminée.

Il ne doit pas être réinitialisé entre les séries ou les exercices.

Il doit continuer à représenter le temps écoulé pendant les repos, les changements de machine et les interruptions temporaires de l'application.

Enregistrer l'horodatage de début et calculer le temps écoulé à partir de cet horodatage. Ne pas se contenter d'incrémenter un compteur en mémoire.

Restaurer un chronomètre cohérent après fermeture, rechargement ou passage en arrière-plan.

**Séance oubliée :** si, à la réouverture, une séance est en cours depuis plus de 4 heures, proposer de la terminer en indiquant l'heure de fin réelle (préremplie avec l'heure de la dernière modification), ou de la poursuivre. Ne jamais la terminer ni la supprimer automatiquement.

Conserver la date, les heures de début et de fin, la durée totale et les performances détaillées.

Aucun chronomètre de repos n'est nécessaire dans la première version.

## 7. Moteur de surcharge progressive

**Cette partie est essentielle. Toutes les décisions de progression doivent respecter exactement les règles suivantes. En cas de doute, appliquer la règle la plus prudente (consolidation) et me le signaler.**

Le moteur fonctionne automatiquement à partir de l'historique enregistré. Il ne demande pas à l'utilisateur d'analyser ses statistiques ni de valider manuellement une progression.

### 7.1. Vocabulaire

- **Exercice-variante** : un exercice dans une variante précise. Chaque exercice-variante a son propre historique et ses propres compteurs.
- **Palier** : le couple (poids, cible de répétitions) pour un exercice-variante. Exemple : 45 kg à 3×9.
- **Performance** : les répétitions réellement effectuées à chaque série, plus le ressenti global, pour un exercice-variante dans une séance.
- **Séance complète** : toutes les séries prévues ont été enregistrées (3 par défaut).
- **Séance standard** : séance complète, faite avec le nombre de séries standard de l'exercice (3 par défaut) et la cible recommandée par le moteur.

### 7.2. Plage de répétitions

Par défaut :

- 3 séries.
- Plage de 8 à 12 répétitions par série.

Progression habituelle :

1. 3×8.
2. 3×9.
3. 3×10.
4. 3×11.
5. 3×12.
6. Augmentation de poids après validation.
7. Retour à 3×8 avec la nouvelle charge.

Ne pas proposer de cible inférieure à 8 ou supérieure à 12 dans le parcours standard.

Des réglages spécifiques (plage, nombre de séries) peuvent exister pour certains exercices, sans modifier la plage standard par défaut. Les règles ci-dessous s'appliquent alors avec les bornes de l'exercice.

### 7.3. Correspondance des ressentis

Le ressenti est stocké sur l'échelle à cinq niveaux. Les symboles des notes importées sont convertis ainsi :

| Symbole | Ressenti stocké |
|---|---|
| `++` | Très bien passé |
| `+` | Bien passé |
| `+=` | Moyen (entre « bien passé » et « moyen ») |
| `=` | Moyen |
| `-=` | Mal passé |
| `--` | Très mal passé |
| absent | Inconnu |

Tout autre symbole est signalé à l'import et soumis à confirmation, jamais deviné.

Le symbole d'origine d'une performance importée (par exemple `+=`) est conservé avec elle et affiché dans l'historique.

**Précision validée (version 1.12.2) :** un symbole connu impose son ressenti ; `+=` est toujours Moyen (orange), jamais lu comme `+`.

- Dans l'aperçu d'import, un ressenti choisi à la main qui contredit un symbole connu le remplace : le symbole n'est alors pas enregistré. Un symbole inconnu reste conservé avec le ressenti choisi.
- Correction automatique, appliquée une seule fois à une base existante : toute performance dont le symbole d'origine est `+=` et dont le ressenti n'est pas Moyen passe à Moyen, puis le profil est recalculé. Aucun autre ressenti n'est touché. Une sauvegarde restaurée reçoit la même correction.

### 7.4. Calcul du statut (vert / orange / rouge)

Le statut est calculé pour chaque performance, de façon déterministe, selon cette table. Appliquer les règles dans l'ordre : la première qui s'applique détermine le statut.

| Ordre | Condition | Statut |
|---|---|---|
| 1 | Séance incomplète (moins de séries que prévu) | Orange |
| 2 | Au moins 2 séries sous la cible | Rouge |
| 3 | Ressenti « Très mal passé » | Rouge |
| 4 | Exactement 1 série sous la cible | Orange |
| 5 | Toutes les séries à la cible et ressenti « Moyen », « Mal passé » ou « Inconnu » | Orange |
| 6 | Toutes les séries à la cible et ressenti « Bien passé » ou « Très bien passé » | Vert |

Conséquences :

- Seule une performance verte peut compter comme validation.
- Le ressenti seul ne rend jamais une performance verte : il faut aussi toutes les répétitions.
- Des répétitions complètes avec `=` ou `-=` donnent orange : on consolide le palier.
- Une séance incomplète est orange : elle ne valide rien et n'entre pas dans le décompte des séances rouges (§7.8).

La couleur affichée pour un exercice dans la bibliothèque et les fiches est celle de sa **dernière performance**.

### 7.5. Validation d'un palier : deux séances vertes consécutives

Pour chaque exercice-variante, le moteur maintient un compteur de **validations vertes consécutives au palier actuel**.

- Une performance verte, standard, au palier actuel : compteur + 1.
- Une performance orange ou rouge au palier actuel : compteur remis à 0.
- Un changement de palier (poids ou cible différents) : compteur remis à 0 pour le nouveau palier.
- Une même séance ne peut jamais être comptée plusieurs fois.

Quand le compteur atteint **2** :

- Si la cible est inférieure à 12 : la prochaine cible est la cible + 1, au même poids.
- Si la cible est 12 : la prochaine recommandation est l'augmentation de poids (§7.6).

Exemple à 45 kg :

| Séance | Performance | Compteur | Décision |
|---|---|---|---|
| 1 | 8-8-8, Bien passé (vert) | 1 | Conserver 3×8 |
| 2 | 8-8-8, Très bien passé (vert) | 2 | Proposer 3×9 |
| 3 | 9-9-9, Bien passé (vert) | 1 | Conserver 3×9 |
| 4 | 9-9-9, Moyen (orange) | 0 | Conserver 3×9 |
| 5 | 9-9-9, Bien passé (vert) | 1 | Conserver 3×9 |
| 6 | 9-9-9, Bien passé (vert) | 2 | Proposer 3×10 |

L'historique complet n'est jamais supprimé : seul le compteur de validations consécutives est remis à zéro.

### 7.6. Augmentation du poids

**Il faut deux séances distinctes, consécutives, vertes et standard à 3×12 au même poids avant de proposer une augmentation de charge.** C'est la même règle qu'au §7.5, appliquée au palier 12.

Une seule séance à 3×12 ne suffit jamais. Une séance orange ou rouge à 3×12 ne compte pas.

Une fois les conditions validées :

1. Recommander de **passer au poids supérieur**, sans indiquer de valeur.
2. Au démarrage de l'exercice, je saisis la nouvelle charge réellement utilisée.
3. La cible revient à 3×8 avec cette nouvelle charge.
4. Recommencer le cycle de validation.
5. Conserver tout l'historique des anciennes charges.

Les écarts de charge varient selon les machines et les poids libres, et je ne les connais pas à l'avance. Le moteur ne calcule donc jamais de poids cible, ne gère aucun incrément et n'invente aucune valeur.

### 7.7. Choix de l'utilisateur et séances atypiques

L'utilisateur peut refuser la recommandation, conserver la charge ou la changer ponctuellement. Le moteur :

- Enregistre la performance réelle au poids réellement utilisé.
- Calcule toujours la suite à partir de la **dernière charge et de la dernière cible réellement utilisées**.
- Ne contourne jamais les règles : un palier choisi manuellement démarre son propre compteur à 0.

Règle de cible lors d'un changement de charge, recommandé ou non :

- Charge saisie **supérieure** à la précédente : cible 3×8.
- Charge saisie **inférieure** à la précédente : cible de répétitions conservée.
- Charge **identique** alors qu'un changement était recommandé : la recommandation est considérée comme refusée ; palier et cible inchangés, la recommandation reste affichée à la séance suivante.

Une séance non standard (nombre de séries ou cible modifiés ponctuellement, séance interrompue) est enregistrée et visible dans l'historique, mais ne compte jamais comme validation. Elle remet à 0 le compteur de validations du palier actuel uniquement si elle est faite à ce palier et qu'elle est orange ou rouge.

Un changement de machine ou de variante crée un historique distinct lorsque les performances ne sont pas comparables.

### 7.8. Réduction du poids

Le moteur maintient un compteur de **séances rouges consécutives** par exercice-variante, au même poids.

- Une performance rouge : compteur + 1.
- Une performance verte ou orange (hors séance incomplète) : compteur remis à 0.
- Une séance incomplète ne modifie pas ce compteur.

Quand le compteur atteint **4** :

- Recommander de **passer au poids inférieur**, sans indiquer de valeur ; je saisis la nouvelle charge au démarrage de l'exercice.
- Conserver la cible de répétitions du palier en cours.
- Remettre les compteurs à 0 pour le nouveau palier.

Une, deux ou trois séances rouges ne provoquent jamais de baisse de charge : la charge et la cible sont conservées.

### 7.9. Reconstruction et corrections

Le profil de progression (§9) n'est jamais modifié de façon incrémentale « à la main » : il est **recalculé en rejouant l'historique dans l'ordre chronologique**, séance par séance, avec les règles ci-dessus.

L'ordre chronologique est déterministe : tri par date, puis par heure de début lorsqu'elle est connue, puis par date d'enregistrement dans l'application. Plusieurs séances le même jour restent donc toujours dans le même ordre.

Toute modification d'une séance passée, tout import et toute suppression déclenchent ce recalcul pour les exercices-variantes concernés.

À historique et réglages identiques, le moteur doit toujours produire exactement les mêmes statuts, compteurs et recommandations.

### 7.10. Priorité des règles

Pour déterminer la prochaine cible :

1. Calculer le statut de la dernière performance (§7.4).
2. Mettre à jour les compteurs de validation (§7.5) et de rouge (§7.8).
3. Si 4 rouges consécutives : proposer la baisse (§7.8).
4. Sinon, si 2 vertes consécutives au palier : proposer la cible + 1 ou l'augmentation de poids (§7.5, §7.6).
5. Sinon : conserver le palier actuel.

Si une condition manque, interdire la progression correspondante.

### 7.11. Précisions validées

Ces règles précisent les §7.1 à §7.10. Elles ont été validées et s'appliquent telles quelles.

**A. Cible attendue et séance standard.** La cible attendue d'une séance dépend de la charge saisie :

- Charge identique au palier actuel : cible du palier, ou cible + 1 si le moteur recommande « +1 répétition ».
- Charge supérieure : borne basse de la plage de l'exercice (8 par défaut).
- Charge inférieure : cible du palier actuel conservée.

Une séance est **standard** si et seulement si elle est complète, faite avec le nombre de séries standard de l'exercice-variante, à la cible attendue, et sans changement de charge non recommandé. Une charge supérieure n'est conforme que si « poids supérieur » est recommandé ; une charge inférieure, que si « poids inférieur » est recommandé.

**B. Changement de charge non recommandé.** Une séance faite à une autre charge sans recommandation correspondante crée un nouveau palier (charge et cible réellement utilisées) avec un compteur de validations à 0. Cette séance ne valide rien ; la séance suivante à ce palier peut valider. À l'inverse, la première séance faite à une charge recommandée (supérieure ou inférieure), à la cible attendue, est standard et compte normalement.

**C. Cible choisie manuellement.** Une cible différente **à la fois** de la cible du palier actuel et de la cible recommandée crée un nouveau palier (charge et cible réellement utilisées), qui devient le palier courant avec un compteur de validations à 0. Cette séance ne valide rien ; la séance suivante à ce palier peut valider.

**D. Recommandation refusée.** Refaire le palier actuel (même charge, même cible) alors que le moteur recommande « +1 répétition », « poids supérieur » ou « poids inférieur » est un refus. Une séance de refus n'est pas standard, ne valide rien et ne change pas le palier.

- Refus avec une performance verte : compteur de validations inchangé, recommandation toujours active.
- Refus avec une performance orange ou rouge : compteur de validations remis à 0 (§7.5) ; la recommandation « +1 répétition » ou « poids supérieur » disparaît.
- Refus d'une baisse : une nouvelle rouge incrémente le compteur de rouges et maintient la recommandation ; une verte ou une orange complète remet ce compteur à 0 et la recommandation disparaît.

**E. Compteur de rouges.** Toute performance rouge au même poids compte, qu'elle soit standard ou non. Un changement de cible au même poids ne remet pas ce compteur à 0. Un changement de poids le remet à 0 ; la séance faite au nouveau poids compte 1 si elle est rouge.

**F. Séance incomplète.** Une séance incomplète au palier actuel est orange : elle remet le compteur de validations à 0 et ne modifie pas le compteur de rouges. Un exercice sans aucune série est retiré automatiquement à la fin de la séance (§5.6), sauf si l'utilisateur annule ce retrait.

**G. Première performance.** La toute première performance non partielle d'un exercice-variante fixe le palier de départ. Elle est standard si elle est complète, avec le nombre de séries standard et une cible comprise dans la plage de l'exercice (8 à 12 par défaut), même si cette cible n'est pas la borne basse. C'est notamment le cas d'un historique importé qui commence en cours de cycle.

**H. Historique partiel.** Une performance partielle (par exemple un poids sans répétitions) est ignorée par le moteur : aucun statut, aucune couleur, aucun effet sur le palier ni sur les compteurs. Elle reste visible dans l'historique, sans pastille. Un exercice jamais réalisé n'a pas de pastille.

**I. Cible hors plage.** Le moteur ne propose jamais de cible au-delà de la borne haute. À partir de la borne haute (y compris une cible manuelle supérieure), deux validations conduisent à « poids supérieur ». Sous la borne basse, la progression +1 s'applique normalement.

**J. Égalité de poids.** Deux poids sont égaux s'ils sont identiques une fois arrondis à 0,01 kg (52,5 = 52.50).

### 7.12. Exercices assistés (précision validée)

Certains exercices sont assistés (dips assistés, tractions assistées, tous deux dans la bibliothèque) : la charge saisie est une **aide**, et plus elle est basse, plus l'exercice est dur. Chaque exercice-variante possède un réglage « assisté » (désactivé par défaut).

Pour une variante assistée, le sens de la charge est inversé dans toutes les règles du §7 :

- « Poids supérieur » devient **« Moins d'aide »** : la charge à saisir est plus basse.
- « Poids inférieur » devient **« Plus d'aide »** : la charge à saisir est plus haute.
- Règle de cible du §7.7 et du §7.11 A : moins d'aide (charge plus basse) → retour à la borne basse (3×8) ; plus d'aide (charge plus haute) → cible conservée.
- Changement de charge non recommandé (§7.11 B) : apprécié dans ce même sens (moins d'aide sans recommandation « moins d'aide », ou plus d'aide sans recommandation « plus d'aide »).
- La protection contre les fautes de frappe (écart de plus de 50 %, §5.3) s'applique normalement.

L'interface parle d'« aide » pour ces variantes (champ « Aide (kg) », fiche marquée « exercice assisté »). À l'import, une charge signalée comme aide dans la source est rapprochée du réglage de l'exercice ; une incohérence est signalée.

## 8. Affichage du statut : trois couleurs uniquement

Afficher trois couleurs pour indiquer l'état de progression, calculées par le moteur selon le §7.4.

- **Vert** : performance réussie et bien vécue. Le vert ne signifie pas qu'il faut augmenter : c'est le compteur de validations qui décide.
- **Orange** : palier à consolider.
- **Rouge** : performance insuffisante ou très difficile. Aucune progression ; baisse seulement après 4 rouges consécutives.

Règles d'affichage :

- Trois couleurs seulement.
- Pas de phrase descriptive à côté du statut, comme « Dernier ressenti : très bien passé » ou « Niveau maîtrisé ».
- Couleurs identiques dans la bibliothèque, les fiches d'exercice et l'écran de séance.
- Contraste élevé en mode sombre ; la couleur ne doit pas être le seul indice (forme ou pictogramme discret en complément, pour la lisibilité).
- Couleur calculée automatiquement et non modifiable manuellement.
- Poids, séries, répétitions et prochaine cible toujours visibles.

La couleur ne déclenche jamais directement une progression.

## 9. Profil global de progression

Créer un profil global qui mémorise l'état actuel de chaque exercice-variante.

Pour chaque exercice-variante, conserver notamment :

- Les charges utilisées.
- Les répétitions réellement effectuées par série.
- Les séries complétées.
- Le ressenti global.
- Le statut calculé.
- Le compteur de validations vertes consécutives au palier actuel.
- Le compteur de séances rouges consécutives.
- La dernière performance.
- Le palier actuel.
- La prochaine cible recommandée (cible de répétitions, et éventuellement « poids supérieur » ou « poids inférieur »).

Ce profil est une donnée dérivée : il doit pouvoir être entièrement reconstruit à partir des séances et des réglages persistés (§7.9). Il peut être mis en cache pour la rapidité, mais le cache n'est jamais la source de vérité.

Il alimente la bibliothèque et les séances futures.

## 10. Historique et réutilisation des séances

Créer un historique chronologique des séances, avec :

- Nom.
- Date.
- Heure de début et de fin (lorsque connues).
- Durée.
- Exercices et variantes.
- Poids.
- Nombre de séries.
- Répétitions réellement effectuées par série.
- Ressenti global de chaque exercice.
- Origine : saisie dans l'application ou importée.

Permettre de rechercher une séance par son nom et de consulter ses détails.

Permettre de renommer et de corriger une séance passée. **Précision validée :** la date d'une séance passée est modifiable ; la séance est alors rejouée à sa nouvelle place chronologique (§7.9).

Permettre de supprimer une séance passée, après confirmation explicite, depuis son détail seulement (la liste, regroupée par mois, n'a aucun bouton, §3.5). La suppression déclenche le recalcul du profil (§7.9).

Permettre de créer une nouvelle séance à partir d'une séance historique.

**Réutiliser une ancienne séance doit créer une nouvelle séance sans jamais modifier l'originale.**

Lorsqu'une séance est réutilisée :

- Les anciens exercices sont préremplis.
- Les poids et cibles sont recalculés à partir du profil global actuel.
- Les performances historiques restent consultables.
- L'ancienne séance n'est jamais comptée une deuxième fois comme validation.

Toute modification de l'historique déclenche le recalcul des recommandations concernées.

## 11. Import de données : JSON et notes en texte brut

**L'application doit pouvoir récupérer mon historique existant sans que je sois obligé de tout ressaisir.**

Prévoir deux modes d'import complémentaires :

1. Import d'un fichier JSON ou collage de contenu JSON.
2. Import de notes de séances en texte brut, copiées-collées depuis ChatGPT, un bloc-notes ou un autre outil.

L'import de notes libres est une fonctionnalité essentielle, pas un simple bonus.

### 11.1. Interface d'import

Créer une interface simple accessible depuis les réglages ou l'historique.

Elle doit permettre :

- De sélectionner un fichier JSON. **Précision validée (Android)** : le champ fichier n'impose aucun type (`accept="*/*"`), car Android n'annonce pas toujours un .json reçu par mail ou Drive comme `application/json` (souvent `application/octet-stream`). Le contenu est validé après lecture : un fichier vide, binaire, trop volumineux ou un .json illisible ou tronqué est refusé avec un message clair, sans rien modifier ; un JSON qui n'est pas une sauvegarde suit le chemin habituel (§11.9).
- De coller directement du JSON dans un champ de texte.
- De coller des notes de séances en texte brut.
- D'afficher un aperçu des informations détectées.
- De corriger les erreurs d'interprétation.
- De confirmer l'import.

L'objectif est de pouvoir coller mes notes, vérifier rapidement les résultats et confirmer, sans reformater manuellement les données.

Un fichier d'exemple, `docs/exemples/seance-exemple-1.json`, contient la séance du §11.3 dans un format JSON simple. Il est fourni dans le dépôt. L'import JSON doit l'accepter (directement ou après adaptation proposée dans l'aperçu), et il doit servir de donnée de test.

### 11.2. Un bloc collé = une séance

**Un bloc de notes collé correspond à une seule séance.** Avant de confirmer l'import, l'application demande la date de cette séance (champ date unique, prérempli avec aujourd'hui mais à confirmer explicitement). Si une date figure dans le texte, la proposer à la place.

Pour importer plusieurs séances, je colle et confirme les blocs les uns après les autres.

### 11.3. Exemple de notes réelles à reconnaître

Le système doit être capable de traiter ce bloc, qui correspond à une séance :

```
Seated row horizontal
3x8x48kg =

Epaules latéral raise
3x8x9kgs ++

Biceps poulie corde
3×8x15 kgs ++

Biceps curl banc incliné 70°
3×8×10 kgs -=

Lat pulldown vertical
3×9×36 kgs -=

Triceps sur banc assis 1 haltere
3x8x14 kgs ++
```

L'import doit comprendre les noms d'exercices, les nombres de séries, les répétitions, les poids et les symboles de ressenti.

### 11.4. Interprétation des notations

Reconnaître les variantes d'écriture suivantes, entre autres :

- `3x8x52kg`
- `3×8×52 kgs`
- `3 séries de 8 à 52 kg`
- `3x8x52kg ++`
- `3×9×36 kgs -=`

Tolérer les espaces, les accents, les majuscules, les minuscules, les décimales (`52,5` ou `52.5`) et les différences entre le caractère `x` et le symbole `×`.

Ne pas confondre les trois informations numériques : nombre de séries × répétitions par série × poids.

Une notation `3x8x52kg` signifie : cible de 8, et 8 répétitions réellement faites sur chacune des 3 séries (8-8-8) à 52 kg. C'est donc une séance complète au palier 52 kg / 3×8.

Si les répétitions diffèrent selon les séries (par exemple `8-8-7 x 52kg`), permettre leur saisie détaillée. Si le format est ambigu, le signaler dans l'aperçu au lieu d'inventer.

### 11.5. Symboles de ressenti

Les symboles sont convertis selon la table du §7.3. Rappel de leur sens :

- `++` : très bien passé, j'aurais probablement pu faire un peu plus.
- `+` : bien passé.
- `=` : neutre, rien de particulier ; on consolide le palier.
- `-=` : plutôt difficile, dans le bas de ma capacité du jour.
- `--` : très mal passé.

Les symboles inconnus sont signalés et soumis à confirmation, jamais devinés.

Les ressentis importés sont conservés fidèlement.

### 11.6. Les séances importées comptent pour la progression

**Une séance importée est évaluée avec exactement les mêmes règles qu'une séance saisie dans l'application** (§7.4).

Exemple : `3x8x52kg ++` donne 8-8-8 à la cible de 8 avec « Très bien passé », donc une performance verte qui compte comme **1 validation** au palier 52 kg / 3×8.

À l'inverse, `3x8x52kg =` est orange et `3x8x52kg` sans symbole a un ressenti inconnu, donc orange : ni l'une ni l'autre ne valide.

Les séances importées sont insérées dans l'ordre chronologique selon leur date, puis le profil est recalculé (§7.9).

### 11.7. Reconnaissance des exercices

Utiliser la bibliothèque et ses synonymes pour associer les noms importés aux exercices existants.

Exemples de correspondances candidates :

- `Seated row horizontal` → Tirage horizontal machine (appui pectoral).
- `Lat pulldown vertical` → Tirage vertical.
- `Biceps poulie corde` → Curl biceps poulie corde, distinct du curl aux haltères.
- `Biceps curl banc incliné 70°` → Curl biceps banc incliné, en conservant la variante 70°.
- `Epaules latéral raise` → Élévations latérales haltères ou machine : matériel non précisé, l'aperçu demande de choisir (§4.0).
- `Triceps sur banc assis 1 haltere` → Extension triceps haltère assis.

Ce sont des propositions, pas des associations à imposer. Si plusieurs exercices ou variantes sont plausibles, afficher les options et demander de choisir.

Une fois une association confirmée, la mémoriser comme synonyme pour les imports suivants.

Si aucune correspondance fiable n'est trouvée, permettre de créer un exercice personnalisé.

Ne jamais mélanger automatiquement les historiques de variantes non comparables.

### 11.8. Sécurité et aperçu de l'import

Avant la confirmation, afficher un aperçu lisible comportant :

- La date et le nom de la séance.
- Les exercices reconnus et les variantes sélectionnées.
- Les poids et répétitions.
- Les ressentis reconnus.
- Le statut que chaque performance obtiendra.
- Les champs manquants ou ambigus.
- Les doublons potentiels.

Permettre de corriger les données ambiguës avant confirmation.

Ne jamais inventer des poids, des répétitions, des dates ou des ressentis absents. Si une ancienne note contient seulement un poids, l'enregistrer comme historique partiel, qui ne compte pas comme validation.

Conserver le texte original des notes avec la séance importée, pour pouvoir vérifier l'interprétation.

### 11.9. Doublons

Une séance est un doublon potentiel si une séance existe déjà à la même date avec les mêmes exercices, poids et répétitions. Les doublons potentiels sont signalés dans l'aperçu et ne sont importés qu'après confirmation explicite. Une même séance n'est jamais comptée deux fois.

Si le format JSON est inconnu, tenter d'en détecter la structure et présenter les corrections nécessaires au lieu d'échouer silencieusement.

### 11.10. Export JSON

Prévoir un export complet de l'application au format JSON, contenant les données nécessaires à une restauration :

- Séances et identifiants.
- Dates, heures et durées.
- Exercices et variantes.
- Poids et répétitions par série.
- Ressentis et textes originaux importés.
- Exercices personnalisés, synonymes appris et métadonnées.
- Réglages.
- Taille et historique des pesées (§20).
- Réglages des bilans de la semaine et du mois : bandeaux et adresse e-mail (§19.7).
- Activités habituelles hors salle : liste des habitudes (réglages), réponses « Oui » / « Non » et activités ponctuelles (§19.8), format `schemaVersion` 4 ; une sauvegarde au format 2 ou 3 est migrée sans perte (aucune activité, habitudes par défaut).
- Blocs de cardio des séances et liste des machines de cardio (§5.7).

Utiliser un format versionné (`schemaVersion`) pour permettre de faire évoluer la structure des données, avec des migrations testées.

Le profil global n'a pas besoin d'être exporté : il est reconstruit à partir de l'historique et des réglages. Après export puis import, il doit être identique.

L'import ne doit jamais supprimer ou remplacer silencieusement les données existantes. Par défaut, il fusionne ; un remplacement global demande une confirmation explicite.

### 11.11. Précisions validées

Ces règles précisent les §11.1 à §11.10. Elles ont été validées et s'appliquent telles quelles.

**A. Angle ou prise précisés dans le nom.** Un angle chiffré (« Biceps curl banc incliné 70° », « 45 degrés ») ou une prise (« prise très large », « prise serrée », « wide grip »…, les trois prises du §4.3.1) dans un nom importé désigne par défaut une variante distincte de l'exercice reconnu : la variante correspondante si elle existe déjà (« prise moyenne » désigne la variante standard), sinon une nouvelle variante nommée d'après cette précision (« 70° », « Prise très large »), avec son propre historique. L'aperçu le signale et permet de rattacher la séance à une autre variante, notamment la variante standard. Sans précision, une hésitation entre les variantes d'un même exercice propose la variante standard, à vérifier. Les autres termes (« horizontal », « plat ») ne créent pas de variante automatiquement.

**B. Répétitions détaillées.** Pour une notation série par série (`8-8-7 x 52kg`), la cible retenue est la meilleure série (ici 8), signalée dans l'aperçu pour vérification.

**C. Exercice présent des deux côtés lors d'un import JSON.** Un exercice resté identique à la bibliothèque initiale sur l'appareil prend la version importée (nom, réglages, métadonnées). Un exercice modifié sur l'appareil conserve sa version locale ; l'écart est signalé dans l'aperçu. Dans les deux cas, synonymes et variantes s'additionnent.

**D. Date d'un bloc de notes.** Modifier la date dans l'aperçu vaut confirmation explicite ; sinon, le bouton « Confirmer la date » est requis.

**E. Points à confirmer.** Une unité de poids non reconnue (« 47gs », « 47 lbs ») n'est ni convertie ni ignorée : le nombre est lu (47 kg) et signalé comme poids à confirmer ; l'import reste bloqué jusqu'à confirmation ou correction. Une remarque laissée dans un fichier JSON (champ `toConfirm`) est affichée et soumise à la même confirmation.

**F. Données de départ.** Les séances réelles de l'utilisateur (fichier de départ `mes-seances-depart.json` au format de sauvegarde, et les fichiers d'origine) sont conservées dans `perso/`, dossier ignoré par git (§22). Il n'est jamais chargé automatiquement par l'application : l'utilisateur l'importe lui-même (Importer / exporter) après l'installation. Le dépôt contient seulement des copies anonymisées équivalentes, dans `docs/exemples/` : `seance-exemple-1.json`, `seance-exemple-2.json` et `depart-exemple.json`, avec les mêmes cas (symboles, fautes, exercices assistés, variantes) mais des poids, des dates et des identifiants fictifs.

## 12. Persistance et protection des données

Utiliser IndexedDB pour le stockage persistant local.

Au premier lancement, demander au navigateur un stockage persistant (`navigator.storage.persist()`), afin de réduire le risque que le navigateur efface les données. Afficher discrètement dans les réglages si le stockage persistant est accordé ou non.

Enregistrer automatiquement après chaque action importante :

- Modification du poids.
- Validation ou correction d'une série.
- Modification des répétitions.
- Sélection du ressenti.
- Ajout ou retrait d'un exercice de la séance.
- Modification d'une séance passée.
- Fin de séance.
- Import de données.

La fermeture de l'application ne doit pas entraîner la perte des données déjà enregistrées.

Restaurer une séance en cours avec ses exercices, ses poids, ses répétitions, ses ressentis déjà renseignés et son chronomètre cohérent.

Prévoir une gestion claire des erreurs de sauvegarde. Ne jamais annoncer qu'une donnée est sauvegardée si l'opération a échoué.

**Écriture immédiate (précision validée).** À la salle, l'utilisateur peut valider une série puis verrouiller le téléphone ou fermer l'appli aussitôt, et Chrome sur Android peut geler ou fermer une appli en arrière-plan. Donc :

- Aucun délai volontaire (debounce, regroupement d'écritures) entre une saisie de séance et l'écriture dans IndexedDB : l'écriture part dans le gestionnaire de l'action elle-même.
- Chaque transaction d'écriture est validée explicitement (`commit()`) dès sa dernière requête émise, sans attendre un aller-retour avec la page, et en durabilité stricte (`durability: 'strict'`) : « Enregistré » n'est affiché qu'une fois la donnée sur le disque.
- Les écritures non confirmées (en cours ou échouées) sont relancées dans leur dernière version au passage en arrière-plan (`visibilitychange`, `pagehide`, `freeze`), et les échecs au retour au premier plan.
- Un poids tapé sans quitter le champ est enregistré au passage en arrière-plan (avec la même protection contre les fautes de frappe).
- **Plusieurs fenêtres de l'appli (précision validée).** L'appli installée et un onglet Chrome partagent la même base : une fenêtre restée en mémoire ne doit jamais écrire une ancienne version d'une séance par-dessus une plus récente (cardio ajouté ailleurs effacé par la série suivante). Chaque écriture réussie est annoncée aux autres fenêtres (`BroadcastChannel`), qui relisent séances et bibliothèque ; chaque fenêtre relit aussi la base en revenant au premier plan. Une écriture locale non confirmée garde sa version.

**Rappel de sauvegarde** : si aucun export n'a été fait depuis 14 jours et que de nouvelles séances existent, afficher un rappel discret sur l'onglet Séance (accueil), avec un bouton d'export direct. Pas de fenêtre bloquante.

Prévoir une procédure simple pour transférer les données vers un autre appareil grâce à l'export et à l'import JSON.

## 13. Annulation et correction rapide

Permettre :

- De corriger rapidement une série.
- D'annuler la dernière action de saisie pendant la séance en cours (bouton « Annuler » visible quelques secondes après une action : modification de série, retrait d'exercice ou de cardio, ce retrait étant d'abord confirmé, §5.3).
- De retirer un exercice de la séance actuelle sans supprimer son historique.
- De corriger une séance passée.
- De recalculer les recommandations concernées après une correction.

Éviter les confirmations répétitives pour les actions facilement réversibles.

Demander confirmation lorsqu'une action risque de supprimer ou de remplacer des données importantes.

Une correction ne doit jamais détruire silencieusement les performances historiques.

## 14. Réglages

Prévoir une page de réglages simple (sections repliables, toutes fermées à l'ouverture sauf la première, §3.5) permettant notamment :

- De personnaliser les noms d'exercices.
- De gérer les variantes.
- De modifier les groupes musculaires et les synonymes d'un exercice.
- De personnaliser la plage de répétitions ou le nombre de séries d'un exercice si nécessaire.
- De renseigner ma taille (§20).
- D'importer des séances depuis des notes ou du JSON.
- D'exporter les données complètes.
- De voir l'état du stockage persistant.
- De modifier la liste des machines de cardio (§5.7).
- De désactiver le signalement du bilan de la semaine et/ou du mois (pastille sur l'onglet Progrès et bandeau en haut de cet onglet), et de renseigner une adresse e-mail facultative pour les bilans (§19.7).
- De gérer les activités habituelles hors salle : ajout, modification, suppression, désactivation (§19.8).
- De consulter la version de l'application.

Les valeurs par défaut doivent permettre d'utiliser immédiatement l'application, sans longue configuration initiale.

## 15. Tests automatisés obligatoires

Écrire et exécuter des tests couvrant au minimum les situations suivantes. Les tests du moteur sont des tests unitaires sur les fonctions pures, écrits pendant la phase 1.

### Calcul du statut

1. 8-8-8 à la cible 8 avec « Bien passé » ou « Très bien passé » : vert.
2. 8-8-8 à la cible 8 avec « Moyen », « Mal passé » ou « Inconnu » : orange.
3. 8-8-7 avec « Très bien passé » : orange.
4. 8-7-7 avec n'importe quel ressenti : rouge.
5. 8-8-8 avec « Très mal passé » : rouge.
6. Deux séries sur trois enregistrées : orange, quelle que soit la performance.
7. Les répétitions ne peuvent pas dépasser la cible.

### Progression des répétitions

8. Une première séance verte à 3×8 ne déclenche pas de progression.
9. Une deuxième séance verte distincte et consécutive à 3×8 propose 3×9.
10. Une seule séance verte à 3×9 ne déclenche pas 3×10.
11. Vert, orange, vert au même palier : pas de progression.
12. Une mauvaise séance ne supprime pas l'historique.
13. Des répétitions insuffisantes ne valident pas un palier, même avec un ressenti « Très bien passé ».

### Progression et réduction du poids

14. Une seule séance verte à 3×12 ne permet pas d'augmenter le poids.
15. Deux séances vertes consécutives à 3×12 recommandent « poids supérieur », sans valeur de poids.
16. Une séance orange ou rouge à 3×12 ne compte pas.
17. L'historique de l'ancienne charge reste conservé.
18. Une charge saisie supérieure à la précédente donne une cible 3×8 et des compteurs à zéro.
19. Une charge identique saisie malgré la recommandation laisse le palier inchangé et la recommandation active.
20. Trois séances rouges consécutives : aucune baisse, charge et cible conservées.
21. Quatre séances rouges consécutives recommandent « poids inférieur » ; une charge inférieure saisie conserve la cible de répétitions.
22. Rouge, rouge, rouge, orange, rouge : pas de baisse (compteur remis à zéro).
23. Une séance incomplète entre deux rouges ne remet pas le compteur de rouges à zéro et ne l'incrémente pas.

### Cohérence de l'historique

24. Deux variantes non comparables ont des compteurs indépendants.
25. Une séance non standard (séries ou cible modifiées) ne valide pas un palier.
26. Une séance ne peut pas être comptée deux fois.
27. La modification d'une séance passée recalcule les recommandations.
28. Une séance réutilisée comme modèle ne modifie jamais la séance originale.
29. Un palier choisi manuellement démarre avec un compteur à zéro.
30. Le recalcul complet à partir de l'historique donne le même résultat que l'état mis en cache.

### Import et export

31. L'import d'un JSON valide restaure correctement les données.
32. Un JSON invalide est signalé sans altérer les données existantes.
33. Le bloc de notes du §11.3 donne exactement six exercices, avec séries, répétitions, poids et ressentis corrects.
34. Les variantes `x` / `×`, les espaces, les décimales et les unités `kg` / `kgs` sont reconnues.
35. Les symboles `++`, `+`, `=`, `-=` et `--` sont convertis selon le §7.3 ; un symbole inconnu est signalé.
36. `3x8x52kg ++` importé compte comme une validation verte ; `3x8x52kg =` et `3x8x52kg` sans symbole ne valident pas.
37. Deux imports successifs `3x8x52kg ++` à des dates différentes proposent 3×9 à 52 kg.
38. Les noms français et anglais sont reconnus lorsque les correspondances sont fiables.
39. Les correspondances ambiguës peuvent être corrigées, et la correction est mémorisée.
40. Les informations manquantes ne sont pas inventées.
41. La date saisie pour un bloc est conservée et les séances importées sont classées chronologiquement.
42. Les doublons potentiels sont détectés et ne sont pas importés deux fois silencieusement.
43. Export puis import : séances, réglages, pesées et profil recalculé identiques, sans doublon.
44. L'import ne supprime pas les données existantes sans confirmation explicite.

### Persistance et interface (tests de bout en bout Playwright)

45. Le rechargement de la page restaure une séance en cours.
46. Le chronomètre reste cohérent après rechargement.
47. Les recherches par nom d'exercice fonctionnent (`chest press`, `pec deck`).
48. Les recherches par groupe musculaire fonctionnent (`dos`).
49. Les synonymes français et anglais donnent des résultats pertinents.
50. La recherche fonctionne hors ligne (service worker actif, réseau coupé).
51. Les corrections de séries mettent à jour les données concernées.

### Suivi corporel et non-régression

52. Une pesée invalide est refusée sans affecter les séances.
53. L'absence de données corporelles n'a aucun effet sur les séances.
54. Tous les tests du moteur passent à l'identique après l'ajout du module corporel.

### Robustesse des données

55. Renommer un exercice conserve son historique et ses compteurs.
56. Un exercice avec historique ne peut pas être supprimé, seulement archivé ; son historique reste consultable.
57. Un même exercice-variante ne peut pas être ajouté deux fois dans une séance.
58. Un poids qui s'écarte de plus de 50 % du précédent demande une confirmation ; un poids nul ou négatif est refusé.
59. Deux séances le même jour sont toujours rejouées dans le même ordre.
60. La suppression d'une séance passée recalcule le profil.
61. Une séance ouverte depuis plus de 4 heures propose d'être terminée, sans fermeture ni suppression automatique.
62. Le fichier `docs/exemples/seance-exemple-1.json` s'importe correctement : six exercices, poids, séries et ressentis conformes.

### Précisions validées (§7.11)

63. (A, B) Une charge supérieure saisie sans recommandation « poids supérieur » donne une séance non standard qui ne valide rien ; le nouveau palier part d'un compteur à 0 et la séance suivante à ce palier peut valider. Une charge plus lourde recommandée, à 3×8, valide dès la première séance verte.
64. (C) Une cible différente à la fois de la cible actuelle et de la cible recommandée crée un nouveau palier avec un compteur à 0, sans valider ; la séance suivante à ce palier peut valider.
65. (C/D) Garder la cible actuelle alors que +1 répétition est recommandé est un refus : avec une verte, palier et compteur inchangés et recommandation toujours active ; avec une orange ou une rouge, compteur à 0 et recommandation retirée.
66. (D) Refus de « poids supérieur » : une verte maintient la recommandation, une orange ou une rouge la retire.
67. (D) Refus de « poids inférieur » : une nouvelle rouge maintient la recommandation, une verte ou une orange complète la retire.
68. (E) Une rouge non standard au même poids compte dans le compteur de rouges ; un changement de cible au même poids ne remet pas ce compteur à 0 ; un changement de poids le remet à 0.
69. (F) Une séance incomplète au palier actuel remet le compteur de validations à 0 sans modifier le compteur de rouges.
70. (G) Une première performance à 3×9, complète et verte, compte comme une validation ; une première performance hors plage ne valide pas.
71. (H) Une performance partielle n'a aucun statut et ne modifie ni le palier ni les compteurs ; elle reste présente dans l'historique.
72. (I) Avec une cible manuelle supérieure à 12, deux validations recommandent « poids supérieur » et jamais une cible au-delà de 12.
73. (J) 52,5 kg et 52.50 kg sont le même poids : pas de changement de palier.
74. (§5.6) À la fin d'une séance, un exercice sans aucune série est retiré automatiquement et ne modifie pas ses compteurs ; « Annuler » le rétablit, et il compte alors comme séance incomplète.
75. (§5.5) Un nouvel appui sur le ressenti déjà sélectionné ne l'efface pas ; seul un autre niveau le remplace.
76. (§5.5, §5.6) La confirmation de fin de séance liste les exercices réalisés sans ressenti et permet de le compléter avant de terminer ; le ressenti choisi est enregistré avec la séance terminée.

### Précisions validées (§11.11)

77. (A) Un angle chiffré dans le nom importé crée par défaut une nouvelle variante ; le même angle écrit autrement reprend la variante existante ; sans angle, la variante standard est proposée ; on peut toujours rattacher la séance à une autre variante.
78. (B) Des répétitions détaillées donnent une cible égale à la meilleure série, signalée dans l'aperçu.
79. (C) À l'import, un exercice jamais modifié localement prend la version importée ; un exercice modifié localement est conservé et l'écart signalé ; synonymes et variantes s'additionnent.
80. (D) Modifier la date d'un bloc de notes la confirme ; sans modification, l'import exige la confirmation explicite.

### Exercices assistés, bibliothèque et deuxième jeu d'import

81. (§7.12) Pour une variante assistée, deux validations à 3×12 recommandent « Moins d'aide » ; une charge plus basse suivie revient à 3×8 et valide normalement.
82. (§7.12) Une charge plus haute (plus d'aide) alors que « moins d'aide » est recommandé est un changement non recommandé : non standard, compteur à 0.
83. (§7.12) Quatre rouges recommandent « Plus d'aide » ; une charge plus haute conserve la cible ; une charge plus basse non recommandée ne valide pas.
84. (§7.12) La protection contre les fautes de frappe s'applique normalement aux variantes assistées ; une variante non assistée garde le sens habituel.
85. (§4.0) « Dips assistés » (assisté) et « Écarté couché haltères » sont dans la bibliothèque initiale, installés une seule fois sur une base existante, sans recréer un exercice supprimé.
86. (§7.3) `+=` est stocké comme Moyen (orange) et le symbole d'origine est conservé dans l'historique.
87. (§11.11 A, E) Le deuxième jeu d’exemple (`docs/exemples/seance-exemple-2.json` et ses notes) : `+=` reconnu comme Moyen, « 47gs » signalé comme poids à confirmer, variante « prise très large » proposée pour le tirage vertical, dips assistés reconnus comme exercice assisté, aucune donnée inventée.
88. (§11.11 F) `docs/exemples/depart-exemple.json` s'importe dans une base vide : le triceps haltère assis propose 3×9 à 14 kg, le chest press est orange, les dips assistés sont assistés, les élévations latérales sont à la machine ; aucun code de l'application ne charge ce fichier.

### Récapitulatif hebdomadaire, machines d'ischios et données personnelles

89. (§19.6) La semaine commence le lundi 0 h 00 ; l'en-tête donne les dates exactes du lundi et du dimanche et le nombre de séances.
90. (§19.6) Une séance du lundi 0 h 00 compte dans la nouvelle semaine ; une séance du dimanche 23 h 30 compte dans l'ancienne, même si elle se termine après minuit.
91. (§19.6) Le groupe principal compte une fois par séance ; un groupe secondaire ne compte qu'en indirect (½, tests 179 à 184) ; les abdominaux sont absents.
92. (§19.6) Couleurs selon le nombre de séances : vert = 0, orange = 1, rouge à partir du seuil (2 par défaut, réglable).
93. (§19.6) Mention « aujourd'hui » ou « hier » correcte (moins de 48 heures, jour du calendrier), y compris pour la semaine précédente.
94. (§19.6) Ordre de tri : vert, orange, rouge ; à couleur égale, « hier » et « aujourd'hui » en dernier.
95. (§19.6) Semaine vide : tous les groupes verts, « 0 séance ».
96. (§19.6) Une séance en cours n'est pas comptée ; terminer, supprimer ou importer une séance met à jour le récapitulatif au retour sur l'accueil (test de bout en bout : bloc visible sans clic ni défilement au format smartphone).
97. (§19.6) Les sous-groupes des jambes comptent pour « jambes » ; le récapitulatif ne modifie ni les séances ni le moteur.
98. (§4.0) « leg curl », « leg curl assis », « seated leg curl » → Leg curl (assis) ; « curl ischios », « curl ischio allongé », « leg curl allongé », « lying leg curl » → Curl ischios (allongé) ; en cas de doute, l'aperçu demande de choisir ; historiques séparés.
99. (§4.0) Une base existante reçoit « Curl ischios » une seule fois ; les synonymes du leg curl ne sont corrigés que s'ils n'ont pas été personnalisés.
100. (§4.0.1) Chaque fiche illustrée affiche, une fois la vignette agrandie, le dessin et l'attribution (auteur, licence CC BY-SA 3.0 ou 4.0 selon la source, deux sources), y compris le dessin propre à une variante ; les fiches sans illustration n'en affichent pas.
101. (§1) Les tests s'exécutent à l'heure de Paris, quelle que soit la machine.

### Élévations latérales haltères / machine et corrections de la bibliothèque

102. (§4.0) Une base existante reçoit la séparation des élévations latérales (renommage en « haltères » et nouvel exercice « machine ») et le retrait de « Tirage nuque », sans perte de données : séances, variantes et synonymes appris conservés ; un exercice personnalisé par l'utilisateur garde son nom et ses synonymes.
103. (§4.0) « élévations latérales haltères », « lateral raise haltères », « dumbbell lateral raise » → haltères ; « élévations latérales machine », « lateral raise machine », « machine lateral raise » → machine ; sans matériel précisé (« latéral raise », « Epaules latéral raise », « élévations latérales »), l'aperçu demande de choisir ; « Tirage nuque » n'est plus reconnu comme tirage vertical.
104. (§4.0, §11.11 C) Une sauvegarde d'une version antérieure de la bibliothèque ne réintroduit ni ancien nom ni ancien synonyme ; ses synonymes appris sont repris.

### Cardio (§5.7)

105. Un bloc s'enregistre avec la machine, la durée et, pour le tapis seulement, l'inclinaison (Neutre par défaut) ; la distance est facultative ; une durée nulle, décimale ou absente est refusée ; plusieurs blocs par séance, dans l'ordre d'ajout ; correction et retrait ; une séance sans cardio n'a pas de champ cardio.
106. Le cardio n'a aucun effet sur le moteur (profil, statuts et recommandations identiques), ne demande aucun ressenti, et une séance réutilisée ne reprend pas le cardio.
107. Terminer une séance conserve ses blocs ; une séance ne contenant que du cardio est enregistrée.
108. (§19.6) Le cardio n'entre dans aucun groupe ; l'en-tête affiche « 3 séances · 45 min de cardio » (« 1 h 20 » au-delà d'une heure), rien de plus sans cardio ; une séance de cardio seul compte ; une séance en cours ne compte pas.
109. Notes : « Tapis 15 min », « Tapis incliné 20 min », « Marche inclinée haute 20min », « Rameur 10 min », « Elliptique 15 min », « Vélo elliptique 20 min » sont reconnus ; « Tapis » ou « marche » sans précision = Neutre ; « incliné » sans niveau bloque l'import jusqu'au choix de Moyenne ou Haute.
110. Notes mêlant exercices et cardio : les exercices sont inchangés ; une machine non reconnue est à choisir ou à exclure, jamais devinée ; une machine ajoutée dans les réglages est reconnue ; le cardio d'un JSON simple est lu de la même façon.
111. Export puis import : blocs et liste des machines conservés, sans doublon ; deux séances qui ne diffèrent que par le cardio ne sont pas des doublons ; un bloc invalide fait refuser la sauvegarde.
112. Une sauvegarde au format 2 est migrée sans perte ; un format plus récent est refusé ; une base existante, sans liste de machines enregistrée, reçoit la liste par défaut et ses séances restent intactes.
113. Liste des machines : noms non vides et uniques, au moins une machine ; une liste invalide revient à la liste par défaut ; renommer une machine ne change pas les séances enregistrées.
114. (bout en bout) Séance avec un exercice et deux blocs de cardio : saisie, rechargement, correction, récapitulatif de fin, en-tête de l'accueil (« 1 séance · 35 min de cardio », seul le groupe de l'exercice compté), historique et données enregistrées.
115. (bout en bout) Une séance de cardio seul compte dans l'en-tête de l'accueil sans colorer de groupe ; le retrait d'un bloc s'annule.
116. (bout en bout) Import de notes : « incliné » sans niveau demande de choisir, puis les blocs sont importés.
117. (bout en bout) Les machines se modifient dans les réglages et sont proposées pendant la séance.

### Fiabilité de l'enregistrement et vélo classique

118. (§12) Une écriture de séance part sans délai : transaction en durabilité stricte, requête émise et validation (`commit()`) demandée avant toute attente ; toutes les écritures suivent la même règle.
119. (§12) Les écritures non confirmées sont relancées dans leur dernière version ; une ancienne version confirmée ne libère pas une version plus récente ; une écriture confirmée ou une séance supprimée n'est plus relancée.
120. (§12, bout en bout) « Valider » puis fermeture immédiate de l'appli, trois fois de suite : chaque série est enregistrée et réaffichée à la réouverture.
121. (§12, bout en bout) Passage en arrière-plan : une écriture échouée est relancée sans action de l'utilisateur, et un poids tapé sans quitter le champ est enregistré.
122. (§5.7) « Vélo » est une machine par défaut, sans inclinaison ; à l'import, « vélo » seul (ou « vélo classique ») → Vélo, « elliptique » ou « vélo elliptique » → Vélo elliptique.
123. (§5.7) Une liste de machines enregistrée par une version antérieure reçoit « Vélo » une seule fois, avant « Autre », sans doublon de nom ; une liste à jour dont l'utilisateur a retiré « Vélo » ne le recrée pas.
124. (§5.7, bout en bout) Au lancement, une liste enregistrée par la version 1.2.0 reçoit « Vélo » ; retiré puis enregistré, il n'est jamais recréé.

### Lexique d'équivalences (§4.2.1)

125. Recherche : « latéral raise haltère », « lateral raise dumbbell », « élévation latérale DB » et « élévation latérale haltères » → Élévations latérales haltères seules ; « curl biceps haltère » → curls aux haltères ; « pec fly machine » → Pec deck ; « rowing haltère » → Rowing haltère ; « développé épaules machine » et « shoulder press » → Développé épaules machine en tête ; « pec », « pecs », « pectoraux » → tous les exercices de pectoraux ; « pec deck » et « pec fly » → Pec deck.
126. Import : les mêmes saisies sont reconnues ; « pec », « pecs », « pectoraux » proposent les exercices de pectoraux et demandent de choisir ; leg curl et curl ischios restent distincts ; « Epaules latéral raise » demande toujours de choisir.
127. Un mot de matériel départage les variantes (haltères contre machine, poulie), sans rien exclure quand aucun résultat ne l'a.
128. Mot inconnu : la recherche l'ignore si au moins deux autres mots sont reconnus et le signale ; « tirage nuque » ne trouve rien ; l'import propose l'exercice et bloque jusqu'à la confirmation.
129. Chaque écriture du lexique a la forme de sa référence ; expressions protégées conservées ; les exercices de la bibliothèque restent tous distincts.
130. (bout en bout) Recherche et import des saisies du point 125, mot ignoré affiché, import bloqué jusqu'à « J'ai vérifié ».
131. « ischio », « ischios », « ischio-jambiers », « hamstrings » → leg curl et curl ischios ; « quadri », « quadriceps », « quads » → leg extension et presse ; « jambe », « jambes », « legs » → les quatre ; à l'import, un sous-groupe seul propose ses exercices et demande de choisir ; le récapitulatif compte tout dans « Jambes ».
132. Bibliothèque version 5 : la presse perd les ischio-jambiers une seule fois, sauf groupes personnalisés ; une sauvegarde antérieure ne les réintroduit pas.
133. « seated row », « row assis », « tirage horizontal » → Tirage horizontal (machine) en premier, jamais le Rowing haltère ; « rowing haltère », « dumbbell row » → Rowing haltère.

### Prises (§4.3.1)

134. Trois prises seulement, écritures du lexique comprises, sans fusion ni supination, pronation ou prise neutre ; « tirage vertical » seul, « lat pull » et « latpull » → prise moyenne ; « tirage vertical wide grip », « tirage vertical prise large », « lat pull prise très large » → prise très large ; « prise très large » et « prise serrée » → variantes distinctes ; une prise demandée pour un exercice sans prise crée la variante.
135. Tirage vertical prise moyenne le lundi et prise très large le jeudi : « Dos (2×) » dans le récapitulatif, deux historiques séparés.
136. Bibliothèque version 6 : variante standard renommée « Prise moyenne », prises manquantes ajoutées une seule fois, sans doublon ni perte (synonymes appris conservés) ; les données de départ (exemple anonymisé) se réimportent avec la bonne prise.

### Repère de progression (§5.3.1)

137. Deux vertes à 3×8 : « ↑ +1 rép. » (de 3×8 à 3×9) ; aucun repère après une seule verte, ni une fois 3×9 fait ; le repère reste si la hausse a été refusée avec une verte ; « +2 rép. ».
138. « ↑ Poids supérieur » après deux vertes à 3×12, « ↓ Poids inférieur » après quatre rouges, « Moins d'aide » et « Plus d'aide » pour un exercice assisté ; trois rouges : aucun repère.
139. (bout en bout) Le repère « ↑ +1 rép. » s'affiche en haut de l'exercice ajouté, sous la ligne « 3 × 9 à 35 kg » (au-dessus du poids, sans couleur de statut), disparaît si la charge change, et figure sur la fiche sous « Prochaine cible » ; aucun repère quand la cible ne change pas.

### Bilan, graphiques et import de fichier (§19.2, §19.3, §11.1)

140. Données de départ (exemple anonymisé) : l'extension triceps haltère assis (deux vertes, palier validé) est « En progression » ; les exercices à une seule séance sont « Trop tôt » ; le graphique a un point dès la première séance.
141. Fichier d'import : un .json, même sans type reconnu, du texte ou des notes sont acceptés ; un fichier vide, binaire, tronqué ou trop volumineux est refusé avec un message clair.
142. (bout en bout) Champ fichier sans filtre de type ; fichier non valide refusé sans rien importer ; .json annoncé en `application/octet-stream` importé ; bouton « Bilan de progression » dans l'onglet Progrès, avec les autres bilans, de même taille et de même style ; résumé et titres avec le nombre d'exercices par catégorie, libellé « Une seule séance sur cet exercice. », aucune couleur de statut ; un exercice ouvre sa fiche sur son graphique (deux points), un exercice à une seule séance montre un point et le message.

### Cadres de section et filtres du bilan (§3.1, §19.3)

143. Une seule règle de bordure (quatre côtés), gris neutre par défaut, sans couleur par rang d'affichage ni bordure gauche seule ; les cinq couleurs vives (groupes) restent claires (contraste d'au moins 7:1), ni vert, ni orange, ni rouge.
144. Les cadres sont tous marqués du même attribut ; la liste des éléments encadrés est unique (menus et volet de fin compris) et exclut pastilles de statut et cases du récapitulatif.
145. (bout en bout) Bilan : un bouton par catégorie et « Tous » (actif par défaut), « … Trop tôt » ; une catégorie vide est visible mais désactivée ; un appui n'affiche que la catégorie et remplit le bouton ; un nouvel appui ou « Tous » réaffiche tout ; le filtre est mémorisé après rechargement ; boutons et sections de catégorie neutres, chaque exercice à la couleur de son groupe.
146. (bout en bout) Sur chaque écran (accueil, séance, fiche, bibliothèque, historique, détail de séance, bilan, Mon poids, réglages, import/export) : chaque cadre a une bordure de 2 px de la même couleur sur les quatre côtés et des coins arrondis ; fiche entièrement à la couleur du groupe ; ailleurs, ce qui concerne un groupe à sa couleur, tout le reste neutre ; pastilles et cases du récapitulatif sans cadre ; rien ne dépasse de l'écran, et la ligne de série reste dans sa carte à 360 et 320 px.

### Bibliothèque version 7 : curl à la barre, mollets, abducteurs, adducteurs (§4.0, §4.2.1)

147. Les quatre exercices ont leurs groupes et leur matériel ; « curl barre », « curl barre droite », « curl à la barre », « barbell curl », « straight bar curl » → Curl biceps barre droite seul, en recherche comme à l'import ; « curl biceps » propose les quatre curls ; tous les noms de la bibliothèque restent distincts.
148. « mollet(s) », « calf », « calves » → Mollets machine ; « fessier(s) », « fesses », « glutes » → Abducteurs machine ; « adducteur(s) », « adductors » → Adducteurs machine ; « jambes » et « legs » → les sept exercices de jambes ; synonymes reconnus à l'import ; « fessiers » seul demande de choisir.
149. Abducteurs et adducteurs jamais confondus : chaque synonyme (français, anglais, « abduction », « adduction », « hip abduction »…) ne trouve que sa machine, en recherche comme à l'import ; une vraie faute de frappe reste tolérée.
150. Récapitulatif : mollets, abducteurs et adducteurs comptent dans « Jambes », une fois par séance ; le curl à la barre dans « Biceps ».
151. Base existante en version 6 : les quatre exercices ajoutés une seule fois, le reste inchangé (nom personnalisé, synonymes appris, séances) ; un exercice supprimé n'est pas recréé ; une sauvegarde de la version 6 ne retire rien, une sauvegarde de la version 7 garde les nouveaux groupes.
152. (bout en bout) Recherche de « calves », « fessiers », « adductors », « abduction », « hip adduction », « barbell curl », « legs » ; fiches des abducteurs et des adducteurs avec deux dessins distincts (attribution CC BY-SA 4.0, everkinetic/data) ; séance avec les trois machines comptée une fois dans « Jambes ».

### Bibliothèque version 8 (§4.0, §4.2.1, §7.12)

153. Mollets : « Mollets machine — Debout » (variante standard) et « — Assis », historiques séparés ; « mollets », « mollets debout », « standing calf raise », « calf press » → debout ; « mollets assis », « seated calf raise », « calf assis » → assis.
154. Dix-neuf exercices ajoutés avec leurs groupes et leur matériel ; développé incliné barre / haltères et oiseau machine / haltères en variantes ; chaque nom et synonyme de la bibliothèque désigne son exercice-variante à l'import, sans hésitation, et aucun ne se confond avec un autre.
155. « squat », goblet squat, squat KB → Squat kettlebell ; « hack », « hack squat » → Hack squat ; « quadri » → leg extension, presse, hack squat, squat kettlebell ; autres équivalences (pull up, hammer, preacher, Larry Scott, front raise, skull crusher, reverse pec deck, back extension, pullover, vis-à-vis).
156. Jamais confondus : curl barre droite / barre EZ, extension poulie corde / barre, développé incliné barre / haltères, développé couché barre / haltères (une prise crée toujours la variante), abduction / adduction ; « pec deck » ne trouve que le pec deck.
157. Tractions assistées : réglage « assisté » ; deux validations à 3×12 → « Moins d'aide · 3 × 8 » ; moins d'aide suivie à 3×8 valide ; plus d'aide non recommandée ne valide pas ; quatre rouges → « Plus d'aide ».
158. Récapitulatif : chaque nouvel exercice compte dans son groupe principal (shrugs et lombaires dans « Dos ») ; une variante compte dans le groupe de son exercice.
159. Base existante en version 7 : les dix-neuf exercices ajoutés une seule fois ; mollets et extension poulie reçoivent leurs variantes sans perte (synonyme appris, nom personnalisé et séances conservés) ; une variante du même nom déjà créée n'est pas doublée ; un exercice supprimé n'est pas recréé ; une sauvegarde de la version 7 ne défait aucun nom de variante.
160. (bout en bout) « squat », « hack », « mollets assis », « curl ez », « pushdown barre » ; dessins distincts debout / assis et corde / barre ; séance avec tractions assistées (champ « Aide ») et squat kettlebell, comptée dans « Dos » et « Jambes ».

### Couleurs des groupes musculaires (§3.2)

161. Une couleur fixe par groupe, définie une seule fois : épaules jaune, pectoraux cyan, triceps bleu clair, dos violet, biceps rose, jambes blanc (sous-groupes compris), abdominaux gris clair ; toutes distinctes et lisibles sur le fond noir ; une seule règle CSS ; plus aucune teinte de pictogramme écrite à part.
162. (bout en bout) Bibliothèque : chaque exercice, dans chaque section de groupe, a la bordure et le fond de pictogramme de son groupe ; fiche : tous les cadres ont la couleur du groupe de l'exercice ; détail d'une séance et séance : chaque carte d'exercice a la couleur de son groupe, un bloc de cardio est neutre ; accueil sans couleur de groupe ; pastilles de statut et cases du récapitulatif sans couleur de groupe.

### Dernière fois / Prochaine cible (§5.3.2)

163. (bout en bout) Fiche et carte de séance : « Dernière fois » en petit, gris clair, sur une ligne à 412 px (poids, répétitions, date « 12/03 », pastille), jamais tronquée à 360 et 320 px ; « Prochaine cible » sur une seule ligne en grand, en gras, dans la couleur du groupe, avec le poids ; séparateur entre les zones ; repère court quand la cible change, « = Même cible : consolide » quand elle est identique, « Poids de départ à saisir » pour un exercice jamais réalisé ; en séance, une autre charge saisie met à jour la ligne et retire repère et mention ; aucune couleur de statut hors de la pastille.

### Cardio et fenêtres multiples (§5.7, §12)

164. (bout en bout) Deux fenêtres de l'appli ouvertes sur la même séance : un cardio ajouté dans l'une est affiché par l'autre, dont les séries suivantes et la fin de séance le conservent (séance terminée en base avec le bloc) ; une fenêtre sans canal entre fenêtres relit la base en revenant au premier plan, avant toute écriture.
165. (bout en bout) Cardio rempli mais pas validé à « Terminer la séance » : la confirmation l'affiche et « Enregistrer le cardio et terminer » l'enregistre avec la séance ; une durée invalide bloque la fin avec un message, sans bouton inactif ; un formulaire vide ne change rien.

### Symboles de ressenti collés (§7.3)

166. Texte collé exact « Chest press\n3x8x52kg += » : Moyen, symbole « += » conservé, orange ; écritures voisines (« += » collé au poids, « + = », « × », « kgs ») identiques.
167. `++`, `+`, `=`, `-=`, `--` collés de la même façon donnent Très bien (vert), Bien (vert), Moyen (orange), Mal passé (orange), Très mal passé (rouge) ; sans symbole : inconnu, orange.
168. Aperçu : un ressenti choisi qui contredit un symbole connu le remplace (« += » jamais enregistré avec Bien) ; un symbole inconnu reste conservé avec le ressenti choisi.
169. Correction : seuls les « += » sans Moyen passent à Moyen ; les autres ressentis ne sont pas touchés.
170. Après correction, le profil est recalculé : le chest press n'est plus compté vert et « +1 répétition » disparaît.
171. La correction de la base est appliquée une seule fois, en une transaction.
172. Une sauvegarde contenant un « += » enregistré avec Bien est restaurée corrigée.
173. (bout en bout) Une base d'une version antérieure est corrigée au lancement : chest press orange, cible 3 × 8, historique « Moyen (+=) ».

### Bibliothèque version 9 : tirage horizontal machine et poulie basse (§4.0)

174. Le tirage horizontal garde son identifiant et devient « Tirage horizontal machine (appui pectoral) » (machine, dos, biceps, nouveaux synonymes, trois prises, pictogramme) ; « Tirage horizontal poulie basse » est un exercice distinct (poulie, dos, biceps, trois prises, dessin du tirage à la poulie).
175. « tirage horizontal », « seated row », « Seated row horizontal » et les synonymes de la machine → la machine ; « tirage poulie basse », « cable row », « seated cable row », « low row », « tirage horizontal câble » → la poulie basse, jamais la machine ; « pec », « chest », « pectoraux » ne trouvent pas la machine ; historiques séparés, les deux comptent dans « Dos ».
176. Base existante en version 8 : renommage une seule fois, synonymes d'origine remplacés, synonyme appris et synonyme ajouté à la main gardés, nom personnalisé gardé ; poulie basse ajoutée une seule fois, jamais recréée ; séances et profil inchangés, rattachés à la machine.
177. Une sauvegarde antérieure, en fusion comme en remplacement, ne réintroduit ni l'ancien nom ni « Tirage poulie basse » sur la machine ; ses séances restent sur la machine.
178. (bout en bout) Une base en version 8 est migrée au lancement : fiche de la machine renommée avec son historique et un pictogramme, fiche de la poulie basse avec le dessin et sans historique ; « seated row » → la machine, « poulie basse » et « cable row » → la poulie basse seule.

### Récapitulatif hebdomadaire : groupes secondaires (§19.6) et bibliothèque version 10

179. Tractions assistées : dos 1 (orange, « 1× »), biceps ½ : une seule séance indirecte reste verte, avec la mention « +1 indirect » ; un groupe non travaillé est vert, sans nombre.
180. Curl le lundi et tractions le jeudi : biceps 1,5 → orange, « 1× · +1 indirect » ; avec un tirage en plus, 2 → rouge.
181. Deux séances indirectes seulement : score 1 → orange, « +2 indirect » ; quatre → rouge ; seuil réglable.
182. Groupe principal et secondaire dans la même séance : 1 ; plusieurs exercices indirects dans la même séance : ½.
183. « hier » et « aujourd'hui » s'appliquent au travail indirect, même vert ou de la semaine précédente.
184. Tri : couleur, puis « hier » ou « aujourd'hui » en dernier, puis score croissant (vert avec de l'indirect après vert sans rien ; orange 1,5 sans mention avant orange 1 d'hier) ; seuls les groupes affichés comptent (sous-groupe secondaire des jambes dans « Jambes », abdominaux jamais) ; moteur et bilan identiques avec ou sans groupes secondaires.
185. Bibliothèque version 10 : les trois écartés n'ont plus les épaules en secondaire ; les mouvements composés gardent leur second groupe ; aucun secondaire n'est le groupe principal ni les abdominaux ; la recherche « épaules » ne trouve plus les écartés.
186. Base existante en version 9 : correction appliquée une seule fois, groupes personnalisés gardés ; une sauvegarde antérieure fusionnée ne remet pas les épaules.
187. (bout en bout) Accueil au format smartphone : « Biceps (1× · +1 indirect) · hier » orange, « Triceps (+1 indirect) » et « Épaules (+1 indirect) » verts, « Dos (1×) · hier » ; ordre jambes, épaules, triceps, pectoraux, dos, biceps ; récapitulatif visible sans défilement ; cases dans le cadre, sans défilement horizontal, à 412, 360 et 320 px.

### Bilans de la semaine et du mois (§19.7)

188. Bornes : semaine du lundi 0 h 00 au dimanche (une séance commencée dimanche 23 h 30 reste dans sa semaine), mois calendaire (31 à 23 h 30 dans le mois, 1er à 0 h 00 dans le suivant) ; titres « Semaine du 19 au 25 oct. 2026 », « du 28 sept. au 4 oct. 2026 », « du 29 déc. 2025 au 4 janv. 2026 », « Octobre 2026 » ; objets du mail ; décalage d'une période (changement d'année compris) ; clé invalide refusée ; période ouverte par défaut.
189. Période sans séance : « 0 séance », comparaison et durée seulement, pesées si elles existent, rien d'inventé ; une seule pesée : une seule valeur.
190. Paliers validés de la période (+1 répétition, poids supérieur, moins d'aide et +1 répétition d'un exercice assisté) avec ancienne → nouvelle cible et date ; une seule verte ou la première verte d'une période antérieure ne sont pas listées ; rouges et passage en « poids inférieur » (« plus d'aide ») sur une ligne par exercice (« 4ᵉ séance rouge de suite à 100 kg → poids inférieur recommandé », sinon « 2 séances rouges cette semaine (3 de suite à 100 kg) » quand la série a commencé avant, sans parenthèse sinon, « ce mois-ci » pour le mois) ; séances et moteur inchangés.
191. Comparaison avec la période précédente (+1, −1, « autant que »), durée en salle (une séance importée sans heure signalée « sans durée », sans comparaison de durée), cardio par machine, groupes directs et indirects, semaine et mois (« par rapport au mois précédent »).
192. Texte du mail complet, en texte brut (titres en capitales, listes « - », sans HTML), mention d'une période en cours ; lien mailto avec adresse, objet et corps encodés (retours à la ligne CRLF).
193. Bandeau : semaine écoulée à partir du lundi, mois écoulé à partir du 1er, une seule fois par période (plus affiché une fois le bilan ouvert ; ouvrir la période en cours ou une plus ancienne ne compte pas), seulement si la période contient une séance, désactivable séparément ; réglages lus ou importés contrôlés (adresse invalide écartée).
194. (bout en bout, format smartphone) Lundi : plus de bandeau sur l'accueil, pastille sur l'onglet Progrès (« Progrès : bilan prêt »), pilotée par le réglage « Signaler le bilan de la semaine » ; bandeau de la semaine seul en haut de l'onglet Progrès ; « Plus tard » masque bandeau et pastille jusqu'à la prochaine ouverture ; « Voir » ouvre la semaine écoulée avec toutes ses sections ; aucune couleur de statut, rien ne dépasse à 412, 360 et 320 px ; « Envoyer par mail » transmet l'objet et le texte au partage natif ; « Copier le texte » ; navigation précédente / suivante jusqu'à la période en cours ; onglet Mois ; bandeau et pastille disparus après ouverture, même après relance ; accès depuis le bilan de progression ; adresse invalide refusée, adresse et réglages conservés ; bouton « Mail à … » quand une adresse est renseignée ; éléments importants en gras.
195. Mise en évidence : comparaisons (y compris « autant que »), « Non travaillés », changement de cible des progressions, séances rouges de la période et « poids inférieur recommandé », valeurs des pesées ; noms, nombres de séances et dates en texte simple ; le mail sans aucune marque.

### Activités habituelles hors salle (§19.8)

196. Habitudes : badminton par défaut (lundi 21 h – 22 h 30, jambes et épaules, active) ; une liste enregistrée, même vide, est gardée ; entrées invalides écartées ; erreurs (nom vide ou en double, fin avant le début, heure invalide).
197. Question : pas avant 22 h 30 le lundi, posée à 22 h 30 (« Badminton lundi soir (21 h – 22 h 30) ? »), toujours là jusqu'au dimanche soir, disparue le lundi suivant ; habitude désactivée : aucune question ; « matin » pour une habitude du matin.
198. « Oui » enregistre l'activité à la date du lundi (« Badminton · 1 h 30 ») ; « Non » n'enregistre rien ; la question ne revient plus ; une activité supprimée n'est ni comptée ni redemandée.
199. Récapitulatif : badminton lundi → jambes et épaules « +1 indirect · hier » le mardi, vertes ; « aujourd'hui » le lundi soir ; en-tête « 3 séances · 1 activité · 45 min de cardio » ; au plus 1 par jour et par groupe (rien de plus après une séance où le groupe est principal, ½ de plus après une séance où il est secondaire) ; « hier » aussi pour la semaine précédente.
200. Bilan du mois : « Activités : Badminton ×4, 6 h 00 », groupes indirects, texte du mail ; nombre et durée des séances inchangés ; semaine sans séance avec du badminton ; moteur inchangé.
201. Export / import : activités et habitudes dans la sauvegarde (format 4), format 3 migré sans perte, activité invalide refusée, fusion sans doublon, écriture avec les séances dans une seule transaction.
202. (bout en bout, format smartphone) Question absente à 22 h, présente à 22 h 31 au-dessus du récapitulatif ; « Oui » ; mardi : jambes et épaules « (+1 indirect) · hier » vertes ; historique « Badminton · 1 h 30 » (ligne compacte sans « Supprimer », détail avec date et heures) ; bilan de la semaine et texte du mail ; export ; suppression confirmée depuis le détail ; « Non » ; sans réponse jusqu'au dimanche ; réglages (désactivation, nouvelle activité, erreur d'heures) ; rien ne dépasse à 412, 360 et 320 px.

### Records personnels (§19.9)

203. Charge plus élevée → record ; même charge, plus de répétitions → record ; une série sous la cible, une séance incomplète, une égalité ou plus de répétitions à une charge plus basse → pas de record ; « 3 × 9 à 20 kg (9 oct.) ».
204. Exercice assisté : aide plus basse → record, puis les répétitions ; plus d'aide ne bat jamais le record (« 3 × 9 avec 25 kg d’aide »).
205. La première performance qui compte devient le record sans être célébrée ; une séance en cours est comparée au record des séances terminées ; pas de « Nouveau record » pour une première fois ni avant la dernière série.
206. Rétroactif : import d'une séance plus ancienne rejoué à sa place ; correction ou suppression d'une séance passée → recalcul ; moteur inchangé ; pas de record pour le cardio.
207. Bilan : section « Records » (« 👑 Curl biceps barre droite : 3 × 9 à 20 kg », en évidence), dernier record de chaque exercice de la période, premières fois exclues (« Aucun nouveau record. »), texte du mail.
208. (bout en bout, format smartphone) Fiche : ligne du record avec la couronne dorée, couronne dans l'historique de la fiche ; séance : « Nouveau record ! » une fois les trois séries faites, rien pour une première fois ; fin de séance : « Record battu » et couronne ; détail de la séance : couronne ; bilan et texte du mail ; rien ne dépasse à 412, 360 et 320 px.

### Bilan par groupe musculaire (§19.10)

209. Indice : Epley sur la moins bonne série (9-9-8 vaut 8), base 100 à la première séance de l'exercice.
210. Indice du groupe : moyenne des derniers indices connus de ses exercices, un point par date (deux séances le même jour : un seul point) ; charges brutes jamais mélangées entre exercices.
211. Exercice assisté sans pesée : 30 → 25 kg d'aide = 116,7, 30 → 35 kg = 83,3 ; répétitions comptées ; jamais sous 0.
212. Changement de palier de charge : 3×12 puis 3×8 au poids supérieur, l'indice continue de monter (100 → 110,53 → 112,5).
213. Groupe principal seulement (dips assistés hors pectoraux, chest press hors triceps), sous-groupes des jambes dans « jambes », ni historique partiel, ni séance en cours, ni cardio.
214. Séries par semaine : lundi 0 h 00 – dimanche (dimanche 23 h 30 dans la semaine précédente), 12 semaines, séries réellement enregistrées, indirectes pour moitié.
215. Seuils et messages (séances, semaines, les deux, singulier) ; séries : 3 semaines ; données simulées : pectoraux en progression continue, dos à 100, épaules en baisse, triceps en hausse, semaines vides ; moteur inchangé ; fixture jamais chargée par l'application.
216. (bout en bout, format smartphone) Données simulées : accès depuis le bilan, pectoraux par défaut (123,6, 17 points, 12 barres avec les semaines vides), courbe et barres cyan, indirectes plus claires, aucune couleur de statut ; épaules en jaune (82,9) ; dos 100 ; triceps 115,6 avec les dips assistés ; rien ne dépasse à 412, 360 et 320 px.
217. (bout en bout) Historique court : « 3 séances sur 6 nécessaires. » à la place de l'indice, barres affichées ; biceps : séances et semaines manquantes, message des séries ; le graphique apparaît dès six séances.
218. Exercice assisté avec pesée : charge réelle = poids du corps − aide, Epley (80 kg, 30 → 25 kg d'aide = 110) ; le poids du corps compte (2 kg perdus à aide égale = 96) ; jamais sous 0 ; aide au moins égale au poids du corps à la première séance : aide inversée ; exercice classique sans effet.
219. Poids du corps interpolé entre les deux pesées qui encadrent la séance, première pesée avant, dernière après, constant avec une seule ; une perte de poids peut faire baisser l'indice malgré une aide en baisse ; données simulées sans creux artificiel (jamais plus d'un point de baisse d'un point à l'autre) ; sans aucune pesée, aide inversée ; exercices classiques identiques avec ou sans pesées.
220. (bout en bout) Données simulées, triceps : 115,6 sans pesée (mention de l'aide inversée), 111,7 avec des pesées à 78 puis 74 kg (mention de la charge réelle), sans creux à la mi-août (104,63 le 30 juillet → 107,69 le 3 août, jamais plus d'un point de baisse), étiquettes de l'axe sans chevauchement (99,5 trop proche de 100 n'est pas affiché) ; pectoraux inchangés (123,6), sans mention ; rien ne dépasse à 412, 360 et 320 px.

### Ergonomie de la saisie et harmonisation du style (§3.1, §3.3, §5.3, §5.6, version 1.19.0)

221. (bout en bout) Carte ouverte : une seule ligne de cible avec la charge (« 3 × 9 à 52,5 kg ») et « ↑ +1 rép. », ni « Cible : » ni encadré ; « Dernière fois » (« 03/10 ») sur une ligne à 412 px, jamais tronquée à 360 et 320 px ni avec le texte à 115 % ; changement de charge recommandé : « 3 × 12 à 35 kg », séries préremplies à 12 et « ↑ Poids supérieur → 3 × 8 », puis, une fois un poids supérieur saisi, « 3 × 8 à 40 kg », séries préremplies à 8 (même si « − » a été touché avant), cible 8 enregistrée et série validée à 8.
222. (bout en bout) Menu « ⋯ » de la carte ouverte : « Ajuster séries et répétitions », « Voir la fiche de l'exercice », « Retirer de la séance », plus aucune de ces actions en permanence ; Échap le ferme ; ajustement de la cible puis « Terminé » ; fiche ouverte ; ligne de série à 360 px (et texte à 115 %) et 320 px : « Série 1 » sur une ligne, 8 px au moins entre « + » et « Valider », dans la carte. Retrait d'un exercice ou d'un cardio : confirmé, « Non » garde, « Annuler » rétablit (tests de séance et de cardio).
223. (bout en bout) Fin de séance avec six exercices : volet entièrement visible sans défiler à 412 et 360 px, texte à 115 % compris ; ressentis de 48 px, à 8 px, sur une ligne, deux rangées à 360 px, en bleu tant qu'ils manquent ; « Terminer sans compléter » secondaire ; un niveau choisi : lui seul en bleu, « Oui, terminer » principal, ressenti enregistré.
224. (bout en bout) Récapitulatif de fin : « Retour à l'accueil » mène à l'accueil et garde le nom saisi.
225. (bout en bout) Sur chaque écran et chaque route de l'appli (accueil avec la question d’activité et le formulaire « + Activité » ouvert, onglets Progrès avec le bandeau et Plus, bibliothèque, fiche, modification et création d'un exercice, historique, détail d’une séance et d’une activité (habituelle ou ponctuelle), bilans, par groupe, Mon poids avec onze pesées dont des dates longues, réglages, données et aperçu d'import), dans leurs états dépliés (bibliothèque filtrée, fiche entière, réglages ouverts, correction d'une pesée ou d'une séance passée, confirmations de suppression), à 412, 360 et 320 px et à 360 px avec le texte à 115 % ; puis la séance (menu, ajustement, confirmation du retrait et d'un poids très différent, menu du cardio, texte à 115 %), l'ajout d'un exercice, le récapitulatif de fin et la séance oubliée : seulement les cinq tailles de police, espacements de 8, 16 et 24 px, éléments tactiles d'au moins 48 px et à 8 px au moins de leurs voisins, un seul style de titre de section, étiquettes des graphiques d'au moins 12 px, rien ne dépasse. Un élément sous la barre d'onglets ou la barre du pouce reste contrôlé (atteignable en faisant défiler) ; seuls les éléments recouverts par un volet, un menu ou une fenêtre sont écartés. Les onze « Corriger » de Mon poids sont tous contrôlés (version 1.21.1).
226. (bout en bout) Cadres neutres sur l'accueil (bandeaux, récapitulatif, cases du récapitulatif inchangées), les réglages, les données, le volet de fin ; Mon poids : un seul cadre pour la liste des pesées, aucune pesée encadrée ; par groupe : cadres à la couleur du groupe ; carte d'exercice à la couleur de son groupe.

### Barre d'onglets, mode salle et bouton retour (§3.4, §5.8, version 1.20.0)

227. (bout en bout) Barre d'onglets Séance, Historique, Progrès, Plus : fixe en bas, 56 px, icône et libellé, onglet actif en couleur d'accent (`aria-current`), y compris sur les écrans de l'onglet ; onglet Séance : récapitulatif et « Démarrer une séance », aucun autre lien ni bandeau de bilan ; Progrès : trois bilans et Mon poids ; Plus : bibliothèque, réglages, « Importer / exporter » (écran du même nom) ; onglets d'au moins 48 px, rien ne dépasse à 412, 360 et 320 px.
228. (bout en bout) Mode salle : barre d'onglets masquée, barre du pouce fixe en bas (« + Exercice », « + Cardio », « Terminer », 48 px), liste compacte (« 35 kg · 1/3 »), un seul exercice ouvert ; « + Cardio » amène le formulaire à l'écran, « Terminer » ouvre le volet ; la flèche ramène à l'onglet Séance, séance conservée, reprise en un appui sur le même exercice ; libellés sur une ligne à 360 px avec le texte à 115 %.
229. (bout en bout) Bouton retour : Plus → Réglages → retour → Plus → retour → Séance ; Historique → détail → retour → Historique → retour → Séance ; adresse ouverte directement → retour → Séance ; fiche ouverte depuis la séance → retour → séance ; après l'ajout d'un exercice, retour → Séance (pas la recherche) ; en pleine séance, retour sur l'onglet Séance ne ferme pas l'appli (deux fois de suite) ; poids tapé sans quitter le champ enregistré, répétitions ajustées et cardio en cours retrouvés ; nom saisi au récapitulatif enregistré, retour → Séance (pas la séance terminée).
230. (bout en bout) Nombre d'appuis, chaque élément déjà à l'écran (aucun défilement) : démarrer 1, ajouter un exercice récent 2, série 1, ressenti 1, cardio 2, terminer 2 (avec six exercices), garder le nom 1, pesée 2, corriger une séance passée 3, reprendre 1 ; aucun de plus qu'avant les onglets (inchangé par l'allègement des écrans au calme, §3.5).

### Écrans au calme allégés (§3.5, version 1.21.0)

231. (bout en bout) Historique regroupé par mois (« Octobre 2026 », « Septembre 2026 »…), un seul cadre par mois ; ligne de séance « lun. 19 », titre, « 5 ex. · 20 min cardio » ; ligne d'activité « Badminton · 1 h 30 », « activité » ; titres sur une ligne et lignes de 64 px au plus à 412 et 360 px, texte à 115 % compris ; aucun bouton dans la liste ; « Supprimer la séance » et « Supprimer l'activité » dans le détail, avec confirmation.
232. (unitaire et bout en bout) Prises regroupées : très large · moyenne · serrée en une entrée à la place de la première, une seule prise ou d'autres variantes non regroupées, chaque prise reste un exercice-variante distinct. Bibliothèque : puces « Tous », Dos, Pectoraux, Épaules, Biceps, Triceps, Jambes, Abdominaux sur une ligne, « Récents » en tête ; « Dos » n'affiche que les récents et la section du dos, filtre gardé au retour d'une fiche ; une puce de prise ouvre la fiche de sa variante, puces de 48 px ; en séance, la puce « Serrée » ajoute « Tirage vertical — Prise serrée » (poids de départ), qui est rouvert ensuite au lieu d'être ajouté deux fois.
233. (bout en bout) Fiche : cible et dernière fois à l'écran, avant l'exercice ; vignette de 80 px au plus, agrandie au toucher avec l'attribution sous l'image, réduite ensuite ; historique dans un seul cadre, 5 lignes compactes (« 45 kg · 11-11-11 », « cible 3 × 11 · Bien passé »), « Voir tout (N séances) » puis « Voir les 5 dernières » ; lignes de 72 px au plus, texte à 115 % compris.
234. (unitaire et bout en bout) Bilan de progression : filtres sur une seule rangée, dernier « … Trop tôt », plus aucun « Trop tôt pour conclure » ; une ligne par évolution (« 8 → 9 rép. », « 40 → 45 kg, 12 → 8 rép. », « 30 → 27,5 kg »), à 412 et 360 px et avec le texte à 115 %.
235. (bout en bout) Réglages : « Exercices, variantes et réglages par exercice » au-dessus des sections ; cinq sections repliables, seule « Taille » ouverte ; jour, début et fin de l'activité sur une ligne à 412 et 360 px, jour jamais tronqué (texte à 115 % compris) ; lignes de machines à 8 px au moins l'une de l'autre ; aucun bouton « Retirer » visible, « Retirer » dans le menu « ⋯ », annulable.
236. (bout en bout) Mon poids avec onze pesées : dates courtes (« 22 sept. 2026 », « 25 août 2026 »), chaque pesée sur une ligne à 412 et 360 px ; « Taille : 178 cm · modifier dans les réglages » : le « · » est visible quand le lien est sur la même ligne (412 px), jamais quand il passe à la ligne (360 px, texte à 115 %).

### Bilan de la période : durées inconnues et période en cours (§19.7, version 1.21.3)

237. Semaine précédente avec deux séances importées sans heure : jamais 0 min, « Durée en salle : 1 h 02 » sans comparaison de durée, « (1 séance sans durée) » ou « inconnue » dans la période ; durée comparée seulement quand tout est connu des deux côtés ; semaine en cours (vendredi) comparée à lun.–ven. de la semaine dernière (« −1 par rapport à lun.–ven. de la semaine dernière »), lundi au lundi, dimanche à toute la semaine ; mois en cours au 1er–23 du mois dernier, le 1er au 1er, le 31 à tout le mois précédent ; période terminée à la précédente entière ; texte du mail identique. Bout en bout (test 194) : semaine en cours le lundi, « autant que lun. de la semaine dernière », mois en cours « par rapport au 1er–26 du mois dernier ».

### Activités ponctuelles (§19.8, version 1.22.0)

238. Activités proposées : hors habitude active d'abord (enregistrées, la plus récente en tête, puis habitudes désactivées), puis les habitudes actives, même plus récentes ; badminton désactivé classé par date comme les autres ; préremplissage d'après la dernière fois, sinon l'habitude ; activité à 0 h 00 de sa date, durée, groupes, marque `oneOff`, rattachée à l'habitude du même nom (saisie le jour de l'habitude : la question disparaît, un « Non » est remplacé) ; erreurs : nom vide, durée hors de 1 à 600 ou non entière, date invalide ou future, déjà enregistrée ce jour-là ; la question du badminton reste posée.
239. Comptée comme une activité confirmée : récapitulatif (« +1 indirect », « aujourd'hui », puis « hier », « · 1 activité »), bilan et texte du mail (« Activités : Badminton ×1, 1 h 30 ; Futsal ×1, 1 h 00 »), groupes indirects ; export puis import identiques (format 4) ; marque invalide refusée ; moteur inchangé.
240. (bout en bout, format smartphone) badminton seul connu : proposé sans présélection (« Choisissez une activité. ») ; futsal en habitude désactivée ; « + Activité » discret (lien de 48 px sous « Démarrer une séance ») ; puces Futsal, Badminton, Autre, futsal présélectionné et prérempli (60 min, Jambes), date du jour ; date future refusée avec un message ; enregistrée : message, en-tête « 1 activité », jambes « +1 indirect · aujourd'hui », question du badminton toujours là ; deuxième ouverture : futsal en tête, présélectionné, prérempli d'après la dernière fois (2 appuis), refus d'un doublon le même jour ; « Autre » : Escalade le 21, puis ordre Futsal, Escalade, Badminton ; après relance, historique (détail « activité ponctuelle », sans heures) et bilan de la semaine ; jamais de question pour le futsal ; rien ne dépasse à 412, 360 et 320 px. Le test 225 contrôle aussi le formulaire ouvert et le détail d'une activité ponctuelle.

Les tests doivent vérifier les décisions réelles du moteur et les données enregistrées, pas seulement l'affichage.

## 16. Vérification avant livraison

Effectuer réellement les scénarios suivants, avec Playwright dans un navigateur à la taille d'un smartphone :

1. Enregistrer une séance verte à 3×8 et vérifier qu'aucune progression n'est déclenchée.
2. Enregistrer une deuxième séance verte au même palier et vérifier que la cible passe à 3×9.
3. Enregistrer vert, orange, vert au même palier et vérifier qu'il n'y a pas de progression.
4. Enregistrer une première séance verte à 3×12 : pas d'augmentation de poids.
5. Enregistrer une deuxième séance verte à 3×12 : « poids supérieur » affiché ; saisir une charge plus lourde et vérifier le retour à 3×8.
6. Enregistrer quatre séances rouges consécutives : « poids inférieur » affiché ; saisir une charge plus légère et vérifier que la cible est conservée.
7. Recharger l'application en pleine séance et vérifier la restauration complète, chronomètre compris.
8. Modifier une séance passée et vérifier le recalcul des couleurs et recommandations.
9. Coller le bloc de notes du §11.3, saisir une date, et vérifier l'interprétation des six exercices.
10. Rechercher `chest press` et `pec deck`, puis `dos`.
11. Exporter les données, puis les réimporter sans créer de doublons.
12. Vérifier qu'un import incomplet ou invalide ne détruit aucune donnée existante.
13. Couper le réseau et vérifier que l'application recharge et fonctionne hors ligne.

Si un scénario échoue, corriger le problème puis relancer les tests concernés.

**Ce que tu ne peux pas vérifier toi-même** (installation réelle sur mon téléphone, rendu sur un écran physique) : liste-le clairement dans le compte rendu pour que je le teste. Ne prétends jamais l'avoir fait.

## 17. Qualité technique et livraison

Avant la livraison :

- Vérifier la compilation TypeScript en mode strict.
- Exécuter les tests automatisés.
- Corriger les erreurs détectées.
- Vérifier la sauvegarde et la restauration des données.
- Vérifier le fonctionnement hors ligne.
- Vérifier le manifeste PWA (icônes, nom, couleurs, `start_url` et `scope` compatibles avec GitHub Pages).
- Vérifier le thème sombre et le contraste des couleurs.
- Vérifier que chaque bouton visible fonctionne réellement.
- Vérifier l'import de notes libres et de JSON.
- Vérifier la cohérence entre le profil recalculé et les recommandations.

Ne pas ajouter de dépendances inutiles.

Ne pas afficher de bouton inactif.

Si une fonctionnalité ne peut pas être entièrement réalisée, le signaler clairement.

Dans le compte rendu final, indiquer :

- Les fonctionnalités réellement implémentées.
- Les tests exécutés et réussis.
- Les tests échoués ou non exécutés.
- Les éventuelles limites restantes.
- Ce que je dois vérifier moi-même sur mon téléphone.
- Les commandes pour lancer l'application localement et pour la déployer.

Ne jamais déclarer un test réussi s'il n'a pas réellement été exécuté.

## 18. Priorités absolues

Si des compromis sont nécessaires, respecter cet ordre :

1. Fiabilité de la sauvegarde et de l'historique.
2. Exactitude du moteur de progression.
3. Import fiable des séances existantes.
4. Rapidité de saisie pendant la séance.
5. Recherche efficace par exercice et groupe musculaire.
6. Clarté de l'interface.
7. Illustrations et confort visuel.
8. Fonctionnalités secondaires (analyse, suivi corporel).

## 19. Consultation et analyse de la progression

L'application doit permettre non seulement de mémoriser les performances, mais aussi de comprendre facilement leur évolution dans le temps.

### 19.1. Historique individuel par exercice et variante

Chaque fiche d'exercice propose une vue historique accessible rapidement, affichant les séances successives avec :

- La date.
- Le poids utilisé.
- Le nombre de séries.
- Les répétitions réellement effectuées pour chaque série.
- Le ressenti global.
- Le statut couleur calculé.
- L'origine (saisie ou importée).

L'historique est trié chronologiquement et permet de comprendre immédiatement où j'en suis sur cette machine. Lignes compactes dans un seul cadre, les 5 dernières séances d'abord, puis « Voir tout » (§3.5).

### 19.2. Graphique d'évolution simple

Prévoir un graphique léger dans la fiche de chaque exercice pour visualiser l'évolution dans le temps : poids utilisé, répétitions réalisées, dates correspondantes.

Ne pas mélanger les variantes non comparables. Le graphique est secondaire : il ne doit pas ralentir la saisie pendant la séance.

**Précision validée :** le graphique (charge et répétitions) s'affiche dès la première séance, avec un seul point ; tant qu'il y a moins de deux séances, un court message l'indique : « Le graphique se complètera au fil des séances ».

### 19.3. Bilan synthétique

Prévoir une vue facultative permettant de repérer :

- Les exercices qui progressent (au moins un palier validé sur les 6 dernières séances de l'exercice).
- Les exercices stables (aucun palier validé sur les 6 dernières séances, sans rouge répété).
- Les exercices en difficulté (au moins 2 rouges consécutives en cours).
- Les dernières évolutions de charge et de répétitions.

Ne jamais déclarer un exercice en stagnation sur la base d'une seule séance difficile. Ne pas inventer de score de progression.

**Précisions validées :**

- Un palier est « validé » quand il atteint sa 2ᵉ validation verte consécutive (§7.5).
- Un exercice qui n'a qu'une seule séance évaluée est classé « Trop tôt » (« Trop tôt pour conclure » jusqu'à la version 1.20.0).
- « En difficulté » (au moins 2 rouges consécutives en cours) l'emporte sur « En progression ».
- Libellé de « Trop tôt » : « Une seule séance sur cet exercice. »
- Présentation : un résumé en tête donne le nombre d'exercices de chaque catégorie ; chaque catégorie a un titre de section bien visible, un pictogramme (↗ en progression, → stables, ↘ en difficulté, … trop tôt), un cadre neutre et son nombre d'exercices ; chaque exercice listé est encadré à la couleur de son groupe (§3.2). Pas de vert, d'orange ni de rouge (réservés aux statuts, §8).
- Filtres : le résumé du haut est une seule rangée (défilement horizontal si elle ne tient pas, §3.5) de vrais boutons rectangulaires arrondis, au style des boutons de l'accueil, un par catégorie (pictogramme, titre, nombre d'exercices) et un bouton « Tous ». Les boutons sont neutres (les couleurs désignent les groupes, §3.2). Un appui n'affiche que la catégorie choisie et remplit le bouton, comme un bouton principal ; un nouvel appui sur le bouton actif, ou « Tous », réaffiche tout. Une catégorie sans exercice reste visible mais n'est pas sélectionnable. Par défaut tout est affiché ; le dernier filtre est mémorisé sur l'appareil (s'il ne contient plus d'exercice, tout est affiché). « Dernières évolutions » n'apparaît que sans filtre, une ligne par évolution (§3.5).
- Un appui sur un exercice ouvre sa fiche directement sur son graphique d'évolution (§19.2) ; le retour ramène au bilan. Le bilan est accessible depuis l'onglet Progrès (§3). Il mène aux bilans de la semaine et du mois (§19.7) et à la vue « Par groupe musculaire » (§19.10).

### 19.4. Séparation entre historique réel et recommandation

Les performances réellement réalisées sont la donnée de référence. Le moteur calcule paliers et cibles, mais ne modifie jamais les performances réelles pour les faire correspondre au palier théorique.

### 19.5. Priorité d'utilisation

La saisie et la consultation de la prochaine cible restent immédiates. Graphiques et analyses sont dans une vue secondaire.

### 19.6. Récapitulatif hebdomadaire en page d'accueil (précision validée)

But : un coup d'œil de 2 secondes avant la séance pour savoir quels groupes travailler.

**Affichage**

- En haut de l'accueil, au-dessus du bouton de démarrage, visible sans clic ni défilement sur smartphone.
- Une grille compacte de cases colorées, une par groupe, nom en entier, avec le nombre de séances de la semaine entre parenthèses (sauf pour un groupe pas du tout travaillé) : séances directes, puis indirectes s'il y en a, sans fraction (« Biceps (1× · +1 indirect) », « Biceps (+2 indirect) »). Le nombre et la mention « hier » sont plus discrets que le nom du groupe, et un mot n'est jamais coupé en deux (vérifié à 412, 360 et 320 px).

  ```
  Semaine du lun. 12 au dim. 18 oct. : 2 séances
  [vert] Jambes                 [vert] Biceps (+1 indirect)
  [orange] Pectoraux (1×)       [orange] Dos (1×) · hier
  [rouge] Épaules (2×)          [rouge] Triceps (2×) · hier
  ```

- L'en-tête affiche les dates exactes de la semaine en cours (lundi et dimanche, mois répété si la semaine change de mois) et le nombre de séances (« 0 séance », « 1 séance », « 2 séances »), suivi du nombre d'activités habituelles confirmées et du total de cardio de la semaine quand il y en a (« 3 séances · 1 activité · 45 min de cardio », §5.7, §19.8). Une séance ne contenant que du cardio compte comme une séance ; le cardio n'entre dans aucun groupe. Une activité n'est pas une séance de salle.
- Couleur selon le score de la semaine (voir Calcul), pour qu'un travail seulement indirect ne pèse pas autant qu'une séance directe (précision validée) : vert = score inférieur à 1 (aucune séance, ou une seule séance indirecte : la mention « +1 indirect » reste affichée) ; orange = score d'au moins 1 et inférieur au seuil du rouge ; rouge = score au moins égal au seuil. Le seuil du rouge est réglable (2 par défaut, de 2 à 7).
- Mention « aujourd'hui » ou « hier » si le groupe a été travaillé, directement ou indirectement, il y a moins de 48 heures, même la semaine précédente. La mention suit le jour du calendrier : une séance d'avant-hier, même à moins de 48 heures, n'a pas de mention.
- Tri (précision validée) : couleur d'abord, vert en haut, puis orange, puis rouge en bas ; à couleur égale, les groupes non travaillés depuis moins de 48 heures avant ceux travaillés « hier » ou « aujourd'hui » ; puis score croissant (un vert avec de l'indirect passe après un vert sans rien) ; puis l'ordre de la liste des groupes.
- Cases pleines, visuellement différentes des pastilles de progression des exercices ; texte lisible en mode sombre.
- Rien d'autre : pas de légende, de graphique ni de texte explicatif.

**Calcul**

- Semaine du lundi 0 h 00 au dimanche 23 h 59 inclus, heure locale du téléphone (Paris). Une séance compte dans la semaine de sa date de début, même si elle se termine après minuit ; une séance importée sans heure compte selon sa date.
- Groupes affichés par défaut : pectoraux, dos, épaules, biceps, triceps, jambes. Abdominaux exclus du récapitulatif mais gardés dans la bibliothèque. Liste modifiable dans les réglages ; elle est incluse dans l'export.
- Groupes principal et secondaires (précision validée) : pour chaque groupe affiché et chaque séance de la semaine, la séance compte **1** si le groupe est le groupe principal d'au moins un exercice de la séance (shrugs et lombaires au banc dans « Dos », oiseau et face pull dans « Épaules ») ; sinon **½** s'il n'est que groupe secondaire d'au moins un exercice (travail indirect : biceps des tractions assistées et des tirages, pectoraux des dips assistés, triceps et épaules des développés). Une séance ne compte jamais plus de 1 pour un groupe : principal dans un exercice et secondaire dans un autre, il compte 1 ; deux exercices où il est secondaire comptent ½. Le score de la semaine est la somme : tractions seules → biceps ½ (vert, « +1 indirect ») ; deux séances indirectes seulement → 1 (orange, « +2 indirect ») ; curl le lundi et tractions le jeudi → biceps 1,5 (orange, « 1× · +1 indirect »). Les exercices de jambes de la bibliothèque (presse, leg extension, leg curl, curl ischios, mollets, abducteurs, adducteurs) comptent dans « Jambes ». Un exercice personnalisé dont le groupe principal est un sous-groupe des jambes (quadriceps, ischio-jambiers, mollets, fessiers, adducteurs) compte pour « jambes » quand ce sous-groupe n'est pas affiché lui-même.
- Activités habituelles confirmées (§19.8) : travail **indirect**, ½ pour chacun de leurs groupes, dans la semaine de leur date, avec la mention « hier » / « aujourd'hui » (heure de fin). Au plus 1 par jour et par groupe (choix d’implémentation signalé à l’utilisateur) : le jour d'une séance où le groupe est principal, l'activité n'ajoute rien ; le jour d'une séance où il n'est que secondaire, elle ajoute ½ (« +2 indirect »).
- Le récapitulatif n'est jamais stocké : il est recalculé à partir des séances enregistrées à chaque affichage de l'accueil. Il est donc à jour immédiatement après la fin d'une séance, un import, une suppression ou une modification de date.
- Seules les séances terminées comptent ; une séance en cours n'est prise en compte qu'une fois terminée.
- En début de semaine, sans séance, tous les groupes sont verts et l'en-tête indique « 0 séance ».
- Aucun effet sur le moteur de progression ni sur le bilan (§19.3).

### 19.7. Bilans de la semaine et du mois, envoyables par mail (précision validée)

L'application n'a pas de serveur : aucun envoi automatique. Elle prépare le bilan, le signale, et l'utilisateur l'envoie en un geste.

**Écran « Bilan de la période »** (`#/bilan-periode`), accessible depuis l'onglet Progrès et le bilan de progression (bouton « Bilan de la semaine / du mois »), et depuis le bandeau de l'onglet Progrès.

- Deux onglets, Semaine et Mois. Semaine = lundi 0 h 00 au dimanche, mois = mois calendaire, heure locale ; une séance compte dans la période de son début (même règle que le §19.6). Boutons ‹ et › vers la période précédente ou suivante ; pas de période suivante après la période en cours, pas de période précédente avant la première séance.
- Période ouverte par défaut : la période en cours si elle contient une séance, sinon la précédente. Une période en cours l'indique (« Semaine en cours, arrêtée au jeu. 22 oct. »).
- Contenu, court et factuel, en sections :
  - **Séances** : nombre de séances et comparaison avec la période précédente (« 3 séances, +1 par rapport à la semaine précédente », « autant que… ») ; durée en salle ; minutes de cardio par machine ; activités habituelles confirmées par nom (« Activités : Badminton ×4, 6 h 00 », §19.8), qui ne sont pas des séances (ni dans le nombre de séances, ni dans la durée en salle : deux chiffres séparés).
  - **Durée en salle (précision validée, version 1.21.3)** : une séance importée sans heure de début ou de fin a une durée inconnue, jamais comptée pour 0 min. La durée n'additionne que les séances à durée connue et signale les autres (« Durée en salle : 1 h 02 (2 séances sans durée) » ; « inconnue (2 séances sans durée) » si aucune n'est connue). Elle n'est comparée (« , +22 min par rapport à… ») que si toutes les séances des deux intervalles comparés ont une durée connue ; sinon, pas de comparaison.
  - **Période de comparaison (précision validée, version 1.21.3)** : une période terminée est comparée à la période précédente entière (« par rapport à la semaine précédente », « au mois précédent »). Une période en cours est comparée à la même portion de la précédente, jours entiers : du lundi au même jour de la semaine dernière (« par rapport à lun.–ven. de la semaine dernière », « autant que lun. de la semaine dernière »), du 1er au même jour du mois dernier (« par rapport au 1er–23 du mois dernier », « autant que le 1er du mois dernier »), sans dépasser la fin de la période précédente (le 31 octobre est comparé à tout septembre, et un dimanche à toute la semaine précédente : libellé habituel). Même règle pour le nombre de séances et la durée, à l'écran comme dans le mail.
  - **Groupes travaillés** : même calcul que le récapitulatif (§19.6, direct + indirect, activités habituelles comprises, groupes affichés seulement), en nombre de séances (« Biceps : 1× · +2 indirect ») ; puis « Non travaillés : … ».
  - **Progressions** : paliers validés pendant la période d'après les évaluations du moteur (2ᵉ validation verte consécutive) : « Curl biceps haltères : 3×8 → 3×9 à 12 kg (21 oct.) », « Leg extension : 3×12 à 40 kg validé → poids supérieur, 3×8 », « Tractions assistées : 3×12 avec 30 kg d'aide validé → moins d'aide, 3×8 » ; sinon « Aucun palier validé. ».
  - **Records** : records battus pendant la période (§19.9) ; sinon « Aucun nouveau record. ».
  - **En difficulté** : une ligne par exercice ayant eu au moins une séance rouge pendant la période ; sinon « Aucun exercice en difficulté. ». Formulation selon le cas (précision validée) :
    - passage en « poids inférieur » pendant la période : « Presse à cuisses : 4ᵉ séance rouge de suite à 100 kg → poids inférieur recommandé (21 oct.) » (« avec 30 kg d'aide → plus d'aide recommandée » pour un exercice assisté) ;
    - sinon : « Presse à cuisses : 2 séances rouges cette semaine (3 de suite à 100 kg) » (« ce mois-ci » pour le mois). La parenthèse donne la série de rouges en cours à la fin de la période quand elle a commencé avant la période ; sans série en cours plus longue (série commencée dans la période, ou interrompue), pas de parenthèse.
  - **Poids** : première et dernière pesée de la période, si elles existent (« 80,2 kg le 19 oct. → 79,6 kg le 25 oct. »).
  - Une période sans séance n'affiche que le nombre de séances, la comparaison, les activités habituelles et leurs groupes, et les pesées.
- Mise en évidence (précision validée) : les phrases gardent leur rédaction, mais l'essentiel se repère d'un coup d'œil : en gras et en blanc, le reste de la ligne en gris clair. Sont mis en évidence : les comparaisons avec la période précédente (« +1 par rapport à la semaine précédente », « autant que… »), la ligne « Non travaillés : … », le changement de cible d'une progression (« 3×8 → 3×9 à 12 kg », « poids supérieur, 3×8 », « moins d'aide, 3×8 »), le nombre de séances rouges de la période (« 2 séances rouges cette semaine ») et « poids inférieur recommandé » / « plus d'aide recommandée », les deux valeurs de poids. Restent en texte simple : nombres de séances, durée, cardio, noms d'exercices et de groupes travaillés, dates. Le mail reste en texte brut, sans marque.
- Pas de score, pas de conseil. Écran neutre (cadres `--frame-neutral`) : pas de vert, d'orange ni de rouge, y compris dans les messages. Aucun effet sur le moteur de progression ; rien n'est stocké, tout est recalculé à l'affichage.

**Envoi**

- « Envoyer par mail » : partage natif d'Android (Web Share API, objet = `title`, texte brut = `text`), pour choisir Gmail ; à défaut (partage indisponible ou refusé), lien `mailto:` avec l'adresse des réglages, l'objet et le corps préremplis. Un partage annulé n'ouvre rien d'autre.
- « Copier le texte », toujours proposé ; le texte complet est aussi affichable (« Texte du mail »).
- Quand une adresse est renseignée et que le partage natif existe, un bouton « Mail à <adresse> » ouvre directement le mail prérempli (le partage natif ne permet pas de préremplir le destinataire).
- Objet : « MyFitApp — Bilan semaine du 19 au 25 oct. 2026 » / « MyFitApp — Bilan octobre 2026 ». Le corps reprend l'objet en première ligne, puis chaque section : titre en capitales, lignes « - … », sans HTML.

**Signalement**

- À partir du lundi (semaine écoulée) et à partir du 1er (mois écoulé) : une **pastille sur l'onglet Progrès** (§3.4), et un bandeau discret tout en haut de cet onglet (version 1.20.0 : plus sur l'accueil) : « Ton bilan de la semaine est prêt » / « Ton bilan du mois est prêt », avec « Voir » et « Plus tard ». Pas de notification système.
- Seulement si la période écoulée contient au moins une séance terminée. Seule la dernière période écoulée est signalée.
- Pastille et bandeau disparaissent définitivement pour cette période une fois le bilan ouvert (donc aussi une fois envoyé). Ouvrir la période en cours ou une période plus ancienne ne compte pas.
- « Plus tard » masque le bandeau et la pastille jusqu'à la prochaine ouverture de l'appli (rechargement ou relance).
- Réglages (§14) : « Signaler le bilan de la semaine (pastille sur Progrès) » et « … du mois » désactivables séparément ; ils pilotent la pastille et le bandeau ; adresse e-mail facultative, contrôlée, préremplie dans le `mailto:`. Ces réglages sont inclus dans l'export et restaurés par un remplacement global ; les bilans déjà ouverts sont mémorisés sur l'appareil seulement.

### 19.8. Activités habituelles hors salle (précision validée)

But : compter, sans rien saisir, une activité régulière faite hors de la salle (badminton…).

**Habitudes (réglages, « Activités habituelles »)**

- Liste d'habitudes : nom, jour de la semaine, heure de début, heure de fin (même jour, après le début), groupes sollicités (pectoraux, dos, épaules, biceps, triceps, jambes, abdominaux), et « Activée » pour la suspendre (vacances). Ajout, modification, suppression ; enregistrées avec « Enregistrer les activités » (erreurs affichées : nom vide ou en double, fin avant le début).
- Préremplie à l'installation, et sur une base existante qui n'a pas encore de liste, avec une seule habitude : Badminton, le lundi de 21 h à 22 h 30, jambes et épaules. Une liste enregistrée, même vide, n'est jamais complétée (une habitude supprimée n'est pas recréée).
- Modifier ou supprimer une habitude ne change pas les activités déjà enregistrées (nom, heures et groupes y sont copiés).

**Confirmation (accueil)**

- Pour chaque habitude active, une question sur l'accueil une fois l'heure de fin passée, pour le jour de l'habitude de la semaine en cours : « Badminton lundi soir (21 h – 22 h 30) ? » (matin avant midi, après-midi avant 18 h, soir ensuite), avec « Oui » et « Non ». Aucune saisie, aucune notification système.
- « Oui » enregistre l'activité à la date du jour de l'habitude. « Non » n'enregistre rien ; la question ne revient plus pour ce jour.
- Sans réponse, la question reste proposée jusqu'au dimanche de cette semaine, puis disparaît sans rien enregistrer.
- Habitude désactivée : aucune question.
- Une seule réponse par habitude et par jour (identifiant `act-<habitude>-<date>`).

**Affichage**

- Historique : l'activité confirmée figure parmi les séances, à sa date (ligne « Badminton · 1 h 30 », « activité », §3.5) ; son détail donne « 19 octobre 2026 · 21 h – 22 h 30 » et les groupes ; « Supprimer l'activité » puis « Confirmer la suppression » la retire (la réponse devient « Non » : la question ne revient pas).
- Récapitulatif hebdomadaire (§19.6) : travail indirect et « · 1 activité » dans l'en-tête. Bilans (§19.7) : « Activités : Badminton ×4, 6 h 00 » dans « Séances », groupes indirects, texte du mail compris.
- Pas de vert, d'orange ni de rouge en dehors des statuts (messages neutres).

**Activités ponctuelles (précision validée, version 1.22.0)**

But : compter une activité faite de temps en temps (futsal…), sans en faire une habitude ni recevoir de question chaque semaine. Les activités habituelles (badminton) ne changent pas.

- Onglet Séance, sous « Démarrer une séance » : un lien d'action discret « + Activité » (48 px de haut, pas un bouton plein). Il ouvre un formulaire en place (« Activité ponctuelle ») :
  - **Activité** : une puce par activité déjà connue, y compris les habitudes désactivées (le futsal) ; « Autre » pour un nouveau nom (champ « Nom de l'activité »). Ordre (précision validée, version 1.22.1) : d'abord les activités qui ne sont pas couvertes par une habitude active (futsal, nom libre), la plus récemment enregistrée en premier, puis celles jamais enregistrées ; ensuite les habitudes actives (badminton), dans le même ordre. La première puce est présélectionnée seulement si elle n'est pas une habitude active : un futsal s'enregistre en 2 appuis (« + Activité », « Enregistrer l'activité »), et un badminton n'est jamais enregistré par erreur. Sans activité hors habitude active, rien n'est présélectionné (« Choisissez une activité. » si l'on enregistre sans choisir).
  - **Date** : aujourd'hui par défaut, jamais dans le futur.
  - **Durée (min)** : nombre entier de 1 à 600.
  - **Groupes sollicités** (mêmes puces que les habitudes).
  - Durée et groupes sont préremplis d'après la dernière fois (même nom), sinon d'après l'habitude (fin − début, groupes) ; vides pour un nouveau nom.
  - « Enregistrer l'activité » / « Annuler » ; erreurs affichées (nom manquant, durée invalide, date future, « Cette activité est déjà enregistrée ce jour-là. ») ; après l'enregistrement : « Activité enregistrée : Futsal · 1 h 15, 23 oct. 2026. ».
- Elle compte exactement comme une activité habituelle confirmée : récapitulatif (travail indirect, « · 1 activité », « aujourd'hui » / « hier »), bilans et mail, historique (ligne « Futsal · 1 h 15 », « activité » ; détail « 23 octobre 2026 · 1 h 15 · activité ponctuelle », suppression comme une activité habituelle). Aucun effet sur le moteur.
- Heures inconnues (choix d'implémentation) : l'activité est rangée à 0 h 00 de sa date, comme une séance importée sans heure (`start` « 00:00 », `end` = durée, marque `oneOff`), et ses heures ne sont jamais affichées.
- Une activité du même nom qu'une habitude lui est rattachée (`act-<habitude>-<date>`) : saisie le jour de l'habitude, elle répond à sa question, sans doublon ; une réponse « Non » ce jour-là est remplacée. Sinon l'identifiant est `act-ponctuelle-<nom>-<date>`. Une seule activité confirmée par nom et par jour.
- Données : dans la méta `activities`, avec les réponses aux habitudes ; incluses dans l'export, format `schemaVersion` 4 inchangé (champ facultatif `oneOff`).

**Données** : réponses dans la méta `activities` et habitudes dans la méta `habits` de la base principale (aucune migration de structure) ; une activité n'est jamais une séance et n'a aucun effet sur le moteur de progression. Export (format `schemaVersion` 4 : `activities` et `settings.habits`) ; import en fusion (la réponse de l'appareil est gardée, pas de doublon même nom même jour) ou en remplacement global (habitudes comprises).

### 19.9. Records personnels (précision validée)

**Définition**, par exercice-variante (`src/analysis/records.ts`, calcul pur) :

- Une performance compte si toutes les séries prévues ont été faites, toutes à la cible (ni historique partiel, ni séance incomplète, ni série sous la cible).
- La meilleure : charge la plus élevée, puis à charge égale le plus de répétitions par série, puis le plus de séries (choix signalé). Exercice assisté (§7.12) : aide la plus **basse**, puis les répétitions.
- Un record n'est battu que par une performance strictement meilleure : une égalité ne le remplace pas.
- Calculé à partir de tout l'historique (séances terminées, saisies ou importées), dans l'ordre chronologique du moteur (§7.9) : rétroactif, et recalculé à chaque affichage, donc à jour après la correction, le changement de date ou la suppression d'une séance passée. Jamais stocké.
- La toute première performance qui compte devient le record **sans être célébrée** : ni « Nouveau record ! », ni couronne dans l'historique, ni ligne dans les bilans. Seuls les records **battus** sont célébrés.
- Le cardio et les activités habituelles (§19.8) n'ont pas de record. Aucun effet sur le moteur de progression.

**Affichage** (couronne dorée `--gold`, pictogramme SVG `Crown` ; « 👑 » dans le texte du bilan et du mail) :

- Fiche d'exercice : ligne « Record : 3 × 9 à 20 kg (16 oct.) » sous « Dernière fois » (§5.3.2).
- Séance : quand toutes les séries prévues d'un exercice sont faites à la cible et battent le record des séances précédentes, couronne et « Nouveau record ! » sur sa carte, sous le nom (visible carte repliée).
- Récapitulatif de fin de séance : cadre « Record battu » / « Records battus » (« Curl biceps barre droite : 3 × 8 à 22 kg ») et couronne à côté du nom de l'exercice.
- Historique : petite couronne (« Record battu ») à côté des performances qui ont battu un record, dans le détail d'une séance et dans l'historique de la fiche.
- Bilan de la période (§19.7) : section « Records » après « Progressions », le dernier record battu de chaque exercice pendant la période (« 👑 Curl biceps barre droite : 3 × 9 à 20 kg », la performance en évidence), sinon « Aucun nouveau record. » ; même section dans le texte du mail.
- La couronne est discrète et ne remplace aucune pastille de statut ni couleur de groupe. Pas de vert, d'orange ni de rouge.

### 19.10. Bilan par groupe musculaire (précision validée)

Vue secondaire (`#/bilan-groupes/<groupe>`), accessible depuis l'onglet Progrès et le bilan de progression (bouton « Par groupe musculaire »), jamais depuis l'onglet Séance. Sélecteur de groupe : pectoraux, dos, épaules, biceps, triceps, jambes (pectoraux par défaut ; les sous-groupes des jambes comptent dans « jambes »). Calcul pur (`src/analysis/groups.ts`), refait à l'affichage à partir des séances terminées ; ni cardio ni activités habituelles ; aucun effet sur le moteur.

**Indice de progression (base 100)**

- Pour chaque exercice-variante dont le groupe est le groupe **principal** (un groupe secondaire est ignoré) : force estimée à chaque séance par la formule d'Epley, charge × (1 + répétitions / 30), sur la **moins bonne série** ; exprimée en pourcentage de sa première séance (= 100). Historique partiel ignoré.
- Exercice assisté (§7.12) :
  - quand au moins une pesée existe dans « Mon poids » (§20) : charge réelle = poids du corps − aide, puis Epley comme pour un exercice classique (80 kg, 30 → 25 kg d'aide : 50 → 55 kg réels, 110). Poids du corps à la date de la séance (précision validée) : interpolation linéaire entre les deux pesées qui l'encadrent ; avant la première pesée, la première ; après la dernière, la dernière ; avec une seule pesée, ce poids constant. Pas de saut artificiel quand deux pesées sont espacées. Seule lecture des pesées : le suivi corporel n'en est pas modifié. Une aide au moins égale au poids du corps à la première séance (sans sens physique) revient à la méthode sans pesée ;
  - sans aucune pesée : la variation relative de l'aide est inversée, indice = 100 × (2 − aide ÷ aide de la première séance) × l'effet des répétitions (Epley) ; 30 → 25 kg d'aide donne 116,7, comme 30 → 35 kg pour un exercice classique ;
  - la méthode appliquée est indiquée sous la liste des exercices ; jamais sous 0.
- Indice du groupe à une date = moyenne des indices de ses exercices, chacun avec sa dernière valeur connue ; un point par date de séance. Les charges brutes de deux exercices différents ne sont jamais additionnées ni moyennées.
- Affichage : dernière valeur (« Pectoraux : 123,6 »), courbe dans le temps avec une ligne pointillée à 100, liste des exercices pris en compte. Les étiquettes de l'axe (maximum, 100, minimum, dans cet ordre de priorité) ne se chevauchent jamais : une étiquette trop proche d'une autre n'est pas affichée.

**Séries par semaine**

- Barres des 12 dernières semaines (lundi 0 h 00 – dimanche, heure locale, semaine en cours comprise) : séries enregistrées des exercices dont le groupe est principal, en plein ; séries des exercices où il n'est que secondaire, comptées pour moitié et empilées en plus clair. Total au-dessus de chaque barre (« 7,5 »).

**Seuils** (pour le groupe choisi) : indice = au moins 6 séances sur au moins 3 semaines différentes ; séries = au moins 3 semaines avec des séries sur le groupe parmi les 12. En dessous, à la place du graphique : « Pas encore assez de données pour analyser ta progression : 3 séances sur 6 nécessaires. » (chiffres réels ; « 2 semaines sur 3 », ou les deux : « 1 séance sur 6 et 1 semaine sur 3 nécessaires. »). Le graphique apparaît dès que le seuil est atteint.

**Couleurs** : cadres, courbe et barres dans la couleur du groupe choisi (`GROUP_COLORS`, §3.2), le reste neutre. Pas de vert, d'orange ni de rouge.

**Données de test** : `src/analysis/__tests__/simulation.ts` (fixture, jamais chargée par l'application, vérifié par le test 215) : du 1er juin au 22 octobre 2026, pectoraux en progression (retour à 3×8 au poids supérieur), dos en stagnation, épaules en régression, dips assistés (aide en baisse), semaines sans séance.

## 20. Suivi corporel simplifié : « Mon poids »

- Rubrique indépendante des entraînements, dans l'onglet Progrès : une pesée s'y enregistre directement (« Enregistrer la pesée », dernière pesée rappelée), l'écran « Mon poids » garde l'historique, les corrections et le graphique.
- Taille enregistrée une seule fois dans les réglages.
- Saisie du poids avec la date (préremplie à aujourd'hui), en une action.
- Historique des pesées (une simple liste dans un seul cadre neutre, une ligne par pesée, §3.1) et graphique simple de l'évolution. Lignes séparées d'un filet avec 8 px de chaque côté : deux « Corriger » (48 px) restent à plus de 8 px l'un de l'autre, même quand une date longue fait passer le poids et « Corriger » sous la date (version 1.21.1). Version 1.21.2 : date courte (« 22 sept. 2026 »), poids en gras, « Corriger » en 15 px, écarts de 8 px : chaque pesée tient sur une ligne à 412 et 360 px, et à 360 px avec le texte à 115 % sauf les mois qui ne s'abrègent pas (« 25 août 2026 », 7 px de trop avec la police des tests) ; si la place manque, poids et « Corriger » passent sous la date. Sous le formulaire, « Taille : 178 cm · modifier dans les réglages » : quand le lien passe à la ligne, le « · » n'est pas affiché (jamais isolé en fin de ligne).
- Périodes de consultation : 1 mois, 3 mois, 6 mois et 1 an, selon les données disponibles.
- Correction ou suppression d'une mesure.
- Taille et historique des pesées inclus dans la sauvegarde et l'export JSON.
- Aucune pesée, mensuration ni saisie régulière imposée.
- Pas de calculs complexes, de scores corporels ou d'analyses automatiques superflues.

**Précisions validées :**

- Une seule pesée par date : une nouvelle saisie à la même date remplace la précédente.
- Poids accepté entre 20 et 350 kg, taille entre 80 et 250 cm, pas de date dans le futur.
- Import : en cas de conflit (même date, autre poids ; taille différente), la valeur de l'appareil est conservée et l'écart signalé. Les pesées sont importées après les séances, dans leur base séparée : si cette étape échoue, les séances restent importées et l'échec est signalé.

### Isolation et fiabilité

- Le suivi corporel est un module indépendant du système d'entraînement, stocké dans un espace séparé d'IndexedDB.
- Il ne modifie ni les séances, ni l'historique sportif, ni le moteur de progression, ni les recommandations.
- Une erreur de saisie, un problème de graphique ou une donnée corporelle invalide ne doit jamais empêcher de démarrer, poursuivre, enregistrer ou consulter une séance.
- L'absence de données corporelles n'a aucune conséquence sur les autres fonctionnalités.
- Des tests de non-régression vérifient que les fonctionnalités sportives continuent de fonctionner (§15).

## 21. Hébergement sur GitHub Pages

L'application est déployée sur **GitHub Pages**, ce qui fournit le HTTPS nécessaire à l'installation de la PWA sur smartphone.

- Dépôt : `MyFitApp` (public, compte `nicKLas-317`), remote SSH `git@github.com:nicKLas-317/MyFitApp.git`. Adresse finale : https://nicklas-317.github.io/MyFitApp/. `base` de Vite : `/MyFitApp/` (majuscules exactes).
- **Publication (précision validée)** : pour les ajouts et corrections normaux, pousser directement après une vérification propre (§22). La validation explicite de l'utilisateur reste obligatoire avant toute réécriture d'historique et tout push forcé.
- Configurer le manifeste (`start_url`, `scope`) et le service worker pour ce chemin.
- Utiliser un routage compatible avec un hébergement statique (routage par hash, ou fallback `404.html`), pour qu'un rechargement sur une page interne ne donne pas d'erreur.
- Ajouter un workflow GitHub Actions qui, à chaque push sur `main` : installe les dépendances, lance la compilation TypeScript et les tests unitaires, construit l'application et la publie sur GitHub Pages. Le déploiement ne se fait pas si un test échoue.
- Lors d'une mise à jour, le service worker doit proposer de recharger la nouvelle version sans jamais effacer les données locales.
- Documenter dans le `README` : lancement local, tests, déploiement, et procédure d'installation sur téléphone.
- Licence du code : aucune pour l'instant (tous droits réservés), choix de l'utilisateur. Les illustrations gardent leur licence CC BY-SA 3.0 (§4.0.1).

Les données restent uniquement sur l'appareil : GitHub Pages ne sert que les fichiers de l'application.

## 22. Données personnelles et identité git

Le dépôt est public : il ne contient ni données personnelles réelles, ni trace de l'identité professionnelle de l'utilisateur.

- **Données réelles** (séances, pesées, sauvegardes, fichiers d'origine) : uniquement dans `perso/`, ignoré par git. Elles ont été retirées de tout l'historique git. Les tests utilisent les copies anonymisées de `docs/exemples/` (§11.11 F). Toute nouvelle donnée réelle fournie va dans `perso/`, jamais dans le dépôt ni dans les tests.
- **Identité git** : configurée localement pour ce dépôt (`git config` sans `--global`) : `user.name` « Nicolas Senentz », `user.email` « nsenentz@hotmail.fr ». Tous les commits, auteur et committer, portent cette identité ; aucune adresse ni identité professionnelle ne doit apparaître dans l’historique, les messages ou les fichiers.
- **Vérification avant tout push** : `perso/verifier-historique.sh` (hors dépôt, puisqu'il contient les empreintes des données réelles) contrôle le contenu de tous les commits, les chemins, les messages, les objets orphelins et les identités ; `git log --all --format='%an <%ae> | %cn <%ce>' | sort -u` doit n'afficher que l'identité ci-dessus.
- **Script bloquant (précision validée)** : si le script signale quelque chose, on ne le contourne jamais en masquant la donnée (adresse découpée, assemblée, encodée…). Soit on ajuste sa liste blanche de façon explicite (règle commentée dans le script), soit on demande à l'utilisateur. Sa liste blanche d'adresses e-mail contient l'identité git, les adresses techniques et les domaines réservés aux exemples (`example.com`, `example.org`, `example.net`, RFC 2606) : une adresse de test s'écrit en clair dans l'un de ces domaines.
- **Captures d'écran (précision validée)** : toujours enregistrées dans `perso/captures/` (ou un autre dossier ignoré par git), jamais à la racine du dépôt ni dans un dossier suivi.
- **Filet de sécurité local** : ne jamais vider les reflogs (`git reflog expire`) ni lancer de nettoyage (`git gc --prune`, `git prune`…) sans demande explicite de l'utilisateur.

## Résultat attendu

Une application personnelle de musculation simple, fiable et rapide, qui :

- Mémorise mes performances.
- Me permet de saisir mes séances en quelques secondes.
- Retrouve les exercices aussi bien par leur nom que par leur groupe musculaire.
- Importe mon historique existant à partir de JSON ou de notes copiées-collées.
- Interprète les symboles de ressenti selon des règles explicites.
- Recommande automatiquement la prochaine cible, et une baisse de charge seulement après quatre séances rouges consécutives.
- Respecte strictement la règle des deux séances vertes consécutives.
- Préserve les données, fonctionne hors ligne et s'installe depuis GitHub Pages.

**Aucune progression ne doit être déclenchée prématurément par une seule bonne séance. La fiabilité du moteur, la conservation de l'historique et la simplicité d'utilisation priment sur le nombre de fonctionnalités.**
