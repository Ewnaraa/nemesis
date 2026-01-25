# 📖 GUIDE UTILISATEUR - NEMESIS VOTE

## 🎯 Bienvenue sur Nemesis Vote !

Nemesis Vote est un système de vote automatique pour les serveurs Dofus Rétro avec gestion de licences, shop PayPal et dashboard Discord complet.

---

## 🚀 DÉMARRAGE RAPIDE

### 1️⃣ Installation de l'extension Chrome

1. Téléchargez l'extension depuis le Chrome Web Store
2. Installez l'extension dans votre navigateur Chrome
3. L'icône Nemesis apparaît dans votre barre d'extensions

### 2️⃣ Activation de votre licence

**Première utilisation :**

1. Cliquez sur l'icône Nemesis
2. Une popup d'activation apparaît automatiquement
3. Entrez votre **clé de licence** (format: XXXX-XXXX-XXXX-XXXX)
4. Entrez votre **Discord User ID** (obligatoire)
5. *(Optionnel)* Entrez le code de parrainage de votre parrain
6. Cliquez sur **Activer**

**Comment trouver mon Discord User ID ?**
- Activez le Mode Développeur dans Discord (Paramètres > Avancés)
- Clic droit sur votre profil > Copier l'identifiant

✅ **Votre extension est maintenant activée !**

---

## 💰 SYSTÈME DE SHOP

### Recharger votre solde

**Méthode 1 : Via Discord**

1. Tapez `/menu` dans le serveur Discord
2. Sélectionnez **"Recharger mon solde"**
3. Choisissez un montant (5€, 10€, 20€, 50€, 100€) ou montant personnalisé
4. Cliquez sur **"Payer sur PayPal"**
5. **IMPORTANT** : Ajoutez votre Discord User ID dans la **note PayPal**
6. Validez le paiement
7. Cliquez sur **"J'ai payé"**
8. Votre solde sera crédité automatiquement sous quelques minutes

**Méthode 2 : Montant personnalisé**

- Minimum : 5€
- Maximum : 500€
- Entrez le montant souhaité dans le chat Discord

### Acheter une licence

1. Tapez `/menu` dans Discord
2. Sélectionnez **"Acheter une licence"**
3. Choisissez la durée :
   - **30 jours** - 5€
   - **90 jours** - 12€ (-20%)
   - **180 jours** - 20€ (-33%)
   - **365 jours** - 35€ (-42%)
4. Confirmez l'achat
5. Votre licence est créée instantanément !

**Note :** Vous ne pouvez avoir qu'une seule licence active à la fois.

---

## 🎁 SYSTÈME DE PARRAINAGE

### Comment ça marche ?

1. Votre **Discord User ID** est votre code de parrainage unique
2. Partagez-le à vos amis
3. Quand ils achètent une licence, ils entrent votre code
4. Vous gagnez **10% de réduction** sur votre prochain achat par filleul
5. Maximum **50% de réduction** (5 filleuls)

### Voir votre code

1. Tapez `/menu`
2. Sélectionnez **"Code parrainage"**
3. Copiez votre Discord User ID et partagez-le !

---

## 🎮 UTILISATION DU BOT DE VOTE

### Configuration initiale

**Dans l'extension Chrome :**

1. Cliquez sur l'icône Nemesis
2. Allez dans **"Configuration"**
3. Remplissez pour chaque serveur :
   - **Username** : Votre pseudo de jeu (requis)
   - **Password** : Votre mot de passe (requis)
   - **Pseudo SP.NET** : Optionnel
   - **Email** : Optionnel (pour vérification automatique)
4. Cliquez sur **"Sauvegarder"**

### Activer le bot automatique

1. Dans l'extension, activez le **"Vote Auto"** (bouton toggle)
2. Le bot votera automatiquement toutes les 91 minutes
3. Vous recevrez une notification à chaque vote réussi

### Serveurs supportés

- ✅ **Karnak** - Vote + Récupération automatique
- ✅ **Hyperion** - Vote + Récupération automatique

### Synchronisation du cooldown

**Le bot synchronise automatiquement votre cooldown :**
- Au démarrage de l'extension
- Toutes les 15 minutes
- Après chaque vote

