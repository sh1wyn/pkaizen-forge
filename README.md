# ⚒ Pkaizen Forge

Optimisation PC **réelle, sûre et 100% réversible** — boost FPS, réduction de latence, nettoyage, pilotes officiels et diagnostic de config. Fonctionne sur PC fixes **et** portables.

## Sécurité & anticheat

- ✅ Compatible **Vanguard, Easy Anti-Cheat, BattlEye, FACEIT** : aucun tweak kernel, Secure Boot / TPM / VBS jamais touchés automatiquement.
- ✅ Chaque tweak est **réversible en un clic** (valeurs Windows par défaut restaurées).
- ✅ Pilotes uniquement depuis des **sources officielles** : Windows Update (API COM signée Microsoft), winget, sites constructeurs.
- ✅ Point de restauration système en un clic avant d'optimiser.

## Fonctionnalités

| Onglet | Ce que ça fait |
|---|---|
| 📊 Diagnostic | Matériel complet, charge CPU/GPU/RAM en direct, **détection de bottlenecks** (RAM single-channel, XMP désactivé, HDD, 60 Hz oublié, Wi-Fi, batterie usée…) |
| ⚡ Optimiser | Plan d'alimentation, Game DVR off, Mode Jeu, HAGS, accélération souris off, latence réseau, télémétrie… avec score d'optimisation |
| 🧹 Nettoyage | Temp, cache Windows Update, miniatures, corbeille, DNS — avec tailles estimées avant suppression |
| 🔧 Pilotes | Scan des pilotes installés (âge), **installation auto via Windows Update**, mises à jour winget, liens officiels selon ta machine |
| 🚀 Démarrage | Désactivation/réactivation des applis au démarrage (sauvegarde automatique) |

## Dev

```bash
npm install
npm run dev        # lancement en développement
npm run build      # build
npm run dist       # installeur Windows (NSIS)
```

Stack : Electron + React + TypeScript + Vite ([systeminformation](https://www.npmjs.com/package/systeminformation) + PowerShell pour l'accès système).

> 💡 Lance l'app **en administrateur** pour débloquer les tweaks système et l'installation de pilotes.
