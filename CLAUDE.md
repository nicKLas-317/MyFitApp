# PROMPT CLAUDE CODE — Application PWA de suivi sportif « MyFitApp »

## 0. Mode de travail

Ce document est la référence complète du projet : les règles en vigueur, sans leur historique (ce qui a changé à chaque version, et ce qui n'est plus vrai : `CHANGELOG.md`). Relis-le avant chaque demande.

Les six phases d'origine (moteur, séance, import et export, bibliothèque, analyse, déploiement) sont terminées : l'application est publiée (§21) et évolue demande par demande. Pour chaque demande :

1. **Examiner** le code et les tests concernés ; conserver ce qui fonctionne, sans réécriture inutile.
2. **Demander** quand une règle de ce document est ambiguë ou contradictoire, au lieu de choisir silencieusement ; **signaler** tout choix fait à défaut de règle (« choix signalé à l'utilisateur »).
3. **Implémenter réellement** (pas de plan, de maquette ni d'exemple à la place), dans une version : numéro de `package.json` (et `package-lock.json`), 1.x.y+1 pour un correctif, 1.x+1.0 pour une fonctionnalité. Une modification qui ne touche que la documentation, les tests ou le workflow ne change pas de numéro.
4. **Tester** : `npm run typecheck` ; tests unitaires (`npm test`) ; tests de bout en bout à l'heure de Paris et avec `TZ=UTC` (§1) ; tests sur les vraies données (`npx vitest run --config perso/vitest.perso.config.ts`, §22). Un nouveau comportement a son test numéroté (§15), avec un contre-test quand c'est possible. Ne jamais déclarer réussi un test qui n'a pas été exécuté (§17).
5. **Documenter** : ce document (règle et test), le README si besoin, `CHANGELOG.md`.
6. **Publier** : commit avec l'identité et les fichiers nommés (§22), vérification (`perso/verifier-historique.sh` et identités, §22), push direct sur `main`, puis contrôle du workflow et du bundle déployé (§21). Jamais de réécriture d'historique ni de push forcé sans validation explicite.
7. **Rendre compte** : ce qui est fait, ce qui est testé (avec les chiffres réels), les choix signalés, ce qui reste à vérifier sur le téléphone (§16) ; le compte rendu se termine par « Dernier commit publié : <commit> ».

## 1. Objectif général

Développer une application personnelle de suivi de musculation appelée **MyFitApp**.

Toute l'interface est en **français**. Les dates et heures sont affichées au format français et calculées dans le fuseau horaire local de l'appareil, qui est et restera celui de Paris (`Europe/Paris`) ; les tests automatisés s'exécutent eux aussi à l'heure de Paris, quelle que soit la machine, et les tests de bout en bout avec la même police partout (§15). Les poids sont exprimés en **kilogrammes**, avec une décimale possible (par exemple 52,5 kg).

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

- **Séance** (onglet par défaut, l'accueil) : la question d'une activité habituelle en haut s'il y en a une (« Badminton lundi soir (21 h – 22 h 30) ? », §19.8), le récapitulatif de la semaine (§19.6), juste dessous les alertes « groupe moins travaillé » s'il y en a (« Dos : 3 séries par semaine depuis 2 semaines (ta moyenne : 5,3) » ; à partir de 2 groupes, une seule ligne « 3 groupes sous ta moyenne : Pectoraux, Dos, Épaules », §19.11), puis « Démarrer une séance » / « Reprendre la séance » (toujours 1 appui), ou, quand une séance est prévue, « Démarrer la séance prévue » et « Séance libre » ; dessous, le lieu de la séance libre (« Salle » par défaut, ou « Maison », §5.10), puis les actions secondaires en boutons et cartes (§3.7, version 1.40.0) : « Compléter la séance de ce matin » le jour même (§5.12), la carte « Ma séance prévue » (§5.9), la carte « Séance pour compléter la semaine » avec ses groupes en pastilles (§5.15), « Préparer ma prochaine séance » (sans séance prévue) et « + Activité » (activité ponctuelle, §19.8) ; enfin le rappel de sauvegarde éventuel (§12). Le titre « MyFitApp » n'y est pas affiché (gardé pour le lecteur d'écran).
- **Historique** : la liste des séances et des activités, regroupée par mois (§10, §3.5).
- **Progrès** : en haut, le bandeau « Ton bilan de la semaine / du mois est prêt » quand un bilan est à voir (§19.7 ; celui de la semaine avec le rappel « Partager pour le coach », version 1.47.0, §19.13), puis les alertes « groupe moins travaillé » (§19.11) ; puis le bilan de progression (§19.3), les bilans de la semaine et du mois (§19.7), le bilan par groupe musculaire (§19.10), juste dessous « Cardio » (§19.12, versions 1.43.0 et 1.43.1), puis le bouton « Partager pour le coach » (§19.13, version 1.46.0), puis « Mon poids » (§20), avec une pesée rapide.
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
- Accueil (version 1.40.0) : tout est neutre, sauf les pastilles des groupes de la carte « Séance pour compléter la semaine » (§5.15), au fond de la couleur de leur groupe, texte sombre ; la carte elle-même garde un cadre neutre.
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

### 3.4. Barre d'onglets et bouton retour (précision validée, version 1.20.0)

- **Barre d'onglets** fixe en bas de l'écran, 56 px de haut, au-dessus de la zone système d'Android (`env(safe-area-inset-bottom)`) : Séance · Historique · Progrès · Plus, chacun avec une icône et un libellé, 8 px entre deux onglets. L'onglet actif est en couleur d'accent, en gras, avec un trait au-dessus ; les écrans ouverts depuis un onglet le gardent actif (`tabOf`, `src/ui/TabBar.tsx`). Masquée en mode salle (§5.8).
- **Pastille** sur l'onglet Progrès quand un bilan de la semaine ou du mois est prêt (§19.7), ou qu'un groupe est sous sa moyenne (§19.11, version 1.38.0) : un seul point discret couleur d'accent, nom accessible « Progrès : bilan prêt », « Progrès : groupe sous ta moyenne » ou « Progrès : bilan prêt, groupe sous ta moyenne ».
- **Bouton retour d'Android** (`src/app/navigation.ts`) : chaque entrée de l'historique connaît sa profondeur.
  - Il suit la navigation : la fiche ouverte depuis la séance revient à la séance, le détail revient à l'historique, etc. ; les flèches « ‹ » font de même (à défaut d'écran précédent, elles mènent à l'écran parent de l'onglet).
  - Un onglet s'ouvre toujours juste au-dessus de l'onglet Séance : « retour » depuis un onglet (ou un écran d'onglet atteint par un autre onglet) ramène à la Séance. Une adresse ouverte directement reçoit une entrée Séance en dessous.
  - Après « Ajouter un exercice », « retour » ne rouvre pas la recherche ; après la fin d'une séance, il ne ramène pas dans la séance terminée.
  - Il ne ferme jamais l'appli en pleine séance : sur l'onglet Séance, une entrée de garde absorbe « retour » tant qu'une séance est en cours.
  - Il ne perd aucune saisie : un poids tapé sans quitter le champ est enregistré en quittant l'écran (même protection au-delà de 50 %, §5.3), les répétitions ajustées (− / +) de la série en cours, l'exercice ouvert et le cardio en cours de saisie sont retrouvés au retour dans la séance, et le nom saisi au récapitulatif est enregistré.
  - **Position et saisie au retour (précision validée, version 1.48.0)** : chaque entrée de l'historique a sa clé (`entryKey`) et sa position de défilement, suivie en continu et notée en la quittant ; « retour » (bouton ou geste d'Android, flèche « ‹ ») rend la position exacte de l'écran, un écran ouvert autrement (onglet, lien, accueil) s'ouvre en haut. L'appli gère seule le défilement (`history.scrollRestoration` « manual » : avant, le navigateur rétablissait la position après l'appli, à quelques pixels près, et parfois pas du tout) ; les cadres sont posés avant (§3.1), sinon la page glissait de 2 px par carte. La saisie en cours d'un écran (préparation de la séance prévue, suggestion) est gardée pour son entrée (`useEntryMemory`, `src/app/entryMemory.ts`) : retrouvée au retour, jamais sur une nouvelle ouverture.
- **Nombre d'appuis** : aucune action de saisie n'en demande plus qu'avant les onglets, et aucune ne demande de défiler (test 230) : démarrer ou reprendre une séance 1, ajouter un exercice récent 2, valider une série 1 (les 3 séries d'un coup : 1, §5.4), ressenti 1, cardio 2 (+ la durée ; cardio prévu : 1, puis l'élément suivant s'ouvre tout seul), terminer 2, pesée 2 (+ le poids), corriger une séance passée 3. Séance de 5 exercices (test 245) : 33 appuis série par série, 23 avec « Valider les 3 séries », 13 avec une séance prévue (§5.9) : l'exercice suivant s'ouvre tout seul après le ressenti (§5.5), 0 appui pour l'ouvrir ; avec deux cardios prévus en plus (en tête et entre deux exercices), 15 (1 appui chacun, version 1.23.2).

### 3.5. Écrans au calme allégés (précision validée, version 1.21.0)

Moins de défilement sur les écrans de consultation ; navigation, moteur de progression et données inchangés.