**Synchronisation manuelle :**
1. Cliquez sur **"Synchroniser Cooldown"** dans l'extension
2. Le bot lit votre cooldown actuel sur le site du serveur
3. Le prochain vote sera planifié automatiquement

### Notifications

**Vous êtes notifié quand :**
- ✅ Un vote réussit
- ❌ Un vote échoue
- ⏰ Votre licence expire bientôt (7 jours)
- 💰 Votre solde est crédité

**Types de notifications :**
- 🔔 **Chrome** : Notifications système Windows/Mac
- 💬 **Discord** : Messages privés (si configuré)

---

## 📊 DASHBOARD DISCORD

### Commande `/menu`

**Votre tableau de bord personnel :**

📊 **Affichage :**
- 💰 Solde actuel
- 📜 Statut de la licence
- 🎮 Nombre de votes effectués
- 🎁 Nombre de filleuls actifs

**Actions disponibles :**

1. **💳 Recharger mon solde**
   - Ajouter des fonds via PayPal

2. **🛒 Acheter une licence**
   - Acheter ou prolonger votre licence

3. **📋 Ma licence**
   - Voir les détails de votre licence actuelle
   - Clé, date d'expiration, votes effectués

4. **📺 Mon channel privé**
   - Accéder à vos logs Discord privés
   - Voir l'historique de vos votes

5. **📊 Mes statistiques**
   - Total de votes
   - Vérifications effectuées
   - Date de création
   - Dernier vote

6. **📜 Historique**
   - Voir vos transactions (crédits/débits)
   - Pagination automatique (10 par page)

7. **🎁 Code parrainage**
   - Votre code unique
   - Nombre de filleuls
   - Réduction actuelle

---

## 🔐 SÉCURITÉ & ANTI-PARTAGE

### Système de détection progressif

**Nemesis Vote détecte automatiquement le partage de licence :**

🟢 **Niveau 1 : Normal (0-2 IPs)**
- Utilisation normale autorisée
- Jusqu'à 2 adresses IP différentes

🟡 **Niveau 2 : Avertissement (3 IPs)**
- Alerte Discord envoyée
- Surveillance active
- Utilisation encore autorisée

🟠 **Niveau 3 : Suspension temporaire (4 IPs)**
- Licence suspendue 24h
- Notification Discord
- Réactivation automatique après 24h

🔴 **Niveau 4 : Révocation définitive (5+ IPs)**
- Licence révoquée définitivement
- Aucun remboursement
- Bannissement possible

### Protection de vos données

- ✅ Votre IP est **masquée** dans les logs utilisateur
- ✅ Les admins voient l'IP complète (sécurité)
- ✅ Votre mot de passe n'est **jamais stocké** côté serveur
- ✅ Chiffrement des données sensibles

---

## ❓ FAQ - QUESTIONS FRÉQUENTES

### 💳 Paiements & Solde

**Q : Je n'ai pas reçu mon solde après paiement PayPal**
- Vérifiez que vous avez bien mis votre Discord User ID dans la **note PayPal**
- Le crédit peut prendre jusqu'à 5 minutes
- Contactez un admin si le problème persiste

**Q : Puis-je être remboursé ?**
- Les soldes ne sont pas remboursables
- Les licences ne sont pas remboursables après activation
- En cas d'erreur, contactez un admin

**Q : Comment obtenir une facture ?**
- Les transactions PayPal servent de facture
- Historique disponible dans PayPal et Discord (`/menu` > Historique)

### 🔑 Licences

**Q : Puis-je transférer ma licence à quelqu'un d'autre ?**
- Non, les licences sont liées à votre Discord User ID
- Le partage est interdit et détecté automatiquement

**Q : Que se passe-t-il à l'expiration ?**
- Le bot s'arrête automatiquement
- Vos données sont conservées 7 jours
- Vous pouvez racheter une licence à tout moment

**Q : Puis-je avoir plusieurs licences ?**
- Non, une seule licence active par Discord User ID
- Vous pouvez prolonger votre licence actuelle

### 🎮 Votes

