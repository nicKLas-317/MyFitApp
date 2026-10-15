# Tester MyFitApp sur un téléphone, en réseau local

Pour essayer l'application sur un téléphone avant la mise en ligne sur GitHub Pages.

## Procédure

1. Connecter le téléphone au même réseau Wi-Fi que l'ordinateur.
2. Sur l'ordinateur, dans le dossier du projet :

   ```bash
   nvm use                # Node 24, lu dans .nvmrc
   npm run preview:lan    # construit l'application puis la sert sur le réseau local
   ```

3. Relever l'adresse affichée sur la ligne `Network` qui correspond à la carte réseau réelle (Wi-Fi ou Ethernet, en 192.168.x.x), suivie de `/MyFitApp/`, par exemple `http://192.168.1.20:4173/MyFitApp/`. Ignorer les adresses des interfaces Docker (172.x.x.x, `br-…`, `docker0`) et du VPN (`tun0`).
4. Ouvrir cette adresse dans le navigateur du téléphone.

Variante : `npm run dev:lan` (port 5173) recharge l'application à chaque modification du code, mais il est plus lent et moins représentatif de la version publiée.

## Si la page ne s'ouvre pas

- Pare-feu : `sudo ufw allow 4173/tcp` (et `5173/tcp` pour `dev:lan`).
- Un VPN actif peut bloquer l'accès au réseau local : le couper le temps du test.
- Vérifier que le téléphone n'est pas sur un réseau « invité » isolé.

## Limites de ce mode de test

- En HTTP simple, le navigateur n'accorde ni le stockage persistant, ni l'installation de l'application, ni le service worker (pas de fonctionnement hors ligne) : les réglages affichent « non pris en charge ». C'est normal ; la version GitHub Pages (HTTPS) permet tout cela.
- **Les données sont propres à l'adresse utilisée.** Le navigateur range les données de chaque site selon son adresse exacte (protocole, adresse et port) : `http://192.168.1.20:4173`, `http://192.168.1.20:5173` et la future adresse GitHub Pages sont trois espaces séparés. Les séances saisies en test n'apparaîtront donc pas dans la version GitHub Pages.
- L'adresse locale de l'ordinateur peut changer (attribution automatique par la box) : les données saisies à l'ancienne adresse ne s'affichent plus à la nouvelle, sans être effacées pour autant.
- Pour conserver des séances saisies en test : **Importer / exporter → Exporter mes données** à l'ancienne adresse, puis importer le fichier à la nouvelle (ou sur la version GitHub Pages).
