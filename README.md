# Sonora

Sonora est un convertisseur audio qui fonctionne entièrement dans le navigateur. Les fichiers sélectionnés sont traités sur l’appareil avec FFmpeg.wasm : aucun serveur de conversion ni compte n’est nécessaire.

## Formats

- MP3 : 128, 192, 256 ou 320 kb/s.
- WAV PCM : 16, 24 ou 32 bits.
- FLAC sans perte, Ogg Vorbis, Opus et M4A/AAC.
- Canaux source, mono, stéréo ou 5.1 selon le codec et le fichier d’origine.

Sonora peut extraire la piste audio d’un fichier vidéo fourni par l’utilisateur. Pour une vidéo YouTube dont tu détiens les droits, exporte le fichier avec YouTube Studio et sélectionne-le dans Sonora. Les liens YouTube, Spotify et autres plateformes ouvrent leur lecteur officiel ; ils ne donnent pas directement le fichier audio à convertir.

## Bibliothèque de playlists

Importe un fichier CSV exporté depuis un service musical, par exemple TuneMyMusic. Sonora reconnaît les colonnes usuelles `Track name` / `Title`, `Artist name` / `Artist`, `Album name` / `Album` et `Duration`. La bibliothèque, les modifications et l’ordre restent dans le stockage local du navigateur. Chaque entrée propose une recherche YouTube officielle ; Sonora ne télécharge pas le résultat. Tu peux exporter la liste en CSV ou la vider depuis la page.

## Développement

Prérequis : Node.js.

```sh
npm ci
npm run dev
npm run build
```

Vite utilise des chemins relatifs pour prendre en charge les dépôts de projet. La configuration de build copie le moteur FFmpeg WebAssembly dans `dist/ffmpeg/`.

## Déploiement GitHub Pages

Le workflow `.github/workflows/pages.yml` compile et publie automatiquement le site à chaque push sur `main`.

1. Crée un dépôt GitHub pour Sonora et place le contenu de ce dossier à la racine du dépôt (notamment `package.json`, `index.html`, `src/` et `.github/`).
2. Dans **Settings → Pages**, choisis **GitHub Actions** comme source de déploiement.
3. Envoie le code sur la branche `main`. Le workflow installera les dépendances, construira `dist/` et publiera le site.
4. Consulte **Actions** pour suivre le premier déploiement. L’adresse du site apparaîtra dans **Settings → Pages**.

Pour une vérification locale avant publication : `npm ci`, puis `npm run build`. Le site final est généré dans `dist/`.

## Limites

- Au premier traitement, le navigateur télécharge le moteur FFmpeg WebAssembly (environ 30 Mo), puis le réutilise pendant la session.
- Les fichiers source sont limités à 250 Mo. La conversion peut utiliser plusieurs fois cette quantité en mémoire ; la taille réellement praticable dépend donc de l’appareil et du navigateur.
- Les URL directes doivent pointer vers un fichier audio/vidéo et autoriser le chargement CORS depuis le site.
- Convertir une source compressée vers un format sans perte ou augmenter son débit ne restaure pas les détails audio déjà perdus.