**Q : Le bot ne vote pas automatiquement**
- Vérifiez que le bot est **activé** (toggle ON)
- Vérifiez votre **configuration** (username/password)
- Vérifiez que votre **licence est active**
- Synchronisez le cooldown manuellement

**Q : Le vote a échoué, pourquoi ?**
- Cooldown encore actif (attendez 91 minutes)
- Identifiants incorrects
- Problème de connexion au site
- Vérifiez les logs dans votre channel privé

**Q : Comment voir mes logs de votes ?**
- `/menu` > Mon channel privé
- Tous les votes sont enregistrés avec l'heure

### 🎁 Parrainage

**Q : Comment fonctionne la réduction ?**
- 10% par filleul actif (maximum 50%)
- Applicable sur le prochain achat uniquement
- Cumulative sur plusieurs achats

**Q : Mon filleul n'a pas utilisé mon code**
- Il peut l'ajouter lors de l'activation de sa licence
- Champ optionnel "Code de parrainage du parrain"
- Doit être fait à la première activation

---

## 🆘 SUPPORT & AIDE

### Problème technique ?

1. **Vérifiez les logs** : `/menu` > Mon channel privé
2. **Testez manuellement** : Extension > Bouton "Tester"
3. **Resynchronisez** : Extension > "Synchroniser Cooldown"
4. **Réactivez** : Extension > Toggle OFF puis ON

### Besoin d'aide humaine ?

**Discord Support :**
- Rejoignez le serveur : https://discord.gg/qWDUE4xXCX
- Ouvrez un ticket
- Un admin vous répondra sous 24h

**Informations à fournir :**
- Votre Discord User ID
- Votre clé de licence (premiers caractères seulement)
- Description du problème
- Screenshot si possible

---

## ⚠️ RÈGLES D'UTILISATION

### ✅ AUTORISÉ

- Utiliser le bot sur vos propres comptes de jeu
- Utiliser jusqu'à 2 adresses IP différentes (domicile + mobile)
- Partager votre code de parrainage
- Créer plusieurs comptes Discord avec licences séparées

### ❌ INTERDIT

- Partager votre licence avec d'autres personnes
- Utiliser sur plus de 2 adresses IP simultanément
- Revendre votre licence
- Abuser du système de parrainage (faux comptes)
- Tenter de contourner la détection anti-partage
- Utiliser des moyens frauduleux pour obtenir des licences

**Sanctions :**
- 1ère infraction : Avertissement
- 2ème infraction : Suspension 7 jours
- 3ème infraction : Révocation définitive + bannissement

---

## 🔄 CHANGELOG

### Version 2.5.0 - 25/01/2026

**Nouvelles fonctionnalités :**
- 📊 Dashboard `/menu` et `/admin` centralisés
- 💰 Système de shop avec balance PayPal
- 🎁 Système de parrainage avec réductions
- 📺 Channels privés automatiques
- 📜 Pagination dans l'historique
- ⏳ États de chargement et confirmations

**Améliorations :**
- ✅ Triple protection cooldown Hyperion
- 🔒 Détection anti-partage progressive (4 niveaux)
- 📊 Statistiques en temps réel
- 🔔 Notifications Discord améliorées
- 🎨 Interface utilisateur modernisée

**Corrections :**
- Fix CORS pour Chrome extension
- Fix auto-update licences expirées
- Fix logs avec event: 'vote_success'
- Fix compteur "Votes aujourd'hui"

---

## 📞 CONTACT

**Discord :** https://discord.gg/qWDUE4xXCX
**Support :** Ouvrez un ticket sur Discord
**Bugs :** Signalez dans #bugs sur Discord

---

## 📄 MENTIONS LÉGALES

**Nemesis Vote** est un service fourni "tel quel" sans garantie.
- Aucun remboursement après activation
- Service sujet à modifications sans préavis
- Utilisation à vos risques et périls
- Nous ne sommes pas affiliés à Ankama ou Dofus

**Protection des données :**
- Conformité RGPD
- Données stockées : Discord ID, licences, transactions
- Pas de revente de données
- Suppression sur demande (contact admin)

---

**Merci d'utiliser Nemesis Vote ! 🚀**

*Dernière mise à jour : 25/01/2026*
