# Liasse Fiscale

Préparez le dossier fiscal dans **Liasse** (`/liasse`) selon le CGNC (états de synthèse) et le CGI (tableau de passage, IS / cotisation minimale).

## États générés

À partir du journal PCGE (`atlas_accounting_entries`) :

1. **Bilan — Modèle Normal** : Actif immobilisé, Actif circulant (hors trésorerie), Trésorerie-Actif / Financement permanent, Passif circulant, Trésorerie-Passif. Colonnes Brut / Amort. & Prov. / Net. Contrôle `Total Actif = Total Passif`.
2. **Bilan — Modèle Simplifié** : mêmes masses, postes regroupés.
3. **CPC** : produits et charges d’exploitation, financiers et non courants, puis Résultat d’exploitation, Résultat financier, Résultat courant, Résultat non courant, Résultat net.
4. **Tableau de passage** : résultat net comptable → réintégrations (IS, amendes CGI art. 11) − déductions (participations CGI art. 6, déficits art. 12) → résultat fiscal.
5. **Liquidation IS** : barème indicatif × résultat fiscal, cotisation minimale 0,50 % du CA HT avec plancher 3 000 MAD (CGI art. 144), impôt dû = max(IS, CM).

## Préparation

Vérifiez le journal (équilibre débit/crédit), la TVA, la paie et les rapprochements bancaires avant de générer.

## Génération

1. Sélectionner l’exercice
2. Relire les contrôles de validation
3. Générer / actualiser la liasse
4. Contrôler Bilan, CPC et tableau de passage
5. Valider — à confirmer par expert-comptable
