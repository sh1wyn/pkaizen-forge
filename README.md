<div align="center">

# ⚒ Pkaizen Forge

**Diagnostic, réglages Windows et analyse gaming mesurée — pour PC fixes et portables.**

Boost FPS · Réduction de latence · Diagnostic complet · Pilotes officiels · Benchmark · Nettoyage

[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows&logoColor=white)](#-installation)
[![Release](https://img.shields.io/github/v/release/sh1wyn/pkaizen-forge?color=7c6cfb)](../../releases/latest)
[![License MIT](https://img.shields.io/badge/license-MIT-30d158)](LICENSE)
[![Langues](https://img.shields.io/badge/langues-EN%20FR%20ES%20RU%20DE%20PT%20IT-38d8ff)](#)

</div>

---

## 📥 Installation

1. Télécharge **`Pkaizen-Forge-Setup.exe`** depuis la [dernière release](../../releases/latest)
2. Double-clique → suis l'assistant → c'est installé (raccourci bureau + menu Démarrer)
3. Utilise le mode utilisateur pour les diagnostics, jeux installés et analyses CSV. Les droits administrateur ne sont nécessaires que pour certaines modifications système et installations de pilotes.

### ⚠ Avertissements Windows (app non signée)

L'application n'est pas encore signée numériquement. Windows peut la bloquer.
**Ne désactive pas antivirus, SmartScreen ou Smart App Control pour l'exécuter.**
En cas de blocage, attends une version signée ou examine puis compile les sources dans un environnement de développement adapté.

> Le dépôt est public et le code du projet est sous [licence MIT](LICENSE). Le code consultable ne prouve pas à lui seul qu'un binaire téléchargé correspond aux sources.

---

## ✨ Fonctionnalités

| Onglet | Ce que ça fait |
|---|---|
| 📊 **Diagnostic** | Matériel complet (CPU/GPU/RAM par slot/disques/écrans/BIOS/TPM), charge en direct, **détection de bottlenecks gamer** : RAM single-channel, XMP désactivé, HDD, écran resté en 60 Hz, Wi-Fi, pilote GPU obsolète, batterie usée, uptime trop long… |
| ⚡ **Optimiser** | Sélection prévisualisée, profils « Gaming prudent » et « Confort du bureau », arrêt après l'action en cours, états indisponibles bloqués et exclusions explicites portable/admin. Réglage des transparences avec sauvegarde/restauration de la valeur précédente. Les indications d'impact des réglages historiques sont des conseils, pas des gains mesurés |
| 🧪 **Benchmark gaming** | Détection des jeux Steam/Epic, guides pour 8 jeux populaires et saisie libre ; import de temps de trame réels, FPS moyens, 1% low, pics, budget 60/144/240 FPS, historique local et comparaison. Aucun FPS prédit depuis un score synthétique |
| 🖥 **Conseil écran** | Résolution/Hz détectés, choix multi-écran, analyse prudente des captures à la même résolution sans génération d'images, distinction entre un jeu et plusieurs jeux. Pas d'extrapolation vers la 1440p/4K |
| 🎮 **Préparer le gaming** | Contrôles en lecture seule : CPU/RAM, espace disque, batterie, écrans, connexion et redémarrage ; raccourcis vers les paramètres Windows |
| 🛡 **Confiance** | Code source, licence, limites de compatibilité, connexions externes et procédure SHA-256 |
| 🧹 **Nettoyage** | Temp, cache Windows Update, miniatures, corbeille, DNS — tailles estimées avant suppression, jamais tes fichiers persos |
| 🔧 **Pilotes** | Check par composant via les **canaux officiels** : API NVIDIA (version exacte dispo), carte mère/chipset/réseau/audio/SSD avec liens constructeurs directs, détection des périphériques **sans pilote**, installation auto via Windows Update, téléchargement direct NVIDIA avec progression |
| 🚀 **Démarrage** | Désactive les applis au boot (sauvegardées, réactivables en 1 clic) |
| 🌐 **Réseau** | **Speedtest** (serveurs officiels Cloudflare), ping/jitter/pertes, bench DNS comparatif et **changement de DNS en 1 bouton** |
| 🧭 **Navigateur** | Détecte ton navigateur + sa conso RAM en direct, recommande les meilleurs (perf/vie privée) installables en 1 clic |
| 📋 **Rapport** | Diagnostic HTML complet exportable — envoie-le à un pote pour diagnostiquer son PC à distance |

🌍 Interface historique multilingue. Les nouveaux guides gaming, préparation et confiance sont disponibles en **français/anglais** ; un message signale le repli en anglais pour les autres langues.

## 🎮 Mesures gaming : mode d'emploi et limites

1. Dans Benchmark, clique **Trouver mes jeux installés**. La détection lit les manifestes Steam/Epic et vérifie le dossier d'installation, sans lancer de jeu ni en vérifier l'intégrité. Les bibliothèques Steam secondaires sont incluses ; autres lanceurs et jeux portables restent saisissables manuellement.
2. Choisis un guide puis renseigne **les vrais réglages utilisés**, la résolution, la scène, la version du jeu et le PC/mode d'alimentation. Les guides sont des points de départ, pas des promesses de FPS.
3. Capture **30 à 60 secondes** avec [PresentMon](https://github.com/GameTechDev/PresentMon) ou un export brut de [CapFrameX](https://www.capframex.com/), sur un seul processus et une seule swap chain. Forge n'intègre pas de capture automatique en jeu. Respecte les règles du jeu et de son anticheat.
4. Exporte un CSV contenant une image par ligne et une colonne `MsBetweenPresents`, `FrameTime (ms)`, `frametime_ms` ou `Frametime`, **en millisecondes**. Séparateurs acceptés : virgule, point-virgule ou tabulation ; décimales à virgule avec point-virgule/tabulation. Limites : 16 Mio, 250 000 images, minimum 120 images. Les zéros d'initialisation, valeurs invalides et mélanges de processus sont signalés, pas corrigés silencieusement.
5. Importe et compare des parcours identiques. Une hausse des FPS sur une autre carte ou après une mise à jour du jeu n'est pas une preuve d'effet de Forge.

**Méthode publiée :**
- FPS moyens = nombre d'images × 1 000 / somme des temps de trame.
- 1% low = 1 000 / moyenne des `ceil(N × 0,01)` temps de trame les plus longs. Ce n'est ni le minimum FPS ni l'inverse du percentile 99.
- P99 = percentile par rang supérieur ; pics = images strictement au-delà de 50/100 ms.
- Budget cible = proportion d'images dont le temps est inférieur ou égal à `1 000 / FPS cible`, pas proportion du temps de jeu.
- Graphique : maximum par groupe chronologique d'images, pour ne pas masquer les pics.
- Conseil écran : captures d'au moins 30 secondes, même résolution de sortie, génération d'images confirmée désactivée. Palier supérieur uniquement si le plus faible 1% low retenu l'atteint ; sous 80% des Hz actuels, priorité à la régularité. Ces seuils sont des heuristiques explicites, pas une certification. Moins de trois jeux n'est pas une recommandation d'achat globale.

Les données importées mesurent les intervalles de présentation : elles ne garantissent pas les images réellement affichées et ne mesurent pas la latence d'entrée. Menus, limite FPS, V-Sync, shaders et génération d'images affectent les mesures. Refais trois essais. Aucun résultat d'une autre résolution n'est inventé.

Les temps bruts restent en mémoire ; seuls les dix derniers résumés volontairement enregistrés persistent localement. L'export JSON ne contient pas les chemins d'installation ni les temps bruts. L'historique peut être effacé dans l'interface.

Le benchmark propose trois parcours : **Tester ce PC**, **FPS dans mes jeux** et **Comparer aux tests publiés**. Le diagnostic local conserve une charge CPU limitée à quatre workers et un test disque temporaire (lecture possiblement cachée). La nouvelle scène 3D Forge, en 1280 × 720 avec jusqu'à 64 étapes de ray marching par pixel, mesure le temps GPU via `EXT_disjoint_timer_query_webgl2` quand disponible (au moins 10 mesures après préchauffage, rejet si horloge disjointe). Le débit de présentation autour de 60 FPS n'est plus affiché comme résultat gaming. Sans compteur fiable, le temps GPU est déclaré indisponible. **Ce n'est pas un stress test, un score 3DMark ou une prédiction de FPS en jeu.** Les anciens résultats CPU sont conservés ; les anciennes mesures GPU ne sont pas assimilées à la nouvelle scène.

La section références permet d'afficher CPU/GPU/RAM et d'ouvrir les essais TechPowerUp, ComputerBase et Notebookcheck, ainsi que Cinebench/3DMark/CrystalDiskMark avec leur rôle expliqué. Elle ne copie pas leurs bases et ne convertit pas leurs scores en scores Forge. Notebookcheck contient aussi des valeurs interpolées : vérifier la configuration individuelle testée et la méthode, pas seulement un tableau global.

---

## 🛡 Sécurité & anticheat

### Optimisations choisies, pas appliquées aveuglément

Aucun réglage n'est sélectionné automatiquement à l'ouverture. **Gaming prudent** propose seulement le Mode Jeu Windows ; **Confort du bureau** propose le délai des menus et les transparences. L'ancien ensemble de recommandations reste sélectionnable explicitement, à examiner : il contient des modifications d'enregistrement, d'accessibilité, de tâches en arrière-plan et d'alimentation.

La sélection affiche le nombre d'actions et de redémarrages nécessaires, puis relit les états juste avant application. Les réglages déjà actifs, indisponibles, nécessitant des droits absents ou déconseillés sur portable sont exclus des lots. Les échecs restent visibles ; « Arrêter » et quitter la page empêchent les actions suivantes, mais ne coupent pas une écriture Windows déjà lancée. Une opération encore en cours reste verrouillée après navigation.

Le nouveau réglage **Transparences Windows** conserve la valeur DWORD initiale (ou son absence) dans `HKCU\Software\PkaizenForge\Backups\Transparency`. L'annulation vérifie la restauration puis supprime cette sauvegarde ; elle refuse de deviner une valeur si aucune sauvegarde n'existe. Ce réglage ne promet aucun gain de FPS. Les anciennes annulations restaurent encore des valeurs par défaut, pas nécessairement ta configuration personnalisée antérieure.

- Aucun pilote de capture ajouté par ces fonctions. Aucune certification universelle Vanguard/EAC/BattlEye/FACEIT n'est revendiquée : leurs politiques peuvent changer.
- Les réglages disposent d'actions d'annulation ; restaurer une valeur Windows par défaut n'est pas toujours identique à restaurer une valeur personnalisée antérieure.
- ✅ Pilotes uniquement depuis des **sources officielles** : Windows Update (API Microsoft signée), API NVIDIA, winget, sites constructeurs — jamais de sites tiers
- ✅ **Point de restauration système** en un clic avant d'optimiser
- Pas de compte Forge requis. Diagnostics et résumés gaming restent locaux ; les fonctions réseau contactent néanmoins GitHub (mises à jour), services constructeurs, winget/Windows Update, Cloudflare et serveurs DNS. La présence Discord existante annonce l'activité de l'app lorsque Discord tourne.

## 🔍 Vérifier et contribuer

Le dépôt public, la licence et les tests permettent l'inspection. Ils ne garantissent pas l'absence de code malveillant dans une distribution tierce.

Le workflow [Verify Windows app](.github/workflows/verify.yml) installe avec `npm ci`, vérifie les types, exécute les régressions et le parcours Electron, puis produit l'installeur et `SHA256SUMS.txt` sans publication automatique. Les artefacts sont rattachés au commit du workflow. Pour une release, publier ensemble l'installeur et son fichier d'empreintes issus du même build.

```powershell
Get-FileHash .\Pkaizen-Forge-Setup.exe -Algorithm SHA256
```

Compare l'empreinte avec `SHA256SUMS.txt` de la même release. Une empreinte vérifie l'identité d'un fichier, **pas son innocuité**. Une analyse antivirus sans détection n'est pas une garantie non plus. Une compilation locale est possible ; aucune reproductibilité bit à bit ni signature Authenticode n'est promise actuellement.

Pour signaler un problème, fournis version de Forge/Windows, matériel, étapes, message d'erreur et résultat attendu. Ne publie pas de données privées dans un rapport ou un CSV. Les compteurs absents, sessions distantes, VM, GPU hybrides et politiques d'entreprise doivent être testés séparément : **tous les PC ne peuvent pas être certifiés depuis une seule machine**.

---

## 🖥 Développement

```bash
git clone https://github.com/sh1wyn/pkaizen-forge.git
cd pkaizen-forge
npm ci
npm run dev        # lancement en développement
npm run typecheck  # vérification TypeScript
npm test           # tests de régression (y compris mesures et bibliothèques gaming)
npm run dist       # construire l'installeur Windows (release/)
```

**Stack** : Electron · React 18 · TypeScript · Vite (electron-vite) · [systeminformation](https://www.npmjs.com/package/systeminformation) · PowerShell pour l'accès système Windows. Versions exactes dans le lockfile.

**Architecture** : `src/main/system/` contient les modules moteur (optimizer, analyzer, drivers, network, bench, cleaner…), `src/renderer/` l'interface React, `src/shared/types.ts` les types partagés. L'i18n UI vit dans `src/renderer/src/lib/i18n.tsx`, les textes moteur dans `src/main/system/i18n.ts`.

---

<div align="center">

*Fait par [sh1wyn](https://github.com/sh1wyn) — optimise sans casser.* ⚒

</div>
