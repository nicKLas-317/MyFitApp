# Historique des versions

Ce qui a changé à chaque version de MyFitApp, de la plus récente à la plus ancienne, et ce qui n'est plus vrai. Les règles en vigueur sont dans `CLAUDE.md` ; le détail de chaque changement, dans le commit indiqué (`git show <commit>`).

Les commits sans changement de numéro (documentation, tests, workflow) sont rangés sous la version en cours à ce moment-là.

## 1.55.1 — 20 nov. 2026

- Découpage de `src/transfer/backup.ts` sans changement de comportement (règle des gros fichiers, §0), préalable à la version 1.56.0 : format de la sauvegarde (`backupFormat.ts`), validation stricte (`backupValidate.ts`), lecture d'un JSON simple (`simpleJson.ts`), plan d'import (`importPlan.ts`), rappel de sauvegarde (`backupReminder.ts`), contrôles de type (`jsonGuards.ts`) ; `backup.ts` garde l'export, la migration et l'analyse d'un contenu JSON. Seuls les chemins d'import changent ailleurs ; `backup.ts` sort de la liste des gros fichiers (reste `draft.ts`)

## 1.55.0 — 19 nov. 2026

- Export pour le coach (§19.13) : nouvelle section `bibliotheque`, tous les exercices disponibles dans l'appli (bibliothèque et exercices personnalisés, marqués `personnalise`), même jamais faits, par groupe principal, une ligne par exercice : variantes, type, groupes secondaires, sous-groupes et articulations avec leurs poids (« dos épaisseur 1, épaules arrière ½, biceps brachial ½ », « épaule ½, coude ½ »), `deja_fait` (jusqu'au dimanche de la semaine exportée) et `variantes_faites` quand seules certaines variantes l'ont été. Exercices et variantes archivés exclus. Même bouton « Partager pour le coach » ; la règle en tête de l'export explique chaque champ
- Vraies données (sauvegarde du 19/11) : la bibliothèque fait 11 Ko sur 71 Ko (56 exercices, 36 déjà faits, 5 personnalisés) ; « Lat pulldown machine » est marqué jamais fait (aucune séance ne l'utilise)
- Tests : 328 (unitaire, avec quatre contre-tests), 311 (bout en bout : la bibliothèque dans le fichier partagé), 310 adapté ; la sauvegarde du 19/11 ajoutée au test de l'export sur les vraies données

## 1.54.0 — 19 nov. 2026

- Sous-groupes musculaires (§19.15) pour les 7 groupes : pectoraux haut, milieu, bas ; dos largeur, épaisseur, lombaires ; épaules avant, côté, arrière ; biceps longue, courte, brachial ; triceps longue, latérale, médiale ; jambes quadriceps, ischio-jambiers, fessiers, adducteurs, mollets ; abdominaux grand droit, obliques, transverse. Chaque série compte 1 pour le sous-groupe visé, ½ pour un sous-groupe sollicité moins directement (correspondance de la bibliothèque validée, groupes secondaires compris : ½ à un seul sous-groupe) ; salle et maison pareil ; ni activités ni cardio ; une répartition, pas une décomposition exacte des séries du groupe
- Les cinq exercices personnalisés de l'utilisateur ont leur correspondance exacte ; un futur exercice personnalisé est déduit des mots-clés de son nom, sinon de ses groupes, sinon réparti également ; aucun champ à remplir, sauvegarde inchangée
- Progrès › Par groupe musculaire : sous « Séries par semaine », les barres des sous-groupes sur les 4 dernières semaines terminées, à la couleur du groupe ; un sous-groupe à 0 en gris, « pas travaillé »
- Bilans de la semaine et du mois : section « Sous-groupes » repliable, fermée, seulement les groupes travaillés, en liste indentée (le groupe en gras, les sous-groupes avec un tiret, un 0 en gris) ; dans le mail, une ligne par groupe (« Épaules : avant 7, côté 1,5, arrière 0 »), les mêmes groupes
- Export pour le coach : `sous_groupes` (la semaine) et `sous_groupes_4_semaines`, et la règle
- Vraies données (export du 19/11) : les 39 exercices-variantes de l'historique ont leur correspondance ; sur les 4 dernières semaines terminées, l'arrière d'épaule à 6 (tirages horizontaux seulement), les lombaires et le haut des pectoraux à 0
- Tests : 324 à 326 (unitaires), 327 (bout en bout), 225 (Par groupe pour les biceps et les jambes, bilan avec les sous-groupes ouverts) ; 192 et 195 adaptés

## 1.53.0 — 19 nov. 2026

- Nouvelle alerte « articulation trop sollicitée » (épaule, coude, genou, §19.14). Chaque semaine, séries par articulation : 1 par série pour une articulation très sollicitée par l'exercice, ½ pour une articulation sollicitée moins directement (correspondance de la bibliothèque validée par l'utilisateur), salle et maison en entier ; 3 séries par activité confirmée pour chacune de ses articulations ; 3 séries pour le genou à partir de 15 min de footing dans la semaine. Exercices personnalisés et activités : articulations déduites de leurs groupes. En alerte quand la dernière semaine terminée atteint 1,5 fois la moyenne des 4 précédentes, avec au moins 5 séries de plus et au moins 10 séries ; muette tant qu'il n'y a pas 4 semaines terminées avant
- Bandeau lavande (#c4b5fd, texte #1e1036, contraste 9,6:1), même forme que le bandeau jaune, avec un cercle d'avertissement, sur l'onglet Séance (sous le bandeau jaune) et dans Progrès, avec la pastille de l'onglet Progrès. Texte court : « Coude : 18 séries contre 11 d’habitude » (moyenne arrondie à l'entier), « Épaule, Coude : forte hausse » pour plusieurs. Pas de lien. La croix masque toutes les articulations citées jusqu'au lundi suivant ; chacune revient si la nouvelle semaine terminée est encore en hausse
- Bilan de la semaine terminée (écran et mail), même ignorée : « Coude : forte hausse cette semaine (18 séries contre 11 d’habitude). Échauffe-toi bien et surveille les douleurs. » ; rien pour le mois ni la semaine en cours
- Export pour le coach : la règle, et dans les signaux les séries de chaque articulation, la moyenne des 4 semaines précédentes, la hausse (affichée ou ignorée)
- Cas le plus chargé de l'accueil (§3.7) : avec la phrase complète, « Démarrer » passait 49 px sous la barre d'onglets à 320 px ; avec le texte court, il reste à l'écran aux quatre tailles. Les deux bandeaux ensemble : limite acceptée
- Vraies données (sauvegarde du 17/11) : aucune alerte (muette jusqu'au 9 novembre ; le 16, épaule 21 contre 21,5, coude 20 contre 20,75, genou 6 contre 6)
- Tests : 320, 321, 322 (unitaires), 323 (bout en bout), 225 (accueil et Progrès avec les deux bandeaux, bilan avec les deux lignes) ; outils communs du cas le plus chargé sortis du test 291 dans `e2e/alertes-accueil.ts`

## 1.52.1 — 18 nov. 2026

- Alerte « groupe moins travaillé » : un seul bandeau cite tous les groupes en alerte, du plus bas au plus haut (à égalité, le plus bas la dernière semaine), sur l'onglet Séance comme dans Progrès. Un groupe : « Dos : 0 et 6 séries ces 2 semaines (sous 7) » ; plusieurs : « Dos, Pectoraux : sous 7 séries ces 2 semaines ». L'appui mène aux séries du premier groupe ; la croix masque tous les groupes cités, chacun jusqu'au lundi suivant (il revient si la nouvelle semaine terminée est encore sous le seuil). Version 1.51.0 : le groupe le plus bas seulement
- Texte du bandeau en 13 px sous 340 px de large, pour garder « Démarrer » à l'écran à 320 px avec 3 groupes cités (§3.7). Deux raccourcis automatiques du titre du récapitulatif, acceptés : à 320 px, même sans cardio, il perd les noms de jours ; à 360 px avec le texte à 115 % et du cardio, il perd « · 50 min de cardio » ; avec 6 groupes cités à 360 px et texte à 115 %, « Démarrer » peut passer sous la barre d'onglets : limite acceptée
- Bilan de la semaine (écran et mail) : pour une semaine terminée, sous les groupes travaillés, la ligne de l'alerte de cette semaine, même ignorée, au format du bandeau, avec les séries de chaque groupe quand il y en a plusieurs (« Dos, Pectoraux : sous 7 séries ces 2 semaines (Dos 0 et 6, Pectoraux 3 et 4) ») ; à l'écran, discrète, sans fond jaune. Rien dans le bilan du mois ni pour la semaine en cours
- Export pour le coach : la règle décrit le bandeau unique et la croix ; tous les groupes cités sont marqués affichés ; le texte du bilan porte la ligne de l'alerte
- Tests : 319 (unitaire et bout en bout), 225 (bandeau à six groupes, bilan de la semaine avec la ligne), 289, 290, 291, 310 ; 189, 191, 192 et 308 adaptés ; vraies données : aucune ligne au seuil de 6, celle du dos au seuil de 7

## 1.52.0 — 18 nov. 2026

- Alerte « groupe moins travaillé » en bandeau, le même sur l'onglet Séance et dans Progrès : fond jaune (#f7d046, distinct de l'orange du récapitulatif), texte foncé (#1f1a00, contraste 11,7:1), coins arrondis comme les cartes, petit triangle d'avertissement à gauche. Même texte, appui toujours vers les séries du groupe
- « Ignorer » devient une croix « ✕ » à droite dans le bandeau (48 × 48 px), toujours nommée « Ignorer l’alerte : <groupe> » pour le lecteur d'écran, même comportement : avec le mot, le texte passait sur 3 lignes à 320 px dans le cas le plus chargé de l'accueil (« Démarrer » 3 px sous la barre d'onglets) et le titre du récapitulatif se raccourcissait à 360 px avec le texte à 115 %
- Tests : 291 et 319 (bandeau, contraste, croix, même style sur les deux écrans) ; 225 (accueil et Progrès avec le bandeau)

## 1.51.0 — 18 nov. 2026

- Alerte « groupe moins travaillé », nouvelle règle : un groupe est en alerte quand son score de la semaine (celui du récapitulatif : séries directes, indirectes ½, maison, activités, cardio des jambes) est sous 6 séries sur chacune des 2 dernières semaines terminées. Plus de comparaison à la moyenne, plus de condition de 6 semaines terminées ni de 4 semaines de référence : l'alerte est possible dès 2 semaines terminées. Abdominaux jamais concernés
- Seuil réglable : Réglages › Récapitulatif de la semaine, « Alerte « moins travaillé » sous (séries) », de 3 à 9, 6 par défaut (champ `alertSets`, dans la sauvegarde ; 6 pour un réglage antérieur)
- Une seule alerte affichée à la fois, sur l'onglet Séance comme sur l'onglet Progrès : le groupe le plus bas sur les 2 semaines (à égalité, le plus bas la dernière semaine) ; un groupe ignoré laisse la place au suivant. Plus de ligne de résumé « 3 groupes sous ta moyenne » sur l'onglet Séance
- Texte de la ligne : « Dos : 4 et 2 séries ces 2 semaines (sous 6) » (avant : « Dos : 3 séries par semaine depuis 2 semaines (ta moyenne : 5,3) ») ; pastille « Progrès : groupe moins travaillé » (avant : « groupe sous ta moyenne »). « Ignorer » inchangé
- Export pour le coach : règle de l'alerte avec le seuil réglé, `contexte.seuil_alerte_series`, et dans les signaux tous les groupes sous le seuil avec leurs 2 scores et le seuil (`seuil` au lieu de `moyenne_avant`), celle affichée dans l'appli marquée
- Vraies données (sauvegarde du 17/11) : aucune alerte ne se serait déclenchée ; sous 6 une seule semaine : triceps (19 oct., 4,5 séries), dos (2 nov., 0)
- Tests : 319 (unitaire et bout en bout) ; 289, 290, 291, 296, 307, 310, 112 et 225 adaptés ; données simulées des alertes complétées (chaque groupe à 6 séries au moins une semaine ordinaire)

## 1.50.1 — 18 nov. 2026

- Découpage de `src/analysis/coach.ts` (656 lignes), sans changement de comportement : semaine exportée, libellé, nom du fichier, titre du partage et semaine envoyée dans `src/analysis/coachPeriod.ts`, mise en forme des valeurs (heures, ressentis, types, charges, cibles, recommandations) dans `src/analysis/coachFormat.ts`, règles dans `src/analysis/coachRules.ts`, JSON compact dans `src/analysis/coachJson.ts` ; `coach.ts` (474 lignes) garde la construction de l'export. Préalable à la version 1.51.0 (règle des gros fichiers, CLAUDE.md §0) ; `coach.ts` sort de la liste

## 1.50.0 — 18 nov. 2026

- Bilans de la semaine et du mois : une période en cours est comparée à la période précédente entière, comme une période terminée, pour tous les chiffres comparés (séances, durée en salle, cardio, activités), à l'écran comme dans le mail. Novembre au 17 : badminton ×1 contre futsal ×1 sur tout octobre, « = autant » ; en début de mois ou de semaine, les écarts sont négatifs et se rattrapent au fil de la période
- Libellé simple, sans date : « Par rapport au mois dernier » / « Par rapport à la semaine dernière » à l'écran ; « par rapport au mois dernier », « autant que la semaine dernière »… dans le mail, aussi pour une période terminée
- Durée en salle toujours comparée, sur la somme des durées connues ; une séance sans durée (importée sans heure) compte pour 0 et reste signalée (« 2 séances sans durée »). Plus de « pas de comparaison ». Dans le mail, l'écart est désormais celui des durées affichées, arrondies à la minute, comme à l'écran (« 4 h 02 » contre « 4 h 14 » : −12 min, et non −13)
- Historique : de la version 1.21.3 à la version 1.49.3, une période en cours était comparée à la même portion de la précédente (« par rapport au 1er–17 du mois dernier », « à lun.–ven. de la semaine dernière »), une période terminée « à la semaine précédente » / « au mois précédent », et la durée n'était pas comparée dès qu'une séance des deux intervalles était sans durée
- Tests : 318 (unitaire et bout en bout) ; 191, 237, 256, 284, 194 et 285 adaptés ; 225 : bilan de la semaine avec une séance sans durée

## 1.49.3 — 18 nov. 2026

- Découpage de `src/analysis/report.ts` (766 lignes), sans changement de comportement : périodes des bilans (semaine, mois, clés, titres, objet du mail, période par défaut) dans `src/analysis/reportPeriod.ts`, réglages des bilans et bilans à signaler dans `src/analysis/reportSettings.ts`, données de l'écran du bilan (tuiles, bâtons, calendrier, échelles) dans `src/analysis/reportScreen.ts` ; `report.ts` (504 lignes) garde le calcul du bilan, ses sections et le texte du mail. Préalable à la version 1.50.0 (règle des gros fichiers, CLAUDE.md §0) ; `report.ts` sort de la liste

## 1.49.2 — 17 nov. 2026

- Bilan par groupe musculaire, « Séries par semaine » : la barre de la semaine en cours garde les mêmes teintes que les autres semaines (direct plein, indirect clair) ; elle se distingue par un contour en pointillés à la couleur du groupe, autour de la barre (son total au-dessus), et par « en cours » sous sa date. Aucun calcul ne change
- Historique : depuis la version 1.34.0, la semaine en cours était plus transparente (opacité 0,45, contour plein collé à la barre) et ressemblait à une barre d'indirect (clair, 0,4) : 3 séries directes faites à la maison le 17 novembre semblaient comptées en indirect, alors que le récapitulatif, les bilans et le graphique les comptaient bien en direct
- Test 43 (bout en bout) : le second appareil s'ouvre à l'adresse de la configuration (`baseURL`), comme le test de `data.spec.ts`, au lieu de `localhost:4173` écrit en dur : il passe aussi dans les passes parallèles (autres ports). Ce qu'il vérifie ne change pas

## 1.49.1 — 16 nov. 2026

- Ajout d'un exercice, recherche : dès qu'un texte est tapé, l'ordre suit d'abord la pertinence (« shoulder press » : le développé épaules machine avant le chest press, même fait récemment) ; les favoris, puis les exercices faits au lieu de la séance, ne départagent que des résultats de même pertinence. Une seule liste, sans intertitres. Sans texte (liste complète ou filtre par groupe), l'ordre « Favoris / Récents / Tous les exercices » ne change pas
- Historique : en 1.49.0, les résultats d'une recherche étaient répartis en « Favoris / Récents / Tous les exercices », un favori ou un récent moins pertinent passant avant le meilleur résultat

## 1.49.0 — 16 nov. 2026

- Ajout d'un exercice (en séance et dans la préparation de la séance prévue) : d'abord les favoris, puis les exercices déjà faits au lieu de la séance, du plus récent au plus ancien (à la salle : séances à la salle ; à la maison : séances à la maison ; séance prévue : salle), puis tous les autres dans l'ordre de la bibliothèque, chacun une seule fois, sous des intertitres discrets « Favoris », « Récents », « Tous les exercices ». Même ordre dans les résultats d'une recherche (pertinence à l'intérieur de chaque part) et avec un filtre par groupe. La bibliothèque (onglet Plus) ne change pas
- Proposition d'ajuster le nombre de séries : un exercice fait 3 séances de suite (même suivi) avec le même nombre de séries, inférieur à son nombre de séries standard, propose sur sa fiche et sur sa carte en séance « Tu fais souvent 2 séries : passer à 2 ? ». « Oui » change le nombre de séries standard de l'exercice (rien d'autre, ni la cible ni l'historique) ; « Non » la masque jusqu'à 3 nouvelles séances (mémorisé sur l'appareil). Jamais à la hausse
- Historique : l'écran d'ajout était celui de la bibliothèque : « Récents » (6 au plus ; à la maison, ceux de la maison puis ceux de la salle ; à la salle, toutes les séances) avant « Favoris », puis les groupes avec leurs titres, un exercice pouvant figurer trois fois ; dans une recherche, un favori ne passait devant qu'à pertinence égale

## 1.48.2 — 16 nov. 2026

- Découpage de `src/app/store.tsx` (741 lignes), sans changement de comportement : types de l'état de l'appli dans `src/app/appTypes.ts`, lecture de la base dans `src/app/stored.ts` (`loadStored`), réglages, activités, séance prévue et mémoire de l'appareil dans `src/app/useStoredMeta.ts` ; `store.tsx` (414 lignes) garde le fournisseur, les séances, la bibliothèque, l'enregistrement et la relecture entre fenêtres. Préalable à la version 1.49.0 (règle des gros fichiers, CLAUDE.md §0) ; `store.tsx` sort de la liste

## 1.48.1 — 12 nov. 2026

- Carte « Ma séance prévue » de l'accueil : de nouveau un seul bouton vers la préparation, sans lien vers les fiches, avec son allure d'avant. Les liens vers la fiche restent dans le détail de la séance prévue (préparation) et dans la séance pour compléter la semaine
- Historique : en 1.48.0, chaque nom d'exercice de la carte de l'accueil était un lien (lignes plus hautes, noms soulignés)
- CLAUDE.md §0 : les gros fichiers (`report.ts`, `store.tsx`, `backup.ts`, `draft.ts`, `coach.ts`) sont découpés au fil de l'eau, chacun dans une version corrective séparée, sans changement de comportement, avant la première demande qui le modifie
- CLAUDE.md §0 : exception pour un correctif urgent (perte ou corruption de données, appli inutilisable, saisie bloquée), qui passe directement ; le fichier est découpé dans la version suivante

## 1.48.0 — 12 nov. 2026

- Séance prévue → fiche de l'exercice : dans la préparation, la carte « Ma séance prévue » de l'accueil et la séance pour compléter la semaine, un appui sur la vignette ou le nom d'un exercice ouvre sa fiche (zone limitée à la vignette et au nom, 48 px ; sur l'accueil, chaque nom est un lien, le reste de la carte ouvre toujours la préparation ; retiré de l'accueil en 1.48.1). Le retour (bouton ou geste d'Android, flèche « ‹ ») ramène exactement où l'on était : même position, ordre, cardio en cours d'ajout ou de correction, confirmation ouverte. Pendant la séance à la salle, rien ne change (« Voir la fiche de l'exercice » reste dans le menu de la carte)
- Partout : « retour » rend la position de défilement exacte de l'écran (l'appli la gère seule, plus le navigateur, qui la rétablissait à quelques pixels près), un écran ouvert autrement s'ouvre en haut ; menu « ⋯ » ouvert : un appui ailleurs ne fait que le fermer, sans activer ce qui est dessous ou à côté

## 1.47.1 — 12 nov. 2026

- Export pour le coach en fichier texte : `myfitapp-coach-AAAA-MM-JJ.txt` (`text/plain`), même contenu (JSON lisible), pour le bouton sous « Cardio » comme pour celui du bandeau du lundi ; téléchargement en secours si le partage n'est pas disponible. `.gitignore` : `myfitapp-coach-*.txt` en plus de `.json`
- Historique : en 1.46.0 et 1.47.0, l'export était un `.json` (`application/json`) que Chrome sur Android refusait de partager : il le téléchargeait (« Télécharger de nouveau le fichier ? »)

## 1.47.0 — 12 nov. 2026

- Rappel de l'export pour le coach : le bandeau « Ton bilan de la semaine est prêt » (onglet Progrès, chaque lundi) porte un bouton « Partager pour le coach », qui lance le même export que le bouton sous « Cardio » (dernière semaine terminée). Une fois le fichier partagé ou téléchargé, il devient « Envoyé au coach ✓ » pour cette semaine, mémorisé sur l'appareil (un envoi par le bouton sous « Cardio » compte aussi). Réglages › Bilans : case « Rappel de l'export coach », cochée par défaut, pour le masquer ; gardée dans la sauvegarde. Le bouton sous « Cardio » ne change pas

## 1.46.0 — 12 nov. 2026

- Export « coach » : dans l'onglet Progrès, sous les bilans, un bouton secondaire « Partager pour le coach », avec la semaine concernée en petit (« Semaine du 9 au 15 nov. »). Il exporte toujours la dernière semaine terminée (lundi – dimanche), quel que soit le bilan affiché, dans un fichier `myfitapp-coach-AAAA-MM-JJ.json` (date du lundi), partagé par le partage d'Android avec le fichier, sinon téléchargé. Contenu, arrêté au dimanche soir : règles utiles à l'interprétation (avec le seuil du rouge réglé), contexte (première séance, séances, semaines suivies, habitudes, taille et dernières pesées), la semaine en détail (séances, performances avec statut et séance de départ, cardio, activités, pesées), son récapitulatif en séries détaillé et le texte de son bilan (identique au mail), les exercices des 8 dernières semaines (cible et recommandation, série de rouges, record, 5 dernières performances), la tendance sur 8 semaines (séries par groupe, séances, cardio, activités, indice par groupe) et les signaux (alertes, difficultés, paliers validés, records, séance pour compléter la semaine). Clés en français, aucun identifiant interne, JSON compact (une performance par ligne). L'export complet ne change pas ; `myfitapp-coach-*.json` est ignoré par git comme les sauvegardes

## 1.45.0 — 10 nov. 2026

- Récapitulatif de la semaine en séries : le score d'un groupe correspond aux séries du graphique « Séries par semaine » (directes, plus les indirectes divisées par 2, salle et maison en entier), avec 3 séries par activité confirmée et par groupe sollicité, et 3 séries pour les jambes à partir de 45 min de cardio. Vert sous 3 séries, orange de 3 jusqu'au seuil du rouge, rouge à partir du seuil ; cases « Jambes (15 séries) », « Biceps (4,5 séries · badminton) », « Jambes (6 séries · +50 min cardio) », « · hier ». « Hier » / « aujourd'hui » comptent aussi les groupes secondaires d'une séance à la maison. Tri, en-tête et moteur inchangés. Titre raccourci : 4ᵉ forme `compact` (titre court et case Jambes sans « +50 min cardio »), seulement quand « Démarrer » ne tiendrait pas autrement (320 × 711 px dans le cas le plus chargé)
- Réglages : « Rouge à partir de (séries) », de 6 à 20, 10 par défaut ; un ancien réglage en séances est converti à 5 séries par séance (2 → 10, 3 → 15, 4 et plus → 20)
- Bilans de la semaine et du mois : bâtons en séries, « 6,5 séries » en petit sous le nom du groupe dans le tableau (colonnes inchangées), phrase « Jambes : +3 séries pour 50 min de cardio. » ; mail « Pectoraux : 6,5 séries (1 séance, +2 séries maison) », « Triceps : 1,5 série », « Jambes : 12 séries (1 séance, +1 indirect, +100 min cardio sur 2 semaines) » ; « Non travaillés » seulement sans aucune série ni part
- Séance pour compléter la semaine : objectif en séries (10 par défaut) ; après le 1ᵉʳ exercice de chaque groupe, un 2ᵉ aux groupes encore sous l'objectif (2 par groupe, 6 en tout), comptés avec les séries standard de chaque exercice ; un groupe est complété par le groupe secondaire d'un exercice retenu quand la séance projetée l'amène à l'objectif ; la règle des 4 exercices au moins est gardée ; un groupe que cela ne suffit pas à amener à l'objectif reste dans « Encore sous l'objectif »
- Historique : avant, le récapitulatif comptait en séances : 1 par séance directe (« 1× »), ½ par séance indirecte et par activité (« +1 indirect »), la maison à 1/12 par série plafonnée à ½ par semaine (« +5 séries maison »), ½ pour le cardio des jambes, et jamais plus de 1 par jour et par groupe pour la salle, la maison et les activités ; vert sous 1, rouge à partir de 2 séances (réglable de 2 à 7). Le plafond de 1 par jour disparaît aussi des colonnes « Indirect » et « Maison (séries) » du tableau des bilans. La séance pour compléter la semaine visait 2 séances, avec un exercice par groupe (un 2ᵉ seulement pour atteindre 4 exercices), et un groupe à qui il manquait ½ au plus était complété par un groupe secondaire. « Hier » ignorait les groupes secondaires à la maison. Une performance partielle importée (sans répétitions) comptait comme une séance ; elle compte maintenant 0 série (case verte), mais toujours pour « hier » et la colonne « Séances » (« Dos : 0 série (1 séance) »). Un groupe travaillé seulement en secondaire à la maison était dans « Non travaillés »

## 1.44.1 — 9 nov. 2026

- Écran « Cardio », barre d'inclinaison du tapis : neutre en segment vide avec un contour gris, moyenne gris plein (#90949e), haute blanc pur, séparateurs de 2 px, légende aux mêmes teintes ; au moins 3:1 entre deux teintes voisines et avec le fond (avant : gris moyenne et haute à 1,7:1, mal distingués sur le téléphone)

## 1.44.0 — 9 nov. 2026

- Écran « Cardio » en barres (maquette C retouchée) : nom et temps en grand sur une ligne, barre du temps proportionnelle au total, la même barre blanche pour toutes les machines, une ligne de détails « 7 fois · moy. 8 min · 4,15 km · moy. 0,69 km 6/7 » (« sur 6 fois sur 7 » devient la pastille « 6/7 ») ; pour le tapis, une fine barre d'inclinaison séparée et sa légende au lieu des pourcentages. Avant : trois lignes de texte par machine

## 1.43.1 — 9 nov. 2026

- Onglet Progrès : l'entrée « Cardio » passe juste sous « Par groupe musculaire », au-dessus de « Mon poids » (elle était la dernière, sous « Mon poids »)

## 1.43.0 — 9 nov. 2026

- Nouvel écran « Cardio » (`#/cardio`), dernière entrée de l'onglet Progrès, sous « Mon poids » : « Cette semaine », « Ce mois », « Depuis le début » ; total de la période, puis une carte neutre par machine (rameur compris, salle et maison, machine retirée des réglages comprise), triées par temps : temps, nombre de fois, moyenne ; distance et moyenne sur les fois où elle est saisie ; répartition du temps par inclinaison pour le tapis. Sans objectif, rien sur l'accueil, dans les bilans ni le mail, aucun effet sur le reste
- Tests : le contrôle « rien ne dépasse de l'écran » (test 225 et 21 autres contrôles) comparait la largeur de la page à `innerWidth`, qui grandit avec la page en émulation mobile (Pixel 7) : il ne voyait aucun débordement. Il la compare maintenant à la largeur de l'écran (`clientWidth`)

## 1.42.1 — 6 nov. 2026

- Bilans (écran et mail) et bilan de progression : « série de 4 rouges à 100 kg → poids inférieur recommandé », « (série en cours : 3 rouges à 100 kg) », « série en cours : 2 rouges », libellé « Série en cours d’au moins 2 séances rouges. » ; plus de « 4ᵉ séance rouge de suite », « 3 de suite », « rouges de suite » ni « consécutives », inexacts depuis qu'une séance « Mal » ne coupe plus la série (1.42.0)

## 1.42.0 — 6 nov. 2026

- Moteur : une séance orange « Mal passé » ne remet plus le compteur de rouges à 0 (neutre, comme une séance incomplète) et laisse une baisse déjà recommandée ; avant, « Mal », « Très mal », « Mal », « Très mal »… ne menait jamais à « poids inférieur » (option B1, choisie après simulation ; aucun écart sur les vraies données)
- Fiche : « Série en cours : 2 séances rouges » sous le record, à partir de 2 rouges, masquée quand une baisse est recommandée ; « · séance de départ » dans l'historique pour une séance faite à une charge changée sans recommandation
- Carte en séance : « ↓ / ↑ Nouvelle charge : séance de départ » (« Nouvelle aide : séance de départ » pour un exercice assisté) quand la charge saisie change sans recommandation du moteur

## 1.41.4 — 5 nov. 2026

- Changer la date d'une séance passée : début et fin au nouveau jour, à la même heure ; comptée dans sa nouvelle semaine partout (avant : le récapitulatif, les bilans et les séries par semaine la gardaient dans l'ancienne)
- CLAUDE.md : fin du §15 (« Les tests doivent vérifier… » et « Tests de bout en bout fiables ») remise après le dernier test ; la version B l'avait déplacée par erreur entre les tests 241 et 242
- Tests : garde contre les fichiers « .uuid » de fontconfig (`e2e/uuid-guard.mjs`, fin de chaque passe) et avertissement dans `e2e/fonts/fonts.conf` ; les 75 fichiers créés le 5 novembre hors node_modules (par un essai avec `prefix="relative"`) sont supprimés
- Tests 43, 202 et 246 : le texte du fichier importé est lu une fois la zone de saisie remplie (`importedText`) ; le test 202 avait échoué sur la machine de GitHub en le lisant aussitôt

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