- **Historique** (§10) : regroupé par mois, un intertitre par mois (« Octobre 2026 », style des titres de section) et un seul cadre neutre par mois. Une ligne compacte par séance : jour à gauche (« lun. 19 »), titre (nom calculé, « Salle · Pectoraux · Triceps », §5.14) sur une ligne au plus (tronqué « … » si besoin), puis le contenu (« 5 ex. · 20 min cardio », « · importée ») ; par activité : « Badminton · 1 h 30 », « activité ». Heures et durée sont dans le détail. Aucun bouton dans la liste : « Supprimer » n'est proposé que dans le détail (séance ou activité), avec confirmation.
- **Bibliothèque et ajout d'un exercice** (§4.2, §4.3.1) : sous la recherche, une rangée de puces de filtre (« Tous », puis chaque groupe qui a des exercices), sur une seule ligne qui défile horizontalement si besoin. Un appui n'affiche que ce groupe ; un nouvel appui, ou « Tous », réaffiche tout ; le filtre est gardé le temps de l'ouverture de l'appli (retour depuis une fiche). « Récents » reste en tête, puis « Favoris », puis les groupes ; avec un filtre, récents et favoris sont limités au groupe choisi. Pendant une recherche, les puces sont masquées et les résultats ne sont pas filtrés. Les prises d'un même exercice présentes dans une liste (au moins deux) sont regroupées en une seule entrée : nom et groupe une fois, puis une puce par prise, dans l'ordre très large · moyenne · serrée, avec le dernier poids et le statut de chaque prise. Un appui sur une puce agit sur cette variante : ajout à la séance (poids de départ demandé si besoin ; « dans la séance » rouvre l'exercice) ou fiche dans la bibliothèque. C'est un regroupement d'affichage (`groupGrips`, `src/library/catalog.ts`) : chaque prise reste un exercice-variante distinct (données, moteur, historique). Une seule prise dans une liste (récents, « tirage vertical wide grip ») reste une entrée simple ; les autres variantes (assis / debout, barre / haltères…) ne sont pas regroupées.
- **Fiche d'un exercice** (§4, §19.1) : la prochaine cible et la dernière fois en premier, puis « Ajouter à la séance » / « Modifier », puis l'exercice (illustration réduite à une vignette, groupes, matériel, favori). Un appui sur la vignette agrandit l'illustration, avec l'attribution sous l'image agrandie ; un nouvel appui la réduit. Puis l'évolution, l'historique, les variantes et les autres noms. Historique : lignes compactes dans un seul cadre (« 19/10 · 45 kg · 11-11-11 », statut, puis « cible 3 × 11 · Bien passé (+=) · importée », « · séance de départ » pour une séance faite à une charge changée sans recommandation du moteur, version 1.42.0, §5.3.2), les 5 dernières séances, puis « Voir tout (17 séances) » (et « Voir les 5 dernières »).
- **Bilan de progression** (§19.3) : les filtres sur une seule rangée (défilement horizontal si besoin) ; la catégorie s'appelle « Trop tôt » ; « Dernières évolutions » : une ligne par évolution (« 19/10 Pec deck 10 → 11 rép. », « 30 → 27,5 kg », « 40 → 45 kg, 12 → 8 rép. »), le nom tronqué si besoin ; s'il ne lui resterait pas 5 caractères (« 11,5 → 12,5 kg/haltère, 12 → 8 rép. », §4.4, version 1.30.2), l'évolution passe dessous et le nom reste entier.
- **Réglages** (§14) : « Exercices, variantes et réglages par exercice » en haut ; puis des sections repliables, toutes fermées à l'ouverture sauf la première : Taille, Récapitulatif de la semaine, Bilans de la semaine et du mois, Activités habituelles, Machines de cardio (titre au style des titres de section, chevron). Stockage persistant et version restent affichés en bas (information, pas un réglage), puis « Importer / exporter ». Activités habituelles : jour, début et fin sur une ligne à 360 px (le jour à la largeur de sa valeur, les heures à cinq caractères) ; le jour n'est jamais tronqué : avec le texte agrandi, l'heure de fin (avec son tiret) passe dessous. Machines de cardio : lignes espacées de 8 px, « Retirer » dans le menu « ⋯ » de chaque machine (effectif à « Enregistrer les machines », annulable) ; pas de menu quand il ne reste qu'une machine ; sous le nom de chaque machine, la case « Compte pour les jambes » (version 1.41.0, §19.6).

### 3.6. Ton : tutoiement (précision validée, version 1.22.2)

L'application tutoie l'utilisateur, partout et sans exception : écrans, boutons, messages d'erreur, confirmations, aperçu d'import, texte du mail des bilans (« Ton bilan de la semaine est prêt », « Choisis une activité. », « Enregistrement impossible : réessaie. », « importe les blocs l'un après l'autre »). Jamais de « vous », « votre », « vos » ni d'impératif en « -ez ». Vérifié par le test 241 (tous les textes du code, mail compris) et par le test 225 (texte affiché de chaque écran et de chaque état). Le README n'est pas concerné.

### 3.7. Onglet Séance : boutons secondaires et haut compact (précision validée, version 1.40.0)

But : que les actions sous « Démarrer » se lisent comme des actions (plus de liens texte empilés), et que « Démarrer » reste à l'écran sans défiler dans le cas le plus chargé.

- **Haut compact** : le titre « MyFitApp » est masqué à l'écran sur l'accueil (gardé pour le lecteur d'écran) ; les alertes « groupe moins travaillé » tiennent en une ligne à partir de 2 groupes (§19.11).
- **Sous « Démarrer » et le choix du lieu**, dans cet ordre, 8 px entre chaque :
  - « Compléter la séance de ce matin » (§5.12) : bouton secondaire pleine largeur, seulement le jour même ;
  - **carte « Ma séance prévue »** (§5.9) quand une séance est prévue : titre, puis exercices et cardio dans l'ordre du plan (« Chest press · Pec deck · … »), chevron « › » ; toute la carte ouvre la préparation (elle remplace le lien « Modifier ma séance prévue ») ;
  - **carte « Séance pour compléter la semaine »** (§5.15) : titre, « D'ici dimanche · 5 exercices » (« Aujourd'hui » le dimanche, version 1.40.1), puis ses groupes en pastilles de leur couleur (13 px, gras, texte sombre), chevron « › » ; toute la carte ouvre la suggestion ;
  - « Préparer ma prochaine séance » (sans séance prévue) et « + Activité » : boutons secondaires, **côte à côte seulement si chacun tient sur une ligne**, sinon l'un sous l'autre, pleine largeur (à 412 et 360 px, l'un sous l'autre ; libellé gardé, choix de l'utilisateur) ; le formulaire d'activité s'ouvre dessous.
- Cartes : cadre neutre (§3.1), au moins 48 px ; aucune action n'a plus d'appuis qu'avant (§3.4).
- **Cas le plus chargé** (question d'activité, 7 groupes au récapitulatif, 3 alertes, séance à compléter, suggestion, rappel de sauvegarde, avec et sans séance prévue) : « Démarrer » entièrement au-dessus de la barre d'onglets, sans défiler, à 412 × 915, 360 × 800 et 320 × 711 px (320 px : 360 × 800 avec la taille d'affichage d'Android agrandie, choix signalé) et à 360 × 800 px avec le texte à 115 % (test 291). Avec en plus 50 min de cardio dans la semaine (« · 50 min de cardio » dans l'en-tête, « Jambes (15 séries · +50 min cardio) · aujourd’hui ») : à l'écran à toutes les tailles grâce au titre raccourci (version 1.41.1, §19.6), et à 320 × 711 px grâce à la forme `compact` (version 1.45.0 : « Jambes (15 séries) · aujourd’hui »). Depuis la version 1.41.0, avec un nombre impair de groupes (7 avec les abdominaux), la dernière case du récapitulatif, seule sur sa ligne, prend toute la largeur (choix signalé à l'utilisateur) : 21 px de gagnés à 320 px dans le cas le plus chargé.

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

Bibliothèque version 10 (précision validée) : un groupe secondaire doit être réellement sollicité, pas anecdotique, puisque ses séries comptent pour moitié dans le récapitulatif hebdomadaire (§19.6). Les trois écartés (pec deck, écarté couché haltères, écarté à la poulie) perdent les épaules : ce sont des mouvements d'isolation des pectoraux. Les mouvements composés gardent leur second groupe : tirages, rowings et tractions assistées → biceps ; développés → triceps et épaules ; dips assistés → pectoraux ; oiseau et face pull → dos. Sur une base existante, la correction est appliquée une seule fois, seulement si les groupes n'ont pas été personnalisés ; une sauvegarde antérieure, fusionnée, ne remet pas les épaules.

Bibliothèque version 11 (précision validée, version 1.24.0) : abdominaux au poids du corps (§7.13), groupe principal abdominaux, sans groupe secondaire, matériel « poids du corps » :

- **Crunch au sol** (`crunch-sol`) : crunch classique. Synonymes : crunch, crunch classique, floor crunch, crunch sol. « crunch » seul désigne le crunch au sol, en recherche (en tête) comme à l'import (sans demander) ; le **Crunch machine** (salle, pas la poulie) reste l'exercice à charge.
- **Crunch oblique touche talons** (`crunch-oblique-touche-talons`) : répétitions comptées au total, autant à droite qu'à gauche. Synonymes : heel touches, heel touch, touche talons, touche-talons, crunch oblique, alternate heel touch.
- **Relevés de jambes allongé** (`releves-jambes-allonge`). Synonymes : relevés de jambes, relevé de jambes, relevés de jambes au sol, lying leg raise, leg raise.

Bibliothèque version 12 (précision validée, version 1.25.0) : **Planche** (`planche`), gainage en secondes (§7.13), abdominaux, sans groupe secondaire, matériel « poids du corps », 3 × 20 à 60 s, par pas de 5 s. Synonymes : gainage, gainage ventral, gainage planche, plank, front plank. « gainage » et « plank » la trouvent en tête ; « abdos » la trouve parmi les abdos au poids du corps, après le crunch machine.

Bibliothèque version 13 (précision validée, version 1.27.0) : **Pompes** (`pompes`), au poids du corps (§7.13), groupe principal pectoraux, groupes secondaires triceps et épaules, matériel « poids du corps ». Deux variantes seulement, chacune avec son suivi : **Classiques** (variante standard, `pompes`, affichée « Pompes — Classiques ») et **Sur les genoux** (`pompes--genoux`, « Pompes — Sur les genoux ») ; pas d'autre variante (diamant, frappées…). Plage 10 à 40 rép. ; **2 séries par défaut** (réglable comme les autres, Modifier › Séries). Synonymes : pompes (nom), push-up, pushups ; classiques : pompes classiques, push-up classique ; genoux : pompes genoux, pompes sur les genoux, knee push-up. « pompes », « push-up » trouvent les deux variantes, classiques d'abord ; « pompes genoux », « knee push-up » les genoux seuls ; « pectoraux » les trouve aussi.

Bibliothèque version 14 (précision validée, version 1.31.0) : **La chaise** (`chaise`, wall sit : dos contre un mur, cuisses à l'horizontale), en secondes (§7.13), groupe principal jambes, groupe secondaire **abdominaux** (seule exception à la règle de la version 10, choix de l'utilisateur), matériel « poids du corps ». Plage **20 à 90 s**, par pas de 5 s ; **cible de départ 3 × 45 s** (§4.5). Synonymes : chaise, wall sit, chaise contre le mur. « chaise », « wall sit » la trouvent en tête (recherche et import) ; « jambes » la trouve aussi ; « abdos » la trouve en dernier (groupe secondaire).

Volontairement non ajoutés (choix de l'utilisateur) : crunch à la poulie, relevés de jambes suspendu, squat à la barre, hip thrust, soulevé de terre jambes tendues, fentes ; tractions et dips sans aide (faits hors application).

Chaque version de la bibliothèque est installée une seule fois sur une base existante, sans perte de données et sans recréer un exercice supprimé ensuite. Une variante ajoutée à un exercice existant (mollets assis, extension poulie à la barre) l'est aussi une seule fois, sauf si une variante du même nom existe déjà ; la variante standard prend son nom (« Debout », « Corde ») si elle s'appelle encore « Standard », et ses synonymes appris sont conservés.

Dans les notes de l'utilisateur, « leg curl » désigne toujours la version assise et « curl ischios » la version allongée. Pour les élévations latérales, le matériel est précisé dans le nom (« haltères » ou « machine ») ; s'il ne l'est pas (« latéral raise », « élévations latérales »), l'aperçu d'import demande de choisir, sans rattachement par défaut. Le choix fait dans l'aperçu est mémorisé comme synonyme pour les imports suivants. Un nom importé identique, mot pour mot, à un nom ou à un synonyme de la bibliothèque est reconnu directement (« leg curl allongé » → Curl ischios) ; en cas de doute entre les deux machines, l'aperçu d'import demande de choisir.

Cette liste est un point de départ modifiable dans les réglages. Les exercices ajoutés à cette liste après une première installation sont installés une seule fois sur une base existante, sans recréer ceux que l'utilisateur a supprimés. Une correction de nom ou de synonymes de la bibliothèque n'est appliquée à une base existante que si l'utilisateur ne les a pas personnalisés ; identifiants, variantes, synonymes appris et historique sont toujours conservés. Une sauvegarde d'une version antérieure ne réintroduit jamais d'anciens noms ou synonymes de la bibliothèque.

### 4.0.1. Illustrations

Les illustrations doivent aider à distinguer les machines et les variantes proches. Elles doivent être embarquées dans l'application et utilisables hors ligne.

N'utiliser que des ressources dont la licence autorise explicitement la réutilisation (domaine public, CC0 ou licence libre compatible). Indiquer la source et la licence dans le dépôt. Ne pas télécharger d'images sans licence vérifiable.

Version 11 : les relevés de jambes allongé ont un dessin (everkinetic/data, CC BY-SA 4.0) ; le crunch au sol (seul dessin trouvé : pieds sur un banc, autre style, trompeur) et le crunch oblique touche talons (aucun dessin) gardent un pictogramme (docs/illustrations.md). Version 12 : la planche garde un pictogramme (seule la planche latérale est dessinée, un autre mouvement). Version 13 : les pompes classiques ont un dessin (everkinetic/data, « Push Up: Body Weight », CC BY-SA 4.0) ; les pompes sur les genoux gardent un pictogramme (aucun dessin) et, par exception, ne reprennent pas le dessin de leur exercice, qui serait trompeur (`WITHOUT_DRAWING`). Version 14 : la chaise garde un pictogramme (aucun dessin ajouté, faute de source vérifiée). Version 1.40.2 (précision validée) : le pull-over à la poulie a un dessin (everkinetic/data, « Straight Arm Push Down », CC BY-SA 4.0 : debout, bras tendus) ; la presse à cuisses reprend un pictogramme, son dessin (« Leg-press ») montrant une presse inclinée à 45° alors que celle de l'utilisateur est horizontale ; dips assistés, tractions assistées (dessins sans machine d'assistance), rowing haltère (autre version, jambe levée) et planche (autre style) gardent leur pictogramme, choix de l'utilisateur (recherche du 4 novembre 2026, docs/illustrations.md). Version 1.40.3 (précision validée) : le tirage vertical, ses trois prises, est illustré par un tirage devant la poitrine à la barre droite (« Close grip front lat pull down », Wikimedia Commons, CC BY-SA 3.0), au lieu de « Wide grip lat pull down », qui montrait un tirage derrière la nuque (un autre mouvement) ; aucun dessin Everkinetic de tirage devant en prise large. Le tirage horizontal poulie basse garde son dessin pour toutes ses prises.

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
- Mots inconnus de la bibliothèque et du lexique : la recherche ignore un mot inconnu si au moins deux autres mots sont reconnus et plus nombreux, et le signale discrètement (« Mot non reconnu, ignoré : xyz ») ; « tirage nuque » ne trouve rien. L'import propose l'exercice mais demande une confirmation explicite (« Mot non reconnu… Vérifie l’exercice proposé », bouton « J'ai vérifié »), jamais retenu d'office.
- À l'import, un nom de groupe seul (« pec », « pecs », « pectoraux ») désigne un groupe : les exercices du groupe sont proposés et le choix est obligatoire. Un nom identique à un nom ou synonyme de la bibliothèque une fois le lexique appliqué, dans n'importe quel ordre (« lateral raise dumbbell »), est reconnu directement.
- Sous-groupes des jambes (précision validée) : « ischios » trouve le leg curl et le curl ischios ; « quadri » trouve le leg extension et la presse à cuisses ; « jambes » trouve tous les exercices de jambes. Pour cela, la presse à cuisses n'a que les quadriceps en groupe secondaire (bibliothèque version 5 : correction appliquée une seule fois à une base existante si ses groupes n'ont pas été personnalisés ; une ancienne sauvegarde ne réintroduit pas les ischio-jambiers). « mollets » trouve les mollets machine, « fessiers » les abducteurs machine, « adducteurs » les adducteurs machine (bibliothèque version 7). Le récapitulatif hebdomadaire n'est pas concerné : tout reste compté dans « Jambes » (§19.6).
- Version 8 : « squat » seul, goblet squat, squat kettlebell, squat KB → Squat kettlebell ; « hack », « hack squat » → Hack squat ; « quadri » trouve aussi le hack squat et le squat kettlebell. « barre au front » est une expression protégée (le mot « front » n'y devient pas « frontal »). « pec deck » ne trouve toujours que le pec deck, jamais l'oiseau (reverse pec deck).
- Matériel d'une variante : une variante dont le nom désigne un matériel (« Haltères », « Barre ») a ce matériel, et non celui de son exercice : « développé incliné barre » ne trouve pas la variante haltères. À égalité, la recherche présente la variante standard d'abord (« mollets » : debout, puis assis).
- Import : un mot inconnu est écarté du rapprochement quand au moins deux autres mots sont reconnus et plus nombreux (« shoulder press xyz » propose le développé épaules machine, à confirmer) ; un nom identique à un exercice une fois sa prise ou son angle retirés (« Développé couché prise serrée ») désigne cet exercice et sa variante, même si un exercice voisin partage des mots (« Développé couché haltères »).
- Fautes de frappe : la recherche tolère une lettre de différence dans un mot inconnu (« extenzion »), mais un mot connu de la bibliothèque n'est jamais lu comme une faute de frappe d'un autre : « abducteurs » ne trouve jamais les adducteurs, ni « abduction » l'adduction.
- « seated row », « row assis » et « tirage horizontal » trouvent le Tirage horizontal machine (appui pectoral) en premier, pas le Rowing haltère, malgré l'équivalence row → rowing (l'expression la plus longue l'emporte, et « assis » doit correspondre).
- Version 11 : « relevé de jambes » et « leg raise » sont des expressions protégées (« leg » n'y devient pas « jambes ») ; un groupe tapé seul (« jambes », « legs ») ne trouve jamais un exercice d'un autre groupe dont le nom contient ce mot : « Relevés de jambes allongé » n'est trouvé que par son nom, pas par « jambes ». « abdos » trouve le crunch machine en tête, puis les trois abdos au poids du corps.
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

### 4.4. Charges aux haltères (précision validée, versions 1.30.1 et 1.30.2)

**Convention de saisie** : pour un exercice aux haltères (deux haltères), la charge notée est celle d'**un** haltère, jamais le total (11,5 = 11,5 kg par haltère) ; pour un exercice à un seul haltère (extension triceps haltère assis, rowing haltère, kickback), le poids de cet haltère.

- **Aucun calcul ne double ni n'additionne ces charges.** Toute nouvelle fonction qui combine des charges (tonnage, volume, comparaison entre exercices…) doit en tenir compte : ne jamais additionner ni comparer directement les charges de deux exercices différents (un haltère contre une barre ou une machine), et ne jamais multiplier par deux une charge aux haltères.
- **État vérifié (version 1.30.1)** : aucun calcul actuel n'additionne des charges d'exercices différents. Moteur, records et dernières évolutions travaillent par exercice-variante (et par suivi) ; l'indice par groupe (§19.10) rapporte chaque exercice à sa propre première séance (Epley, base 100) puis fait la moyenne de ces indices, sans unité : noter le total des deux haltères ne le changerait pas (test 271) ; les séries par semaine comptent des séries, pas des charges ; le récapitulatif et les bilans ne comptent ni charge ni tonnage. Seul calcul mêlant deux poids : la charge réelle d'un exercice assisté (poids du corps − aide, §19.10), qui ne concerne pas les haltères.
- **Exercice aux haltères** : matériel « haltère » ou « haltères » de l'exercice, ou de sa variante quand son nom désigne un matériel (« Développé incliné — Haltères », « Oiseau — Haltères », §4.2.1) ; une seule définition, `perDumbbell` (`src/library/search.ts`). Bibliothèque : quatorze exercices-variantes (test 271).
- **Affichage « kg / haltère » partout** au lieu de « kg », sans rien changer aux valeurs enregistrées : un même exercice ne s'affiche jamais tantôt en « kg », tantôt en « kg / haltère ». Carte en séance (« 12 kg / haltère · 0/3 », cible « 3 × 9 à 12 kg / haltère », dernière fois), fiche (cibles de la salle et de la maison, dernière fois, record, titre du graphique « Charge (kg / haltère) », historique), records (fiche, « Record battu » du récapitulatif de fin), champ de saisie (« Poids (kg / haltère) », unité, confirmation d'un poids très différent, « Poids de départ (kg / haltère) »). Mise en forme (choix signalé à l'utilisateur) : dans la ligne de cible en grand, « / haltère » est en texte courant (17 px), d'un bloc, juste après la charge, et passe dessous quand la place manque : la cible elle-même reste sur une seule ligne (§5.3.2) ; « Dernière fois » peut passer sur deux lignes à 412 px (pastille dessous), jamais tronquée (test 163).
- **Version 1.30.2** : aussi le détail d'une séance passée (« 12 kg / haltère · 8 · 8 · 8 ») et sa correction (« Poids (kg / haltère) »), les lignes d'exercices du récapitulatif de fin, la séance prévue (cible « 3 × 8 à 14 kg / haltère », « / haltère » plus petit comme en séance), la liste de la bibliothèque et de l'ajout d'un exercice (dernier poids « 14 kg », « / haltère » dessous, pour laisser la place au nom), les bilans de la semaine et du mois et le texte du mail (progressions, records, séances rouges : « à 12 kg / haltère » ; à l'écran, « 12 kg / haltère » ne se coupe jamais), les dernières évolutions du bilan de progression, en forme courte (« 11,5 → 12,5 kg/haltère, 12 → 8 rép. ») ; quand le nom de l'exercice n'aurait plus 5 caractères, l'évolution passe sous le nom, alignée à droite, et le nom reste entier (choix signalé à l'utilisateur). Seul l'import de notes reste en « kg » (choix de l'utilisateur).

### 4.5. Type d'un exercice (précision validée, version 1.31.0)

- **À la création** (« + Nouvel exercice ») : « Type » en trois puces, sous les noms : **« Charge (kg) »** (par défaut), **« Poids du corps (répétitions) »**, **« Durée (secondes) »**, avec la plage par défaut du type, modifiable : 8 à 12 répétitions, 10 à 40 répétitions, 20 à 60 s (« Rép. min » / « Rép. max », « Durée min (s) » / « Durée max (s) ») ; changer de type remet la plage par défaut du nouveau type si elle n'avait pas été changée. Le matériel suit (choix signalé à l'utilisateur) : « poids du corps » pour les deux types sans charge s'il était resté sur « machine », et inversement. 3 séries par défaut (réglables ensuite dans « Modifier »). Une plage invalide est signalée, rien n'est créé.
- **Dans « Modifier »**, pour chaque variante : les mêmes trois puces remplacent les anciennes cases « Poids du corps » et « En secondes » ; « Exercice assisté » n'est proposé que pour le type à charge. **Type figé dès que la variante a un historique** (séance terminée ou en cours) : « Type : Durée (secondes) (déjà réalisé : non modifiable) », sans puces (jamais de bouton inactif, §17).
- Données inchangées : le type est le réglage `bodyweight` / `seconds` de la variante (§7.13) ; un exercice à charge n'enregistre aucun réglage s'il garde la plage par défaut.
- **Cible de départ** (`startReps`, réglage de la bibliothèque, version 1.31.0) : cible d'un exercice-variante jamais réalisé, au lieu de la borne basse (§5.3) ; ramenée dans la plage si celle-ci change, et gardée seulement si elle est dans la plage, au-dessus de la borne basse ; pas de champ dans « Modifier », qui la conserve. Seule la chaise en a une (3 × 45 s). La première séance faite à cette cible est standard (§7.11 G). Sauvegarde : entier positif, sinon refusée ; format `schemaVersion` 7 inchangé.

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

Les exercices de la séance sont affichés dans l'ordre où je les ai ajoutés, sauf ceux remis à plus tard, en fin de liste (§5.13).

### 5.3. Préparer l'exercice

Valeurs par défaut :

- 3 séries.
- Une cible comprise entre 8 et 12 répétitions par série.
- Le dernier poids utilisé, prérempli.
- La prochaine cible déterminée par le moteur de progression.

Lorsque le moteur recommande un changement de charge (§7.6, §7.8), afficher clairement « Poids supérieur » ou « Poids inférieur » et mettre en évidence le champ de poids pour que je saisisse la nouvelle charge. Le moteur n'indique jamais de valeur précise : c'est moi qui saisis le poids réellement disponible sur la machine ou en poids libres.

Pour un exercice jamais réalisé, demander uniquement le poids de départ ; la cible est 3×8. Exercice au poids du corps (§7.13) : rien à demander, la cible est le bas de sa plage (3×10 ; planche : 3 × 20 s), sans champ de poids, ou sa cible de départ quand la bibliothèque en donne une (la chaise : 3 × 45 s, §4.5).

Ne pas demander à l'utilisateur de remplir un formulaire pour déterminer la cible.

Le poids doit être modifiable facilement. Le nombre de séries et la cible peuvent être ajustés ponctuellement si nécessaire (voir §7.7 pour l'effet sur les validations).

**Protection contre les fautes de frappe :** si le poids saisi diffère de plus de 50 % du dernier poids utilisé sur cet exercice-variante (par exemple 520 au lieu de 52), demander une confirmation simple avant de l'enregistrer. Refuser un poids nul, négatif ou non numérique.

Prévoir une validation rapide de la préparation de l'exercice.

**Actions secondaires (précision validée, version 1.19.0)** : « Plus tard » (§5.13, version 1.29.0, quand il est proposé), « Ajuster séries et répétitions », « Voir la fiche de l'exercice » et « Retirer de la séance » sont dans un menu « ⋯ » en haut de la carte ouverte, jamais affichés en permanence sous le pouce. Retirer un exercice demande une confirmation (« Retirer cet exercice de la séance ? », « Oui, retirer » / « Non ») ; « Annuler » reste proposé quelques secondes après (§13). Même chose pour un bloc de cardio (« Corriger », « Retirer »). Menu ouvert (version 1.48.0) : un appui hors du panneau ne fait que le fermer (fond transparent dessous, `.menu-backdrop`), il n'active jamais ce qui se trouve dessous ou à côté (la fiche d'un exercice de la carte suivante, par exemple) ; Échap le ferme aussi.

### 5.3.1. Repère de progression (précision validée)

Quand j'ajoute un exercice à la séance et que sa cible a changé depuis ma dernière séance sur cet exercice-variante, une courte mention s'affiche sous la ligne de cible (§5.3.2), en blanc et en gras (version 1.19.0 : plus d'encadré) :

- « ↑ +1 rép. » pour une hausse de répétitions recommandée par le moteur (« ↑ +2 rép. » si l'écart est de deux) ;
- « ↑ Poids supérieur » et « ↓ Poids inférieur » (« ↑ Moins d'aide » et « ↓ Plus d'aide » pour un exercice assisté, §7.12). Dans la carte de séance, tant que la charge n'a pas été changée, la mention donne aussi la cible qui suivra : « ↑ Poids supérieur → 3 × 8 ».

Pas de repère quand la cible ne change pas (palier conservé, exercice jamais réalisé, nouvelle cible déjà faite à la séance précédente). Le repère disparaît si je saisis une autre charge ou une autre cible : ce n'est plus la progression recommandée (une charge changée sans recommandation affiche à la place « ↓ Nouvelle charge : séance de départ », version 1.42.0, §5.3.2). Même repère sur la fiche de l'exercice, sous « Prochaine cible ». Il est dérivé de la recommandation du moteur et de la dernière performance réelle, sans règle nouvelle. Pas de vert, d'orange ni de rouge : ces couleurs sont réservées aux statuts (§8).

### 5.3.2. Dernière fois / Prochaine cible (précision validée)

Sur la fiche d'un exercice et en haut de sa carte dans l'écran de séance (au-dessus du champ de poids), le bloc est séparé en deux zones, avec un fin séparateur entre elles :

- **Dernière fois** : zone secondaire. Libellé et texte gris clair, en plus petit : poids · répétitions · date courte numérique (« 15/10 ») · pastille de statut. **Jamais tronquée** (version 1.19.0) : sur un écran étroit ou avec un texte agrandi, la ligne passe à la ligne entre deux éléments, chaque élément restant entier. Pour un exercice jamais réalisé : « jamais réalisé ».
- **Record** (fiche seulement, §19.9) : sous « Dernière fois », une ligne « 👑 Record : 3 × 9 à 20 kg (16 oct.) », couronne dorée.
- **Prochaine cible** : zone principale. Libellé visible, puis **une seule ligne de cible**, en grand et en gras, dans la couleur du groupe de l'exercice (§3.2), **avec la charge** : « 3 × 9 à 12 kg », « 3 × 9 avec 25 kg d'aide ». Dans la carte de séance, cette ligne suit la charge et la cible réellement saisies (elle remplace l'ancienne ligne « Cible : 3 × 9 », supprimée) ; sur la fiche, c'est la cible recommandée, sans charge quand le moteur recommande d'en changer (« 3 × 8 »). Sous la cible, une courte mention :
  - quand la cible change : le repère de progression (§5.3.1) ;
  - quand la cible est identique à la dernière fois : une mention discrète « = Même cible : consolide » ;
  - pour un exercice jamais réalisé : « Poids de départ à saisir » (« Première fois » au poids du corps, §7.13) ;
  - au poids du corps, au plafond de la plage : « = Plafond atteint » (§7.13).
  - en secondes (planche, §7.13) : la cible et la dernière fois sont en secondes (« 3 × 25 s », « 20 s · 20 s · 20 s »), le repère aussi (« ↑ +5 s », « ↓ −5 s »).
- Pendant la séance, si je saisis une autre cible que celle recommandée, le repère disparaît (§5.3.1) et aucune mention ne le remplace : ce n'est plus la progression recommandée.
- **Séance de départ (précision validée, version 1.42.0)** : si je saisis une autre charge que celle du palier **sans que le moteur recommande ce changement** (§7.11 B : nouveau palier, la séance ne valide rien), le repère est remplacé par une mention dans le même style (blanc, gras) : « ↓ Nouvelle charge : séance de départ » pour une charge plus légère, « ↑ Nouvelle charge : séance de départ » pour une plus lourde, « Nouvelle aide : séance de départ » (sans flèche) pour un exercice assisté. Rien pour une charge recommandée et suivie (« ↑ Poids supérieur » puis une charge plus lourde), ni tant que la charge n'est pas saisie. Carte en séance seulement (`freshLoadHint`, `src/ui/TargetSummary.tsx`) ; sur la fiche, la ligne de cette séance dans l'historique porte « · séance de départ » (§3.5). Pas d'autre message.
- **Série de rouges en cours (précision validée, version 1.42.0)** : sur la fiche seulement, sous la ligne « Record » (sous « Dernière fois » sans record), une ligne grise de 15 px « Série en cours : 2 séances rouges » à partir de 2 rouges (compteur du moteur, §7.8, séances « Mal » neutres comprises), dans le bloc de la salle comme dans celui de la maison ; masquée quand une baisse est recommandée (« ↓ Poids inférieur », « ↓ Plus d'aide », « ↓ −1 rép. », choix signalé à l'utilisateur pour les deux derniers). Jamais à côté de la pastille de statut (§8).
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

**Valider les 3 séries (précision validée, version 1.23.0)** : tant qu'aucune série n'est enregistrée et que la série en cours est préremplie à la cible (− / + non touchés), un bouton secondaire « Valider les 3 séries » (« les 4 séries »… selon le nombre prévu), sous les séries, les enregistre toutes à la cible en un appui ; il ne reste que le ressenti. « Annuler » le défait quelques secondes (§13). La validation série par série reste possible. Proposé dans toute séance, prévue ou libre (choix signalé à l'utilisateur).

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
- **Exercice suivant (précision validée, version 1.23.1)** : quand le premier ressenti est donné à un exercice dont toutes les séries sont faites, l'exercice suivant non terminé (séries incomplètes ou ressenti manquant) s'ouvre, dans l'ordre de la séance, en reprenant au début après le dernier (choix signalé à l'utilisateur), et il est amené sous l'en-tête par un défilement doux. Si tous sont terminés, rien ne s'ouvre : l'exercice reste ouvert. « Plus tard » (§5.13) ouvre aussi l'élément suivant non terminé. Changer ensuite un ressenti déjà donné, ou donner un ressenti avant la dernière série, ne déplace rien. Séances prévues et libres. Séance prévue (version 1.23.2) : l'ordre est celui du plan, cardio compris ; un cardio prévu pas encore validé compte comme non terminé : il « s'ouvre » à son tour (aucune carte d'exercice ouverte, son « Valider » en bouton principal), et le valider alors ouvre l'élément suivant non terminé. Un cardio prévu validé alors qu'un autre élément est ouvert ne déplace rien (choix signalé à l'utilisateur).
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

**Exercices sans série (précision validée, version 1.28.0).** À la fin de la séance, les exercices auxquels aucune série n'a été enregistrée sont **toujours** retirés de la séance terminée : ils n'entrent pas dans l'historique et n'ont aucun effet sur le moteur. Le récapitulatif l'indique (« Exercice sans série retiré : Presse à cuisses »), sans « Annuler ». Un exercice sans aucune série resté dans une séance terminée (rétabli par une version antérieure) ne compte jamais : ni moteur (§7.11 F), ni récapitulatif (§19.6), ni bilans (§19.7). Une performance partielle importée (poids sans répétitions, §7.11 H) n'a aucune série : depuis la version 1.45.0, elle compte 0 série au score du récapitulatif et aux bâtons des bilans (§19.6), comme dans le graphique « Séries par semaine » (case verte, sans nombre) ; elle compte toujours pour « hier » / « aujourd'hui », dans la colonne « Séances » du tableau des bilans et le mail (« Dos : 0 série (1 séance) », §19.7) et pour la veille de la séance pour compléter la semaine (§5.15) (choix signalé à l'utilisateur).

La séance doit être enregistrée avant de demander un éventuel nom personnalisé.

Proposer un nom généré automatiquement (§5.14, version 1.32.0), par exemple :

`Salle · Pectoraux · Triceps · Jambes`

Le nom doit pouvoir être modifié facilement, par exemple en « Haut du corps » ou « Pectoraux et dos ».

L'utilisateur doit pouvoir conserver le nom par défaut en une action. Le nommage ne doit jamais entraîner la perte d'une séance. Le récapitulatif se termine par un bouton « Retour à l'accueil » (version 1.19.0), qui garde le nom saisi.

### 5.7. Cardio (précision validée)

Version minimale : le cardio est un simple enregistrement dans la séance.

**Saisie**

- Dans une séance, en plus des exercices de musculation, un bloc de cardio peut être ajouté à tout moment (début, milieu, fin). Une séance peut en contenir plusieurs, affichés dans l'ordre d'ajout.
- Machines proposées par défaut : Tapis de marche, Rameur, Vélo elliptique, Vélo (vélo classique, sans inclinaison), Autre. La liste est modifiable dans les réglages (ajouter, renommer, retirer, indiquer si la machine se règle en inclinaison et si elle compte pour les jambes : case « Compte pour les jambes », version 1.41.0, cochée par défaut et pour toute machine ajoutée, décochée pour le rameur, §19.6). Un bloc enregistré garde le nom de sa machine : renommer ou retirer une machine ne modifie pas l'historique. Une machine ajoutée à la liste par défaut après une première installation (comme « Vélo ») est ajoutée une seule fois à une liste déjà enregistrée, avant « Autre », sans doublon de nom et sans recréer une machine que l'utilisateur a retirée ensuite.
- Tapis de marche uniquement : inclinaison en trois niveaux, Neutre, Moyenne ou Haute, avec trois boutons (Neutre par défaut). Aucune valeur en pourcentage.
- Durée en minutes entières (1 à 600), seule donnée obligatoire. Distance en km facultative.
- Saisie en quelques secondes : machine (la première de la liste est présélectionnée), inclinaison si tapis, durée, « Valider ». Un bloc peut être corrigé ou retiré depuis son menu « ⋯ » ; le retrait est toujours confirmé, et annulable quelques secondes pendant la séance.
- Bloc rempli mais pas validé au moment de « Terminer la séance » (précision validée) : la confirmation l'affiche (« Cardio non validé : Vélo elliptique · 11 min ») et le bouton devient « Enregistrer le cardio et terminer » ; une saisie invalide bloque la fin avec un message (« Non, continuer la séance » pour la corriger ou l'annuler). Un formulaire ouvert mais vide ne change rien.

**Règles**

- Ni progression, ni couleur, ni ressenti, ni calories. Aucun effet sur le moteur (§7) : profil, statuts et recommandations sont identiques avec ou sans cardio.
- Le cardio n'entre dans aucun groupe musculaire du récapitulatif hebdomadaire, sauf les jambes : 3 séries à partir de 45 min dans la semaine (versions 1.41.0 et 1.45.0, §19.6) ; l'en-tête affiche le total de la semaine (§19.6).
- Une séance ne contenant que du cardio est une séance comme une autre : elle est enregistrée à la fin et compte dans l'en-tête du récapitulatif.
- Réutiliser une séance (§10) ne reprend que ses exercices, pas son cardio.

**Affichage** : la séance en cours, le récapitulatif de fin de séance, l'historique (liste : « 2 ex. · 20 min cardio ») et le détail d'une séance passée affichent les blocs : machine, inclinaison, durée et distance éventuelle (« Tapis de marche · inclinaison haute · 20 min »). Récapitulatif par machine : écran « Cardio » de l'onglet Progrès (§19.12, version 1.43.0).

**Import de notes** : une ligne avec une durée en minutes est un bloc de cardio (« Tapis 15 min », « Tapis incliné 20 min », « Marche inclinée haute 20min », « Rameur 10 min », « Elliptique 15 min », « Vélo elliptique 20 min ») ; la machine peut aussi être sur la ligne précédente. La machine est reconnue d'après la liste des réglages et des noms usuels (« tapis » et « marche » → tapis ; « vélo » seul → Vélo, le vélo classique ; « elliptique » ou « vélo elliptique » → Vélo elliptique). « Tapis » ou « marche » sans précision : inclinaison Neutre. « Incliné » ou « inclinée » sans niveau : l'aperçu demande de choisir Moyenne ou Haute (import bloqué jusque-là). Une machine non reconnue est à choisir dans l'aperçu (ou le bloc est exclu), jamais devinée. Un JSON simple peut contenir une liste `cardio` (`machine`, `minutes`, `inclinaison`, `distanceKm`).

**Données** : les blocs sont inclus dans l'export et l'import JSON (format `schemaVersion` 3, puis 4 avec les activités habituelles, §19.8) ; une sauvegarde au format 2 est migrée sans perte. Une installation existante n'a aucune migration de base à subir : ses séances, sans cardio, restent intactes, et la liste de machines par défaut s'applique. Deux séances qui ne diffèrent que par leur cardio ne sont pas des doublons (§11.9).

### 5.8. Mode salle (précision validée, version 1.20.0)

Pendant la saisie d'une séance (écran de séance, ajout d'un exercice), l'écran est plein et la barre d'onglets masquée :

- En haut, l'en-tête collant (flèche « ‹ », nom de la séance, chronomètre, « Enregistré »), puis la liste compacte des exercices : nom, charge et séries faites (« 30 kg · 0/3 »), avec la couronne d'un nouveau record ; un seul exercice ouvert à la fois, comme avant. Les blocs de cardio suivent.
- En bas, une barre fixe dans la zone du pouce, au-dessus de la zone système : « + Exercice » (bouton principal, un peu plus large), « + Cardio » (ouvre le formulaire et l'amène à l'écran), « Terminer » (ouvre le volet de fin, §5.6). Libellés en 15 px sur une ligne, même à 360 px avec le texte agrandi.
- La flèche « ‹ » ramène à l'onglet Séance sans terminer la séance, qui reste enregistrée et se reprend en un appui (« Reprendre la séance »), sur l'exercice qui était ouvert.
- Menu « ⋯ » de l'en-tête, à côté du chronomètre (ou de « À la maison ») : « Passer à la salle » ou « Passer à la maison » (§5.10, version 1.30.0 ; ni séance prévue, ni séance complétée), puis « Annuler la séance » (§5.11, version 1.27.0), « Annuler les ajouts » pour une séance complétée (§5.12).

### 5.9. Séance prévue (précision validée, versions 1.23.0 et 1.23.2)

But : préparer la prochaine séance au calme pour passer moins de temps sur le téléphone à la salle.

**Préparation** (`#/seance-prevue`, onglet Séance, barre d'onglets visible)

- Une seule séance prévue à la fois. Sur l'accueil sans plan : bouton secondaire « Préparer ma prochaine séance » sous « Démarrer une séance » (version 1.40.0, §3.7). Avec un plan : carte « Ma séance prévue » (exercices et cardio dans l'ordre du plan, « · » entre chacun), qui ouvre la préparation (version 1.40.0) ; toute la carte ouvre la préparation, sans lien vers les fiches (version 1.48.1 : les liens de la version 1.48.0 retirés, choix de l'utilisateur ; la fiche s'ouvre depuis la préparation). Pendant une séance en cours, l'accueil n'affiche que « Reprendre la séance » (le plan n'est ni affiché ni modifiable).
- « + Exercice » ouvre le même écran d'ajout qu'en séance (recherche, récents, puces de filtre, prises regroupées) ; un exercice déjà prévu est marqué « déjà prévu » et n'est pas ajouté deux fois ; un exercice jamais réalisé demande son poids de départ (seule saisie). Un exercice créé depuis cet écran est ajouté au plan.
- Une carte par exercice, à la couleur de son groupe : vignette et nom (un appui ouvre la fiche, version 1.48.0, voir « Fiche depuis la séance prévue »), puis la charge et la cible que le moteur donne à l'instant, avec la même mention que la carte en séance (« 3 × 9 à 30 kg », « ↑ +1 rép. », « ↑ Poids supérieur → 3 × 8 », « = Même cible : consolide » ; « Jamais réalisé : poids de départ ») ; cible en 22 px (vue d'ensemble). Rien n'est saisi : le plan ne fige ni charge ni cible.
- **Un seul ordre pour tout le plan (version 1.23.2)** : musculation et cardio mêlés, chaque élément (carte d'exercice ou bloc de cardio « Cardio · Tapis de marche · 15 min ») avec ses « ↑ » / « ↓ » pour réordonner (pas de « ↑ » sur le premier ni de « ↓ » sur le dernier) ; un cardio ajouté en dernier peut ainsi remonter en tête. Menu « ⋯ » d'un exercice : « Voir la fiche de l'exercice », « Retirer de la séance prévue ». « + Cardio » : même formulaire qu'en séance, bloc ajouté à la fin ; cardio prévu corrigé (il garde sa place) ou retiré par son menu. « Supprimer la séance prévue », avec confirmation.
- Chaque modification est enregistrée aussitôt (méta `plan` de la base) ; un plan vidé est supprimé.
- **Fiche depuis la séance prévue (précision validée, versions 1.48.0 et 1.48.1)** : dans le détail d'une séance prévue (préparation, et séance pour compléter la semaine, §5.15), un appui sur la vignette ou le nom d'un exercice ouvre sa fiche (`SheetLink`, `src/ui/SheetLink.tsx`). Pas sur la carte « Ma séance prévue » de l'accueil, qui reste un seul bouton vers la préparation (version 1.48.1 ; en version 1.48.0, chaque nom y était un lien, retiré à la demande de l'utilisateur : la demande portait sur le détail, et la carte avait changé d'allure). Zone d'appui limitée à la vignette et au nom (pas le reste de la ligne), 48 px de haut, à 8 px au moins du menu « ⋯ » ; les autres appuis de la carte (cible, « ↑ » / « ↓ », menu, cardio) ne changent pas et n'ouvrent jamais la fiche. « Voir la fiche de l'exercice » reste dans le menu. Le retour (bouton ou geste d'Android, flèche « ‹ » de la fiche) ramène exactement où l'on était (§3.4, version 1.48.0) : même position de défilement, ordre et cible (enregistrés), cardio en cours d'ajout ou de correction avec sa saisie, confirmation de suppression ouverte ; rouverte autrement, la préparation est neuve, en haut. Pendant la séance à la salle (§5.8), rien ne change : la carte de l'exercice a déjà « Voir la fiche de l'exercice » dans son menu.

**À la salle**

- Avec un plan, le bouton principal devient « Démarrer la séance prévue » (1 appui) ; « Séance libre » reste en secondaire (bouton plein largeur, sous le bouton principal).
- La séance s'ouvre en mode salle (§5.8) avec les éléments du plan dans son ordre, cardio compris (un cardio placé en premier apparaît en premier), les exercices déjà remplis : charge et cible **recalculées par le moteur au démarrage** (une séance faite entre-temps compte), séries préremplies. Un exercice supprimé ou archivé depuis la préparation est ignoré. Le premier élément à faire est ouvert (un cardio prévu en tête : lui, aucune carte d'exercice ; un exercice reste ouvert une fois ses séries validées, le ressenti étant encore à choisir) ; le ressenti, ou la validation du cardio prévu ouvert, ouvre ensuite l'élément suivant (§5.5). Ce qui est ajouté en séance vient après le plan (exercices dans l'ordre d'ajout, puis cardio).
- Tout se change comme dans une séance normale : charge, cible, retirer, ajouter (« + Exercice », une autre prise comprise). Les exercices se font dans l'ordre voulu (un appui ouvre n'importe quelle carte) ; leur ordre d'affichage reste celui du plan (§5.2 : pas de flèches de réordonnancement en séance ; seul « Plus tard » envoie un élément en fin de liste, sans modifier le plan, §5.13). Changer de variante : ajouter l'autre variante et laisser ou retirer celle du plan.
- Cardio prévu : une ligne « Prévu · Tapis de marche · 15 min » à sa place dans l'ordre, avec « Valider », qui l'enregistre en un appui (même identifiant), et un menu « ⋯ » avec « Plus tard » quand un autre élément reste à faire (§5.13) ; il reste à sa place (« Cardio · … »), « Corriger » ensuite dans son menu ; retiré, il redevient « prévu ».
- Fin : les exercices prévus sans aucune série ne sont pas enregistrés (§5.6) et le cardio prévu non validé non plus. Le volet de fin les signale sans bloquer : « 2 exercices prévus non faits (Leg extension, Curl biceps haltères) : pas enregistrés. » (« · 1 cardio prévu non fait »).

**Durée de vie**

- Le plan reste proposé jusqu'à ce qu'il soit réalisé, quel que soit le délai. Il est consommé quand la séance démarrée à partir de lui (`fromPlan.planId`) est terminée avec au moins une série ou un cardio ; une séance prévue terminée sans rien de fait le laisse en place (choix signalé à l'utilisateur). Une séance libre ne le touche pas.
- Le plan consommé est retiré de la base (il ne revient pas si la séance est ensuite supprimée de l'historique).
- Données (version 1.23.2) : `SessionPlan` (`id`, `createdAt`, `updatedAt`, `items`) dans la méta `plan`, `items` étant la liste ordonnée des éléments, `{ kind: 'exercise', variantId, startWeightKg? }` ou `{ kind: 'cardio', block }`. La séance démarrée garde `fromPlan` (`planId`, `variantIds`, `cardio` prévu, et `order` : l'ordre prévu, `{ kind: 'exercise', variantId }` ou `{ kind: 'cardio', id }` ; absent d'une séance démarrée avant la version 1.23.2 : exercices puis cardio).
- **Migration (précision validée, version 1.23.2)** : un plan enregistré au format des versions 1.23.0 et 1.23.1 (`exercises` puis `cardio`, deux listes) est lu sans perte ni modification : mêmes identifiant, dates, exercices, poids de départ et blocs, le cardio placé après la musculation (là où il était affiché). La base n'est pas réécrite à la lecture : le plan n'est enregistré au nouveau format qu'à sa prochaine modification (test 246).
- Export et import (§11.10) : champ `plan` de la sauvegarde, format `schemaVersion` 5 (6 depuis la version 1.26.0, 7 depuis la version 1.28.0 ; une sauvegarde au format 4 des versions 1.23.0 et 1.23.1 est acceptée et son plan converti de la même façon ; champ absent d'une sauvegarde antérieure = aucun plan) ; en fusion, le plan de l'appareil est gardé (écart signalé), sinon celui de la sauvegarde est repris s'il n'a pas été réalisé ; un remplacement global le remplace. Aucun effet sur le moteur.
- La séance prévue est toujours à la salle (version 1.26.0) : ni choix de lieu à la préparation ni lieu dans le plan ; « Démarrer la séance prévue » démarre une séance à la salle, dont le lieu ne se change pas en séance (version 1.30.0).

### 5.10. Salle ou maison (précision validée, version 1.26.0)

But : faire de temps en temps une séance à la maison (haltères légers, abdos) sans fausser la progression de la salle.

- **Choix du lieu** : seulement pour une séance libre. Sous « Démarrer une séance » (ou sous « Séance libre » quand une séance est prévue), deux puces « Salle » / « Maison » (groupe « Lieu de la séance libre ») ; **Salle par défaut**, à chaque ouverture de l'accueil (jamais mémorisé). « Maison » choisi, le bouton devient « Démarrer une séance à la maison » (« Séance libre à la maison ») : 2 appuis ; une séance à la salle reste à 1 appui.
- **Séance à la maison** : mode salle comme d'habitude (§5.8), mais **sans chronomètre** : l'en-tête affiche « À la maison » (« Reprendre la séance · à la maison » sur l'accueil). La durée n'a pas d'importance : ni heures ni durée au récapitulatif de fin, dans l'historique ou le détail (les horodatages restent enregistrés, pour l'ordre chronologique). La proposition de terminer une séance oubliée (plus de 4 heures, §6) est gardée.
- **Ajout d'un exercice** : rien n'est masqué ; les récents des séances à la maison d'abord, puis ceux de la salle ; charge et statut affichés : ceux du suivi de la maison.
- **Deux suivis pour un exercice à charge** (§7.14) : à la maison, il a sa propre progression (palier, compteurs, records), distincte de la salle ; au poids du corps et en secondes (§7.13), **un seul suivi**, quel que soit le lieu.
- **Lieu d'une séance en cours (précision validée, version 1.30.0)** : « Maison » touché par erreur à la salle, ou l'inverse. Menu « ⋯ » de l'en-tête (§5.8) : « Passer à la salle » ou « Passer à la maison », premier choix du menu.
  - **Confirmation seulement si des séries ou du cardio sont déjà validés**, en volet fixé en bas (« Passer à la maison ? ») : « 4 séries déjà faites resteront telles quelles. » (« 1 série déjà faite restera telle quelle. », « 1 cardio déjà fait restera tel quel. », « 4 séries et 1 cardio déjà faits resteront tels quels. ») ; « Oui, passer à la maison » est le bouton principal, « Non, rester à la salle » le referme (choix signalé à l'utilisateur, l'action étant réversible). Sans rien de validé, le changement est immédiat.
  - **Exercices sans série validée** : charge et cible recalculées avec le suivi du nouveau lieu, comme au démarrage d'une séance prévue (§5.9 ; séries par défaut aussi, une charge ou une cible saisies à la main sont remplacées). **Jamais réalisé dans ce suivi (précision validée, version 1.30.1)** : la charge de l'autre lieu n'est jamais reprise (22 kg à la salle n'existe pas à la maison) ; le champ de poids est vidé et mis en évidence, « Poids de départ à saisir », cible au bas de la plage (« 3 × 8 »), comme pour tout exercice jamais réalisé ; aucune série ni « Valider les 3 séries » avant la saisie ; quitter le champ vide ne signale rien. Resté sans série, il est retiré à la fin (§5.6). Données : charge 0 pendant la séance (`needsStartWeight`), acceptée dans une sauvegarde pour un exercice sans série d'une séance en cours seulement. Au poids du corps et en secondes (un seul suivi), rien ne change.
  - **Exercices commencés et cardio** : gardés tels quels (charge, cible, séries, ressenti), évalués dans le suivi du nouveau lieu à la fin ; ils se corrigent au besoin par « Corriger » dans le détail (§10).
  - **Chronomètre** : heure de début conservée ; à la salle il affiche le temps depuis le début, à la maison « À la maison » le remplace.
  - **Option absente** pour une séance démarrée depuis la séance prévue (toujours à la salle, §5.9) ou depuis la séance pour compléter la semaine (§5.15) et pour une séance complétée (§5.12, sa partie fermée changerait de lieu).
  - Récapitulatif, bilans, moteur et records ne comptent la séance qu'au lieu final (une séance en cours n'y entre jamais). Aucune donnée nouvelle : seul le champ `location` de la séance en cours change ; format `schemaVersion` 7 inchangé.
- **Lieu d'une séance passée** : dans son détail (§10), « Lieu de la séance » : « Salle » / « Maison », sans confirmation (réversible). Le changer fait passer ses exercices à charge d'un suivi à l'autre : les deux suivis sont recalculés en rejouant l'historique (§7.9). Revenir au lieu d'origine redonne exactement le même résultat (vérifié sur les vraies données dans `perso/`).
- **Réutiliser** une séance à la maison crée une séance à la maison (choix signalé à l'utilisateur).
- **Données** : champ facultatif `location: 'maison'` de la séance ; absent = salle. Aucune migration de la base : les séances enregistrées avant la version 1.26.0 (et les sauvegardes antérieures) sont à la salle. Export au format `schemaVersion` 6 ; une sauvegarde au format 5 ou antérieur est lue telle quelle (salle) ; un lieu inconnu est refusé.
- Historique : « 3 ex. · maison » ; fiche : historique « … · maison ».
- **Récapitulatif et bilans (précision validée, version 1.45.0)** : le score d'un groupe étant en séries (§19.6), la maison compte **en entier**, comme la salle et comme le graphique « Séries par semaine » (§19.10) : chaque série validée d'un exercice dont le groupe est le groupe principal compte 1, d'un exercice où il n'est que secondaire ½ (développé incliné haltères 3 × 10 à la maison : pectoraux 3 séries, épaules et triceps 1,5 chacun ; 2 séries de pompes : pectoraux 2). Ni plafond par semaine, ni plafond par jour : une séance à la maison le même jour qu'une séance à la salle ajoute toutes ses séries. La case ne distingue plus la maison (« Pectoraux (5 séries) ») ; « hier » / « aujourd'hui » : tous les groupes de la séance à la maison, secondaires compris (version 1.45.0, puisqu'ils comptent dans les séries). Bilans (§19.7) : bâtons en séries, maison comprise ; le tableau garde sa colonne « Maison (séries) » (séries à la maison des groupes principaux, toutes comptées, même le jour d'une séance à la salle sur le même groupe, choix signalé à l'utilisateur) et le mail sa mention « +3 séries maison ». Les séances à la salle, l'indice par groupe (la maison exclue) et le moteur ne changent pas.

### 5.11. Annuler une séance en cours (précision validée, version 1.27.0)

But : une séance démarrée par erreur ne doit plus être terminée puis supprimée de l'historique.

- En mode salle (§5.8), à la salle comme à la maison : « Annuler la séance » dans le menu « ⋯ » de l'en-tête, à côté du chronomètre ; jamais dans la barre du pouce (appui par erreur).
- **Confirmation obligatoire**, en volet fixé en bas de l'écran (comme la fin, §5.6) : « Annuler cette séance ? », puis ce qui serait perdu, d'après les séries validées et les blocs de cardio validés : « Rien n'a été saisi. » (aucune série ni cardio, même avec des exercices ajoutés), « 1 série sera perdue. », « 4 séries seront perdues. », « 1 cardio sera perdu. », « 4 séries et 1 cardio seront perdus. ». « Non, continuer » est le bouton principal (bleu, en premier) ; « Oui, annuler la séance » est rouge, dessous (choix signalé à l'utilisateur). Le fond assombri ou Échap referment le volet.
- Après confirmation, la séance est **supprimée entièrement** (base, toutes fenêtres), sans récapitulatif ni historique, et l'appli revient à l'onglet Séance (sans entrée de garde : plus de séance en cours). Si la suppression échoue : « Annulation impossible : réessaie. », la séance reste.
- **Séance prévue** : une séance démarrée depuis le plan puis annulée ne le consomme pas (§5.9 : seule une séance terminée le consomme) ; le plan reste intact et toujours proposé.
- Rien d'autre ne change : une séance en cours n'entre ni dans le moteur, ni dans le récapitulatif, ni dans les bilans, ni dans les records ; annulée, elle n'y laisse aucune trace.
- Séance complétée (§5.12) : le menu propose « Annuler les ajouts » à la place.

### 5.12. Compléter une séance terminée le même jour (précision validée, version 1.28.0)

But : rattraper un exercice oublié (des pompes saisies après coup) dans la séance du jour, au lieu d'en créer une seconde.

- **Où** : dans le détail d'une séance du jour (§10), « Compléter cette séance » est le bouton principal (« Nouvelle séance à partir de celle-ci » passe en secondaire) ; sur l'onglet Séance, un bouton secondaire « Compléter la séance de ce matin » (« de cet après-midi » avant 18 h, « de ce soir » ensuite, d'après l'heure de début), sous le choix du lieu (version 1.40.0, §3.7), pour la dernière séance terminée du jour. « Démarrer une séance » reste à 1 appui.
- **Quand** : une séance terminée, saisie dans l'appli (avec ses heures), dont la date est aujourd'hui, et aucune séance en cours. Le lendemain, plus rien n'est proposé. Une séance importée ne se complète pas (choix signalé à l'utilisateur).
- **Déroulement** : la séance se rouvre en mode salle (§5.8), à son lieu (à la maison : toujours sans chronomètre), avec le même identifiant ; son lieu ne se change pas en séance (version 1.30.0 : il se change dans le détail, §5.10). Ce qui était fait reste **fermé** : chaque exercice déjà fait est une simple ligne (« 10 kg · 3/3 · déjà fait »), sans menu ni saisie, jamais rouvert ni relevé dans les ressentis manquants ; il se corrige par « Corriger » dans le détail (§10) ; un cardio déjà fait est une ligne « Déjà fait · Tapis de marche · 15 min ». Les ajouts (exercices, cardio) se font comme dans une séance normale et viennent après. Séance prévue : le cardio prévu non fait n'est plus proposé.
- **Fin** : « Terminer » comme d'habitude ; c'est toujours une seule séance (historique, récapitulatif, bilans, rejeu du moteur à sa place). Durée (à la salle) : **la somme des périodes, sans la pause** (8 h 00 – 8 h 45 puis 18 h 00 – 18 h 20 : 1 h 05) ; le détail affiche « 8 h 00 – 18 h 20 · 1 h 05 ».
- **Annuler les ajouts** : menu « ⋯ » de l'en-tête, avec confirmation (« Annuler les ajouts ? », « 2 séries seront perdues. La séance terminée reste enregistrée. ») ; la séance redevient exactement celle d'avant (fin, durée, exercices, cardio).
- **Données** : `pauseMs` (pause entre les périodes, en millisecondes ; absent = aucune) ; pendant la séance seulement, `locked` (`variantIds`, `cardioIds`, fin et pause d'origine), retiré à la fin. Export au format `schemaVersion` 7 ; une sauvegarde au format 6 ou antérieur est lue telle quelle.

### 5.13. Plus tard (précision validée, version 1.29.0)

But : machine occupée, plus de place, ou pas la forme pour cet exercice maintenant : le faire en fin de séance sans rien réorganiser à la main.

- **Où** : menu « ⋯ » d'un exercice non terminé (séries pas toutes faites, même commencé : « 1/3 ») et d'un cardio prévu pas encore validé (§5.9), en séance libre comme en séance prévue, à la salle comme à la maison. « Plus tard » est le premier choix du menu. Il n'est proposé que si un autre élément reste à faire (il s'ouvrira à sa place) : jamais pour le dernier élément à faire, ni pour un exercice dont il ne manque que le ressenti, ni pour ce qui est déjà fait (cardio validé, partie fermée d'une séance complétée, §5.12). 2 appuis (« ⋯ », « Plus tard »).
- **Effet** : l'élément passe en **fin de liste** et se ferme ; l'**élément suivant non terminé s'ouvre** (même règle que le ressenti, §5.5 : dans l'ordre de la séance, en reprenant au début après le dernier), amené sous l'en-tête. Plusieurs éléments remis à plus tard restent en fin de liste dans l'ordre où ils l'ont été ; remis une seconde fois, un élément repasse dernier ; un exercice ajouté ensuite vient avant eux. Rien d'autre ne change (charge, cible, séries déjà faites).
- **Pas de flèches de réordonnancement en séance** (choix de l'utilisateur) ; un appui ouvre toujours n'importe quelle carte.
- **Séance prévue** : le plan n'est pas modifié (ni la séance prévue enregistrée, ni l'origine `fromPlan` de la séance).
- **Données** : `later` (clés d'étape, dans l'ordre), pendant la séance seulement (gardé au rechargement, dans l'export d'une séance en cours, refusé sur une séance terminée ; format `schemaVersion` 7 inchangé). À la fin, les exercices sont enregistrés dans l'ordre de la liste (ceux remis à plus tard en dernier) et `later` disparaît. Retiré de la séance, un exercice n'est plus « plus tard ». Aucun effet sur le moteur.

### 5.14. Nom de séance calculé (précision validée, version 1.32.0)

- **Nom affiché** d'une séance non renommée : le lieu (« Salle » / « Maison »), puis ses **groupes principaux** travaillés, du plus au moins de séries, **3 au plus**, séparés par « · » : « Salle · Pectoraux · Triceps · Jambes », « Maison · Pectoraux · Abdos ». À égalité de séries, l'ordre de la séance (choix signalé à l'utilisateur). Libellés des groupes (§3.2), « Abdos » pour les abdominaux ; un sous-groupe des jambes (exercice personnalisé) compte dans « Jambes ». Les groupes secondaires et le cardio ne comptent pas ; un exercice sans série non plus ; une performance partielle importée (poids sans répétitions) nomme son groupe, après ceux qui ont des séries (choix signalé). Sans exercice de musculation : « Salle · Cardio » (« Maison · Cardio ») ; séance qui démarre, rien de fait : « Salle » (« Maison »), complété au fil des séries (choix signalé).
- **Affichage calculé, rien n'est réécrit en base** : une séance garde son nom enregistré par défaut (« Séance du 19 octobre 2026 — 17 h 05 », « Séance du 19 octobre 2026 » d'une séance importée sans heure) ; ce nom par défaut signale une séance non renommée (`isDefaultSessionName`, `src/session/title.ts`), ce qui couvre toutes les séances enregistrées avant la version 1.32.0. Export, import et moteur inchangés.
- **Le nom suit la séance** : correction, retrait d'un exercice, séance complétée (§5.12), lieu changé (séance passée ou en cours) ; en séance, l'en-tête l'affiche (§5.8).
- **Nom donné à la main** (récapitulatif de fin ou détail) : gardé tel quel, quoi qu'il arrive ensuite à la séance. Un nom vide, ou identique au nom calculé, rend à la séance son nom calculé (le nom par défaut est réenregistré). Un nom importé (titre des notes, JSON) est un nom donné à la main.
- **Où** : historique (titre de la ligne ; le jour reste à gauche), détail (titre ; la date reste dans l'en-tête, « 19 octobre 2026 · 17 h 05 – 18 h 05 »), en-tête de la séance en cours, champ « Nom de la séance » du récapitulatif (« Garder ce nom » en un appui) et du détail. La recherche de l'historique porte sur le nom affiché et sur le nom enregistré : « pectoraux » et « 19 octobre » trouvent toujours une séance non renommée.

### 5.15. Séance pour compléter la semaine (précision validée, versions 1.39.0 et 1.45.0)

But : à partir des séances déjà faites dans la semaine (lundi – dimanche), proposer une séance à la salle qui vise les groupes encore sous l'objectif, avec des exercices déjà faits, sans rien préparer à la main.

- **Objectif (version 1.45.0 : en séries)** : le seuil du rouge du récapitulatif, **10 séries** par défaut (§19.6) ; un groupe est sous l'objectif quand son score de la semaine (celui du récapitulatif, en séries : séries directes, indirectes pour moitié, maison en entier, 3 par activité confirmée, 3 pour le cardio des jambes) y est inférieur. Groupes : ceux du récapitulatif. La séance projetée compte les séries standard de chaque exercice proposé (3 par défaut, ses réglages sinon : 2 pour les pompes), et aussi les minutes de l'échauffement proposé (version 1.41.0, choix signalé à l'utilisateur).
- **La veille** : les groupes travaillés en direct à la salle la veille de la séance proposée sont écartés (« Pas cette fois (séance à la salle hier) : Dos. ») ; une performance partielle importée compte, comme au récapitulatif (version 1.41.3, `countsAsWork`). La séance proposée est celle d'aujourd'hui, ou de demain si une séance à la salle est déjà terminée aujourd'hui (« Pas cette fois (séance à la salle aujourd'hui) : … ») ; la maison et les activités n'écartent rien.
- **Échéance (précision validée, version 1.40.1)** : aucun jour n'est imposé, seulement la fin de la semaine : « D'ici dimanche » (carte) et « À faire d'ici dimanche » (écran), sauf le dimanche : « Aujourd'hui » et « À faire aujourd'hui » (`suggestionDueToday`). Proposée le samedi pour le dimanche (après une séance à la salle le samedi) : « D'ici dimanche ». Le calcul ne change pas.
- **Choix des exercices** :
  - **1ᵉʳ passage** : un exercice par groupe sous l'objectif, le plus en retrait d'abord (score croissant, puis l'ordre du récapitulatif), **6 au plus** (au-delà : « Pas de place (6 exercices au plus) : … ») ; un groupe est **complété** sans exercice propre quand il est groupe secondaire d'un exercice déjà retenu et que la séance projetée (exercices déjà retenus et échauffement) le porte à l'objectif (biceps à 9 + un tirage de 3 séries : 10,5 ; « Biceps : complété par Tirage horizontal poulie basse — Prise serrée (groupe secondaire). ») ; sinon il a son exercice ;
  - **2ᵉ passage (version 1.45.0)**, dans le même ordre : un 2ᵉ exercice aux groupes encore sous l'objectif dans la séance projetée, **2 au plus par groupe**, tant qu'il reste de la place (**6 au total**) ; un groupe que cela ne suffit pas à amener à l'objectif reste dans « Encore sous l'objectif » ;
  - **4 exercices au moins** : en dessous, un 2ᵉ exercice pour les groupes les plus en retrait, même déjà à l'objectif (2 par groupe au plus) ;
  - **abdominaux** (s'ils sont au récapitulatif, sous l'objectif et pas travaillés à la salle la veille) : **un exercice en bonus**, en fin de séance, **hors des 6** (« Bonus abdos, en fin de séance ») ; objectif inchangé ;
  - candidats : exercices-variantes faits à la salle dans les **6 dernières semaines**, non archivés ; au poids du corps (un seul suivi, §7.13), faits n'importe où (la planche faite à la maison est proposée à la salle) ; un exercice à charge fait seulement à la maison ne l'est jamais. Préférés, dans l'ordre : aucun groupe secondaire travaillé à la salle la veille, pas encore fait cette semaine, le plus souvent fait sur 6 semaines, le plus récent ;
  - **ordre de la séance** : pectoraux, dos, jambes, épaules, triceps, biceps, puis le bonus abdos ; **en tête, l'échauffement** : machine, inclinaison et durée du premier cardio de la dernière séance à la salle qui en avait (choix signalé), modifiable comme tout cardio prévu ;
  - charge et cible : celles du moteur, avec la même mention que la séance prévue (« ↑ +1 rép. », « = Même cible : consolide »). Aucun choix de groupes à exclure (choix de l'utilisateur : il adapte lui-même la séance).
- **Quand** : dès la **1ʳᵉ séance terminée à la salle de la semaine**, jusqu'au dimanche ; recalculée à chaque affichage, donc après chaque séance. Rien le lundi avant une séance à la salle, ni pendant une séance en cours, ni quand aucun groupe (hors abdos) n'est à compléter, ni le dimanche après une séance à la salle (la séance proposée tomberait la semaine suivante).
- **Où** : onglet Séance, une carte cliquable (version 1.40.0, §3.7), sous la carte « Ma séance prévue » s'il y en a une, au-dessus de « Préparer ma prochaine séance » et « + Activité » : « Séance pour compléter la semaine », « D'ici dimanche · 5 exercices » (« Aujourd'hui » le dimanche), puis les groupes en pastilles de leur couleur, dans l'ordre de la séance, bonus compris (« Jambes », « Épaules », « Triceps », « Biceps »). Masquée quand la séance prévue reprend déjà ses exercices. « Démarrer une séance » reste à l'écran sans défiler.
- **Écran** `#/seance-prevue/suggestion` (« Compléter la semaine », onglet Séance) : « À faire d'ici dimanche, à la salle : les groupes de ton récapitulatif encore sous 10 séries cette semaine. » (« À faire aujourd'hui » le dimanche), l'échauffement (cadre neutre), une carte par exercice à la couleur de son groupe (vignette et nom, qui ouvrent la fiche, version 1.48.0 ; charge et cible du moteur, mention), puis « Avec cette séance, à l'objectif : Jambes. » (score recalculé avec la séance proposée), « Encore sous l'objectif : Pectoraux, Dos, Épaules, Biceps, Triceps. » (tous les groupes sous l'objectif que la séance n'y amène pas, écartés compris), les groupes complétés et écartés (« Pas cette fois (séance à la salle hier) : Pectoraux, Dos. »). Rien ne s'y modifie (choix de l'utilisateur).
  - **« Démarrer cette séance »** (bouton principal) : déroulée comme une séance prévue (§5.9 : ordre, échauffement ouvert en premier, élément suivant ouvert au ressenti, non faits signalés à la fin), à la salle, avec son propre identifiant de plan : la séance prévue enregistrée n'est **ni remplacée ni consommée**.
  - **« En faire ma séance prévue »** : copiée dans la séance prévue (nouveaux identifiants), modifiable comme d'habitude, puis figée ; avec une séance prévue déjà préparée, **« Remplacer ma séance prévue »**, avec confirmation (« Remplacer ta séance prévue par cette séance ? », « Oui, remplacer » / « Non »). Jamais remplacée d'office.
- Calcul pur (`weekSuggestion`, `src/plan/suggest.ts`), jamais stocké ; aucun effet sur le moteur, le récapitulatif, les alertes ni la sauvegarde (format `schemaVersion` 7 inchangé).
- **Données de test** : `src/plan/__tests__/completer-simulation.ts` (jamais chargée par l'application, vérifié par le test 292) : trois semaines ordinaires, puis la semaine du 9 novembre 2026 jusqu'au mercredi.
- Sur les vraies données (export du 30/10, semaine du 26 oct., version 1.45.0) : rien avant la séance à la salle du mardi 27 ; ensuite, pour le 28 : Pec deck, Écarté couché haltères, deux tirages horizontaux, la planche en bonus (les pectoraux à l'objectif) ; le jeudi 29 au matin : 6 exercices (chest press, tirage horizontal, adducteurs, élévations latérales, dips assistés, curl poulie) et la planche ; pour le vendredi 30 : adducteurs, squat kettlebell, deux curls, la planche (dos et triceps écartés, pectoraux à l'objectif) ; après la séance à la maison du vendredi : adducteurs et squat kettlebell seulement (biceps à l'objectif) ; le samedi 31 : deux tirages, adducteurs, squat kettlebell, dips assistés, la planche (dos, triceps, jambes à l'objectif) (test sur les vraies données dans `perso/`).

## 6. Chronomètre global de séance

Mettre en place un seul chronomètre global.

Il démarre automatiquement au début de la séance et s'arrête uniquement lorsque la séance est terminée.

Il ne doit pas être réinitialisé entre les séries ou les exercices.

Il doit continuer à représenter le temps écoulé pendant les repos, les changements de machine et les interruptions temporaires de l'application.

Enregistrer l'horodatage de début et calculer le temps écoulé à partir de cet horodatage. Ne pas se contenter d'incrémenter un compteur en mémoire.

Restaurer un chronomètre cohérent après fermeture, rechargement ou passage en arrière-plan.

À la maison (§5.10), pas de chronomètre affiché : la durée n'y a pas d'importance. Lieu changé en cours de séance (version 1.30.0) : l'heure de début est gardée, le chronomètre de la salle compte depuis le début.

Séance complétée le jour même (§5.12) : le chronomètre reprend la durée de la première période, la pause n'est jamais comptée ; la durée totale est la somme des périodes. La séance oubliée (plus de 4 heures) se mesure de la même façon.

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
- Une performance verte ou orange (hors séance incomplète et séance « Mal passé ») : compteur remis à 0.
- Une séance incomplète ne modifie pas ce compteur.
- **Séance « Mal passé » neutre (précision validée, version 1.42.0)** : une performance orange avec le ressenti « Mal passé » (toutes les séries à la cible, ou une seule en dessous) ne modifie pas ce compteur, comme une séance incomplète : elle n'efface plus les rouges d'avant. « Mal », « Très mal », « Mal », « Très mal »… mène à la baisse à la 4ᵉ rouge (8ᵉ séance) ; avant, le compteur retombait à 0 à chaque « Mal ». Une rouge (deux séries sous la cible, ou « Très mal ») compte toujours ; « Moyen », un ressenti inconnu et une verte remettent toujours le compteur à 0 ; « Mal » seul, même répété, ne déclenche jamais de baisse. Option retenue (« B1 ») après simulation sur les vraies données et sur des séquences fictives, la seule sans baisse injustifiée (mauvaise passe, malade une semaine, débutant bloqué, ressenti oublié) ; écartées : « Mal » avec une série manquée compté rouge, 4 séances non vertes dont 2 rouges. Vraies données (exports du 27/10, du 30/10 et du 6/11) : aucun écart (`neutralForReds`, `src/engine/progression.ts`). Même règle au poids du corps et en secondes (cible −1, §7.13). Les bilans parlent donc de « série », jamais de rouges « de suite » (version 1.42.1, §19.3, §19.7) : « série de 4 rouges à 100 kg → poids inférieur recommandé », « (série en cours : 3 rouges à 100 kg) », « série en cours : 2 rouges », comme la fiche (§5.3.2).

Quand le compteur atteint **4** :

- Recommander de **passer au poids inférieur**, sans indiquer de valeur ; je saisis la nouvelle charge au démarrage de l'exercice.
- Conserver la cible de répétitions du palier en cours.
- Remettre les compteurs à 0 pour le nouveau palier.

Une, deux ou trois séances rouges ne provoquent jamais de baisse de charge : la charge et la cible sont conservées.

### 7.9. Reconstruction et corrections

Le profil de progression (§9) n'est jamais modifié de façon incrémentale « à la main » : il est **recalculé en rejouant l'historique dans l'ordre chronologique**, séance par séance, avec les règles ci-dessus.

L'ordre chronologique est déterministe : tri par date, puis par heure de début lorsqu'elle est connue, puis par date d'enregistrement dans l'application. Plusieurs séances le même jour restent donc toujours dans le même ordre. Le même ordre s'applique partout (version 1.41.2) : historique (du plus récent au plus ancien), « Dernière fois » de la fiche, exercices récents ; une séance sans heure passe après celles du même jour dont l'heure est connue, une activité se range à son heure de début (`compareSessions`, `compareHistory`).

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
- Refus d'une baisse : une nouvelle rouge incrémente le compteur de rouges et maintient la recommandation ; une séance « Mal passé » (orange) la laisse telle quelle (version 1.42.0, §7.8) ; une verte ou une autre orange complète remet ce compteur à 0 et la recommandation disparaît.

**E. Compteur de rouges.** Toute performance rouge au même poids compte, qu'elle soit standard ou non. Un changement de cible au même poids ne remet pas ce compteur à 0. Un changement de poids le remet à 0 ; la séance faite au nouveau poids compte 1 si elle est rouge.

**F. Séance incomplète.** Une séance incomplète au palier actuel est orange : elle remet le compteur de validations à 0 et ne modifie pas le compteur de rouges. Un exercice sans aucune série est toujours retiré à la fin de la séance (§5.6, version 1.28.0) ; resté dans une séance terminée (rétabli par une version antérieure), il est ignoré par le moteur (aucun statut, aucun effet), comme une performance partielle.

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

### 7.13. Exercices au poids du corps (précision validée, version 1.24.0)

Réglage « Poids du corps » par exercice-variante (`bodyweight`, comme « assisté », §7.12 ; les deux s'excluent) : crunch au sol, crunch oblique touche talons, relevés de jambes allongé (§4.0, version 11).

- **Aucune charge** : la performance est enregistrée avec une charge nulle (0), autorisée pour ces variantes seulement (moteur, correction d'une séance passée, sauvegarde : charge nulle ailleurs, ou charge au poids du corps, refusées). Pas de champ de poids ni de poids de départ ; jamais « 0 kg » affiché (carte, dernière fois, fiche, historique, détail, récapitulatif de fin, bilans, records : « 3 × 25 »). La fiche le signale (« Poids du corps : progression par les répétitions (10 à 40) ») et n'a que le graphique des répétitions.
- **Plage par défaut : 10 à 40 répétitions**, réglable par exercice (Rép. min / Rép. max) ; 3 séries.
- **Mêmes règles** que le §7 (statut, deux vertes consécutives, rejeu complet), sur les répétitions seulement :
  - deux validations : cible + 1 (« ↑ +1 rép. ») ;
  - au plafond de la plage (y compris une cible manuelle au-delà) : la cible reste au plafond, mention « = Plafond atteint » ; refaire le plafond suit la recommandation (pas un refus) et valide encore ; jamais de poids supérieur ;
  - quatre rouges consécutives : **cible − 1** (« ↓ −1 rép. », kind `reps_down`), jamais sous la borne basse (au plancher, palier conservé). Suivie : nouveau palier, compteurs repartant de 0 (la séance compte 1 rouge si elle est rouge), comme une baisse de charge (§7.8). Refusée (palier refait) : une nouvelle rouge la maintient, une verte ou une orange complète la retire (§7.11 D).
- Records (§19.9) : le plus de répétitions, puis le plus de séries. Bilans (§19.7) : progressions sans charge (« 3×24 → 3×25 »), « série de 4 rouges → cible −1 rép. recommandée ».
- Réglage figé dès qu'une variante a un historique (charges incompatibles) ; cocher « Poids du corps » passe une plage restée par défaut de 8–12 à 10–40 (et inversement).
- Les exercices à charge ne changent pas : moteur, statuts et recommandations identiques (vérifié sur les vraies données de l'utilisateur, instantané de la version 1.23.2 dans `perso/`).

**Exercices en secondes (précision validée, version 1.25.0)** : réglage « En secondes (gainage) » (`seconds`, toujours avec `bodyweight`) : la planche (§4.0, version 12). La « cible de répétitions » est une durée par série, en secondes ; pas de chronomètre (choix de l'utilisateur) : la durée tenue se saisit.

- Plage par défaut **20 à 60 s** (Durée min / Durée max, réglable jusqu'à 600 s), 3 séries ; mêmes règles que le poids du corps, par **pas de 5 s** : deux validations → +5 s (« ↑ +5 s », jamais au-delà du plafond : 55 → 58 s si la plage s'arrête à 58) ; au plafond, « = Plafond atteint » ; quatre rouges → −5 s (« ↓ −5 s », jamais sous la borne basse).
- Saisie : séries préremplies à la cible, − / + par 5 s (jamais au-delà de la cible), « Valider les 3 séries » ; le compteur affiche la valeur seule (« 20 », l'unité est lue par le lecteur d'écran) pour que « Valider » tienne sur la ligne, la cible « 3 × 20 s » étant juste au-dessus ; séries à venir « 20 s ».
- Affichage en secondes partout : carte, séance prévue, fiche (« Gainage : progression par la durée (20 à 60 s) », graphique « Durée par série »), historique (« 20-20-20 s », « cible 3 × 20 s »), détail et sa correction (« Secondes », « Cible (s) »), récapitulatif de fin, records (« 3 × 45 s »), bilan (« 25 → 30 s ») et bilans de la période (« 3×40 s → 3×45 s », « cible −5 s recommandée »). Jamais « 0 kg ».
- Réglage figé dès qu'une variante a un historique ; cocher « En secondes » coche « Poids du corps » et passe une plage restée par défaut à 20–60 s. Une sauvegarde avec `seconds` sans `bodyweight` est refusée. Exercices en répétitions et à charge inchangés (instantané des vraies données identique).

### 7.14. Suivi à la maison (précision validée, version 1.26.0)

Les charges de la maison (haltères légers) ne sont pas comparables à celles de la salle : un exercice-variante **à charge** a deux suivis.

- **Suivi de la salle** : l'exercice-variante, comme avant ; les séances à la maison n'y entrent jamais (son état est exactement celui qu'il aurait sans elles).
- **Suivi de la maison** (clé `<variante>@maison`) : mêmes règles du §7 (statuts, deux vertes, quatre rouges, rejeu), sur les seules séances à la maison. Plage par défaut : borne basse de la salle (8) à **15** (au moins la borne haute de la salle), réglable par exercice dans Modifier (« Maison : rép. min » / « Maison : rép. max », `homeMinReps` / `homeMaxReps`, enregistrés seulement s'ils diffèrent du défaut). Séries et réglage « assisté » de la variante. Après deux vertes à 3×15, « poids supérieur » : l'utilisateur garde la charge s'il est au maximum de ses haltères (choix de l'utilisateur). Première fois à la maison : poids de départ demandé.
- **Poids du corps et secondes** (§7.13) : un seul suivi, salle et maison mêlées.
- **Records** (§19.9) par suivi : un record de la maison ne bat jamais celui de la salle.
- **Fiche** : « Prochaine cible à la salle » et, s'il existe un suivi de la maison, un second bloc « Prochaine cible à la maison » (dernière fois, record, cible) ; le graphique d'un exercice à charge ne montre que la salle.
- Bilan de progression (§19.3) et bilans de la période (§19.7) : le suivi de la maison est classé et rapporté à part, nommé « Curl biceps haltères (maison) » ; les dernières évolutions ne comparent jamais un palier de la maison à un palier de la salle.

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

Permettre de rechercher une séance par son nom (nom affiché, §5.14, ou date d'une séance non renommée) et de consulter ses détails.

Permettre de renommer et de corriger une séance passée. **Précision validée :** la date d'une séance passée est modifiable ; la séance est alors rejouée à sa nouvelle place chronologique (§7.9). Son début et sa fin passent au nouveau jour, à la même heure (version 1.41.4) : le récapitulatif, les bilans, les séries par semaine et le moteur la rangent tous dans sa nouvelle semaine. Une séance sans heure reste sans heure ; une séance non renommée reçoit le nom par défaut de sa nouvelle date, pour que la recherche par date la trouve (choix signalé à l'utilisateur).

Permettre de supprimer une séance passée, après confirmation explicite, depuis son détail seulement (la liste, regroupée par mois, n'a aucun bouton, §3.5). La suppression déclenche le recalcul du profil (§7.9).

Permettre de créer une nouvelle séance à partir d'une séance historique.

**Réutiliser une ancienne séance doit créer une nouvelle séance sans jamais modifier l'originale.**

Lorsqu'une séance est réutilisée :

- Les anciens exercices sont préremplis.
- Les poids et cibles sont recalculés à partir du profil global actuel.
- Les performances historiques restent consultables.
- L'ancienne séance n'est jamais comptée une deuxième fois comme validation.

Toute modification de l'historique déclenche le recalcul des recommandations concernées.

Le lieu d'une séance passée (salle ou maison) se change dans son détail (§5.10) ; heures et durée n'y sont pas affichées pour une séance à la maison.

Une séance du jour se complète depuis son détail (« Compléter cette séance », bouton principal, §5.12).

## 11. Import de données : JSON et notes en texte brut

**L'application doit pouvoir récupérer mon historique existant sans que je sois obligé de tout ressaisir.**

Prévoir deux modes d'import complémentaires :

1. Import d'un fichier JSON ou collage de contenu JSON.
2. Import de notes de séances en texte brut, copiées-collées depuis ChatGPT, un bloc-notes ou un autre outil.

L'import de notes libres est une fonctionnalité essentielle, pas un simple bonus.

### 11.1. Interface d'import

Écran « Importer / exporter » (`#/donnees`), dans l'onglet Plus et en bas des réglages (§3, §3.5).

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
- Activités habituelles hors salle : liste des habitudes (réglages), réponses « Oui » / « Non » et activités ponctuelles (§19.8), format `schemaVersion` 4 (5 depuis la version 1.23.2, pour la séance prévue) ; une sauvegarde au format 2, 3 ou 4 est migrée sans perte (aucune activité, habitudes par défaut).
- Blocs de cardio des séances et liste des machines de cardio (§5.7).
- Séance prévue (§5.9) : champ `plan` (null sans plan), et origine `fromPlan` des séances démarrées à partir d'elle ; format `schemaVersion` 5 (un seul ordre, musculation et cardio mêlés), une sauvegarde au format 4 est acceptée et son plan converti (cardio après la musculation).
- Lieu des séances (§5.10) : `location` « maison » (absent = salle), format `schemaVersion` 6 (version 1.26.0) ; une sauvegarde au format 5 ou antérieur est lue telle quelle, toutes ses séances à la salle.
- Séance complétée (§5.12) : `pauseMs`, et `locked` pour une séance en cours, format `schemaVersion` 7 (version 1.28.0) ; une sauvegarde au format 6 ou antérieur est lue telle quelle ; une pause négative, ou `locked` sur une séance terminée, est refusée.

L'export pour le coach (§19.13, version 1.46.0) est un fichier à part, en lecture seule, qui ne sert pas à restaurer : la sauvegarde ne change pas.

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
- **Plusieurs fenêtres de l'appli (précision validée).** L'appli installée et un onglet Chrome partagent la même base : une fenêtre restée en mémoire ne doit jamais écrire une ancienne version d'une séance par-dessus une plus récente (cardio ajouté ailleurs effacé par la série suivante). Chaque écriture réussie est annoncée aux autres fenêtres (`BroadcastChannel`), qui relisent toute la base : séances, bibliothèque, et depuis la version 1.41.2 réglages (récapitulatif, machines de cardio, bilans, activités habituelles), activités, séance prévue et mémoire de l'appareil (bilans vus, alertes ignorées, dernier export) ; chaque fenêtre relit aussi la base en revenant au premier plan. Une fenêtre restée ouverte n'écrase donc plus un réglage enregistré ailleurs (une seule lecture, `loadStored`, et une seule écriture des réglages, `writeMeta`, `src/app/store.tsx`). Une écriture locale non confirmée garde sa version.

**Rappel de sauvegarde** : si aucun export n'a été fait depuis 14 jours et que de nouvelles séances existent, afficher un rappel discret sur l'onglet Séance (accueil), avec un bouton d'export direct. Pas de fenêtre bloquante.

Prévoir une procédure simple pour transférer les données vers un autre appareil grâce à l'export et à l'import JSON.

## 13. Annulation et correction rapide

Permettre :

- De corriger rapidement une série.
- D'annuler la dernière action de saisie pendant la séance en cours (bouton « Annuler » visible quelques secondes après une action : modification de série, retrait d'exercice ou de cardio, ce retrait étant d'abord confirmé, §5.3).
- De retirer un exercice de la séance actuelle sans supprimer son historique.
- D'annuler une séance démarrée par erreur, après confirmation (§5.11).
- De compléter une séance terminée le jour même, et d'annuler ces ajouts (§5.12).
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
- De personnaliser la plage de répétitions ou le nombre de séries d'un exercice si nécessaire, et de choisir son type (charge, poids du corps ou durée, §4.5, §7.13 : dès la création, puis dans « Modifier » tant qu'il n'a pas d'historique), ainsi que la plage de répétitions à la maison d'un exercice à charge (§7.14).
- De renseigner ma taille (§20).
- De choisir les groupes du récapitulatif de la semaine et son seuil du rouge, en séries (« Rouge à partir de (séries) », 6 à 20, 10 par défaut, §19.6, version 1.45.0).
- D'importer des séances depuis des notes ou du JSON.
- D'exporter les données complètes.
- De voir l'état du stockage persistant.
- De modifier la liste des machines de cardio (§5.7), et d'indiquer celles qui comptent pour les jambes (§19.6, version 1.41.0).
- De désactiver le signalement du bilan de la semaine et/ou du mois (pastille sur l'onglet Progrès et bandeau en haut de cet onglet), le rappel de l'export pour le coach dans le bandeau de la semaine (« Rappel de l'export coach », coché par défaut, version 1.47.0, §19.13), et de renseigner une adresse e-mail facultative pour les bilans (§19.7).
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
67. (D) Refus de « poids inférieur » : une nouvelle rouge maintient la recommandation, une verte ou une orange complète la retire (sauf une séance « Mal passé », qui la laisse : version 1.42.0, test 302).
68. (E) Une rouge non standard au même poids compte dans le compteur de rouges ; un changement de cible au même poids ne remet pas ce compteur à 0 ; un changement de poids le remet à 0.
69. (F) Une séance incomplète au palier actuel remet le compteur de validations à 0 sans modifier le compteur de rouges.
70. (G) Une première performance à 3×9, complète et verte, compte comme une validation ; une première performance hors plage ne valide pas.
71. (H) Une performance partielle n'a aucun statut et ne modifie ni le palier ni les compteurs ; elle reste présente dans l'historique.
72. (I) Avec une cible manuelle supérieure à 12, deux validations recommandent « poids supérieur » et jamais une cible au-delà de 12.
73. (J) 52,5 kg et 52.50 kg sont le même poids : pas de changement de palier.
74. (§5.6, version 1.28.0) À la fin d'une séance, un exercice sans aucune série est toujours retiré et ne modifie pas ses compteurs ; le récapitulatif le signale, sans « Annuler » ; resté dans une séance terminée, il est ignoré par le moteur (aucune évaluation, profil identique).
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
91. (§19.6, version 1.45.0) Chaque série d'un exercice compte 1 pour son groupe principal, ½ pour chacun de ses groupes secondaires (tests 179 à 184 et 306) ; les abdominaux sont absents par défaut.
92. (§19.6, version 1.45.0) Couleurs selon le score de la semaine en séries : vert sous 3, orange de 3 jusqu'au seuil exclu, rouge à partir du seuil (10 séries par défaut, réglable de 6 à 20, tests 306 et 307).
93. (§19.6) Mention « aujourd'hui » ou « hier » correcte (moins de 48 heures, jour du calendrier), y compris pour la semaine précédente.
94. (§19.6) Ordre de tri : vert, orange, rouge ; à couleur égale, « hier » et « aujourd'hui » en dernier.
95. (§19.6) Semaine vide : tous les groupes verts, « 0 séance ».
96. (§19.6) Une séance en cours n'est pas comptée ; terminer, supprimer ou importer une séance met à jour le récapitulatif au retour sur l'accueil (bout en bout : « Pectoraux (3 séries) · aujourd’hui » orange, version 1.45.0 ; bloc visible sans clic ni défilement au format smartphone).
97. (§19.6) Les sous-groupes des jambes comptent pour « jambes » ; le récapitulatif ne modifie ni les séances ni le moteur.
98. (§4.0) « leg curl », « leg curl assis », « seated leg curl » → Leg curl (assis) ; « curl ischios », « curl ischio allongé », « leg curl allongé », « lying leg curl » → Curl ischios (allongé) ; en cas de doute, l'aperçu demande de choisir ; historiques séparés.
99. (§4.0) Une base existante reçoit « Curl ischios » une seule fois ; les synonymes du leg curl ne sont corrigés que s'ils n'ont pas été personnalisés.
100. (§4.0.1) Chaque fiche illustrée affiche, une fois la vignette agrandie, le dessin et l'attribution (auteur, licence CC BY-SA 3.0 ou 4.0 selon la source, deux sources), y compris le dessin propre à une variante ; les fiches sans illustration n'en affichent pas (version 1.40.2 : pull-over à la poulie illustré, presse à cuisses sans dessin ; version 1.40.3 : tirage vertical devant la poitrine pour ses trois prises).
101. (§1) Les tests s'exécutent à l'heure de Paris, quelle que soit la machine.

### Élévations latérales haltères / machine et corrections de la bibliothèque

102. (§4.0) Une base existante reçoit la séparation des élévations latérales (renommage en « haltères » et nouvel exercice « machine ») et le retrait de « Tirage nuque », sans perte de données : séances, variantes et synonymes appris conservés ; un exercice personnalisé par l'utilisateur garde son nom et ses synonymes.
103. (§4.0) « élévations latérales haltères », « lateral raise haltères », « dumbbell lateral raise » → haltères ; « élévations latérales machine », « lateral raise machine », « machine lateral raise » → machine ; sans matériel précisé (« latéral raise », « Epaules latéral raise », « élévations latérales »), l'aperçu demande de choisir ; « Tirage nuque » n'est plus reconnu comme tirage vertical.
104. (§4.0, §11.11 C) Une sauvegarde d'une version antérieure de la bibliothèque ne réintroduit ni ancien nom ni ancien synonyme ; ses synonymes appris sont repris.

### Cardio (§5.7)

105. Un bloc s'enregistre avec la machine, la durée et, pour le tapis seulement, l'inclinaison (Neutre par défaut) ; la distance est facultative ; une durée nulle, décimale ou absente est refusée ; plusieurs blocs par séance, dans l'ordre d'ajout ; correction et retrait ; une séance sans cardio n'a pas de champ cardio.
106. Le cardio n'a aucun effet sur le moteur (profil, statuts et recommandations identiques), ne demande aucun ressenti, et une séance réutilisée ne reprend pas le cardio.
107. Terminer une séance conserve ses blocs ; une séance ne contenant que du cardio est enregistrée.
108. (§19.6) Le cardio n'entre dans aucun groupe (sauf les jambes à partir de 45 min, version 1.41.0, tests 295 à 297) ; l'en-tête affiche « 3 séances · 45 min de cardio » (« 1 h 20 » au-delà d'une heure), rien de plus sans cardio ; une séance de cardio seul compte ; une séance en cours ne compte pas.
109. Notes : « Tapis 15 min », « Tapis incliné 20 min », « Marche inclinée haute 20min », « Rameur 10 min », « Elliptique 15 min », « Vélo elliptique 20 min » sont reconnus ; « Tapis » ou « marche » sans précision = Neutre ; « incliné » sans niveau bloque l'import jusqu'au choix de Moyenne ou Haute.
110. Notes mêlant exercices et cardio : les exercices sont inchangés ; une machine non reconnue est à choisir ou à exclure, jamais devinée ; une machine ajoutée dans les réglages est reconnue ; le cardio d'un JSON simple est lu de la même façon.
111. Export puis import : blocs et liste des machines conservés, sans doublon ; deux séances qui ne diffèrent que par le cardio ne sont pas des doublons ; un bloc invalide fait refuser la sauvegarde.
112. Une sauvegarde au format 2 est migrée sans perte (son seuil `redThreshold` 3 restauré en `redSets` 15, version 1.45.0) ; un format plus récent est refusé ; une base existante, sans liste de machines enregistrée, reçoit la liste par défaut et ses séances restent intactes.
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
135. Tirage vertical prise moyenne le lundi et prise très large le jeudi : « Dos (6 séries) », orange (version 1.45.0), deux historiques séparés.
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
152. (bout en bout) Recherche de « calves », « fessiers », « adductors », « abduction », « hip adduction », « barbell curl », « legs » ; fiches des abducteurs et des adducteurs avec deux dessins distincts (attribution CC BY-SA 4.0, everkinetic/data) ; séance avec les trois machines comptée dans « Jambes » : « Jambes (9 séries) · aujourd’hui », orange (version 1.45.0).

### Bibliothèque version 8 (§4.0, §4.2.1, §7.12)

153. Mollets : « Mollets machine — Debout » (variante standard) et « — Assis », historiques séparés ; « mollets », « mollets debout », « standing calf raise », « calf press » → debout ; « mollets assis », « seated calf raise », « calf assis » → assis.
154. Dix-neuf exercices ajoutés avec leurs groupes et leur matériel ; développé incliné barre / haltères et oiseau machine / haltères en variantes ; chaque nom et synonyme de la bibliothèque désigne son exercice-variante à l'import, sans hésitation, et aucun ne se confond avec un autre.
155. « squat », goblet squat, squat KB → Squat kettlebell ; « hack », « hack squat » → Hack squat ; « quadri » → leg extension, presse, hack squat, squat kettlebell ; autres équivalences (pull up, hammer, preacher, Larry Scott, front raise, skull crusher, reverse pec deck, back extension, pullover, vis-à-vis).
156. Jamais confondus : curl barre droite / barre EZ, extension poulie corde / barre, développé incliné barre / haltères, développé couché barre / haltères (une prise crée toujours la variante), abduction / adduction ; « pec deck » ne trouve que le pec deck.
157. Tractions assistées : réglage « assisté » ; deux validations à 3×12 → « Moins d'aide · 3 × 8 » ; moins d'aide suivie à 3×8 valide ; plus d'aide non recommandée ne valide pas ; quatre rouges → « Plus d'aide ».
158. Récapitulatif : chaque nouvel exercice compte dans son groupe principal (shrugs et lombaires dans « Dos ») ; une variante compte dans le groupe de son exercice.
159. Base existante en version 7 : les dix-neuf exercices ajoutés une seule fois ; mollets et extension poulie reçoivent leurs variantes sans perte (synonyme appris, nom personnalisé et séances conservés) ; une variante du même nom déjà créée n'est pas doublée ; un exercice supprimé n'est pas recréé ; une sauvegarde de la version 7 ne défait aucun nom de variante.
160. (bout en bout) « squat », « hack », « mollets assis », « curl ez », « pushdown barre » ; dessins distincts debout / assis et corde / barre ; séance avec tractions assistées (champ « Aide ») et squat kettlebell : « Dos (3 séries) », « Jambes (3 séries) », « Biceps (1,5 série) » (version 1.45.0).

### Couleurs des groupes musculaires (§3.2)

161. Une couleur fixe par groupe, définie une seule fois : épaules jaune, pectoraux cyan, triceps bleu clair, dos violet, biceps rose, jambes blanc (sous-groupes compris), abdominaux gris clair ; toutes distinctes et lisibles sur le fond noir ; une seule règle CSS ; plus aucune teinte de pictogramme écrite à part.
162. (bout en bout) Bibliothèque : chaque exercice, dans chaque section de groupe, a la bordure et le fond de pictogramme de son groupe ; fiche : tous les cadres ont la couleur du groupe de l'exercice ; détail d'une séance et séance : chaque carte d'exercice a la couleur de son groupe, un bloc de cardio est neutre ; accueil sans couleur de groupe (sauf les pastilles de la carte « Séance pour compléter la semaine », version 1.40.0) ; pastilles de statut et cases du récapitulatif sans couleur de groupe.

### Dernière fois / Prochaine cible (§5.3.2)

163. (bout en bout) Fiche et carte de séance : « Dernière fois » en petit, gris clair, sur une ligne à 412 px (poids, répétitions, date « 12/03 », pastille ; au plus deux lignes pour un exercice aux haltères, « / haltère » de la cible à part, version 1.30.1), jamais tronquée à 360 et 320 px ; « Prochaine cible » sur une seule ligne en grand, en gras, dans la couleur du groupe, avec le poids ; séparateur entre les zones ; repère court quand la cible change, « = Même cible : consolide » quand elle est identique, « Poids de départ à saisir » pour un exercice jamais réalisé ; en séance, une autre charge saisie met à jour la ligne et retire repère et mention ; aucune couleur de statut hors de la pastille.

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

179. (version 1.45.0) Tractions assistées 3 séries : dos 3 séries (orange), biceps 1,5 série (indirect, ½ par série) : un seul exercice indirect reste vert, « Biceps (1,5 série) » ; un groupe non travaillé est vert, sans nombre.
180. (version 1.45.0) Curl le lundi et tractions le jeudi, 3 séries chacun : biceps 4,5 séries → orange ; avec assez de séries en plus pour atteindre le seuil (10 par défaut) → rouge.
181. (version 1.45.0) Travail seulement indirect : ½ par série, additionné ; deux exercices indirects de 3 séries → 3 séries, orange ; le rouge à partir du seuil, réglable.
182. (version 1.45.0) Groupe principal dans un exercice et secondaire dans un autre de la même séance : les séries de chacun s'additionnent (1 par série pour l'un, ½ pour l'autre), plus de « 1 au plus par séance » ; plusieurs exercices indirects dans la même séance : chacun compte ses séries pour moitié.
183. « hier » et « aujourd'hui » s'appliquent au travail indirect, même vert ou de la semaine précédente (inchangé en version 1.45.0).
184. Tri : couleur, puis « hier » ou « aujourd'hui » en dernier, puis score croissant, en séries (version 1.45.0 : un vert à 1,5 série après un vert sans rien ; à couleur égale, un groupe sans mention avant un groupe d'hier) ; seuls les groupes affichés comptent (sous-groupe secondaire des jambes dans « Jambes », abdominaux jamais par défaut) ; moteur et bilan identiques avec ou sans groupes secondaires.
185. Bibliothèque version 10 : les trois écartés n'ont plus les épaules en secondaire ; les mouvements composés gardent leur second groupe ; aucun secondaire n'est le groupe principal ni les abdominaux ; la recherche « épaules » ne trouve plus les écartés.
186. Base existante en version 9 : correction appliquée une seule fois, groupes personnalisés gardés ; une sauvegarde antérieure fusionnée ne remet pas les épaules.
187. (bout en bout) Accueil au format smartphone (version 1.45.0) : « Biceps (4,5 séries) · hier » et « Dos (3 séries) · hier » orange, « Pectoraux (3 séries) » orange, « Triceps (1,5 série) » et « Épaules (1,5 série) » verts ; tri couleur, puis « hier », puis score ; récapitulatif visible sans défilement ; cases dans le cadre, sans défilement horizontal, à 412, 360 et 320 px.

### Bilans de la semaine et du mois (§19.7)

188. Bornes : semaine du lundi 0 h 00 au dimanche (une séance commencée dimanche 23 h 30 reste dans sa semaine), mois calendaire (31 à 23 h 30 dans le mois, 1er à 0 h 00 dans le suivant) ; titres « Semaine du 19 au 25 oct. 2026 », « du 28 sept. au 4 oct. 2026 », « du 29 déc. 2025 au 4 janv. 2026 », « Octobre 2026 » ; objets du mail ; décalage d'une période (changement d'année compris) ; clé invalide refusée ; période ouverte par défaut.
189. Période sans séance : « 0 séance », comparaison et durée seulement, pesées si elles existent, rien d'inventé ; une seule pesée : une seule valeur.
190. Paliers validés de la période (+1 répétition, poids supérieur, moins d'aide et +1 répétition d'un exercice assisté) avec ancienne → nouvelle cible et date ; une seule verte ou la première verte d'une période antérieure ne sont pas listées ; rouges et passage en « poids inférieur » (« plus d'aide ») sur une ligne par exercice (« série de 4 rouges à 100 kg → poids inférieur recommandé », sinon « 2 séances rouges cette semaine (série en cours : 3 rouges à 100 kg) », version 1.42.1 quand la série a commencé avant, sans parenthèse sinon, « ce mois-ci » pour le mois) ; séances et moteur inchangés.
191. Comparaison avec la période précédente (+1, −1, « autant que »), durée en salle (une séance importée sans heure signalée « sans durée », sans comparaison de durée), cardio par machine, groupes directs et indirects, semaine et mois (« par rapport au mois précédent »).
192. Texte du mail complet, en texte brut (titres en capitales, listes « - », sans HTML), mention d'une période en cours ; lien mailto avec adresse, objet et corps encodés (retours à la ligne CRLF).
193. Bandeau : semaine écoulée à partir du lundi, mois écoulé à partir du 1er, une seule fois par période (plus affiché une fois le bilan ouvert ; ouvrir la période en cours ou une plus ancienne ne compte pas), seulement si la période contient une séance, désactivable séparément ; réglages lus ou importés contrôlés (adresse invalide écartée).
194. (bout en bout, format smartphone) Lundi : plus de bandeau sur l'accueil, pastille sur l'onglet Progrès (« Progrès : bilan prêt »), pilotée par le réglage « Signaler le bilan de la semaine » ; bandeau de la semaine seul en haut de l'onglet Progrès ; « Plus tard » masque bandeau et pastille jusqu'à la prochaine ouverture ; « Voir » ouvre la semaine écoulée avec toutes ses sections ; aucune couleur de statut, rien ne dépasse à 412, 360 et 320 px ; « Envoyer par mail » transmet l'objet et le texte au partage natif ; « Copier le texte » ; navigation précédente / suivante jusqu'à la période en cours ; onglet Mois ; bandeau et pastille disparus après ouverture, même après relance ; accès depuis le bilan de progression ; adresse invalide refusée, adresse et réglages conservés ; bouton « Mail à … » quand une adresse est renseignée ; éléments importants en gras.
195. Mise en évidence : comparaisons (y compris « autant que »), « Non travaillés », changement de cible des progressions, séances rouges de la période et « poids inférieur recommandé », valeurs des pesées ; noms, nombres de séances et dates en texte simple ; le mail sans aucune marque.

### Activités habituelles hors salle (§19.8)

196. Habitudes : badminton par défaut (lundi 21 h – 22 h 30, jambes et épaules, active) ; une liste enregistrée, même vide, est gardée ; entrées invalides écartées ; erreurs (nom vide ou en double, fin avant le début, heure invalide).
197. Question : pas avant 22 h 30 le lundi, posée à 22 h 30 (« Badminton lundi soir (21 h – 22 h 30) ? »), toujours là jusqu'au dimanche soir, disparue le lundi suivant ; habitude désactivée : aucune question ; « matin » pour une habitude du matin.
198. « Oui » enregistre l'activité à la date du lundi (« Badminton · 1 h 30 ») ; « Non » n'enregistre rien ; la question ne revient plus ; une activité supprimée n'est ni comptée ni redemandée.
199. Récapitulatif (version 1.45.0) : badminton lundi → jambes et épaules « (3 séries · badminton) · hier » le mardi, orange ; « aujourd'hui » le lundi soir ; en-tête « 3 séances · 1 activité · 45 min de cardio » ; plus de plafond par jour : presse et badminton le même jour → jambes 6 séries ; deux badmintons : « badminton ×2 » ; « hier » aussi pour la semaine précédente.
200. Bilan du mois : « Activités : Badminton ×4, 6 h 00 », groupes en séries (« Jambes : 12 séries (+4 indirect) », version 1.45.0), texte du mail ; nombre et durée des séances inchangés ; semaine sans séance avec du badminton ; moteur inchangé.
201. Export / import : activités et habitudes dans la sauvegarde (format 4), format 3 migré sans perte, activité invalide refusée, fusion sans doublon, écriture avec les séances dans une seule transaction.
202. (bout en bout, format smartphone) Question absente à 22 h, présente à 22 h 31 au-dessus du récapitulatif ; « Oui » ; mardi : jambes et épaules « (3 séries · badminton) · hier » orange (version 1.45.0) ; historique « Badminton · 1 h 30 » (ligne compacte sans « Supprimer », détail avec date et heures) ; bilan de la semaine et texte du mail ; export ; suppression confirmée depuis le détail ; « Non » ; sans réponse jusqu'au dimanche ; réglages (désactivation, nouvelle activité, erreur d'heures) ; rien ne dépasse à 412, 360 et 320 px.

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
225. (bout en bout) Sur chaque écran et chaque route de l'appli (accueil avec la question d’activité et le formulaire « + Activité » ouvert, onglets Progrès avec le bandeau et Plus, bibliothèque, fiche, modification et création d'un exercice, historique, détail d’une séance et d’une activité (habituelle ou ponctuelle), bilans, par groupe, Mon poids avec onze pesées dont des dates longues, réglages, données et aperçu d'import), dans leurs états dépliés (bibliothèque filtrée, fiche entière, réglages ouverts (case « Compte pour les jambes » des machines comprise, version 1.41.0), accueil et bilans de la semaine et du mois avec le cardio des jambes, correction d'une pesée ou d'une séance passée, confirmations de suppression), à 412, 360 et 320 px et à 360 px avec le texte à 115 % ; puis la séance (menu, ajustement, confirmation du retrait et d'un poids très différent, menu du cardio, texte à 115 %), l'ajout d'un exercice, le récapitulatif de fin et la séance oubliée : seulement les cinq tailles de police, espacements de 8, 16 et 24 px, éléments tactiles d'au moins 48 px et à 8 px au moins de leurs voisins, un seul style de titre de section, étiquettes des graphiques d'au moins 12 px, rien ne dépasse, aucun vouvoiement dans le texte affiché (§3.6). Un élément sous la barre d'onglets ou la barre du pouce reste contrôlé (atteignable en faisant défiler) ; seuls les éléments recouverts par un volet, un menu ou une fenêtre sont écartés. Les onze « Corriger » de Mon poids sont tous contrôlés (version 1.21.1). Version 1.42.0 : la fiche avec « Série en cours : 2 séances rouges » (salle et maison) et la carte avec « ↓ Nouvelle charge : séance de départ » (texte à 115 % compris). Version 1.43.0 : l'écran « Cardio », « Depuis le début » (tapis, rameur, machine retirée au nom long) ; version 1.44.0 : en barres (barres, pastille « 1/2 », barre d'inclinaison et sa légende) ; version 1.46.0 : l'onglet Progrès avec « Partager pour le coach » (avec et sans alertes). Un test par écran et par état (5 novembre 2026), chacun avec ses données (séance prévue, cardio des jambes) ; les parcours de séance (salle, séance prévue, maison, séance oubliée) restent un test chacun, leurs états se suivant.
226. (bout en bout) Cadres neutres sur l'accueil (bandeaux, récapitulatif, cases du récapitulatif inchangées), les réglages, les données, le volet de fin ; Mon poids : un seul cadre pour la liste des pesées, aucune pesée encadrée ; par groupe : cadres à la couleur du groupe ; carte d'exercice à la couleur de son groupe.

### Barre d'onglets, mode salle et bouton retour (§3.4, §5.8, version 1.20.0)

227. (bout en bout) Barre d'onglets Séance, Historique, Progrès, Plus : fixe en bas, 56 px, icône et libellé, onglet actif en couleur d'accent (`aria-current`), y compris sur les écrans de l'onglet ; onglet Séance, base vide : récapitulatif et « Démarrer une séance », aucun lien (les actions secondaires sont des boutons, §3.7) ni bandeau de bilan ; Progrès : trois bilans, « Cardio » (version 1.43.1) et Mon poids ; Plus : bibliothèque, réglages, « Importer / exporter » (écran du même nom) ; onglets d'au moins 48 px, rien ne dépasse à 412, 360 et 320 px.
228. (bout en bout) Mode salle : barre d'onglets masquée, barre du pouce fixe en bas (« + Exercice », « + Cardio », « Terminer », 48 px), liste compacte (« 35 kg · 1/3 »), un seul exercice ouvert ; « + Cardio » amène le formulaire à l'écran, « Terminer » ouvre le volet ; la flèche ramène à l'onglet Séance, séance conservée, reprise en un appui sur le même exercice ; libellés sur une ligne à 360 px avec le texte à 115 %.
229. (bout en bout) Bouton retour : Plus → Réglages → retour → Plus → retour → Séance ; Historique → détail → retour → Historique → retour → Séance ; adresse ouverte directement → retour → Séance ; fiche ouverte depuis la séance → retour → séance ; après l'ajout d'un exercice, retour → Séance (pas la recherche) ; en pleine séance, retour sur l'onglet Séance ne ferme pas l'appli (deux fois de suite) ; poids tapé sans quitter le champ enregistré, répétitions ajustées et cardio en cours retrouvés ; nom saisi au récapitulatif enregistré, retour → Séance (pas la séance terminée).
230. (bout en bout) Nombre d'appuis, chaque élément déjà à l'écran (aucun défilement) : démarrer 1, ajouter un exercice récent 2, série 1, ressenti 1, exercice suivant 0 (le ressenti du dernier ajouté ouvre le premier exercice non terminé, amené à l'écran ; changer ensuite ce ressenti ne déplace rien), cardio 2, terminer 2 (avec six exercices), garder le nom 1, pesée 2, corriger une séance passée 3, reprendre 1 ; aucun de plus qu'avant les onglets (inchangé par l'allègement des écrans au calme, §3.5).

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
239. Comptée comme une activité confirmée : récapitulatif (« 3 séries · badminton », orange, version 1.45.0, « aujourd'hui », puis « hier », « · 1 activité »), bilan et texte du mail (« Activités : Badminton ×1, 1 h 30 ; Futsal ×1, 1 h 00 »), groupes indirects ; export puis import identiques (format 4) ; marque invalide refusée ; moteur inchangé.
240. (bout en bout, format smartphone) badminton seul connu : proposé sans présélection (« Choisis une activité. ») ; futsal en habitude désactivée ; « + Activité » en bouton secondaire de 48 px sous « Démarrer une séance » (version 1.40.0) : sous « Préparer ma prochaine séance » à 412 px (ensemble, ils ne tiennent pas sur une ligne), chacun sur une ligne, côte à côte à 600 px ; puces Futsal, Badminton, Autre, futsal présélectionné et prérempli (60 min, Jambes), date du jour ; date future refusée avec un message ; enregistrée : message, en-tête « 1 activité », jambes « 3 séries · futsal » et « · aujourd'hui » (version 1.45.0), question du badminton toujours là ; deuxième ouverture : futsal en tête, présélectionné, prérempli d'après la dernière fois (2 appuis), refus d'un doublon le même jour ; « Autre » : Escalade le 21 (« Dos (3 séries · escalade) »), puis ordre Futsal, Escalade, Badminton ; après relance, historique (détail « activité ponctuelle », sans heures) et bilan de la semaine ; jamais de question pour le futsal ; rien ne dépasse à 412, 360 et 320 px. Le test 225 contrôle aussi le formulaire ouvert et le détail d'une activité ponctuelle.

### Ton de l'appli (§3.6, version 1.22.2)

241. Tutoiement : aucun texte du code de l'appli (chaînes, gabarits, texte JSX ; commentaires et tests exclus) ne contient « vous », « votre », « vos » ni d'impératif en « -ez » (« assez », « chez » admis) ; le texte du mail du bilan non plus (test 192) ; le texte affiché de chaque écran et état du test 225 non plus. Contre-test : « Choisissez une activité. » remis dans le code fait échouer le test.

### Séance prévue (§5.9, versions 1.23.0 et 1.23.2)

242. Préparation : exercices dans l'ordre, sans doublon, réordonnés, cardio prévu dans le même ordre (ajouté à la fin, remonté entre deux exercices puis en tête, gardant sa place une fois corrigé) ; charge, cible et mention du moteur comme la carte en séance (« = même cible », « ↑ Poids supérieur → 3 × 8 », poids de départ d'un exercice jamais réalisé) ; une séance libre entre-temps laisse le plan intact et fait évoluer la cible (« 3 × 9 ↑ +1 rép. ») ; démarrage 3 jours plus tard : charge et cible recalculées, séries préremplies, ordre du plan, origine `fromPlan` avec l'ordre (cardio en tête) ; exercice archivé ignoré, absent de l'ordre. À la salle : un seul ordre, cardio prévu compris ; éléments non terminés (séries ou ressenti manquants, cardio prévu pas validé) ; un cardio validé reste à sa place, retiré il redevient « prévu » ; ajouts en séance après le plan ; séance libre : exercices puis cardio.
243. Réalisation modifiée à la salle (« Valider les 3 séries », autre charge, exercice retiré ou ajouté) ; exercices et cardio prévus non faits relevés, pas enregistrés ; plan consommé à la fin, pas pendant la séance ; séance libre ou séance prévue terminée vide : plan gardé. Contrôle du plan (doublon, poids, cardio), export puis import identiques (format 5, origine comprise), sauvegarde antérieure sans plan, exercice inconnu, origine ou ordre invalides refusés ; fusion (plan de l'appareil gardé, plan réalisé non repris).
244. (bout en bout, format smartphone) Accueil sans plan puis préparation (même écran d'ajout, « déjà prévu », poids de départ, ↑ / ↓, cardio ajouté en dernier puis remonté en tête par ses flèches) avec charges et cibles affichées ; accueil avec plan (« Démarrer la séance prévue », « Séance libre », carte « Ma séance prévue » avec le résumé, qui ouvre la préparation, version 1.40.0) ; séance libre : plan intact et préparation à jour (3 × 9, « ↑ +1 rép. ») ; 3 jours plus tard : 1 appui, mode salle, ordre du plan (cardio en premier), le cardio ouvert en premier (« Valider » principal, aucune carte ouverte), validé en un appui, il reste à sa place et le premier exercice s'ouvre ; charge et cible recalculées ; « Valider les 3 séries », charge changée, séries une par une, exercice ajouté ; volet « 2 exercices prévus non faits (…) » ; séance enregistrée sans eux, avec le cardio et l'ordre prévu, plan consommé, accueil sans plan ; export puis import du plan.
245. (bout en bout) Appuis, séance de 5 exercices, sans défilement : sans plan 23 (série par série : 33), avec plan 13 (chaque exercice déjà ouvert par le ressenti du précédent ; après le dernier, rien d'autre ne s'ouvre) ; avec plan et deux cardios, en tête et entre le 2ᵉ et le 3ᵉ exercice, 15 (chaque cardio ouvert à son tour, validé en un appui, puis l'exercice suivant ouvert).
246. Migration : un plan des versions 1.23.0–1.23.1 avec deux cardios (format `exercises` / `cardio`) est lu sans perte (identifiant, dates, poids de départ, blocs), cardio après la musculation, sans modifier l'enregistrement lu ; un plan déjà au nouveau format est inchangé ; un ancien plan invalide reste refusé ; le plan migré se déplace comme un autre ; sauvegarde au format 4 avec ce plan acceptée et convertie (format 5), formats mélangés refusés ; séance démarrée en 1.23.1 (origine sans ordre) : exercices puis cardio. Bout en bout : plan au format 1.23.1 écrit dans la base, accueil et préparation dans l'ordre affiché jusqu'ici, base non réécrite à la lecture, export au format 5, cardio remonté (enregistré au nouveau format, même identifiant), même ordre à la salle.
Le test 225 contrôle aussi l'accueil avec un plan, la préparation (vide, avec cardio et suppression ouverts, menu d'un exercice et menu d'un cardio ouverts, cardio placé entre deux exercices), l'ajout à la séance prévue, la séance prévue démarrée (texte à 115 % compris) et le volet de fin avec les non faits.

### Abdos et poids du corps (§4.0, §7.13, version 1.24.0)

247. Plage 10 à 40 (réglable ; exercices à charge inchangés) ; charge nulle valide au poids du corps seulement ; première séance dans la plage standard ; deux vertes → +1 rép. ; une verte, ou vert-orange-vert : rien ; au plafond, la cible reste (« Plafond atteint »), refaire le plafond suit et valide encore ; trois rouges : rien, quatre : cible −1 (« ↓ −1 rép. »), suivie (nouveau palier, compteurs à 0) ou refusée (rouge : maintenue, verte : retirée) ; jamais sous la borne basse ; une performance avec charge est écartée du moteur.
248. Ajout sans poids de départ (3 × 10, charge 0), « Valider les 3 séries » ; correction d'une séance passée (charge nulle gardée, refusée ailleurs) ; réglage enregistré (« poids du corps » gardé, plage par défaut non recopiée) ; record « 3 × 25 » ; bilan : progression et « cible −1 rép. recommandée », jamais « 0 kg ».
249. Bibliothèque version 11 : trois exercices d'abdos au poids du corps (groupe, matériel, réglage) ; crunch machine inchangé ; recherche (« crunch » → crunch au sol en tête, heel touches, leg raise, « abdos ») ; « jambes », « legs », « leg » ne trouvent pas les relevés ; import direct (« crunch » → crunch au sol, sans demander) ; récapitulatif avec les abdos.
250. Base existante en version 10 : ajout une seule fois, séances intactes, exercice supprimé jamais recréé ; sauvegarde d'un crunch au sol sans charge identique après import ; charge nulle hors poids du corps, charge au poids du corps ou réglage invalide refusés ; sauvegarde antérieure fusionnée sans rien retirer.
251. (bout en bout) « Abdominaux » activé dans le récapitulatif ; crunch au sol ajouté sans poids de départ, sans champ de poids, « 3 × 10 », « Première fois », « 0/3 » ; deux séances → fiche « 3 × 11 », « ↑ +1 rép. », record « 3 × 10 (27 oct.) », historique et détail sans « 0 kg » ; fiche avec la mention « Poids du corps… (10 à 40) » et le seul graphique des répétitions ; récapitulatif « Abdominaux (6 séries) » orange (version 1.45.0), jambes non comptées ; carte du crunch oblique dans l'écran à 360 px. Le test 225 contrôle aussi une carte au poids du corps ouverte en séance (texte à 115 % compris).

### Planche en secondes (§4.0, §7.13, version 1.25.0)

252. Plage 20 à 60 s (réglable, « en secondes » implique le poids du corps), pas de 5 s (1 pour les autres) ; première séance standard ; deux vertes → +5 s (« +5 s »), suivie, elle valide ; une verte ou vert-orange-vert : rien ; jamais au-delà du plafond (55 → 58 s), au plafond « Plafond atteint » ; quatre rouges → −5 s, suivie ou refusée ; jamais sous 20 s (22 → 20 s) ; charge écartée ; textes « +1 rép. » et « 8 → 9 rép. » inchangés, « 30 → 35 s ».
253. Bibliothèque version 12 : planche (groupe, matériel, réglage), « planche », « gainage », « plank », « front plank », « gainage ventral » ; 3 × 20 s sans charge, « Valider les 3 séries » ; réglage enregistré (plage par défaut non recopiée, jusqu'à 600 s) ; record « 3 × 45 s » ; bilan « 3×40 s → 3×45 s », « cible −5 s recommandée », jamais « 0 kg » ; base en version 11 : ajoutée une seule fois, jamais recréée ; sauvegarde identique, `seconds` sans `bodyweight` refusé.
254. (bout en bout) « gainage » → planche sans poids de départ ni champ de poids, « 3 × 20 s », « Première fois » ; série 1 à « 20 s », « + » bloqué, « − » → 15 s ; « Valider les 3 séries » ; récapitulatif « 20 s · 20 s · 20 s », « Prochaine cible : 3 × 20 s » ; le lendemain « Dernière fois 20 s · 20 s · 20 s · 27/10 », puis « 3 × 25 s » ; enregistrées à 0 kg en secondes ; fiche « ↑ +5 s », record « 3 × 20 s », mention du gainage, graphique de la durée seul, historique « 20-20-20 s » ; détail « (cible 3 × 20 s) » ; carte à 360 px. Le test 225 contrôle aussi une carte de planche ouverte en séance.

### Salle et maison (§5.10, §7.14, version 1.26.0)

255. Suivis : à la maison, un exercice à charge a le sien (`<variante>@maison`, plage 8 à 15, réglable, assisté hérité), poids du corps et secondes un seul ; le suivi de la salle est exactement celui sans les séances à la maison ; maison : 3×12 → … → 3×15, deux vertes à 15 → poids supérieur ; crunch au sol salle puis maison : un seul suivi (+1 rép.) ; lieu d'une séance passée changé : elle passe au suivi de la maison (charge non recommandée), revenir redonne profil et évaluations identiques ; records par suivi ; bilan de progression et dernières évolutions par suivi (jamais « 12 → 6 kg ») ; réutiliser une séance à la maison : à la maison, cible de la maison ; séance libre à la salle par défaut.
256. Récapitulatif « 3 séances · dont 1 maison », groupes comptés ; bilan « 3 séances (dont 1 à la maison) », durée en salle sans la maison (sans heures : jamais « sans durée », comparaison gardée), semaine à la maison seule sans « Durée en salle », « Curl biceps haltères (maison) : 3×12 → 3×13 à 6 kg » ; indice par groupe sans la maison, séries comptées ; récents de la maison d'abord.
257. Sauvegarde au format 6 (lieu gardé), format 5 lu à la salle, lieu inconnu et plage de la maison invalide refusés ; plage de la maison enregistrée seulement si elle diffère du défaut, contrôlée.
258. (bout en bout) Accueil : « Salle » choisie par défaut sous le bouton ; séance à la salle (curl 12 kg) ; le lendemain « Maison » → « Démarrer une séance à la maison », en-tête « À la maison » sans chronomètre, poids de départ demandé (6 kg), « 3 × 8 à 6 kg », récapitulatif sans durée ; accueil de nouveau sur « Salle » après relance, « 2 séances · dont 1 maison » ; séances en base (lieu) ; fiche : « 3 × 8 à 12 kg » (salle) et bloc « Prochaine cible à la maison » « 3 × 8 à 6 kg », historique « maison » ; historique « 1 ex. · maison » ; détail sans heures, lieu « Maison » ; passé à « Salle » : heures affichées, lieu retiré en base, cible de la salle « 3 × 8 à 6 kg », plus de bloc maison ; remis à « Maison » : tout comme avant ; plage de la maison 8–15 dans Modifier, 20 enregistré (`homeMaxReps`). Le test 225 contrôle aussi l'accueil avec « Maison » choisi, la séance à la maison, son récapitulatif et son détail.
259. (versions 1.26.1, 1.28.0 et 1.45.0) Le cas de l'utilisateur : à la maison, développé incliné haltères 3 × 10 (pectoraux ; épaules et triceps secondaires) et 2 séries de crunch au sol → pectoraux 3 séries (orange), abdominaux 2 séries (vert), triceps et épaules 1,5 série chacun (vert), « aujourd'hui » pour chacun de ces groupes (secondaires compris). Depuis la version 1.45.0, la maison compte en entier, comme la salle : plus de 1/12 par série, de plafond de ½ par semaine ni de plafond de 1 par jour (deux séances à la maison, ou une à la maison et une à la salle le même jour : toutes les séries s'additionnent, test 259). Bilans de la semaine et du mois et mail : « Pectoraux : 3 séries (+3 séries maison) », « Abdominaux : 2 séries (+2 séries maison) », triceps et épaules en séries (« Triceps : 1,5 série », sans parenthèse, jamais dans « Non travaillés »), colonne « Maison (séries) » inchangée. Inchangés : séries par semaine (3 séries en plein), indice par groupe (0 séance), suivi de la maison du moteur. Les tests 256 et 258 comptent la maison en entier dans le score (test 258 : « Biceps (6 séries) » orange sur l'accueil).

### Pompes et annulation d'une séance (§4.0, §5.11, version 1.27.0)

260. Bibliothèque version 13 : pompes (pectoraux ; triceps, épaules ; poids du corps), deux variantes seulement, « Pompes — Classiques » et « Pompes — Sur les genoux », 2 séries de 10 à 40 ; 2 × 10 sans charge ; recherche (« pompes », « push-up », « pushups », « push up » : les deux, classiques d'abord ; « pompes genoux », « knee push-up » : les genoux seuls ; « pectoraux ») ; deux vertes à 2 séries → +1 rép., suivis séparés, 3 séries non standard ; record « 2 × 12 » ; récapitulatif (version 1.45.0) : pectoraux 2 séries, triceps et épaules 1 série chacun, à la maison comme à la salle ; un seul suivi quel que soit le lieu ; dessin des classiques, pictogramme des genoux ; base en version 12 : ajoutées une seule fois, jamais recréées ; sauvegarde identique.
261. Texte de la confirmation : « Rien n'a été saisi. » (exercice sans série compris), « 1 série sera perdue. », « 4 séries seront perdues. », « 1 cardio sera perdu. », « 2 cardios seront perdus. », « 4 séries et 1 cardio seront perdus. » ; supprimer une séance en cours (démarrée depuis le plan) laisse moteur, records, récapitulatif et plan identiques.
262. (bout en bout) « pompes » → « Pompes — Classiques » sans poids de départ ni champ de poids, « 2 × 10 », « 0/2 », « Valider les 2 séries » ; le lendemain à la maison (« push-up ») : « Dernière fois 10 · 10 · 26/10 », deuxième verte → « Prochaine cible : 2 × 11 » ; « pompes genoux » : autre suivi, jamais réalisé ; enregistrées à 0 kg, 2 séries ; récapitulatif « Pectoraux (4 séries) » orange, « Triceps (2 séries) » vert (version 1.45.0) ; fiche « 2 × 11 », « ↑ +1 rép. », dessin ; genoux sans dessin.
263. (bout en bout) Rien de saisi : menu « ⋯ » de l'en-tête → « Rien n'a été saisi. », rien dans la barre du pouce, « Non, continuer » principal (garde la séance), « Oui, annuler la séance » rouge → onglet Séance, aucune séance en base, pas de récapitulatif ; avec 4 séries et 1 cardio : texte exact, puis rien dans la base, le récapitulatif (« 0 séance »), l'historique ni la fiche ; démarrée depuis le plan : « 1 série sera perdue. », plan toujours proposé, même après relance ; à la maison : « 2 séries seront perdues. ». Le test 225 contrôle aussi le menu de l'en-tête, le volet d'annulation (rien de saisi, séries perdues, texte agrandi) et une carte de pompes.

### Maison au nombre de séries et séance complétée (§5.6, §5.10, §5.12, version 1.28.0)

264. (version 1.45.0) Récapitulatif : 2 séries de pompes à la maison → pectoraux 2 séries, vert ; développé incliné 3 × 10 → 3 séries, orange ; deux exercices du même groupe : séries additionnées (5) ; plus de plafond de ½ pour la semaine ni de 1 par jour (13 séries en une séance, ou trois séances de 6 séries : rouge) ; couleurs aux bornes du récapitulatif (3 et le seuil). Un exercice sans aucune série resté dans une séance terminée (salle ou maison) ne compte ni au récapitulatif ni aux bilans (« Non travaillés ») ; une performance partielle importée compte 0 série (case verte, sans nombre).
265. Compléter : seulement une séance terminée du jour, saisie dans l'appli (ni la veille, ni importée, ni en cours) ; la dernière terminée du jour ; « de ce matin », « de cet après-midi », « de ce soir » ; rouverte : en cours, pause retirée (durée reprise à 45 min), pas oubliée, exercice et cardio déjà faits fermés (jamais à finir, aucun ressenti manquant), « Rien n'a été saisi. » ; ajouts : « 2 séries seront perdues. », « Annuler les ajouts » rend la séance exacte d'avant ; terminée : une seule séance, partie fermée retirée, durée 45 + 20 min (bilan : 1 h 05), le moteur la rejoue une fois ; complétée deux fois : pauses additionnées ; sauvegarde au format 7 (pause, partie fermée d'une séance en cours), format 6 lu tel quel, pause négative ou partie fermée invalide refusées ; séance prévue complétée : cardio prévu non fait plus proposé ; à la maison, le lieu est gardé.
266. (bout en bout) Mardi 8 h à la maison (développé incliné) ; accueil : bouton secondaire « Compléter la séance de ce matin » (version 1.40.0 ; lien avant), sous le choix du lieu, au-dessus de « Préparer ma prochaine séance » ; rouverte « À la maison », développé « déjà fait », sans menu ni ouverture ; « Annuler les ajouts » sans ajout : séance du matin identique en base ; complétée avec 2 séries de pompes : une seule séance (deux exercices, plus de partie fermée), récapitulatif « Pectoraux (5 séries) » orange (version 1.45.0) ; à la salle 12 h – 12 h 30, « Compléter la séance de cet après-midi » sur l'accueil, « Compléter cette séance » principal dans le détail (« Nouvelle séance à partir de celle-ci » secondaire), chronomètre à 30:00, terminée à 18 h 15 : « 45 min », pause enregistrée, détail « 12 h 00 – 18 h 15 · 45 min » ; le lendemain, plus rien n'est proposé. Le test 74 vérifie le retrait sans « Annuler » ; le test 225 contrôle aussi l'accueil avec le lien, la séance complétée (texte agrandi compris) et le volet « Annuler les ajouts ».

### Plus tard (§5.13, version 1.29.0)

267. Séance libre : « Plus tard » sur le premier exercice → fin de liste, le suivant (leg curl) à ouvrir ; dernier de la liste remis à plus tard : le suivant est cherché depuis le début ; deux remis à plus tard dans l'ordre, remis une seconde fois il repasse dernier ; un exercice ajouté ensuite vient avant eux ; commencé (1/3) : proposé, toutes séries faites ou seul élément restant : pas proposé ; retiré de la séance : plus « plus tard » ; fin : exercices enregistrés dans l'ordre de la liste, sans `later`, moteur indifférent à l'ordre. Séance prévue : premier exercice remis à plus tard → le cardio prévu s'ouvre ; cardio prévu remis à plus tard → le leg curl s'ouvre ; plan et `fromPlan` identiques ; cardio validé : à sa place, plus proposé. Séance complétée : partie fermée jamais proposée, « Annuler les ajouts » efface `later`. Sauvegarde : `later` gardé pour une séance en cours, refusé sur une séance terminée.
268. (bout en bout) Séance libre (pec deck, leg curl, chest press), aucune flèche : « Plus tard » premier choix du menu du pec deck → ordre leg curl, chest press, pec deck, le leg curl ouvert, le pec deck fermé ; gardé après rechargement ; ressentis : chest press puis pec deck ouverts tour à tour ; seul exercice restant : pas de « Plus tard » ; enregistrée dans l'ordre suivi, sans `later`. Séance prévue (chest press, cardio prévu, pec deck) : « Plus tard » sur le chest press → le cardio prévu s'ouvre ; « Plus tard » dans le menu du cardio prévu → le pec deck s'ouvre ; plan en base et origine de la séance identiques. Le test 225 contrôle aussi le menu d'un exercice avec « Plus tard » et celui d'un cardio prévu.

### Lieu d'une séance en cours (§5.10, version 1.30.0)

269. Maison → Salle sans série : sans confirmation, charge et cible du suivi de la salle (11,5 kg 3 × 9 → 22 kg 3 × 10), poids du corps inchangé, heure de début gardée ; aller-retour sans série : la séance d'origine. Salle → Maison avec séries : l'exercice commencé et le cardio gardés tels quels ; un exercice jamais fait à la maison ne reprend pas les 12 kg de la salle (version 1.30.1) : charge vide (0), 3 × 8, poids de départ à saisir, puis 6 kg → 3 × 8 à 6 kg ; sauvegarde d'une séance en cours avec un poids de départ à saisir acceptée, charge nulle refusée dans une séance terminée ; textes de confirmation (« 1 série déjà faite restera telle quelle. », « 3 séries et 1 cardio déjà faits resteront tels quels. »…) ; terminée : suivi de la maison, salle et records de la salle identiques, récapitulatif en séries à la maison ; remise à la salle avant la fin : comptée à la salle. Séance prévue, séance complétée et séance terminée : pas de changement de lieu.
270. (bout en bout) « Maison » par erreur (pec deck, poids de départ 15 kg) ; menu de l'en-tête « Passer à la salle », « Annuler la séance » ; sans confirmation : chronomètre à 10:00 (heure de début gardée), « 3 × 9 à 30 kg », lieu retiré en base ; terminée à la salle. Le lendemain à la salle, curl aux haltères à 12 kg pas commencé et pec deck avec une série faite : « Passer à la maison », volet « 1 série déjà faite restera telle quelle. » (« Oui, passer à la maison » en premier), « Non, rester à la salle » garde la salle ; « Oui » : « À la maison », « 30 kg · 1/3 », lieu en base ; le curl (jamais fait à la maison, version 1.30.1) : « 0/3 », champ « Poids (kg / haltère) » vide, « Poids de départ à saisir », « 3 × 8 », aucun « Valider », champ quitté vide sans erreur, 6 kg saisi → « 3 × 8 à 6 kg / haltère » ; resté sans série, retiré à la fin ; terminée à la maison. Récapitulatif « 2 séances · dont 1 maison », « Pectoraux (6 séries) », salle et maison additionnées (version 1.45.0) ; fiche : salle « 3 × 9 à 30 kg », bloc de la maison. Séance complétée : menu « Annuler les ajouts » seul ; séance prévue : « Annuler la séance » seul. Non-régression sur les vraies données (`perso/`) : séance en cours reprise de la dernière séance réelle, aller-retour sans série identique, passée à la maison puis terminée sans effet sur les suivis de la salle. Le test 225 contrôle aussi le menu « Passer à la salle » et son volet (texte agrandi compris), une carte aux haltères et une carte dont le poids de départ est à saisir après « Passer à la maison » (texte agrandi compris).

### Charges aux haltères (§4.4, version 1.30.1)

271. Exercices aux haltères : matériel « haltère » ou « haltères » de l'exercice ou de sa variante (« Développé incliné — Haltères » oui, la variante à la barre non), les quatorze de la bibliothèque ; barre, machine, poulie, kettlebell, poids du corps, assisté : « kg ». Textes « 11,5 kg / haltère », « 3 × 9 à 12 kg / haltère (16 oct.) ». Aucun calcul n'additionne de charges : avec toutes les charges aux haltères doublées (total des deux haltères), indice par groupe et séries par semaine identiques sur les données simulées.
272. (bout en bout) Fiche du curl aux haltères : « 3 × 9 à 12 kg / haltère », dernière fois, « Record : 3 × 8 à 12 kg / haltère (19 oct.) », « Charge (kg / haltère) », historique « 12 kg / haltère · 8-8-8 » ; fiche du pec deck sans « haltère ». Séance : pec deck « Poids (kg) », « 30 kg · 0/3 » ; curl « 12 kg / haltère · 0/3 », « Poids (kg / haltère) », unité, confirmation « 30 kg / haltère ? C’est très différent de 12 kg / haltère. » ; « Poids de départ (kg / haltère) » pour les élévations latérales haltères ; « Record battu » et ligne de l'exercice du récapitulatif de fin (« 12 kg / haltère · 9 · 9 · 9 ») en « kg / haltère » ; charges enregistrées inchangées (12).
273. (version 1.30.2) Bilan de la semaine et texte du mail : « Curl biceps haltères : 3×8 → 3×9 à 12 kg / haltère (19 oct.) », record « 3 × 9 à 12 kg / haltère », « série de 4 rouges à 6 kg / haltère → poids inférieur recommandé », « (série en cours : 3 rouges à 6 kg / haltère) » (version 1.42.1) ; pec deck en « kg » ; dernières évolutions « 11,5 → 12,5 kg/haltère, 12 → 8 rép. », « 12 → 10 kg/haltère », « 40 → 45 kg, 12 → 8 rép. ».
274. (bout en bout, version 1.30.2) Détail d'une séance passée (« 12 kg / haltère · 8 · 8 · 8 », pec deck « 30 kg »), correction « Poids (kg / haltère) » ; séance prévue « 3 × 8 à 14 kg / haltère » (pec deck « 3 × 9 à 30 kg ») ; bibliothèque « 14 kg » puis « / haltère » dessous (pec deck « 30 kg ») ; bilan de la semaine (progressions, records, « 12 kg / haltère » d'un bloc) et texte du mail ; dernières évolutions « 12 → 14 kg/haltère, 9 → 8 rép. » sur une ligne ou sous le nom entier, rien de coupé ; rien ne dépasse à 412, 360 et 320 px. Le test 225 contrôle aussi une séance prévue avec un exercice aux haltères.

### Type d'un exercice et la chaise (§4.0, §4.5, version 1.31.0)

275. Création : trois types, « Charge (kg) », « Poids du corps (répétitions) », « Durée (secondes) », plages par défaut 8 à 12, 10 à 40, 20 à 60 s ; réglage enregistré (aucun à charge, `bodyweight`, `bodyweight` et `seconds`, plage modifiée gardée : 30 à 120 s) ; le moteur suit le type (première cible au bas de la plage, sans charge au poids du corps et en durée, poids de départ demandé à charge) ; changer de type sans historique remplace le réglage.
276. La chaise (bibliothèque version 14) : jambes, abdominaux en secondaire, poids du corps, en secondes, 20 à 90 s, cible de départ 45 ; « la chaise », « chaise », « wall sit », « chaise contre le mur » en tête de la recherche, reconnus à l'import ; jamais réalisée : 3 × 45 s sans charge ; première séance à 45 s standard, deux vertes → 3 × 50 s, plafond à 90 s ; record « 3 × 50 s » ; cible de départ ramenée dans la plage (50 à 90 → 50 ; 20 à 40 → 40), gardée seulement dans la plage ; récapitulatif : jambes 3 séries, abdominaux 1,5 série (indirect, version 1.45.0) ; base en version 13 : ajoutée une seule fois, jamais recréée ; sauvegarde identique, cible de départ non entière refusée. Les tests de la recherche (« jambes », « legs », « abdos », test 152 compris) et le test 185 (seule exception : abdominaux en secondaire de la chaise) en tiennent compte.
277. (bout en bout) « + Nouvel exercice » : « Type » en trois puces, « Charge (kg) » choisi, 8 à 12, matériel « machine » ; « Durée (secondes) » : 20 à 60 s, matériel « poids du corps » ; « Poids du corps (répétitions) » : 10 à 40 ; plage invalide signalée, rien de créé ; gainage latéral (durée, 20 à 90 s) : fiche « 3 × 20 s », « Gainage : progression par la durée (20 à 90 s) » ; burpees (poids du corps) : « 3 × 10 » ; fentes bulgares (charge) : « 3 × 8 » ; réglages en base ; « Modifier » des burpees sans historique : passés en durée (« 3 × 20 s ») ; la chaise en séance (« wall sit ») : « 3 × 45 s », « Première fois », sans champ de poids, « Valider les 3 séries » ; type figé dès qu'il y a un historique (séance en cours pour la chaise, séance passée pour les fentes) : « Type : … (déjà réalisé : non modifiable) », aucune puce ; rien ne dépasse à 412, 360 et 320 px. Le test 225 contrôle aussi le formulaire de création avec « Durée (secondes) » choisi et « Modifier » de la chaise (types proposés).

### Nom de séance calculé (§5.14, version 1.32.0)

278. Lieu puis groupes principaux par séries décroissantes, 3 au plus (« Salle · Jambes · Pectoraux · Triceps »), ordre de la séance à égalité, groupes secondaires ignorés (développé incliné : « Pectoraux »), « Abdos », sous-groupe des jambes en « Jambes », « Maison · Pectoraux · Abdos », « Salle · Cardio » / « Maison · Cardio », exercice sans série ignoré, performance partielle importée comptée, séance qui démarre « Salle » puis « Salle · Pectoraux » ; noms par défaut reconnus (avec et sans heure), noms donnés à la main gardés ; le nom suit correction, retrait, lieu et complément, le nom enregistré ne change pas ; renommer (nom libre gardé ; vide ou nom calculé : nom par défaut réenregistré, sans heure pour une séance importée) ; recherche par nom affiché et par date ; moteur et sauvegarde identiques.
279. (bout en bout) Historique : « Haut du corps », « Salle · Cardio », « Maison · Pectoraux · Abdos », « Salle · Jambes · Pectoraux · Triceps », titres sur une ligne, jour « lun.19 » à gauche ; recherche « abdos », « 19 octobre » ; détail : titre calculé, date « 19 octobre 2026 · 17 h 05 – 18 h 05 », champ prérempli ; lieu passé à « Maison » : titre « Maison · … », nom par défaut inchangé en base ; renommée « Jambes lourdes » : gardé après un changement de lieu, vide : nom calculé et nom par défaut réenregistré ; séance en cours : en-tête « Salle » puis « Salle · Pectoraux » ; récapitulatif « Salle · Pectoraux », « Garder ce nom », nom par défaut en base ; complétée le jour même avec un curl : « Salle · Pectoraux · Biceps » (en-tête, récapitulatif, historique) ; rien ne dépasse à 412, 360 et 320 px. Le test 225 contrôle l'historique et le détail avec des noms calculés (séances simulées au nom par défaut).

### Bilan par groupe musculaire, audit (§19.10, version 1.33.0)

280. Indice sans les performances incomplètes : ni point, ni base (la base est la première séance complète), ni séance du seuil (6 séances dont une incomplète : seuil non atteint) ; leurs séries réelles comptées ; base même sous la cible (8-8-6 puis 3 × 8 : 105,56) ; à la maison, groupes secondaires pour moitié dans les séries ; Abdominaux dans le sélecteur, sans indice, séries comptées (planche 1 série sur 2 : 1).
281. (bout en bout) Dos stable puis 51,9 kg : « Dos : 99,8 », axe étiqueté 100, 95, 105, points à moins de 4 px l'un de l'autre, texte « Indice de progression dos : 6 points, de 100 le 12 oct. à 99,8 le 29 oct. » ; pectoraux à 120 : axe élargi (120, 100, 95) ; triceps : extension poulie barre incomplète absente de l'indice, ses 2 séries comptées (6,5 la semaine du 26 oct.) ; Abdominaux : message, aucun indice, séries 2, 1, 3 ; fiche : « de 52 kg le 12 oct. à 51,9 kg le 29 oct. » ; rien ne dépasse à 412, 360 et 320 px. Le test 220 étiquette aussi la borne 95 ; le test 225 contrôle aussi l'onglet Abdominaux.

### Séries par semaine : début et moyenne (§19.10, version 1.34.0)

282. Barres depuis la semaine de la première séance terminée (à la maison, d'un autre groupe ou importée sans heure comprises ; une séance en cours ne compte pas), semaines vides ensuite gardées, 12 au plus ; moyenne de la première semaine du groupe à la dernière terminée, vacances comprises, sans la semaine en cours (elle y entre le lundi suivant, pas le dimanche soir) ; sous le seuil, sans séance : pas de moyenne.
283. (bout en bout) Première séance le 6 oct. : cinq barres du 5 oct. au 2 nov. ; « Moyenne : 3 » ((6 + 0 + 3) ÷ 3), ligne en pointillés à mi-hauteur de la barre de 6, étiquette sans chevauchement, barres de 32 px au plus ; totaux dessinés après la ligne et détourés de la couleur du fond ; semaine en cours : dernière barre, opacité 0,45 et contour, « en cours » sous sa date, dates sur une même rangée ; légende courte sur deux lignes au plus à 412 et 360 px ; texte du lecteur d'écran complet (« … semaine du 2 nov. 2 (en cours). Moyenne : 3, semaine en cours exclue. Depuis ta première séance… ») ; le lundi 9 nov., « Moyenne : 2,8 » ; abdominaux sous le seuil : ni graphique ni moyenne ; rien ne dépasse à 412, 360 et 320 px. Le test 281 lit aussi la moyenne dans le texte du lecteur d'écran ; le test 225 contrôle l'étiquette de la moyenne (données simulées).

### Bilan de la période en images (§19.7, version 1.35.0)

284. Première période suivie (la précédente entièrement avant la première séance) ; cardio et activités comparés, semaine en cours comprise (même portion) ; barres des groupes en séries (version 1.45.0 : maison en entier, plus de plafond) ; un jour par jour du mois (salle, maison, activités) ; échelles : 8 à 12 puis « +kg » (« −aide »), passage au poids supérieur, plage de la maison, poids du corps et secondes sur 5 crans sans « +kg », cible sous la plage ; ligne sous le nom ; texte du mail inchangé.
285. (bout en bout) Semaine : référence, tuiles (« ▲ +2 », « = autant », « ▲ +10 min », « ▲ +1 »), pas de calendrier, tableau des groupes (versions 1.36.0, 1.37.0 et 1.45.0 : pectoraux 1 · vide · 11, total en séries sous le nom, le bâton le plus haut ; jambes vide · 1 · vide ; dos cases vides lues « 0 », bâton vide ; bâton à la couleur du groupe ; plus de mini-barre ; en-têtes complets, abrégés seulement à 320 px ; tableau dans son cadre), couleur du groupe, aucune couleur de statut, échelles du chest press et de la planche, phrase du lecteur d'écran, mail inchangé ; semaine précédente : « Première semaine suivie », aucun écart, le mail aussi (« 1 séance, première semaine suivie », durée sans comparaison) ; octobre : « Premier mois suivi » (écran et mail), calendrier au-dessus des tuiles (31 jours, trois cases vides avant le jeudi 1er, ● ○ ◆), pectoraux 2 · vide · 14, total en séries sous le nom (maison en entier, version 1.45.0) ; semaine en cours : « Par rapport à lun.–ven. de la semaine dernière » ; rien ne dépasse à 412, 360 et 320 px. Les tests 194 et 202 / 240 (activités) lisent les tuiles et les barres ; le test 225 contrôle l'écran du bilan (semaine et mois).
286. (version 1.35.1) Mail d'une première période suivie : « premier mois suivi » / « première semaine suivie » au lieu de l'écart (semaine terminée ou en cours), durée en salle sans comparaison, seules ces deux lignes diffèrent du texte d'avant, caractère pour caractère ; période suivante comparée comme avant ; semaine entièrement avant la première séance ou aucune séance : jamais « première ». Le test 256 lit « première semaine suivie » (et la comparaison de durée avec la maison sur une semaine comparée) ; le test 194, « 7 séances, premier mois suivi » ; sur les vraies données (export du 27/10), seules les lignes des séances des premières périodes changent.
287. (versions 1.37.0 et 1.37.1) Noms sous les bâtons sur une ligne : entiers s'ils tiennent (6 px d'écart), sinon trois lettres (sept groupes à 412, 360 et 320 px, et à 360 px avec le texte agrandi ; six groupes à 320 px avec le texte agrandi) ; deux rangs alternés seulement à 320 px avec le texte agrandi et sept groupes ; trois lettres pour chaque groupe (« Pec », « Dos », « Épa », « Bic », « Tri », « Jam », « Abd »).
288. (bout en bout, versions 1.37.0 et 1.37.1) Bâtons au-dessus du tableau, un par groupe dans l'ordre du récapitulatif ; texte du lecteur d'écran avec les totaux en séries (« Total par groupe, en séries : pectoraux …, dos 0, … », version 1.45.0) et aucune valeur affichée ; le plus travaillé à 96 px, les autres en proportion ; dos non travaillé : bâton en pointillés, nom gris ; six groupes : trois lettres sur une ligne à 412, 360 et 320 px, et à 320 px avec le texte à 115 % ; sept groupes (abdominaux au récapitulatif) : une ligne à 320 px, deux rangs seulement à 320 px avec le texte à 115 %, de nouveau une ligne à 360 px ; jamais de chevauchement, de nom hors du cadre ni de texte incliné, 13 px au moins. Le test 285 lit les chiffres du tableau (sans mini-barre) et la hauteur des bâtons.

### Alerte « groupe moins travaillé » (§19.11, version 1.38.0)

289. Données simulées : le dos (3 et 3 séries) sous la moyenne des 8 semaines d'avant, vacances comprises (5,25), mêmes séries que le graphique ; pectoraux en baisse une seule semaine (6 puis 3) : rien ; sans vacances, moyenne 6 ; vacances les 2 dernières semaines : tous les groupes, 3 lignes au plus, dans l'ordre des groupes ; une semaine égale à la moyenne n'alerte pas ; 5 semaines terminées : rien, 6 (4 de référence) : l'alerte ; groupe commencé tard (2 semaines de référence) : rien ; semaines terminées seulement (dimanche soir : rien, lundi 0 h 00 : l'alerte) ; séance en cours non comptée ; première séance en octobre : rien le 3 novembre ; données simulées jamais chargées par l'application.
290. Chiffres de l'alerte (version 1.38.1) : « 3 séries par semaine depuis 2 semaines (ta moyenne : 5,3) », moyenne des 2 semaines et une décimale (« 4,3 », « 0,8 série », « 0 série ») ; « Ignorer » : masquée (même le dimanche suivant), de retour quand la semaine suivante est encore sous la moyenne (nouvelle semaine), plus d'alerte si le groupe se reprend ; seulement les groupes du récapitulatif (abdominaux s'ils y sont) ; le plus en retrait d'abord, puis l'ordre des groupes ; mémoire de l'appareil contrôlée.
291. (bout en bout, format smartphone) Données simulées : « Dos : 3 séries par semaine depuis 2 semaines (ta moyenne : 5,3) » juste sous le récapitulatif, sans soulignement, seul le nom en gras, la ligne entière dans le lien (version 1.38.1), « (ta moyenne : … ) » d'un bloc à 412, 360 et 320 px et avec le texte à 115 %, « Ignorer » ; pastille « Progrès : groupe sous ta moyenne » ; 15 px, 48 px, 8 px d'écart, rien ne dépasse, « Démarrer une séance » à l'écran, à 412, 360 et 320 px et à 360 px avec le texte à 115 % ; un appui : bilan du dos sur les séries par semaine (3, 3, semaine en cours 0 ; onze semaines : dates « 31 août », « 28 sept. », « 9 nov. » sans chevauchement à 412, 360 et 320 px), onglet Progrès actif, « retour » à la Séance ; la même ligne sur l'onglet Progrès ; « Ignorer » : ligne et pastille disparues, même après relance (méta `groupAlertsIgnored`) ; une semaine plus tard encore sous la moyenne : de retour (« ta moyenne : 5 ») ; vacances les 2 dernières semaines : sur l'onglet Séance, une ligne « 3 groupes sous ta moyenne : Pectoraux, Dos, Épaules » qui mène à l'onglet Progrès (version 1.40.0), où sont les trois lignes (« 0 série par semaine… (ta moyenne : 6) », « 4,5 ») et leurs « Ignorer » ; avec un bilan prêt : une pastille, « Progrès : bilan prêt, groupe sous ta moyenne » ; historique trop court ou une seule semaine en baisse : ni ligne ni pastille. Cas le plus chargé (version 1.40.0 : question d'activité, 7 groupes, 3 alertes, séance à compléter, suggestion, rappel de sauvegarde, sans puis avec séance prévue ; version 1.41.1, en plus, sans puis avec séance prévue, 50 min de tapis dans la séance du matin, à 4 exercices de jambes, « Jambes (15 séries · +50 min cardio) · aujourd’hui » (version 1.45.0) : titre du récapitulatif complet à 412 × 915, 360 × 800 et 360 × 800 px avec le texte à 115 % ; à 320 × 711 px, forme `compact` (titre court, « Jambes (15 séries) · aujourd’hui ») ; sans cardio, titre complet à 320 × 711 px) : « Démarrer » entièrement au-dessus de la barre d'onglets, sans défiler, 48 px, 8 px, rien ne dépasse, à 412 × 915, 360 × 800 et 320 × 711 px et à 360 × 800 px avec le texte à 115 %. Le test 225 contrôle aussi l'accueil (ligne de résumé) et l'onglet Progrès (trois alertes).

### Séance pour compléter la semaine (§5.15, version 1.39.0)

292. Données simulées (version 1.45.0, objectif 10 séries), jeudi 12 nov. 9 h : scores pectoraux 9, dos 3, épaules 6, triceps 6, jambes 6, biceps 4,5 ; pectoraux et dos (travaillés hier à la salle) écartés ; proposés, dans l'ordre de la séance : leg extension, presse (2ᵉ exercice des jambes), élévations latérales, extension triceps poulie, curl haltères ; à l'objectif ensuite : jambes ; encore sous l'objectif : pectoraux et dos (écartés), épaules, biceps, triceps ; échauffement : tapis 10 min (premier cardio du lundi). Le vendredi, après une séance le jeudi : chest press, tirage horizontal, tirage vertical (2ᵉ exercice du dos), élévations latérales, extension triceps, curl ; à l'objectif : pectoraux, épaules, biceps, triceps ; encore sous l'objectif : dos et jambes (les jambes écartées, faites la veille) ; le rameur de cette séance en échauffement. Rien le lundi avant une séance à la salle, ni après une séance à la maison seulement, ni le dimanche après une séance à la salle, ni quand tout est à l'objectif ; séance en cours non comptée ; la maison n'écarte rien ; un exercice dont un groupe secondaire a été travaillé la veille passe après ; 6 au plus (« pas de place ») ; abdos en bonus, hors des 6, écartés s'ils ont été travaillés la veille ; exercice à charge fait seulement à la maison, fait il y a plus de 6 semaines ou archivé : jamais proposé ; sans cardio : pas d'échauffement ; échéance (version 1.40.1) : « aujourd'hui » le dimanche seulement, pas pour le jeudi, le vendredi proposé le jeudi, ni le dimanche proposé le samedi ; données simulées jamais chargées par l'application.
293. « Démarrer cette séance » : séance prévue avec l'échauffement en tête, charge et cible du moteur, à la salle ; terminée, elle ne consomme pas la séance prévue enregistrée. « En faire ma séance prévue » : échauffement (nouvel identifiant) puis exercices ; la ligne de l'accueil disparaît quand le plan reprend ses exercices.
294. (bout en bout, format smartphone) Carte « Séance pour compléter la semaine », « D'ici dimanche · 5 exercices » (versions 1.40.1 et 1.45.0), pastilles Jambes, Épaules, Triceps, Biceps à la couleur de leur groupe (13 px), cadre neutre, juste au-dessus de « Préparer ma prochaine séance », 48 px (version 1.40.0), « Démarrer une séance » à l'écran ; écran : onglet Séance, échauffement « Tapis de marche · inclinaison neutre · 10 min », cinq cartes à la couleur de leur groupe (leg extension, presse, élévations latérales, extension triceps poulie, curl haltères) (« 3 × 11 à 40 kg », « ↑ +1 rép. », « 3 × 11 à 8 kg / haltère »), « … encore sous 10 séries cette semaine. », « Avec cette séance, à l'objectif : Jambes. », « Encore sous l'objectif : Pectoraux, Dos, Épaules, Biceps, Triceps. », « Pas cette fois (séance à la salle hier) : Pectoraux, Dos. » ; rien ne dépasse, éléments tactiles de 48 px à 8 px l'un de l'autre, à 412, 360 et 320 px et à 360 px avec le texte à 115 % ; « En faire ma séance prévue » : plan en base, ligne disparue ; avec une séance prévue : ligne sous son résumé, « Remplacer ma séance prévue », « Non » la garde, « Oui, remplacer » la remplace ; « Démarrer cette séance » : échauffement prévu en tête, validé, leg extension ouvert, séance terminée (origine distincte du plan, cardio enregistré), séance prévue intacte ; de retour sur l'accueil, recalculée pour demain (« D'ici dimanche · 6 exercices », Pectoraux, Dos, Épaules, Triceps, Biceps ; à l'objectif : Pectoraux, Épaules, Biceps, Triceps ; encore sous : Dos, Jambes ; jambes écartées, faites aujourd'hui) ; biceps à 9 : complété par le tirage proposé (groupe secondaire) ; lundi matin avant une séance à la salle : rien ; dimanche matin : « Aujourd'hui · … » et « À faire aujourd'hui, à la salle : … ». Le test 225 contrôle aussi l'accueil avec la ligne, l'écran et la confirmation « Remplacer ma séance prévue ».

### Cardio pour les jambes (§19.6, versions 1.41.0 et 1.41.1)

295. Machines : tapis, vélo elliptique, vélo, « Autre » et toute machine ajoutée comptent, le rameur non ; une liste enregistrée avant la version 1.41.0 (sans la case) : le rameur, même renommé, ne compte pas ; la case est gardée à la lecture, une valeur invalide écartée. Récapitulatif (version 1.45.0) : 20 min de tapis + 25 min de vélo à la maison, cardio seul → jambes 3 séries, orange, « 3 séries · +45 min cardio », sans « hier » ; 44 min : rien ; rameur exclu (60 min de rameur + 30 de tapis : rien), elliptique, « Autre » et une machine ajoutée comptés ; réglage changé (rameur coché, tapis décoché) suivi ; machine retirée de la liste : règle par défaut ; 200 min → 3 séries (une fois par semaine), total réel affiché ; leg extension 3 séries et 50 min de tapis le même jour : 6 séries, « 6 séries · +50 min cardio » ; avec des séries à la maison : 12 séries, rouge ; cardio de la semaine précédente, séance en cours : rien ; lundi suivant : rien ; autres groupes et en-tête identiques.
296. Bilans : semaine du 5 oct. (50 min, salle et maison) : « Jambes : 3 séries (+50 min cardio) », bâton 3 séries, jambes travaillées (version 1.45.0) ; semaine du 19 (40 min, rameur exclu) : « Jambes : 3 séries (1 séance) », sans cardio ; semaine du 26 (62 min sur la semaine) : 3 séries, comme le récapitulatif ; octobre : semaine par semaine dans le mois (le 1er : 45 min ; semaine du 5 : 50 ; semaine du 26 : 42 en octobre, rien) → « Jambes : 9 séries (1 séance, +95 min cardio sur 2 semaines) », 3 séries par semaine comptée dans le bâton ; réglage suivi. Séries par semaine, indice par groupe, alerte « groupe moins travaillé » et profil du moteur identiques avec ou sans cardio. Séance pour compléter la semaine : 3 séries de plus pour les jambes avec 50 min de tapis, rien avec le tapis décoché ; l'échauffement proposé (40 min de tapis) compte dans « Avec cette séance, à l'objectif ». Vraies données (`perso/`, exports du 27/10 et du 30/10) : 11, 33 et 20 min les semaines du 12, 19 et 26 octobre, récapitulatifs et textes des bilans identiques à ceux sans cardio compté.
297. (bout en bout, format smartphone) 35 min comptées (tapis 20, elliptique 15 ; rameur 15 exclu) : « Jambes » ; séance de cardio seul, 10 min de vélo : « Jambes (3 séries · +45 min cardio) », orange (version 1.45.0), pectoraux et dos inchangés ; Réglages › Machines de cardio : « Compte pour les jambes » cochée sauf pour le rameur, cochée pour « Marches » ajoutée, cases de 48 px dans l'écran à 412, 360 et 320 px ; rameur coché et elliptique décoché, enregistrés en base (`legs`), gardés après rechargement ; tapis décoché : « Jambes », recoché : « +45 min cardio » ; case dans le cadre du récapitulatif à 412, 360 et 320 px ; bilan de la semaine : bâton des jambes à 3 séries, « Jambes : +3 séries pour 45 min de cardio. », mail « - Jambes : 3 séries (+45 min cardio) » (version 1.45.0) ; bilan d'octobre : « 1 semaine à 45 min ou plus (45 min) », mail « (+45 min cardio sur 1 semaine) » ; rien ne dépasse. Le test 225 contrôle aussi les réglages des machines avec la case, l'accueil avec « +60 min cardio » et les bilans de la semaine et du mois avec la phrase du cardio ; les tests 235 et 124 comptent les champs de nom des machines.
298. (versions 1.41.1 et 1.45.0) Titre du récapitulatif : quatre formes, complète, sans « · 50 min de cardio », sans les noms de jours (« Semaine du 26 oct. au 1 nov. », « Semaine du 9 au 15 nov. »), puis `compact` (titre court, et la case Jambes sans « +50 min cardio », ses séries comptées) ; forme par défaut inchangée. Le test 291 vérifie le choix de la forme à l'écran.

### Réglages entre fenêtres et ordre de l'historique (§7.9, §12, version 1.41.2)

299. (unitaire et bout en bout) Deux fenêtres : « Abdominaux » ajouté au récapitulatif dans l'une apparaît sur l'accueil de l'autre sans rechargement ; tapis décoché (« Compte pour les jambes ») dans l'une, décoché dans les réglages ouverts de l'autre, où une machine ajoutée ensuite ne le recoche pas (base : tapis `legs: false` et la nouvelle machine) ; une fenêtre sans canal entre fenêtres reprend le réglage en revenant au premier plan. Ordre : séance importée sans heure et séances du même jour à 8 h et 18 h, activité à 21 h : ordre du moteur (matin, soir, activité, séance sans heure), séance dont la date a été changée rangée à sa nouvelle date ; récents dans le même ordre ; bout en bout : historique (la séance importée en premier), « Dernière fois » du pec deck à 35 kg (séance importée), récents Pec deck, Leg curl, Chest press. Contre-test : sur la version 1.41.1, les deux tests de bout en bout échouent.

### Calendrier, groupes et score : une seule définition (version 1.41.3)

300. (unitaire) Calendrier (`src/domain/calendar.ts`) : lundi 0 h 00 de la semaine, y compris le dimanche du passage à l'heure d'hiver ; semaine du lundi au lundi suivant 0 h 00 ; date « AAAA-MM-JJ » en heure locale, décalée d'un jour (fin de mois, février) ; début d'une séance sans heure à minuit ; matin avant midi, après-midi avant 18 h, soir ensuite. Groupes (`src/domain/muscleGroups.ts`) : ordre de la bibliothèque identique à celui des libellés, ordre du récapitulatif, sept groupes principaux, sous-groupes des jambes rattachés à « Jambes » (seulement si « Jambes » est affiché et le sous-groupe non). Score : `groupScore` donne le score de chaque case du récapitulatif (données simulées). Travail (`countsAsWork`) : une performance partielle importée compte, y compris pour « la veille » de la séance pour compléter la semaine (dos écarté) ; contre-test sur l'ancienne règle. Non-régression : tout ce que calculent l'appli (moteur, récapitulatif, alertes, suggestion, bilans et leur écran, groupes, noms de séance, récents) est identique à la version 1.41.1 sur les deux vrais exports, jour par jour du 12 octobre au 5 novembre (`perso/`), et les 60 écrans capturés de chaque export sont identiques.

### Changer la date d'une séance passée (§10, version 1.41.4)

301. (unitaire et bout en bout) Séance du dimanche 25 octobre 2026 (passage à l'heure d'hiver), 18 h – 19 h, déplacée au lundi 26 : début et fin le lundi à 18 h et 19 h (durée 1 h), nom par défaut « Séance du 26 octobre 2026 — 18 h 00 » ; récapitulatif (2 séances la semaine du 26 avec celle du lundi 8 h, 0 la semaine du 19), bilans de la semaine (2 et 0), séries par semaine (6 séries de pectoraux la semaine du 26) et moteur (après la séance du lundi 8 h, son palier en dernier) la rangent tous dans la nouvelle semaine ; séance sans heure : toujours sans heure, nom importé à la nouvelle date ; nom donné à la main gardé ; même date : rien ne change. Bout en bout : date changée dans le détail, en-tête « 26 octobre 2026 · 18 h 00 – 19 h 00 », séance en base, récapitulatif « 1 séance » et « Pectoraux (3 séries) » (version 1.45.0), bilan de la semaine du 26, recherche « 26 octobre ». Contre-test : sur la version 1.41.3, les deux tests unitaires et le test de bout en bout échouent.

### Séances « Mal passé », série de rouges et séance de départ (§5.3.2, §7.8, versions 1.42.0 et 1.42.1)

302. Séquences de la simulation du 6 novembre 2026, au même poids : alternance Mal / Très mal → rouges 0, 1, 1, 2, 2, 3, 3, 4, « poids inférieur » après la 8ᵉ ; le curl de l'utilisateur (Mal, Très mal, 8-8-6 Mal, Très mal, Mal) → 0, 1, 1, 2, 2 ; jamais de baisse pour Mal ×6, Très mal ×2 puis Mal ×4 (2 au plus), une mauvaise passe suivie d'un retour au vert, malade une semaine, un débutant qui rate une série de temps en temps, un débutant bloqué à 3×10, un ressenti oublié (« Moyen » et « inconnu » remettent à 0) ; 8-7-7 « Mal » reste rouge ; nouveau poids : compteur reparti ; baisse déjà proposée : « Mal » (8-8-8 ou 8-8-7) la laisse (refus, 4 rouges), « Moyen » ou une verte la retire, une rouge la maintient (5) ; au poids du corps, cible −1 à la 4ᵉ rouge. Non-régression : vraies données (exports du 27/10, du 30/10 et du 6/11, jour par jour, `perso/`) identiques à la version 1.41.4. Contre-test : sur la version 1.41.4, les cinq tests échouent.
303. (unitaire et bout en bout) Carte : 10 kg au lieu de 12 sans recommandation → « ↓ Nouvelle charge : séance de départ » (« 3 × 8 à 10 kg », aucun repère), 14 kg → « ↑ … », 12 kg → rien, charge à saisir → rien ; « poids supérieur » recommandé : plus lourd suivi → rien, plus léger → « ↓ … » ; « poids inférieur » recommandé (pec deck, quatre rouges) : 35 kg suivi → rien ; dips assistés, 35 ou 25 kg d'aide → « Nouvelle aide : séance de départ », sans flèche ; le moteur traite la séance en changement non recommandé (ne valide pas, la suivante valide). Fiche : « Série en cours : 2 séances rouges » juste sous « Record » (Très mal, Mal, Très mal), jamais dans « Dernière fois », aussi dans le bloc « à la maison » ; pec deck à quatre rouges : « ↓ Poids inférieur », pas de série ; après la séance à 10 kg : historique « cible 3 × 8 · Bien passé · séance de départ » (une seule ligne), plus de série à la salle ; pec deck suivi : pas marqué. Le test 225 contrôle aussi la fiche avec la série en cours et la carte « ↓ Nouvelle charge : séance de départ » (texte à 115 % compris). Contre-test : sur la version 1.41.4, trois des quatre tests unitaires et le test de bout en bout échouent.
304. (version 1.42.1) Bilans : Très mal, Mal, Très mal la semaine précédente, puis Mal, Très mal → « Presse à cuisses : 1 séance rouge cette semaine (série en cours : 3 rouges à 100 kg) » ; puis Mal, Très mal → « série de 4 rouges à 100 kg → poids inférieur recommandé (25 oct.) » ; jamais « de suite », à l'écran comme dans le mail ; tests 190, 192, 248, 253 et 273 mis à jour. Bout en bout (test 303) : bilan de progression, « série en cours : 2 rouges » pour le curl à la salle et à la maison, ni « de suite » ni « consécutives ». Contre-test : sur la version 1.42.0, les tests 190, 192 et 304 et le test 303 de bout en bout échouent.

### Écran « Cardio » (§19.12, version 1.43.0)

305. (unitaire et bout en bout) Périodes : semaine du lundi 0 h 00 (dimanche 23 h dans la semaine précédente, lundi 0 h 00 dans la nouvelle), mois calendaire, depuis le début ; séances terminées seulement, salle et maison, rameur compris, séance en cours exclue ; par machine : temps, nombre de fois, distance sur les fois saisies, minutes par inclinaison ; machine renommée sous son nom actuel, machine retirée sous le nom de son dernier bloc ; pourcentages entiers de somme 100 (10/10/10 → 34, 33, 33) ; calcul pur. Bout en bout : « Cardio » juste sous « Par groupe musculaire », au-dessus de « Mon poids » (version 1.43.1), rien sur l'accueil ; onglet Progrès actif ; puces « Cette semaine » (par défaut), « Ce mois », « Depuis le début » ; total « Semaine du 2 au 8 nov. 2026 », « 1 h 11 · 4 fois · 2 machines » ; tapis « 1 h 00 · 2 fois · moyenne 30 min », « Distance : 1,2 km · moyenne 1,2 km · sur 1 fois sur 2 », « Inclinaison : neutre 25 % · moyenne 75 % · haute 0 % » ; rameur sans inclinaison ; mois et depuis le début (machine retirée « Stepper », tri par temps) ; rien ne dépasse de l'écran ni des cartes à 412, 360 et 320 px, chaque élément entier ; cartes neutres, aucun graphique ; puce gardée au retour ; « retour » vers Progrès ; semaine sans cardio : « Aucun cardio cette semaine. ». Contre-test : sans l'écran (version 1.42.1), le test de bout en bout échoue ; avec les espaces de séparation dans les segments insécables (lignes qui ne se coupent pas), le test 305 et le test 225 « Cardio » échouent (débordement) ; avec un nom de machine à 18 px, le test 225 « Cardio » échoue (tailles de police). Version 1.43.1 : avec l'entrée « Cardio » à son ancienne place (dernière, sous « Mon poids »), le test de bout en bout échoue. Version 1.44.0 (présentation en barres) : temps en tête (« 1 h 00 », « 11 min ») ; barres du temps « 85 % du temps total », « 15 % du temps total », toutes blanches, 16 px, longueurs 56,7 %, 28,4 % et 14,9 % (80, 40 et 21 min sur 141) ; détails « 2 fois · moy. 30 min · 1,2 km · moy. 1,2 km » et la pastille « 1/2 » (lecteur d'écran : « distance notée 1 fois sur 2 »), « 1 fois · moy. 40 min » sans distance ; inclinaison du tapis en fine barre séparée sous les détails, 8 px, sur toute la largeur (18,8 %, 56,3 %, 25 %), lecteur d'écran « Inclinaison : neutre 25 %, moyenne 75 %, haute 0 % », légende « neutre », « moyenne », « haute » ; rien pour le rameur ; détails sur deux lignes à 320 px, chaque élément entier. Contre-test : avec l'écran de la version 1.43.1, il échoue. Version 1.44.1 : segments neutre (vide, contour #90949e), moyenne (#90949e), haute (blanc pur), séparés de 2 px, largeurs proportionnelles au temps (à 0,5 point près), un niveau à 0 % absent (semaine : deux segments), légende aux mêmes teintes, contrastes calculés sur les couleurs affichées d'au moins 3:1 (contour neutre / fond, moyenne / fond, neutre vide / moyenne, moyenne / haute, haute / fond). Contre-tests : avec l'écran de la version 1.44.0, ou avec l'ancien gris clair #b4bcc8 pour la moyenne, il échoue.

### Récapitulatif en séries (§19.6, version 1.45.0)

306. (unitaire et bout en bout) Score en séries : identique à `groupWeeklySets` (graphique « Séries par semaine ») sur les données simulées, une séance sur trois à la maison, 21 semaines × 7 groupes ; une activité confirmée +3 par groupe, deux le même jour +6, aussi le jour d'une séance de jambes ; cardio des jambes : 45 min +3, 44 min rien, 3 au plus par semaine ; couleurs aux bornes (vert sous 3, orange de 3 au seuil exclu, rouge au seuil) avec les seuils 10, 6 et 20 ; libellés (« 15 séries », « 1,5 série », « badminton ×2 », « +50 min cardio ») ; tri. Contre-tests : une grosse séance de jambes de 12 séries est rouge (orange avant), deux curls de 3 séries orange (rouge avant). Bout en bout, jeudi 22 oct. 2026 (lundi grosse séance de jambes 4 × 3 séries et tirage vertical, mardi curl haltères, mercredi curl barre droite) : pectoraux, épaules et triceps verts, « Dos (3 séries) » orange, « Biceps (7,5 séries) · hier » orange, « Jambes (12 séries) » rouge ; seuil à 12 : jambes rouges, à 13 : orange (`redSets` 13 en base, gardé après relance) ; avec un badminton et 50 min de tapis : « 4 séances · 1 activité · 50 min de cardio », « Épaules (3 séries · badminton) » orange, « Jambes (18 séries · badminton · +50 min cardio) » rouge ; rien ne dépasse à 412, 360 et 320 px.
307. (unitaire et bout en bout) Seuil du rouge en séries : ancien seuil converti (2 → 10, 3 → 15, 4 et 7 → 20), 6 et 20 gardés, 5, 21 ou une valeur invalide → 10 ; un `redSets` valide l'emporte sur `redThreshold` ; une sauvegarde au format 7 avec `redThreshold` restaurée convertie, l'export écrit `redSets` sans `redThreshold`, réimport identique. Bout en bout : séance du jour (pectoraux 10 séries, triceps 15, biceps 2) : pectoraux et triceps rouges, biceps vert au seuil 10 ; Réglages, « Rouge à partir de (séries) » à 10, « − » jusqu'à 6 puis désactivé (méta `redSets` 6), « + » jusqu'à 20 puis désactivé ; à 20, pectoraux et triceps orange ; 48 px, rien ne dépasse à 412, 360 et 320 px ; base antérieure avec `redThreshold` 2 → 10, 3 → 15 (pectoraux orange, triceps rouge) ; export `redSets` 10 sans `redThreshold`.
308. (unitaire et bout en bout) Bilans en séries : bâtons = `groupWeeklySets` + 3 par activité + 3 par semaine de cardio des jambes, même total que le récapitulatif, semaine et mois (cardio semaine par semaine) ; texte du mail (« Pectoraux : 6,5 séries (1 séance, +2 séries maison) », « Jambes : 12 séries (1 séance, +1 indirect, +100 min cardio sur 2 semaines) ») ; contre-test sur l'ancien calcul ; groupes secondaires à la maison hors de « Non travaillés », sans « () » ; performance partielle seule : « Dos : 0 série (1 séance) ». Bout en bout : « N séries » en 13 px gris sous le nom du groupe, hauteur des bâtons proportionnelle au total (à 0,5 px près), phrase du cardio de la semaine et du mois, texte du mail, rien ne dépasse à 412, 360 et 320 px, « N séries » sur une ligne dans le cadre, aussi à 320 px avec le texte à 115 %.
309. Séance pour compléter la semaine : objectif 10 séries, qui suit le réglage (6 et 20) ; 2 exercices au plus par groupe ; 6 au total (les mollets sans place) ; groupe complété par un groupe secondaire, contre-test biceps à 6 : son propre curl ; règle des 4 exercices au moins ; séries standard dans la projection : pompes à 2 séries → 3 + 2 = 5, sous un objectif de 6 ; contre-test, pompes à 3 séries : à l'objectif ; avec 3 séries écrites en dur dans la projection, le test échoue.

### Export pour le coach (§19.13, version 1.46.0)

310. (unitaire) Semaine exportée : la dernière terminée (lundi 16 nov. → du 9 au 15, `myfitapp-coach-2026-11-09.txt` depuis la version 1.47.1, « Semaine du 9 au 15 nov. » ; dimanche 15 au soir → du 2 au 8 ; « du 26 oct. au 1 nov. », « du 28 déc. 2026 au 3 janv. 2027 ») ; bouton seulement avec une séance terminée avant la semaine en cours. Données simulées (§19.10) avec, dans la semaine du 19 oct., un pec deck rouge (8-5-5, « très mal »), un curl plus léger sans recommandation (séance de départ), 50 min de tapis, une séance à la maison, une séance importée avec une performance partielle, le badminton, et une séance le lundi 26 : sections dans l'ordre, aucun identifiant interne (ni clé `id`, `variantId`…, ni identifiant de séance ou de variante dans le texte), JSON compact relu à l'identique (une performance par ligne, plus court qu'un JSON indenté partout), seuil du rouge réglé dans les règles (10, 12) ; contexte (première séance, séances salle / maison, semaines suivies, habitudes, pesées jusqu'au dimanche) ; séances de la semaine (jour, heure et durée à la salle seulement, importée), performances (types et clés de charge : `charge_kg`, `charge_kg_par_haltere`, `aide_kg`, aucune pour la durée ; statut, validation, séance de départ, partielle sans statut), cardio, activités ; récapitulatif : total et couleur de chaque groupe égaux au récapitulatif de l'accueil le dimanche soir, directes + indirectes + activités + cardio = total, texte du bilan identique au mail ; la séance du lundi 26 ne change rien (contre-test : sans l'arrêt au dimanche soir, le test échoue) ; exercices par suivi (salle, maison, un seul suivi), 5 dernières performances dans l'ordre, prochaine cible ; tendance de 8 semaines (séries = score du récapitulatif, indice = celui du bilan par groupe) ; signaux (difficultés, séance pour compléter la semaine telle que proposée le dimanche soir) ; alertes (données des alertes, §19.11 : « Dos : 3 séries par semaine depuis 2 semaines (ta moyenne : 5,3) », ignorée signalée) ; aucune séance proposée : sa raison (aucune séance à la salle, séance à la salle le dimanche).
311. (bout en bout) Base vide, puis une seule séance dans la semaine en cours : pas de bouton ; avec les données simulées, le lundi 26 oct. : « Partager pour le coach », « Semaine du 19 au 25 oct. » en 13 px dessous, sous « Cardio », au-dessus de « Mon poids », 56 px au moins, bouton secondaire ; partage natif avec le fichier (`myfitapp-coach-2026-10-19.txt`, `text/plain` depuis la version 1.47.1, titre « MyFitApp — données pour le coach, semaine du 19 au 25 oct. 2026 »), « Fichier partagé. », semaine du 19 au 25 seulement (pas la séance du lundi 26), aucun identifiant interne, une performance par ligne, 8 semaines de tendance ; texte du bilan identique au « Texte du mail » de l'écran du bilan ; la semaine en cours ouverte dans le bilan, le bouton exporte toujours la dernière terminée ; partage annulé : ni téléchargement ni message ; fichier refusé par le navigateur : téléchargement, même nom, même contenu, « Fichier téléchargé : … » ; le dimanche 25 au soir : la semaine du 12 au 18. Le test 225 contrôle l'onglet Progrès avec le bouton, et, depuis la version 1.47.0, le bandeau de la semaine avec « Partager pour le coach » puis avec « Envoyé au coach ✓ ». Vraies données (`perso/`, cinq exports, chaque semaine terminée depuis le 19 octobre) : mêmes récapitulatifs et textes de bilan que l'appli, rien après le dimanche, aucun identifiant. Version 1.47.1 : le partage simulé refuse, comme Chrome sur Android, tout fichier `.json` (nom ou type) ; contre-test : avec l'ancien nom `.json`, le fichier est téléchargé et le test échoue (« Fichier téléchargé : myfitapp-coach-2026-10-19.json. »).
312. (unitaire, version 1.47.0) Réglage « Rappel de l'export coach » (`coachReminder`) : coché par défaut, pour une sauvegarde antérieure et pour une valeur invalide, décoché gardé ; dans la sauvegarde, relu à l'identique ; la semaine envoyée (`coachSent`) n'est pas dans la sauvegarde, et seul un lundi valide est gardé. Le test 193 attend aussi le nouveau champ.
313. (bout en bout, version 1.47.0) Lundi 26 oct. : bandeau de la semaine avec « Partager pour le coach » sur sa propre ligne, sous « Voir » et « Plus tard », 48 px au moins, dans le bandeau à 412, 360 et 320 px ; aucun dans le bandeau du mois ; partagé : « Envoyé au coach ✓ », méta `coachSent` 2026-10-19, gardé après relance, pastille « bilan prêt » toujours là ; même fichier que le bouton sous « Cardio », qui ne change pas ; Réglages › Bilans : « Rappel de l'export coach » coché, décoché (`coachReminder` false) : ni bouton ni « Envoyé » dans le bandeau, bouton sous « Cardio » toujours là, recoché : « Envoyé au coach ✓ » ; lundi suivant : le bouton revient, partage annulé : rien, fichier refusé : téléchargé et « Envoyé au coach ✓ » ; lundi 9 nov. : envoi par le bouton sous « Cardio », le bandeau l'affiche aussi ; « Voir » : bandeau disparu. Le test 311 vise le bouton sous « Cardio » (le bandeau en a un second).

### Fiche depuis la séance prévue (§5.9, version 1.48.0)

314. (bout en bout) Préparation de sept éléments à 412 × 600 px (données simulées de la semaine du 9 nov.) : lien vignette + nom vers la fiche, 48 px, s'arrêtant au nom, à 8 px au moins du menu « ⋯ » ; ordre changé, cardio en cours d'ajout (12 min, pas validé), carte centrée : la vignette ouvre la fiche, le retour d'Android ramène à la même position (au pixel), au cardio en cours (12), à l'ordre enregistré ; le nom de la dernière carte, puis la flèche « ‹ » de la fiche : même chose ; la cible n'ouvre rien, « ↑ » réordonne ; menu « ⋯ » ouvert : un appui sur le nom de la carte suivante (hors du panneau) ferme seulement le menu ; « Voir la fiche de l'exercice » et « Retirer de la séance prévue » toujours au menu ; correction d'un cardio en cours (25 min) retrouvée au retour, rien d'enregistré ; rouverte depuis l'accueil : neuve, en haut. Accueil (version 1.48.1) : « Ma séance prévue » sans aucun lien, un seul bouton, texte du résumé inchangé ; un appui sur un nom ouvre la préparation. Suggestion (« Compléter la semaine », 412 × 450 px) : confirmation « Remplacer ma séance prévue » ouverte et écran défilé retrouvés au retour de la fiche, plan non remplacé ; la cible n'ouvre rien. Séance prévue démarrée : aucun lien vers la fiche ajouté, « Voir la fiche de l'exercice » dans le menu de la carte. Contre-tests : sans la mémoire de l'écran, le cardio en cours est perdu au retour ; sans le fond du menu ouvert, l'appui sur le nom de la carte suivante ouvre la fiche ; les deux font échouer le test. Le test 225 contrôle la préparation et la suggestion avec les liens (menus ouverts compris), et l'accueil avec un plan.

Les tests doivent vérifier les décisions réelles du moteur et les données enregistrées, pas seulement l'affichage.

**Tests de bout en bout fiables (précision validée le 5 novembre 2026)** :
- **Police fixée** : le navigateur des tests ne voit que DejaVu Sans et DejaVu Sans Mono (`e2e/fonts`, configuration fontconfig déclarée par `playwright.config.ts`), sur le poste comme sur la machine de GitHub : les contrôles au pixel près ne dépendent plus des polices installées. DejaVu Sans est plus large que Roboto (téléphone) : une mise en page qui tient avec elle tient aussi sur le téléphone (choix signalé à l'utilisateur). Rendu inchangé sur le poste (mêmes largeurs de texte qu'avant).
- **Rechargement** : toujours par `reloadAfterWrites` (`e2e/helpers.ts`), qui attend que les écritures déjà parties vers IndexedDB soient enregistrées ; jamais un `reload()` qui les devance (échecs du test 266, le 27 octobre). Exceptions : la fiabilité à la fermeture (tests 120 et 121) et le hors-ligne (test 50), qui testent justement le rechargement sans attente.
- **Un test par écran** pour le contrôle d'ergonomie (test 225) : un échec ne masque plus les autres écrans, et les tests tournent en parallèle.
- **Garde « .uuid »** : fontconfig écrit un fichier « .uuid » dans chaque dossier qu'il parcourt ; la configuration des polices ne doit parcourir que `e2e/fonts` (`prefix="cwd"`, jamais `prefix="relative"` ni « . », compris comme la racine du dépôt par fontconfig 2.13.1 : 1 371 fichiers créés le 5 novembre 2026, supprimés depuis). À la fin de chaque passe, `e2e/uuid-guard.mjs` (`globalTeardown`) fait échouer la passe si un « .uuid » existe hors de `e2e/fonts` (node_modules et .git exceptés), en le nommant ; contre-test : un « .uuid » posé dans `src/` fait échouer la passe.
- **Débordement (précision du 9 novembre 2026, version 1.43.0)** : « rien ne dépasse de l'écran » se mesure par `document.documentElement.scrollWidth` ≤ `document.documentElement.clientWidth` (largeur réelle de l'écran), jamais par `innerWidth` : en émulation mobile (Pixel 7), quand le contenu dépasse, la page est dézoomée et `innerWidth` grandit avec elle, si bien que l'ancien contrôle (test 225 et 21 autres) ne voyait aucun débordement.
- Workflow sur `ubuntu-24.04` (épinglé, §21).

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

Ne pas afficher de bouton inactif. Exceptions (précision validée le 5 novembre 2026), seulement quand le bouton désactivé dit lui-même pourquoi :
- les boutons − et + d'une valeur à sa borne (répétitions : + bloqué à la cible, §5.4 ; séries, cible, seuil du rouge) ;
- dans les filtres du bilan de progression, une catégorie sans exercice, visible mais désactivée (§19.3, test 145) ;
- dans les réglages, le dernier groupe affiché au récapitulatif (au moins un groupe), et « Enregistrer les machines » / « Enregistrer les activités » tant qu'une erreur est affichée dans la liste ;
- les boutons d'import et de remplacement pendant l'écriture (quelques instants).

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
- Les exercices en difficulté (série en cours d'au moins 2 rouges, §7.8).
- Les dernières évolutions de charge et de répétitions.

Ne jamais déclarer un exercice en stagnation sur la base d'une seule séance difficile. Ne pas inventer de score de progression.

**Précisions validées :**

- Un palier est « validé » quand il atteint sa 2ᵉ validation verte consécutive (§7.5).
- Le suivi de la maison d'un exercice à charge est classé à part, nommé « … (maison) » (§7.14, version 1.26.0).
- Un exercice qui n'a qu'une seule séance évaluée est classé « Trop tôt ».
- « En difficulté » (série en cours d'au moins 2 rouges, §7.8) l'emporte sur « En progression ». Sous chaque exercice en difficulté : « série en cours : 2 rouges » ; libellé de la catégorie : « Série en cours d’au moins 2 séances rouges. » (version 1.42.1 : plus de « rouges de suite » ni de « consécutives », une séance « Mal » ne coupant pas la série).
- Libellé de « Trop tôt » : « Une seule séance sur cet exercice. »
- Présentation : un résumé en tête donne le nombre d'exercices de chaque catégorie ; chaque catégorie a un titre de section bien visible, un pictogramme (↗ en progression, → stables, ↘ en difficulté, … trop tôt), un cadre neutre et son nombre d'exercices ; chaque exercice listé est encadré à la couleur de son groupe (§3.2). Pas de vert, d'orange ni de rouge (réservés aux statuts, §8).
- Filtres : le résumé du haut est une seule rangée (défilement horizontal si elle ne tient pas, §3.5) de vrais boutons rectangulaires arrondis, au style des boutons de l'accueil, un par catégorie (pictogramme, titre, nombre d'exercices) et un bouton « Tous ». Les boutons sont neutres (les couleurs désignent les groupes, §3.2). Un appui n'affiche que la catégorie choisie et remplit le bouton, comme un bouton principal ; un nouvel appui sur le bouton actif, ou « Tous », réaffiche tout. Une catégorie sans exercice reste visible mais n'est pas sélectionnable. Par défaut tout est affiché ; le dernier filtre est mémorisé sur l'appareil (s'il ne contient plus d'exercice, tout est affiché). « Dernières évolutions » n'apparaît que sans filtre, une ligne par évolution (§3.5).
- Un appui sur un exercice ouvre sa fiche directement sur son graphique d'évolution (§19.2) ; le retour ramène au bilan. Le bilan est accessible depuis l'onglet Progrès (§3). Il mène aux bilans de la semaine et du mois (§19.7) et à la vue « Par groupe musculaire » (§19.10).

### 19.4. Séparation entre historique réel et recommandation

Les performances réellement réalisées sont la donnée de référence. Le moteur calcule paliers et cibles, mais ne modifie jamais les performances réelles pour les faire correspondre au palier théorique.

### 19.5. Priorité d'utilisation

La saisie et la consultation de la prochaine cible restent immédiates. Graphiques et analyses sont dans une vue secondaire.

### 19.6. Récapitulatif hebdomadaire en page d'accueil (précision validée, en séries depuis la version 1.45.0)

But : un coup d'œil de 2 secondes avant la séance pour savoir quels groupes travailler.

**Affichage**

- En haut de l'accueil, au-dessus du bouton de démarrage, visible sans clic ni défilement sur smartphone.
- Une grille compacte de cases colorées, une par groupe, nom en entier, avec entre parenthèses (sauf pour un groupe pas du tout travaillé) **le score de la semaine en séries** (précision validée, version 1.45.0 ; voir Calcul), une décimale au plus, « série » au singulier sous 2 (« Jambes (15 séries) », « Biceps (1,5 série) »), puis les activités confirmées qui le sollicitent, en minuscules (« Biceps (4,5 séries · badminton) », « badminton ×2 » pour deux fois, « badminton · futsal »), puis le cardio des jambes (« Jambes (6 séries · +50 min cardio) ») ; « · hier » ou « · aujourd'hui » après la parenthèse. Ni « 1× », ni « +1 indirect », ni « +5 séries maison » : la salle, l'indirect et la maison sont dans le total. Le nombre et la mention « hier » sont plus discrets que le nom du groupe, et un mot n'est jamais coupé en deux (vérifié à 412, 360 et 320 px).

  ```
  Semaine du lun. 12 au dim. 18 oct. : 2 séances
  [vert] Jambes                 [vert] Biceps (1,5 série)
  [orange] Pectoraux (6 séries) [orange] Dos (6 séries) · hier
  [rouge] Épaules (10,5 séries) [rouge] Triceps (12 séries) · hier
  ```

- **Titre raccourci (précision validée, versions 1.41.1 et 1.45.0)** : seulement quand « Démarrer » ne tiendrait pas entièrement au-dessus de la barre d'onglets, page en haut (§3.7) ; d'abord sans « · 45 min de cardio » (le cardio des jambes reste visible dans la case Jambes), puis, si besoin, sans les noms de jours aussi : « Semaine du 9 au 15 nov. : 2 séances » (« Semaine du 26 oct. au 1 nov. »). Chaque forme est mesurée à la largeur et à la taille de texte réelles (`RECAP_TITLE_FORMS`, `recapTitle(recap, form)`, `useTitleForm` dans `src/ui/WeeklyRecap.tsx`) ; refait quand l'accueil, l'écran ou la taille du texte change. **Forme `compact` (précision validée, version 1.45.0)**, la 4ᵉ et dernière : le titre court, et la case Jambes sans « +50 min cardio » (ses 3 séries restent comptées dans le nombre), seulement si même la forme courte ne laisse pas « Démarrer » au-dessus de la barre d'onglets ; mesurée comme les autres (sondes invisibles des titres et de la grille, avec et sans la mention ; les cases des sondes n'ont pas `data-group`, seules les vraies cases en ont un), choix signalé à l'utilisateur. Cas le plus chargé avec 50 min de cardio et une séance du matin à 4 exercices de jambes (« Jambes (15 séries · +50 min cardio) · aujourd’hui ») : titre complet à 412 × 915, 360 × 800 et 360 × 800 px avec le texte à 115 % ; forme `compact` à 320 × 711 px (« Jambes (15 séries) · aujourd’hui »).
- L'en-tête affiche les dates exactes de la semaine en cours (lundi et dimanche, mois répété si la semaine change de mois) et le nombre de séances (« 0 séance », « 1 séance », « 2 séances »), suivi du nombre d'activités habituelles confirmées et du total de cardio de la semaine quand il y en a (« 3 séances · 1 activité · 45 min de cardio », §5.7, §19.8), et des séances à la maison quand il y en a (« 3 séances · dont 1 maison · 1 activité », version 1.26.0 ; dans les groupes, elles comptent selon leurs séries, voir Calcul). Une séance ne contenant que du cardio compte comme une séance ; le cardio n'entre dans aucun groupe, sauf les jambes : 3 séries à partir de 45 min dans la semaine (versions 1.41.0 et 1.45.0, voir Calcul). Une activité n'est pas une séance de salle.
- **Couleur** selon le score de la semaine en séries (précision validée, version 1.45.0) : **vert** sous 3 séries (un exercice de 3 séries fait passer à l'orange ; 1,5 série indirecte reste verte) ; **orange** de 3 séries jusqu'au seuil du rouge exclu (9,5 séries reste orange avec le seuil par défaut) ; **rouge** à partir du seuil. Le seuil du rouge est réglable en séries (Réglages › Récapitulatif de la semaine, « Rouge à partir de (séries) ») : **10 par défaut, de 6 à 20** ; le seuil de l'orange (3) est fixe. Un ancien réglage en séances (versions antérieures, 2 à 7) est converti à la lecture, 5 séries par séance, au plus 20 : 2 → 10, 3 → 15, 4 et plus → 20 ; il est enregistré en séries à la prochaine modification. Valeur invalide : 10.
- Mention « aujourd'hui » ou « hier » si le groupe a été travaillé, directement ou indirectement (à la maison aussi, groupes secondaires compris depuis la version 1.45.0 ; activités confirmées comprises, à leur heure de fin ; cardio non), il y a moins de 48 heures, même la semaine précédente. La mention suit le jour du calendrier : une séance d'avant-hier, même à moins de 48 heures, n'a pas de mention.
- Tri (précision validée) : couleur d'abord, vert en haut, puis orange, puis rouge en bas ; à couleur égale, les groupes non travaillés depuis moins de 48 heures avant ceux travaillés « hier » ou « aujourd'hui » ; puis score croissant, en séries (un vert à 1,5 série passe après un vert sans rien) ; puis l'ordre de la liste des groupes.
- Cases pleines, visuellement différentes des pastilles de progression des exercices ; texte lisible en mode sombre. Nombre impair de groupes (7 avec les abdominaux, version 1.41.0) : la dernière case, seule sur sa ligne, prend toute la largeur.
- Rien d'autre : pas de légende, de graphique ni de texte explicatif.

**Calcul**

- Semaine du lundi 0 h 00 au dimanche 23 h 59 inclus, heure locale du téléphone (Paris). Une séance compte dans la semaine de sa date de début, même si elle se termine après minuit ; une séance importée sans heure compte selon sa date.
- Groupes affichés par défaut : pectoraux, dos, épaules, biceps, triceps, jambes. Abdominaux exclus du récapitulatif mais gardés dans la bibliothèque. Liste modifiable dans les réglages ; elle est incluse dans l'export.
- **Score de la semaine, en séries (précision validée, version 1.45.0)** : exactement les séries du graphique « Séries par semaine » du bilan par groupe (§19.10), plus les activités et le cardio des jambes :
  - **séries** : chaque série enregistrée d'un exercice dont le groupe est le **groupe principal** compte **1** (shrugs et lombaires au banc dans « Dos », oiseau et face pull dans « Épaules ») ; chaque série d'un exercice où il n'est que **groupe secondaire** compte **½** (travail indirect : biceps des tractions assistées et des tirages, pectoraux des dips assistés, triceps et épaules des développés). Salle et maison comptent **en entier**, de la même façon (§5.10). Un exercice compte pour chacun de ses groupes : tractions assistées 3 séries → dos 3, biceps 1,5 ; curl 3 séries le lundi et tractions 3 séries le jeudi → biceps 4,5 (orange) ; deux exercices de dos de 3 séries → dos 6 ;
  - **activités confirmées** (§19.8) : **3 séries** pour chacun de leurs groupes, par activité (badminton : jambes 3 et épaules 3 ; deux fois dans la semaine : 6) ;
  - **cardio des jambes** : **3 séries** pour les jambes à partir de 45 min dans la semaine (voir ci-dessous) ;
  - **ni plafond par jour, ni plafond de la maison** (version 1.45.0 : plus de « ½ » par séance indirecte, de 1/12 par série à la maison plafonné à ½ par semaine, ni de plafond de 1 par jour et par groupe) : une séance à la maison ou une activité le même jour qu'une séance à la salle sur le même groupe ajoute tout ;
  - une séance compte dans la semaine de sa date de début. Les exercices de jambes de la bibliothèque (presse, leg extension, leg curl, curl ischios, mollets, abducteurs, adducteurs) comptent dans « Jambes ». Un exercice personnalisé dont le groupe principal est un sous-groupe des jambes (quadriceps, ischio-jambiers, mollets, fessiers, adducteurs) compte pour « jambes » quand ce sous-groupe n'est pas affiché lui-même. Seuls les groupes affichés comptent (un groupe secondaire non affiché est ignoré).
  - Calcul pur (`groupSeries`, `groupScore`, `recapColor`, `recapCountLabel`, `src/analysis/weekly.ts`) ; même score pour les bâtons des bilans (§19.7) et l'objectif de la séance pour compléter la semaine (§5.15). Les séances directes, indirectes et séries à la maison restent comptées à part (`groupWork`) pour le tableau et le texte du mail des bilans.
- Un exercice sans aucune série (resté dans une séance terminée, §5.6) ne compte jamais, à la salle comme à la maison ; une performance partielle importée (poids sans répétitions) n'a pas de série : 0 série au score (case verte, sans nombre), mais « hier » / « aujourd'hui » (§5.6, choix signalé à l'utilisateur).
- **Cardio pour les jambes (précision validée, version 1.41.0)** :
  - **Machines** : toutes sauf le rameur (tapis, vélo, vélo elliptique, « Autre », machines ajoutées…). Réglages › Machines de cardio : case « Compte pour les jambes », cochée par défaut et pour toute machine ajoutée, décochée pour le rameur (`machineCountsForLegs`, `src/cardio/model.ts`). Un bloc suit le réglage de sa machine (même identifiant, même renommée) ; une liste enregistrée avant la version 1.41.0, sans la case, et une machine retirée depuis suivent la règle par défaut : le rameur (identifiant `rameur`) ne compte pas, les autres comptent (choix signalé à l'utilisateur).
  - **Calcul** : total des minutes de ces machines dans la semaine (lundi – dimanche, semaine de la date de début de la séance), séances terminées à la salle et à la maison confondues. À partir de **45 min** cumulées, les jambes reçoivent **3 séries** (version 1.45.0 ; ½ séance avant) ; en dessous, rien. **Au plus 3 séries par semaine**, quel que soit le total. Une séance de jambes de 3 séries et 50 min de tapis : 6 séries (orange). Pas de mention « hier » / « aujourd'hui » pour le cardio (choix signalé à l'utilisateur). Seul, il fait passer les jambes à l'orange (3 séries).
  - **Affichage** : dans la case Jambes, après les autres mentions, le total réel des minutes comptées : « Jambes (3 séries · +62 min cardio) » (cardio seul), « Jambes (7,5 séries · +45 min cardio) » ; en minutes, même au-delà d'une heure ; rien sous 45 min (choix signalé à l'utilisateur). L'en-tête (« · 1 h 10 de cardio », toutes machines) ne change pas.
  - Calcul pur (`legCardioMinutes`, `legCardioWeek`, `src/analysis/weekly.ts`) ; même règle dans les bilans (§19.7) et la séance pour compléter la semaine (§5.15). Aucun effet sur les séries par semaine et l'indice par groupe (§19.10), l'alerte « groupe moins travaillé » (§19.11) ni le moteur. Données : champ facultatif `legs` (booléen) d'une machine, enregistré seulement une fois la case changée ; dans la sauvegarde avec la liste des machines, format `schemaVersion` 7 inchangé ; une valeur non booléenne est écartée (règle par défaut).
  - Vraies données (exports du 27/10 et du 30/10) : semaine du 12 oct. 11 min (vélo elliptique), du 19 oct. 33 min (tapis 15 + 4 + 4, « Autre » 10 ; rameur 3 non compté), du 26 oct. 20 min (tapis 16 + 4 ; rameur 3 non compté) : jamais 45 min, le cardio n'y ajoute rien.
- **Vraies données (version 1.45.0)** : exports du 27/10, du 30/10, du 6/11 et du 10/11, jour par jour : moteur, alertes, records, indices, séries par semaine et tout le reste identiques à la version 1.44.1 ; seuls le récapitulatif, les groupes des bilans et la séance pour compléter la semaine changent (tests dans `perso/`). Couleurs, avant → après : semaine du 12 oct., épaules rouge → orange (dos 12, biceps 15 et triceps 12 restent rouges) ; du 19 oct., pectoraux, dos et jambes rouge → orange (biceps 12 reste rouge) ; du 26 oct., pectoraux 12 et biceps 11 orange → rouge, triceps 9,5 rouge → orange, abdominaux 5 (maison) vert → orange ; du 2 nov., épaules 5,5 et abdominaux 9 vert → orange, triceps 10 et jambes 15 orange → rouge.
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
  - **Séances** : nombre de séances et comparaison avec la période précédente (« 3 séances, +1 par rapport à la semaine précédente », « autant que… ») ; durée en salle ; minutes de cardio par machine ; activités habituelles confirmées par nom (« Activités : Badminton ×4, 6 h 00 », §19.8), qui ne sont pas des séances (ni dans le nombre de séances, ni dans la durée en salle : deux chiffres séparés). Première période suivie (version 1.35.1) : « 11 séances, premier mois suivi », « 3 séances, première semaine suivie », sans écart, durée sans comparaison (voir « Écran en images »).
  - **Durée en salle (précision validée, version 1.21.3)** : une séance importée sans heure de début ou de fin a une durée inconnue, jamais comptée pour 0 min. La durée n'additionne que les séances à durée connue et signale les autres (« Durée en salle : 1 h 02 (2 séances sans durée) » ; « inconnue (2 séances sans durée) » si aucune n'est connue). Elle n'est comparée (« , +22 min par rapport à… ») que si toutes les séances des deux intervalles comparés ont une durée connue ; sinon, pas de comparaison.
  - **Séance complétée le jour même (version 1.28.0, §5.12)** : une seule séance ; sa durée est la somme de ses périodes, sans la pause.
  - **Séances à la maison (version 1.26.0)** : comptées dans le nombre de séances (« 3 séances (dont 1 à la maison), +1 par rapport… ») ; jamais dans la durée en salle, jamais « sans durée », jamais un obstacle à la comparaison de durée. Une période sans séance à la salle n'a pas de ligne « Durée en salle » (sauf si l'intervalle comparé en a). Leurs progressions, records et séances rouges sont rapportés à part, nommés « … (maison) » (§7.14).
  - **Période de comparaison (précision validée, version 1.21.3)** : une période terminée est comparée à la période précédente entière (« par rapport à la semaine précédente », « au mois précédent »). Une période en cours est comparée à la même portion de la précédente, jours entiers : du lundi au même jour de la semaine dernière (« par rapport à lun.–ven. de la semaine dernière », « autant que lun. de la semaine dernière »), du 1er au même jour du mois dernier (« par rapport au 1er–23 du mois dernier », « autant que le 1er du mois dernier »), sans dépasser la fin de la période précédente (le 31 octobre est comparé à tout septembre, et un dimanche à toute la semaine précédente : libellé habituel). Même règle pour le nombre de séances et la durée, à l'écran comme dans le mail.
  - **Groupes travaillés (précision validée, version 1.45.0)** : pour chaque groupe affiché travaillé, le total de la période **en séries**, même calcul que le score du récapitulatif (§19.6 : séries directes, indirectes pour moitié, maison en entier, 3 par activité confirmée, 3 pour le cardio des jambes, sans plafond), puis entre parenthèses le détail, s'il y en a un (sinon pas de parenthèse : « Triceps : 1,5 série ») : séances directes, séances indirectes (activités comprises), séries à la maison, cardio des jambes, séparés par des virgules : « Pectoraux : 6,5 séries (1 séance, +2 séries maison) », « Biceps : 6 séries (1 séance, +2 indirect) », « Jambes : 6 séries (1 séance, +62 min cardio) » pour une semaine. Cardio des jambes (version 1.41.0) : sur un mois, 3 séries par semaine qui atteint 45 min, semaine par semaine sur la partie de chaque semaine comprise dans le mois (une semaine à cheval sur deux mois compte les minutes de chaque côté séparément, choix signalé à l'utilisateur), avec le total des minutes de ces semaines et leur nombre : « Jambes : 12 séries (1 séance, +1 indirect, +100 min cardio sur 2 semaines) » ; une semaine à 45 min sans autre travail : « Jambes : 3 séries (+45 min cardio) » (mois : « +45 min cardio sur 1 semaine »). Puis « Non travaillés : … » : seulement les groupes sans aucune série et sans aucune part (des jambes au seul cardio, des triceps travaillés seulement en secondaire à la maison n'y sont pas ; une performance partielle seule : « Dos : 0 série (1 séance) »). Même texte dans le mail.
  - **Progressions** : paliers validés pendant la période d'après les évaluations du moteur (2ᵉ validation verte consécutive) : « Curl biceps haltères : 3×8 → 3×9 à 12 kg (21 oct.) », « Leg extension : 3×12 à 40 kg validé → poids supérieur, 3×8 », « Tractions assistées : 3×12 avec 30 kg d'aide validé → moins d'aide, 3×8 » ; sinon « Aucun palier validé. ».
  - **Records** : records battus pendant la période (§19.9) ; sinon « Aucun nouveau record. ».
  - **En difficulté** : une ligne par exercice ayant eu au moins une séance rouge pendant la période ; sinon « Aucun exercice en difficulté. ». Formulation selon le cas (précision validée) :
    - (version 1.42.1 : « série », jamais « de suite », une séance « Mal » ne coupant pas la série, §7.8)
    - passage en « poids inférieur » pendant la période : « Presse à cuisses : série de 4 rouges à 100 kg → poids inférieur recommandé (21 oct.) » (« avec 30 kg d'aide → plus d'aide recommandée » pour un exercice assisté) ;
    - sinon : « Presse à cuisses : 2 séances rouges cette semaine (série en cours : 3 rouges à 100 kg) » (« ce mois-ci » pour le mois). La parenthèse donne la série de rouges en cours à la fin de la période quand elle a commencé avant la période ; sans série en cours plus longue (série commencée dans la période, ou interrompue), pas de parenthèse.
  - **Poids** : première et dernière pesée de la période, si elles existent (« 80,2 kg le 19 oct. → 79,6 kg le 25 oct. »).
  - Une période sans séance n'affiche que le nombre de séances, la comparaison, les activités habituelles et leurs groupes, et les pesées.
- Ces sections sont celles du texte du mail. À l'écran, depuis la version 1.35.0, Séances, Groupes travaillés et Progressions sont présentées en images (ci-dessous) ; Records, En difficulté et Poids restent en lignes.
- Mise en évidence (précision validée) : les phrases gardent leur rédaction, mais l'essentiel se repère d'un coup d'œil : en gras et en blanc, le reste de la ligne en gris clair (à l'écran, depuis la version 1.35.0, sur les lignes restées en texte : Records, En difficulté, Poids). Sont mis en évidence : les comparaisons avec la période précédente (« +1 par rapport à la semaine précédente », « autant que… »), la ligne « Non travaillés : … », le changement de cible d'une progression (« 3×8 → 3×9 à 12 kg », « poids supérieur, 3×8 », « moins d'aide, 3×8 »), le nombre de séances rouges de la période (« 2 séances rouges cette semaine ») et « poids inférieur recommandé » / « plus d'aide recommandée », les deux valeurs de poids. Restent en texte simple : nombres de séances, durée, cardio, noms d'exercices et de groupes travaillés, dates. Le mail reste en texte brut, sans marque.
- Pas de score, pas de conseil. Écran neutre (cadres `--frame-neutral`) : pas de vert, d'orange ni de rouge, y compris dans les messages. Aucun effet sur le moteur de progression ; rien n'est stocké, tout est recalculé à l'affichage.

**Écran en images (précision validée, version 1.35.0)** : le texte du mail ne change pas (sauf la ligne des groupes travaillés, en séries depuis la version 1.45.0) ; à l'écran seulement :

- **Séances** : une référence écrite une fois (« Par rapport à la semaine précédente », « à lun.–ven. de la semaine dernière », « au 1er–23 du mois dernier », mêmes règles que le mail), puis des tuiles sur deux colonnes, chiffre en 28 px et écart dessous (« ▲ +4 », « ▼ −13 min », « = autant », en blanc, jamais en couleur) : **Séances** (« dont 4 à la maison ») ; **Durée en salle** (« 2 séances à la salle », « + 2 séances sans durée » ; « pas de comparaison » si une durée manque, comme le mail), si la période ou la période comparée a une séance à la salle ; **Cardio** (« Tapis de marche 20 min · Rameur 3 min »), si la période a une séance ou la période comparée du cardio ; **Activités** (« Futsal ×1, 1 h 00 »), si l'une des deux en a. Le cardio (minutes) et les activités (nombre) sont comparés aussi, à l'écran seulement.
- **Première période suivie** : quand la période contient la première séance terminée et que la précédente est entièrement avant elle, « Première semaine suivie » / « Premier mois suivi » remplace la référence, sans aucun écart. Le mail aussi (version 1.35.1) : « 11 séances (dont 4 à la maison), premier mois suivi » au lieu de l'écart, et la durée en salle sans comparaison ; seule modification du texte du mail, le reste est identique caractère pour caractère. Une période entièrement avant la première séance garde sa comparaison (« 0 séance, autant que la semaine précédente »).
- **Calendrier, bilan du mois seulement** : au-dessus des tuiles, une case par jour (semaine du lundi au dimanche) : ● une séance à la salle, ○ une séance à la maison, ◆ une activité ; jours à venir d'un mois en cours en pointillés. Lecteur d'écran : « 27 oct. : 1 séance à la salle, 2 séances à la maison ».
- **Groupes travaillés (version 1.37.0)** : un diagramme en bâtons verticaux, puis un petit tableau (version 1.36.0).
  - **Bâtons** : un par groupe affiché au récapitulatif, dans son ordre (fixe), à la couleur du groupe (§3.2) ; hauteur = total **en séries** (version 1.45.0), le score du récapitulatif sur la période (§19.6) : séries directes, indirectes pour moitié, maison en entier, 3 par activité confirmée, 3 par semaine à 45 min de cardio ou plus pour les jambes (semaine par semaine sur un mois) ; le groupe le plus travaillé occupe toute la hauteur (96 px). Pas de valeur au-dessus des bâtons. Groupe non travaillé : bâton vide (pointillés), nom en gris. Lecteur d'écran : « Total par groupe, en séries : pectoraux 6,5, dos 0, … ».
  - **Noms sous les bâtons** (précision validée, version 1.37.1), 13 px, jamais inclinés, toujours sur une ligne si possible : le nom entier s'il tient dans la colonne, sinon trois lettres (« Pec », « Dos », « Épa », « Bic », « Tri », « Jam », « Abd » ; « Qua », « Isc », « Mol », « Fes », « Add » pour les sous-groupes des jambes) ; 6 px au moins entre deux noms. Deux rangs alternés (un nom sur deux descend d'une ligne) seulement en dernier recours, si même les trois lettres ne tiennent pas : sept groupes à 320 px avec le texte agrandi. Choix refait selon la largeur réelle et la taille du texte (texte agrandi du téléphone compris) : avec sept groupes, une ligne de trois lettres à 412, 360 et 320 px.
  - **Tableau** : une ligne par groupe ; sous le nom du groupe, son total en petit gris (13 px, version 1.45.0, maquette C, `group-sets`) : « 14 séries », « 1,5 série », sur une ligne dans le cadre (320 px et texte à 115 % compris), seulement s'il est supérieur à 0 ; colonnes inchangées « Séances » (séances directes), « Indirect » (séances indirectes, activités comprises : toutes les activités confirmées, même le jour d'une séance où le groupe est principal), « Maison (séries) » (toutes les séries à la maison des groupes principaux, même le jour d'une séance à la salle sur le même groupe), en chiffres, sans barre (plus de plafond de 1 par jour, version 1.45.0, choix signalé à l'utilisateur) ; zéro : case vide (lue « 0 » par le lecteur d'écran) ; groupe non travaillé : nom en gris, cases vides. En-têtes abrégés (« Séan. », « Ind. », « Mais. ») seulement sous 340 px (320 px). Cardio des jambes (version 1.41.0) : pas de colonne, une phrase sous le tableau, 15 px, gris clair (choix signalé à l'utilisateur) : « Jambes : +3 séries pour 50 min de cardio. » (semaine), « Jambes : +6 séries pour le cardio, 2 semaines à 45 min ou plus (100 min). » (mois), version 1.45.0.
- **Progressions** : « 6 paliers validés », puis une carte par palier, à la couleur du groupe de l'exercice : nom, « 3 séries · à 52 kg · 29 oct. » (« avec 41 kg d’aide », « à 12 kg / haltère », « poids du corps », « en secondes »), et l'échelle du cycle : les cibles de la plage (8 · 9 · 10 · 11 · 12) puis « +kg » (« −aide » pour un exercice assisté) ; l'ancienne cible en pointillés, la nouvelle pleine, les crans franchis teintés ; passage au poids supérieur : « +kg » plein. Plage de plus de 5 crans (poids du corps 10 à 40, secondes par pas de 5 s, maison 8 à 15) : 5 crans autour de la nouvelle cible ; « +kg » seulement si le haut de la plage est affiché, jamais au poids du corps ni en secondes. Le lecteur d'écran lit la phrase du mail (« Chest press : 3×8 → 3×9 à 52 kg (29 oct.) »), l'échelle est masquée.
- Calcul pur `buildReportScreen` et `ladderSteps` (`src/analysis/report.ts`), à côté de `buildReport` (qui porte seulement `first`, version 1.35.1) ; affichage `src/ui/ReportVisuals.tsx`. Pas de vert, d'orange ni de rouge.

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
- Bandeau de la semaine : rappel de l'export pour le coach (version 1.47.0, §19.13), « Partager pour le coach » sur sa propre ligne, puis « Envoyé au coach ✓ ».
- Réglages (§14) : « Signaler le bilan de la semaine (pastille sur Progrès) » et « … du mois » désactivables séparément ; ils pilotent la pastille et le bandeau ; « Rappel de l'export coach » (version 1.47.0) ; adresse e-mail facultative, contrôlée, préremplie dans le `mailto:`. Ces réglages sont inclus dans l'export et restaurés par un remplacement global ; les bilans déjà ouverts et la semaine envoyée au coach sont mémorisés sur l'appareil seulement.

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
- Récapitulatif hebdomadaire (§19.6, version 1.45.0) : **3 séries** pour chacun de ses groupes, par activité, sans plafond par jour (le jour d'une séance où le groupe est principal, l'activité ajoute aussi ses 3 séries), le nom de l'activité dans la case (« Épaules (9 séries · badminton) », « Jambes (6 séries · badminton ×2) »), « hier » / « aujourd'hui » à son heure de fin, et « · 1 activité » dans l'en-tête. Bilans (§19.7) : « Activités : Badminton ×4, 6 h 00 » dans « Séances » ; groupes : 3 séries par activité dans le total (bâtons, « N séries »), et une séance indirecte dans la colonne « Indirect » et le détail du mail (« +1 indirect »), texte du mail compris.
- Pas de vert, d'orange ni de rouge en dehors des statuts (messages neutres).

**Activités ponctuelles (précision validée, version 1.22.0)**

But : compter une activité faite de temps en temps (futsal…), sans en faire une habitude ni recevoir de question chaque semaine. Les activités habituelles (badminton) ne changent pas.

- Onglet Séance, sous « Démarrer une séance » : un bouton secondaire « + Activité » (version 1.40.0, à côté de « Préparer ma prochaine séance » si chacun tient sur une ligne, §3.7 ; lien d'action discret avant). Il ouvre un formulaire dessous (« Activité ponctuelle ») :
  - **Activité** : une puce par activité déjà connue, y compris les habitudes désactivées (le futsal) ; « Autre » pour un nouveau nom (champ « Nom de l'activité »). Ordre (précision validée, version 1.22.1) : d'abord les activités qui ne sont pas couvertes par une habitude active (futsal, nom libre), la plus récemment enregistrée en premier, puis celles jamais enregistrées ; ensuite les habitudes actives (badminton), dans le même ordre. La première puce est présélectionnée seulement si elle n'est pas une habitude active : un futsal s'enregistre en 2 appuis (« + Activité », « Enregistrer l'activité »), et un badminton n'est jamais enregistré par erreur. Sans activité hors habitude active, rien n'est présélectionné (« Choisis une activité. » si l'on enregistre sans choisir).
  - **Date** : aujourd'hui par défaut, jamais dans le futur.
  - **Durée (min)** : nombre entier de 1 à 600.
  - **Groupes sollicités** (mêmes puces que les habitudes).
  - Durée et groupes sont préremplis d'après la dernière fois (même nom), sinon d'après l'habitude (fin − début, groupes) ; vides pour un nouveau nom.
  - « Enregistrer l'activité » / « Annuler » ; erreurs affichées (nom manquant, durée invalide, date future, « Cette activité est déjà enregistrée ce jour-là. ») ; après l'enregistrement : « Activité enregistrée : Futsal · 1 h 15, 23 oct. 2026. ».
- Elle compte exactement comme une activité habituelle confirmée : récapitulatif (3 séries par groupe sollicité, son nom dans la case, « · 1 activité », « aujourd'hui » / « hier »), bilans et mail, historique (ligne « Futsal · 1 h 15 », « activité » ; détail « 23 octobre 2026 · 1 h 15 · activité ponctuelle », suppression comme une activité habituelle). Aucun effet sur le moteur.
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
- Un exercice à charge a ses records de la salle et ses records de la maison, séparés (§7.14, version 1.26.0) ; au poids du corps, un seul record.

**Affichage** (couronne dorée `--gold`, pictogramme SVG `Crown` ; « 👑 » dans le texte du bilan et du mail) :

- Fiche d'exercice : ligne « Record : 3 × 9 à 20 kg (16 oct.) » sous « Dernière fois » (§5.3.2).
- Séance : quand toutes les séries prévues d'un exercice sont faites à la cible et battent le record des séances précédentes, couronne et « Nouveau record ! » sur sa carte, sous le nom (visible carte repliée).
- Récapitulatif de fin de séance : cadre « Record battu » / « Records battus » (« Curl biceps barre droite : 3 × 8 à 22 kg ») et couronne à côté du nom de l'exercice.
- Historique : petite couronne (« Record battu ») à côté des performances qui ont battu un record, dans le détail d'une séance et dans l'historique de la fiche.
- Bilan de la période (§19.7) : section « Records » après « Progressions », le dernier record battu de chaque exercice pendant la période (« 👑 Curl biceps barre droite : 3 × 9 à 20 kg », la performance en évidence), sinon « Aucun nouveau record. » ; même section dans le texte du mail.
- La couronne est discrète et ne remplace aucune pastille de statut ni couleur de groupe. Pas de vert, d'orange ni de rouge.

### 19.10. Bilan par groupe musculaire (précision validée)

Vue secondaire (`#/bilan-groupes/<groupe>`), accessible depuis l'onglet Progrès et le bilan de progression (bouton « Par groupe musculaire »), jamais depuis l'onglet Séance. Sélecteur de groupe : pectoraux, dos, épaules, biceps, triceps, jambes, abdominaux (pectoraux par défaut ; les sous-groupes des jambes comptent dans « jambes »). **Abdominaux** (version 1.33.0) : séries par semaine seulement, sans indice, avec le message « Pas d’indice de progression pour les abdominaux : il se calcule sur la charge, et ces exercices se font sans charge (poids du corps, durée). » (`SETS_ONLY_GROUPS` ; un crunch machine, à charge, n'y a donc pas d'indice non plus, choix de l'utilisateur). Calcul pur (`src/analysis/groups.ts`), refait à l'affichage à partir des séances terminées ; ni cardio ni activités habituelles ; aucun effet sur le moteur.

**Indice de progression (base 100)**

- Pour chaque exercice-variante dont le groupe est le groupe **principal** (un groupe secondaire est ignoré) : force estimée à chaque séance par la formule d'Epley, charge × (1 + répétitions / 30), sur la **moins bonne série** ; exprimée en pourcentage de sa première séance (= 100), même faite sous la cible (8-8-6 vaut 6, règle gardée en version 1.33.0). Historique partiel ignoré. **Séance incomplète ignorée** (version 1.33.0, comme pour les records, §19.9) : une performance qui a moins de séries que prévu n'entre ni dans le calcul, ni dans la base, ni dans le seuil des 6 séances ; ses séries réelles restent comptées dans les séries par semaine. Les séances à la maison n'entrent pas dans l'indice (charges non comparables, version 1.26.0).
- Exercice assisté (§7.12) :
  - quand au moins une pesée existe dans « Mon poids » (§20) : charge réelle = poids du corps − aide, puis Epley comme pour un exercice classique (80 kg, 30 → 25 kg d'aide : 50 → 55 kg réels, 110). Poids du corps à la date de la séance (précision validée) : interpolation linéaire entre les deux pesées qui l'encadrent ; avant la première pesée, la première ; après la dernière, la dernière ; avec une seule pesée, ce poids constant. Pas de saut artificiel quand deux pesées sont espacées. Seule lecture des pesées : le suivi corporel n'en est pas modifié. Une aide au moins égale au poids du corps à la première séance (sans sens physique) revient à la méthode sans pesée ;
  - sans aucune pesée : la variation relative de l'aide est inversée, indice = 100 × (2 − aide ÷ aide de la première séance) × l'effet des répétitions (Epley) ; 30 → 25 kg d'aide donne 116,7, comme 30 → 35 kg pour un exercice classique ;
  - la méthode appliquée est indiquée sous la liste des exercices ; jamais sous 0.
- Indice du groupe à une date = moyenne des indices de ses exercices, chacun avec sa dernière valeur connue ; un point par date de séance. Les charges brutes de deux exercices différents ne sont jamais additionnées ni moyennées.
- Affichage : dernière valeur (« Pectoraux : 123,6 »), courbe dans le temps avec une ligne pointillée à 100, liste des exercices pris en compte. **Axe (version 1.33.0)** : au moins de 95 à 105 (±5 autour de 100), pour qu'une variation minime (99,9 après 150 g de pesée) ne remplisse pas le graphique ; élargi du côté où des valeurs en sortent (avec une marge de 10 %). Les étiquettes de l'axe (maximum, 100, minimum, puis les bornes 95 et 105 quand l'axe s'y arrête, dans cet ordre de priorité) ne se chevauchent jamais : une étiquette trop proche d'une autre n'est pas affichée. Texte du lecteur d'écran (tous les graphiques en courbe) : « Indice de progression dos : 6 points, de 100 le 12 oct. à 99,9 le 29 oct. », sans espace pour une unité vide ni point après une date abrégée.

**Séries par semaine**

- Barres par semaine (lundi 0 h 00 – dimanche, heure locale, semaine en cours comprise), **depuis la semaine de la première séance enregistrée** (toutes séances terminées confondues, salle ou maison, importées comprises ; version 1.34.0 : plus de semaines vides avant elle), **12 semaines au plus** : au-delà, les plus anciennes sortent. Les semaines vides après la première séance (vacances) restent affichées. Avec peu de semaines, barres de 32 px au plus, chaque date centrée sous sa barre. Sinon, la première date, la dernière (semaine en cours, alignée à droite) et une sur quatre, sauf à moins de 3 colonnes de la dernière (version 1.38.0 : avec 11 semaines, « 26 oct. » touchait « 9 nov. »). Séries enregistrées des exercices dont le groupe est principal, en plein ; séries des exercices où il n'est que secondaire, comptées pour moitié et empilées en plus clair. Total au-dessus de chaque barre (« 7,5 »). Les séries des séances à la maison comptent en entier, comme à la salle (version 1.26.0), groupes secondaires compris, pour moitié (règle gardée en version 1.33.0 ; le score du récapitulatif reprend exactement ces séries depuis la version 1.45.0, §19.6). Une séance incomplète compte ses séries réelles.
- **Moyenne (version 1.34.0)** : ligne horizontale en pointillés à la moyenne des totaux hebdomadaires (directes + indirectes ÷ 2), de la première semaine affichée où le groupe a des séries à la dernière semaine terminée, semaines vides comprises ; la semaine en cours n'y entre qu'une fois terminée (le lundi suivant). Étiquette « Moyenne : 9,2 » dans une bande au-dessus des barres, après un court trait pointillé (choix validé : elle ne recouvre jamais une barre ni un total). Pas de ligne sous le seuil des séries. Quand la ligne traverse le total d'une barre (« 12 » sous une moyenne de 13,5), elle s'interrompt sous le chiffre : les totaux sont dessinés après elle, détourés de la couleur du fond.
- **Semaine en cours** (version 1.34.0) : toujours la dernière barre, plus transparente, avec un contour à la couleur du groupe, et « en cours » sous sa date (les dates restent alignées) ; elle n'entre pas dans la moyenne.
- **Légende** (version 1.34.0) : une ligne courte sous le titre, deux au plus à 412 et 360 px, affichée avec le graphique : « Plein : direct · Clair : indirect (÷ 2) · Pointillés : moyenne » (espaces insécables : ni « : » ni « · » en début de ligne). L'explication complète est dans le texte du lecteur d'écran, après les valeurs : « Séries par semaine triceps : semaine du 12 oct. 12, semaine du 19 oct. 4,5, semaine du 26 oct. 9,5 (en cours). Moyenne : 8,3, semaine en cours exclue. Depuis ta première séance, 12 semaines au plus, du lundi au dimanche ; en plein, les séries des exercices dont c’est le groupe principal ; en clair, les séries indirectes, comptées pour moitié ; en pointillés, la moyenne par semaine. »

**Seuils** (pour le groupe choisi) : indice = au moins 6 séances sur au moins 3 semaines différentes ; séries = au moins 3 semaines avec des séries sur le groupe parmi les 12. En dessous, à la place du graphique : « Pas encore assez de données pour analyser ta progression : 3 séances sur 6 nécessaires. » (chiffres réels ; « 2 semaines sur 3 », ou les deux : « 1 séance sur 6 et 1 semaine sur 3 nécessaires. »). Le graphique apparaît dès que le seuil est atteint.

**Couleurs** : cadres, courbe et barres dans la couleur du groupe choisi (`GROUP_COLORS`, §3.2), le reste neutre. Pas de vert, d'orange ni de rouge.

**Données de test** : `src/analysis/__tests__/simulation.ts` (fixture, jamais chargée par l'application, vérifié par le test 215) : du 1er juin au 22 octobre 2026, pectoraux en progression (retour à 3×8 au poids supérieur), dos en stagnation, épaules en régression, dips assistés (aide en baisse), semaines sans séance.

### 19.11. Alerte « groupe moins travaillé » (précision validée, version 1.38.0)

But : remarquer sans chercher qu'un groupe est délaissé depuis deux semaines.

- **Règle** : un groupe est en alerte quand ses séries des **2 dernières semaines terminées** sont **toutes les deux strictement sous sa moyenne**. La moyenne est celle des semaines terminées **avant** ces 2 semaines (elles ne la tirent pas vers le bas), de la première où le groupe a des séries, semaines vides comprises (vacances, comme la moyenne du graphique), **4 semaines au moins**. Mêmes séries que le graphique « Séries par semaine » (§19.10) : mêmes semaines (lundi – dimanche, depuis la semaine de la première séance, 12 au plus, donc 9 semaines de référence au plus, choix signalé à l'utilisateur), directes + indirectes ÷ 2, salle et maison ; la semaine en cours n'entre jamais dans le calcul (l'alerte change le lundi à 0 h 00).
- **Silencieuse tant que les données sont insuffisantes** : rien avant **6 semaines terminées au total** (depuis la semaine de la première séance terminée) ; ni pour un groupe qui a moins de 4 semaines de référence.
- **Groupes** : ceux du récapitulatif (§19.6, réglages) qui ont un graphique (§19.10) ; un sous-groupe des jambes affiché seul au récapitulatif n'en a pas.
- **Ligne d'un groupe** : discrète (15 px, gris clair, sans soulignement, seul le nom du groupe en gras et en blanc, la ligne entière cliquable, version 1.38.1 ; neutre comme le récapitulatif, ni couleur de groupe ni vert, orange ou rouge), avec ses propres chiffres (version 1.38.1) : « Dos : 3 séries par semaine depuis 2 semaines (ta moyenne : 5,3) », c'est-à-dire les séries des 2 semaines en moyenne (4 puis 2 : « 3 », choix signalé) et la moyenne de référence de l'alerte, arrondies à une décimale (« série » au singulier sous 2 : « 0 série ») ; « (ta moyenne : 6) » ne se coupe jamais ; la moyenne du graphique reste la sienne (4,8 pour le même dos : elle compte aussi les 2 semaines en baisse). Puis « Ignorer » à droite (lien d'action de 48 px, 8 px d'écart ; dessous si la place manque). **3 groupes au plus**, le plus en retrait d'abord (rapport des 2 semaines à la moyenne), puis l'ordre des groupes (choix signalé).
- **Onglet Progrès** : les lignes de tous les groupes en alerte, en haut, sous le bandeau des bilans (choix signalé : la pastille y mène), chacune avec son « Ignorer ».
- **Onglet Séance**, juste sous le récapitulatif : avec 1 seul groupe, sa ligne et son « Ignorer » ; à partir de 2 groupes (version 1.40.0), une seule ligne, « **3 groupes sous ta moyenne** : Pectoraux, Dos, Épaules » (même style), qui mène à l'onglet Progrès, où sont le détail et les « Ignorer ». « Démarrer une séance » reste à l'écran sans défiler (§3.7).
- **Un appui** ouvre le bilan du groupe (§19.10) directement sur ses séries par semaine (`#/bilan-groupes/<groupe>/series`), dans l'onglet Progrès ; « retour » ramène à l'écran d'où l'on vient.
- **Pastille** sur l'onglet Progrès tant qu'une alerte est affichée (§3.4) ; une seule pastille avec un bilan prêt.
- **« Ignorer »** (vacances, blessure) : l'alerte disparaît (ligne et pastille) jusqu'à ce que la situation change : elle revient si la semaine suivante est encore sous la moyenne ; un groupe qui se reprend n'est plus en alerte. Mémorisé sur l'appareil seulement (méta `groupAlertsIgnored` : groupe → lundi de la dernière semaine terminée au moment d'ignorer), comme les bilans déjà ouverts ; pas dans l'export.
- Pas de notification Android. Calcul pur (`src/analysis/groupAlerts.ts`), refait à l'affichage, jamais stocké ; aucun effet sur le moteur, le récapitulatif ni les bilans.
- **Données de test** : `src/analysis/__tests__/alertes-simulation.ts` (jamais chargée par l'application, vérifié par le test 289) : du 31 août au 9 novembre 2026, le dos en baisse 2 semaines, les pectoraux 1 semaine seulement, des vacances, et des variantes (historique trop court, vacances les 2 dernières semaines).
- Sur les vraies données (export du 30/10, première séance en octobre) : aucune alerte le 3 novembre 2026 (4 semaines terminées).

### 19.12. Récapitulatif du cardio (précision validée, versions 1.43.0, 1.44.0 et 1.44.1)

But : voir d'un coup d'œil le cardio fait, machine par machine. Simple consultation : aucun objectif, aucun effet sur le reste de l'appli.

- **Où** : écran « Cardio » (`#/cardio`), bouton « Cardio » de l'onglet Progrès, juste sous « Par groupe musculaire », au-dessus de « Mon poids » (version 1.43.1 ; dernière entrée, sous « Mon poids », en version 1.43.0) ; onglet Progrès actif, « ‹ » et « retour » vers Progrès. Rien sur l'accueil, dans les bilans (§19.7) ni dans le mail.
- **Périodes** : trois puces, « Cette semaine » (lundi 0 h 00 – dimanche, §19.6), « Ce mois » (mois calendaire), « Depuis le début » ; « Cette semaine » à l'ouverture, la puce choisie est gardée le temps de l'ouverture de l'appli (comme le filtre de la bibliothèque, choix signalé à l'utilisateur). Sur une ligne si elles tiennent, sinon elles passent à la ligne (360 px avec la police des tests), jamais coupées.
- **Séances comptées** : terminées, à la salle et à la maison, dans la période de leur début ; une séance en cours ne compte pas (choix signalé).
- **En haut** : la période (« Semaine du 2 au 8 nov. 2026 », « Novembre 2026 », « Depuis le 16 oct. 2026 », date du premier cardio) puis le total tous cardios confondus : « 1 h 40 · 13 fois · 5 machines » (version 1.44.0 : période en 13 px gris, temps en 28 px, le reste en 15 px gris). Pas de distance totale : les kilomètres de machines différentes ne s'additionnent pas (choix signalé). Sans cardio : « Aucun cardio cette semaine. » (« ce mois-ci », « Aucun cardio enregistré. »).
- **Une carte neutre par machine utilisée** (rameur compris), triée par temps décroissant (puis nombre de fois). Présentation en barres (précision validée, version 1.44.0, maquette « C · Mixte » retouchée, choisie parmi trois le 9 novembre 2026 ; avant, trois lignes de texte), pour lire sans effort :
  - **en tête**, le nom de la machine (17 px gras, pas un titre de section) à gauche et son temps en grand (22 px gras) à droite ; un nom long passe à la ligne, le temps reste entier ;
  - **barre du temps** (16 px de haut), longueur proportionnelle au temps de la machine sur le total de la période, **la même barre blanche pour toutes les machines** (aussi le tapis) ; lecteur d'écran : « 57 % du temps total » ;
  - **une ligne de détails** en 15 px gris : « 7 fois · moy. 8 min · 4,15 km · moy. 0,69 km 6/7 » ; distance totale et moyenne calculées sur les seules fois où elle est saisie, absentes sans aucune distance ; **« 6/7 »**, petite pastille discrète (13 px, contour fin) collée à la moyenne de distance, seulement quand la distance manque certaines fois (lecteur d'écran : « distance notée 6 fois sur 7 ») ; sur deux lignes (ou plus) si elle ne tient pas, chaque élément entier ;
  - **machine à inclinaison** (tapis) : sous les détails, une **fine barre empilée séparée** (8 px), sur toute la largeur, part du temps des blocs qui ont une inclinaison ; dessous, sa petite légende (13 px gris, trois carrés aux mêmes teintes : « neutre », « moyenne », « haute ») ; **teintes (précision validée, version 1.44.1)**, les gris de la 1.44.0 se distinguant mal sur le téléphone : **neutre = segment vide entouré d'un contour gris de 2 px** (`--incline-mid`, #90949e), **moyenne = gris plein** #90949e, **haute = blanc pur**, segments séparés par 2 px du fond, un niveau à 0 % n'est pas dessiné. Contrastes : contour et gris contre le fond (#0f1115) 6,2:1, gris contre blanc 3,0:1, blanc contre le fond 18,9:1 ; neutre et moyenne se distinguent par vide / plein. Trois gris pleins ne peuvent pas tous être à 3:1 entre eux et avec le fond (il faudrait 27:1 du fond au blanc, l'écran en offre 18,9:1) : option choisie par l'utilisateur parmi trois le 9 novembre 2026 ; pas de pourcentage affiché (lecteur d'écran : « Inclinaison : neutre 17 %, moyenne 56 %, haute 27 % », pourcentages entiers de somme 100, plus forts restes) ; pas de moyenne (pas une valeur numérique).
- **Machines** : regroupées par identifiant ; nom actuel des réglages, ou, pour une machine retirée des réglages, celui de son dernier bloc : elle apparaît quand même (choix signalé).
- **Style** : cadres neutres (§3.1), barres en gris et blanc seulement, ni couleur de groupe, ni vert, orange ou rouge, ni autre graphique ; chaque élément d'une ligne reste entier (« 0,69 km », « moy. 8 min »), la ligne passe à la ligne entre deux éléments, jamais un « · » en début de ligne.
- Calcul pur (`cardioSummary`, `inclinePercents`, `src/cardio/summary.ts`), refait à l'affichage, jamais stocké ; écran `src/ui/screens/CardioScreen.tsx`. Aucune donnée nouvelle, format `schemaVersion` 7 inchangé.
- Vraies données (export du 6/11, au 6 novembre 2026) : cette semaine et ce mois, 30 min · 4 fois (tapis 16 min, vélo elliptique 10, vélo 4) ; depuis le 16 octobre, 1 h 40 · 13 fois (tapis 59 min, 7 fois, distance sur 6 fois sur 7, neutre 17 % · moyenne 56 % · haute 27 % ; vélo elliptique 21 ; Autre 10 ; rameur 6, distance sur 1 fois sur 2 ; vélo 4) ; barres du temps à 59 %, 21 %, 10 %, 6 % et 4 % du total ; captures dans `perso/captures/cardio/` (1.43.0), `perso/captures/cardio-maquettes/` (maquettes A, B, C) et `perso/captures/cardio-1.44.0/`.

### 19.13. Export pour le coach (précision validée, versions 1.46.0, 1.47.0 et 1.47.1)

But : un fichier unique à donner à un assistant pour qu'il fasse un bilan de coach de la semaine passée, sans rien d'autre : complet, compact et lisible (clés en français, explicites ; aucun identifiant interne ; nombres déjà calculés).

- **Bouton** : onglet Progrès, sous « Cardio », au-dessus de « Mon poids » : bouton secondaire « Partager pour le coach », la semaine concernée en petit dessous (13 px, gris : « Semaine du 9 au 15 nov. », l'année seulement à cheval sur deux ans). Proposé seulement quand une séance a été terminée avant la semaine en cours (jamais de bouton inactif).
- **Semaine exportée** : toujours la **dernière semaine terminée** (lundi 0 h 00 – dimanche), quel que soit le bilan affiché : exporté le lundi 16 novembre (ou le jeudi 19), du 9 au 15 ; le dimanche 15 au soir, du 2 au 8. **Tout est arrêté au dimanche soir** : les séances, activités et pesées d'après n'y entrent pas, et le moteur est rejoué sans elles (cibles, séries de rouges, records tels qu'ils étaient), choix signalé à l'utilisateur.
- **Partage** : partage natif d'Android avec le fichier (Web Share API, `navigator.canShare({ files })`), titre « MyFitApp — données pour le coach, semaine du 9 au 15 nov. 2026 » ; si le navigateur refuse le fichier ou si le partage échoue, téléchargement (secours) ; un partage annulé ne fait rien d'autre. Message dessous : « Fichier partagé. » / « Fichier téléchargé : myfitapp-coach-2026-11-09.txt. ». **Fichier texte (précision validée, version 1.47.1)** : `myfitapp-coach-AAAA-MM-JJ.txt` (lundi de la semaine), type `text/plain`, contenu inchangé (le même JSON lisible) ; en version 1.46.0, un `.json` (`application/json`), que Chrome sur Android refuse de partager (il le télécharge : « Télécharger de nouveau le fichier ? », essai de l'utilisateur sur son téléphone, 12 novembre 2026) ; un `.txt` en texte brut fait partie des fichiers qu'il partage. Les deux boutons (sous « Cardio » et dans le bandeau) partagent le même `.txt`. Ignoré par git comme les sauvegardes (§22), `.json` et `.txt`.
- **Contenu** (`buildCoachExport`, `src/analysis/coach.ts`, calcul pur ; format `version_format` 1) :
  - en tête : `export`, `version_format`, `version_appli`, `genere_le`, `periode` (titre, du, au, et une note : données arrêtées au dimanche, unités) ;
  - `regles` : quelques paragraphes sur ce qui sert à interpréter : statuts et leur calcul, progression (+1 rép., poids supérieur, 4 rouges → poids inférieur, « Mal » neutre), séance standard et séance de départ, types d'exercice (charge, haltères « charge d'un haltère », assisté « aide », poids du corps, durée), salle et maison, séries par semaine (direct 1, indirect ½, maison en entier, activités et cardio des jambes 3, machines exclues), couleurs du récapitulatif avec le seuil réglé (rouge = volume atteint, pas un jugement), indice, alertes, séance pour compléter la semaine, ressentis ;
  - `contexte` : première séance, séances au total (salle / maison), semaines suivies, groupes du récapitulatif et seuil, habitudes, taille, 5 dernières pesées ;
  - `semaine` : chaque séance (date, jour, lieu, heure de début et durée en minutes à la salle seulement : à la maison elles ne sont pas significatives, choix signalé ; nom affiché, importée, prévue ; exercices dans l'ordre : exercice, variante, groupe et groupes secondaires, type, charge sous une clé explicite, cible, séries prévues, séries faites, ressenti, symbole d'origine, statut, validation, séance de départ, partielle), cardio (machine, minutes, distance, inclinaison), activités, pesées ;
  - `recapitulatif` : séances salle / maison ; par groupe du récapitulatif, le total en séries (le score de l'accueil le dimanche soir) et sa couleur, détaillé : directes, indirectes (½), dont à la maison, activités, cardio des jambes, séances et séances indirectes ; `texte_du_bilan` : le texte du mail du bilan de la semaine, ligne par ligne (identique une fois les lignes jointes) ;
  - `exercices` : chaque suivi fait dans les 8 dernières semaines (salle, maison, ou un seul suivi au poids du corps), par groupe : plage, séries standard, palier, recommandation (« +1 répétition », « poids supérieur », « garder le palier »…), prochaine cible (« 3 × 9 à 73 kg », « poids supérieur, puis 3 × 8 »), vertes consécutives, série de rouges en cours, record, 5 dernières performances (de la plus ancienne à la plus récente) ;
  - `tendance` : les 8 dernières semaines (sans semaine avant la première séance) : séances salle / maison, séries par groupe (score du récapitulatif), minutes de cardio par machine, activités, indice par groupe (base 100) à la fin de la semaine ; `indice_seuil_atteint` ;
  - `signaux` : alertes « groupe moins travaillé » à la fin de la semaine (ignorées sur l'appareil signalées), « En difficulté » du bilan, séries de rouges en cours (2 et plus), paliers validés et records battus (lignes du bilan), séance pour compléter la semaine telle qu'elle était proposée le dimanche à 23 h 59 (ou sa raison : aucune séance à la salle, séance à la salle le dimanche, tout à l'objectif), choix signalé.
- **Mise en forme** (`coachJson`) : JSON indenté, mais une liste ou un objet qui tient sur une ligne y reste, et une performance (objet sans sous-objet) aussi : une performance par ligne. Se relit avec `JSON.parse`.
- **Rappel dans le bandeau du lundi (précision validée, version 1.47.0)** : le bandeau « Ton bilan de la semaine est prêt » (§19.7) porte, sur sa propre ligne sous « Voir » et « Plus tard », un bouton secondaire « Partager pour le coach », qui lance le même export (`useCoachExport`, `src/ui/coachExport.ts`, une seule définition pour les deux boutons). Une fois le fichier partagé ou téléchargé, il est remplacé par « Envoyé au coach ✓ » pour cette semaine, mémorisé sur l'appareil seulement (méta `coachSent` : lundi de la dernière semaine envoyée ; pas dans la sauvegarde), même après relance ; un partage annulé ne change rien. Le bouton sous « Cardio » ne change pas, mais un envoi par lui compte aussi (choix signalé à l'utilisateur). Le bandeau du mois n'a pas de rappel. Partager ne vaut pas ouverture du bilan : pastille et bandeau restent jusqu'à « Voir ». Réglages › Bilans : case « Rappel de l'export coach », cochée par défaut, qui masque le bouton (et « Envoyé au coach ✓ ») ; champ `coachReminder` des réglages des bilans, dans la sauvegarde (absent d'une sauvegarde antérieure : coché ; format `schemaVersion` 7 inchangé). Sans bandeau de la semaine (réglage désactivé, bilan déjà ouvert, « Plus tard »), pas de rappel.
- Rien n'est stocké (sauf la semaine envoyée, sur l'appareil), aucun effet sur le moteur ni sur la sauvegarde (§11.10, format `schemaVersion` 7 inchangé).
- Vraies données (export du 12/11, exporté le 12 novembre : semaine du 2 au 8 nov.) : 48 097 octets (896 lignes), dans `perso/myfitapp-coach-2026-11-02.json` (exemple généré en version 1.46.0, avant le passage en `.txt` ; même contenu).

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
- Workflow GitHub Actions (`.github/workflows/deploy.yml`, machine `ubuntu-24.04`, épinglée) : à chaque push sur `main`, il installe les dépendances, lance la compilation TypeScript, les tests unitaires et les tests de bout en bout (format smartphone, à l'heure de Paris), construit l'application et la publie sur GitHub Pages. Le déploiement ne se fait pas si un test échoue.
- Lors d'une mise à jour, le service worker doit proposer de recharger la nouvelle version sans jamais effacer les données locales.
- Documenter dans le `README` : lancement local, tests, déploiement, et procédure d'installation sur téléphone.
- Licence du code : aucune pour l'instant (tous droits réservés), choix de l'utilisateur. Les illustrations gardent leur licence, CC BY-SA 3.0 ou 4.0 selon leur source (§4.0.1, `docs/illustrations.md`).

Les données restent uniquement sur l'appareil : GitHub Pages ne sert que les fichiers de l'application.

## 22. Données personnelles et identité git

Le dépôt est public : il ne contient ni données personnelles réelles, ni trace de l'identité professionnelle de l'utilisateur.

- **Données réelles** (séances, pesées, sauvegardes, fichiers d'origine) : uniquement dans `perso/`, ignoré par git. Elles ont été retirées de tout l'historique git. Les tests utilisent les copies anonymisées de `docs/exemples/` (§11.11 F). Toute nouvelle donnée réelle fournie va dans `perso/`, jamais dans le dépôt ni dans les tests. Une sauvegarde exportée par l'appli (`myfitapp-sauvegarde-*.json`) est ignorée par git où qu'elle soit (règle de `.gitignore`, 10 novembre 2026) ; déposée ailleurs (à la racine après un téléchargement), elle est rangée dans `perso/` sans être modifiée, et `perso/verifier-historique.sh` la signale (section 9 : chemin ayant existé dans l'historique, fichier suivi, contenu d'une sauvegarde de `perso/` présent dans la base git même orphelin, sauvegarde hors de `perso/`, règle absente). Un export pour le coach (`myfitapp-coach-*.json` en version 1.46.0, `myfitapp-coach-*.txt` depuis la version 1.47.1, §19.13), qui contient les mêmes données, est ignoré par git de la même façon (deux règles de `.gitignore`, `.json` et `.txt`), rangé lui aussi dans `perso/`, et le script le contrôle avec les mêmes vérifications, pour chacune des deux extensions (section 10, 12 novembre 2026).
- **Identité git** : configurée localement pour ce dépôt (`git config` sans `--global`) : `user.name` « Nicolas Senentz », `user.email` « nsenentz@hotmail.fr ». Tous les commits, auteur et committer, portent cette identité ; aucune adresse ni identité professionnelle ne doit apparaître dans l’historique, les messages ou les fichiers.
- **Vérification avant tout push** : `perso/verifier-historique.sh` (hors dépôt, puisqu'il contient les empreintes des données réelles) contrôle le contenu de tous les commits, les chemins, les messages, les objets orphelins et les identités ; `git log --all --format='%an <%ae> | %cn <%ce>' | sort -u` doit n'afficher que l'identité ci-dessus.
- **Script bloquant (précision validée)** : si le script signale quelque chose, on ne le contourne jamais en masquant la donnée (adresse découpée, assemblée, encodée…). Soit on ajuste sa liste blanche de façon explicite (règle commentée dans le script), soit on demande à l'utilisateur. Sa liste blanche d'adresses e-mail contient l'identité git, les adresses techniques et les domaines réservés aux exemples (`example.com`, `example.org`, `example.net`, RFC 2606) : une adresse de test s'écrit en clair dans l'un de ces domaines.
- **Captures d'écran (précision validée)** : toutes les captures préparées pour l'utilisateur sont rangées dans `perso/captures/`, jamais à la racine du dépôt ni dans un dossier suivi, et jamais dans `test-results/` : Playwright vide ce dossier à chaque lancement des tests de bout en bout (version 1.28.0).
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
