---
slug: importation-douane-conformite-2026-2027
locale: fr
lang: fr
alternateSlug: importation-douane-conformite-2026-2027-ar
title: Importation et douane 2026-2027 : DUM, TVA à l’entrée 20/10 % et déduction CA3 — ce qu’il faut figer
description: Dédouanement BADR / PORTNET, assiette CIF + DI + TPI 0,25 %, TVA ADII puis déduction DGI — pas l’autoliquidation européenne — et rapprochement Zafirixpro.
date: 2026-08-25
publishedAt: 2026-08-25
category: Douane & importation
tags: importation, douane, DUM, BADR, TVA à l’import, TPI, ADII, CA3, loi de finances 2026, Maroc
author: Rédaction Zafirixpro
readTime: "6"
cover: /images/blog/importation-douane-conformite-2026-2027-cover.png
image: /images/blog/importation-douane-conformite-2026-2027-cover.png
imageAlt: Illustration Zafirixpro — dédouanement, DUM et TVA à l’importation 2026-2027
---

![Importation, douane et TVA à l’entrée au Maroc](/images/blog/importation-douane-conformite-2026-2027-cover.png)

Importer n’est pas « une facture fournisseur + 20 % ». La **TVA à l’importation** est **liquidée par l’ADII** au dédouanement, sur la **DUM** (BADR / PORTNET), **avant** la mainlevée. Ce n’est **pas** l’autoliquidation à l’européenne : vous **payez** (comptant ou **crédit d’enlèvement**), puis vous **déduisez** sur la CA3 DGI si l’achat alimente une activité taxable. Confondre avec la RAS / auto-liquidation des **services** non-résidents (art. **117-III**) crée un **double emploi** ou un **trou**.

Ce briefing est opérationnel. Il ne remplace pas le tarif ADIL ni votre transitaire. Il vous dit **quelle assiette**, **quels taux 2026**, **quelles pièces**, et **quoi rapprocher** dans Zafirixpro.

## Assiette : CIF, puis la pile

Valeur en douane **CAF / CIF** (FOB + fret + assurance). Ensuite, dans l’ordre :

1. **Droit d’importation** (DI) — quotité selon HS / tarif commun (plafond souvent cité **30 %** en 2026) ou **préférentiel** (accords, EUR.1 / preuve d’origine).
2. **TPI / PFI** : **0,25 %** du CIF, en principe **même** sous préférence, sauf texte d’exonération.
3. **TIC** et taxes spéciales le cas échéant.
4. **TVA** = (CIF + DI + TPI + TIC) × **20 %** ou **10 %** (LF 2026 n° **50-25**). Plus de **7 % / 14 %** à l’entrée.

La TVA **n’entre pas** dans sa propre base. La TPI n’est **pas** un crédit DGI. Exonérations 2026 (pâtes courtes, engrais, etc.) : **attestation électronique DGI** transmise à l’ADII — pas un 0 % saisi « à la main » dans l’ERP.

Régime **40** = mise à la consommation. Admission temporaire / perfectionnement : **caution**, pas « on verra à la CA3 ».

## DUM, paiement, déduction

Le commissionnaire agréé saisit la DUM (identifiant fiscal, HS **10 chiffres**, origine, masse, facture, B/L). BADR calcule, vous payez, vous obtenez **BAE / mainlevée**. Sans quittance, pas de stock « arrivé ».

Sur la CA3 : TVA import en **déductible** (souvent compte **34552**), **période du dédouanement**, pièce = DUM + quittance — **pas** la seule facture FOB. Crédit de taxe reportable / remboursable selon art. **103** (exportateurs, etc.). Particulier ou activité exonérée **sans** droit à déduction : la TVA import est un **coût**.

## Routine Zafirixpro

- Type **import** : n° DUM, date BAE, CIF, DI, TPI, TVA ADII, cours BAM.
- Rapprochement **quittance douane ↔ CA3 ↔ stock** (écart de change, fret non CIF).
- Flag **préférence** / **exonération 91-92** vs droit commun.
- **Smart Tax Audit** : 7/14 % à l’import, TVA déduite sans DUM, service étranger passé en « douane ».

Le conteneur n’attend pas votre clôture. Testez Zafirixpro pour figer la pile — et ouvrez l’audit **avant** la prochaine CA3 d’import.

*Source : CGI art. 96, 99, 103, 117-III ; LF 2026 n° 50-25 ; ADII BADR / ADIL. Vérifiez le tarif intégré et votre conseil.*

Mots-clés : #Importation #Douane #DUM #TVAImport #ADII #CA3 #Zafirixpro #Maroc2026
