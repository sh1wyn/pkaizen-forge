<div align="center">

# ⚒ Pkaizen Forge

**Optimisation PC réelle, sûre et 100% réversible — pour PC fixes et portables.**

Boost FPS · Réduction de latence · Diagnostic complet · Pilotes officiels · Benchmark · Nettoyage

[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows&logoColor=white)](#-installation)
[![Release](https://img.shields.io/github/v/release/sh1wyn/pkaizen-forge?color=7c6cfb)](../../releases/latest)
[![Anticheat Safe](https://img.shields.io/badge/anticheat-Vanguard%20%7C%20EAC%20%7C%20BattlEye%20safe-30d158)](#-sécurité--anticheat)
[![Langues](https://img.shields.io/badge/langues-EN%20FR%20ES%20RU%20DE%20PT%20IT-38d8ff)](#)

</div>

---

## 📥 Installation

1. Télécharge **`Pkaizen Forge Setup x.x.x.exe`** depuis la [dernière release](../../releases/latest)
2. Double-clique → suis l'assistant → c'est installé (raccourci bureau + menu Démarrer)
3. 💡 **Lance l'app en administrateur** (clic droit → Exécuter en tant qu'administrateur) pour débloquer les tweaks système et l'installation automatique de pilotes

### ⚠ Avertissements Windows (app non signée)

L'app n'est pas encore signée numériquement (certificat payant). C'est **normal** de voir :

| Protection | Ce qui s'affiche | Quoi faire |
|---|---|---|
| **SmartScreen** | "Windows a protégé votre ordinateur" | *Informations complémentaires* → *Exécuter quand même* |
| **Smart App Control** (certains Windows 11) | Blocage sans option | SAC ne fait aucune exception pour les apps non signées. Soit le désactiver (Sécurité Windows → Contrôle des applications → Smart App Control → Désactivé — ⚠ réactivable uniquement en réinstallant Windows), soit attendre la version signée |

> Le code est 100% open-source dans ce repo — tu peux tout vérifier et builder toi-même (`npm run dist`).

---

## ✨ Fonctionnalités

| Onglet | Ce que ça fait |
|---|---|
| 📊 **Diagnostic** | Matériel complet (CPU/GPU/RAM par slot/disques/écrans/BIOS/TPM), charge en direct, **détection de bottlenecks gamer** : RAM single-channel, XMP désactivé, HDD, écran resté en 60 Hz, Wi-Fi, pilote GPU obsolète, batterie usée, uptime trop long… |
| ⚡ **Optimiser** | 15 tweaks réels et réversibles : plan d'alimentation Ultimate, Game DVR off, Mode Jeu, HAGS, accélération souris off, latence réseau, priorité CPU premier plan… Chaque tweak indique **son impact réel sur TA config** et pourquoi |
| 🧪 **Benchmark** | CPU (mono/multi-cœur), disque (lecture/écriture réelle), GPU (rendu WebGL) — **Indice Pkaizen** avec historique et comparaison avant/après optimisation |
| 🧹 **Nettoyage** | Temp, cache Windows Update, miniatures, corbeille, DNS — tailles estimées avant suppression, jamais tes fichiers persos |
| 🔧 **Pilotes** | Check par composant via les **canaux officiels** : API NVIDIA (version exacte dispo), carte mère/chipset/réseau/audio/SSD avec liens constructeurs directs, détection des périphériques **sans pilote**, installation auto via Windows Update, téléchargement direct NVIDIA avec progression |
| 🚀 **Démarrage** | Désactive les applis au boot (sauvegardées, réactivables en 1 clic) |
| 🌐 **Réseau** | **Speedtest** (serveurs officiels Cloudflare), ping/jitter/pertes, bench DNS comparatif et **changement de DNS en 1 bouton** |
| 🧭 **Navigateur** | Détecte ton navigateur + sa conso RAM en direct, recommande les meilleurs (perf/vie privée) installables en 1 clic |
| 📋 **Rapport** | Diagnostic HTML complet exportable — envoie-le à un pote pour diagnostiquer son PC à distance |

🌍 **7 langues** : English (défaut), Français, Español, Русский, Deutsch, Português, Italiano — sélecteur intégré, choix mémorisé.

---

## 🛡 Sécurité & anticheat

- ✅ **Compatible Vanguard, Easy Anti-Cheat, BattlEye, FACEIT** : aucun tweak kernel, Secure Boot / TPM / VBS jamais touchés automatiquement
- ✅ Chaque optimisation est **réversible en un clic** (valeurs Windows par défaut restaurées)
- ✅ Pilotes uniquement depuis des **sources officielles** : Windows Update (API Microsoft signée), API NVIDIA, winget, sites constructeurs — jamais de sites tiers
- ✅ **Point de restauration système** en un clic avant d'optimiser
- ✅ Aucune télémétrie, aucun compte, tout reste en local

---

## 🖥 Développement

```bash
git clone https://github.com/sh1wyn/pkaizen-forge.git
cd pkaizen-forge
npm install
npm run dev        # lancement en développement
npm run typecheck  # vérification TypeScript
npm run dist       # construire l'installeur Windows (release/)
```

**Stack** : Electron 33 · React 18 · TypeScript · Vite (electron-vite) · [systeminformation](https://www.npmjs.com/package/systeminformation) · PowerShell pour l'accès système Windows.

**Architecture** : `src/main/system/` contient les modules moteur (optimizer, analyzer, drivers, network, bench, cleaner…), `src/renderer/` l'interface React, `src/shared/types.ts` les types partagés. L'i18n UI vit dans `src/renderer/src/lib/i18n.tsx`, les textes moteur dans `src/main/system/i18n.ts`.

---

<div align="center">

*Fait par [sh1wyn](https://github.com/sh1wyn) — optimise sans casser.* ⚒

</div>
