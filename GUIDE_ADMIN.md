# 🛡️ GUIDE ADMINISTRATEUR - NEMESIS VOTE

## 🎯 Vue d'ensemble

Ce guide est destiné aux administrateurs du bot Nemesis Vote. Il couvre la gestion des licences, utilisateurs, paiements et maintenance système.

---

## 🚀 ACCÈS RAPIDE

### Dashboard Admin

Commande principale : `/admin`

**Catégories disponibles :**
- 👤 Gestion Utilisateurs
- 🔑 Gestion Licences
- 📊 Statistiques
- 🔧 Maintenance
- 💰 Soldes & Paiements

---

## 👤 GESTION UTILISATEURS

### Voir les informations d'un utilisateur

**Commande :** `/userinfo user:@User`

**Affiche :**
- Clé de licence
- Statut (active/expired/suspended)
- Date d'expiration / Jours restants
- Votes effectués
- Vérifications
- Adresses IP utilisées
- Channel logs privé
- Date de création
- Dernier vote

**Utilisation :**
```
/userinfo user:@Jean
```

### Voir les logs d'un utilisateur

**Commande :** `/userlogs user:@User limit:20`

**Affiche les X derniers logs :**
- Votes réussis/échoués
- Vérifications de licence
- Ajouts/Avertissements IP
- Suspensions/Révocations

**Utilisation :**
```
/userlogs user:@Jean limit:10
```

### Reset les IPs d'un utilisateur

**Commande :** `/reset-ips user:@User`

**Action :**
- Supprime toutes les IPs enregistrées
- Réinitialise le compteur anti-partage
- Log l'action dans le channel admin
- Notifie l'utilisateur par DM

**Quand l'utiliser :**
- Changement de FAI
- Déménagement
- Réinitialisation légitime
- Faux positifs anti-partage

**Utilisation :**
```
/reset-ips user:@Jean
```

### Débloquer un utilisateur suspendu

**Commande :** `/unsuspend user:@User`

**Action :**
- Change le statut de "suspended" à "active"
- Réactive la licence immédiatement
- Log l'action
- Notifie l'utilisateur

**Utilisation :**
```
/unsuspend user:@Jean
```

---

## 🔑 GESTION LICENCES

### Générer une licence

**Commande :** `/generate user:@User duration:30`

**Durées disponibles :**
- 30 jours
- 90 jours
- 180 jours
- 365 jours

**Action :**
- Génère une clé unique (format XXXX-XXXX-XXXX-XXXX)
- Lie la licence au Discord User ID
- Crée le channel privé automatiquement
- Notifie l'utilisateur par DM
- Log dans le channel admin

**Vérifications automatiques :**
- ❌ Refuse si licence active existante
- ✅ Autorise si aucune licence ou si expirée

**Utilisation :**
```
/generate user:@Jean duration:30
```

### Révoquer une licence

**Commande :** `/revoke key:XXXX-XXXX-XXXX-XXXX`

**Action :**
- Change le statut à "revoked"
- Désactive immédiatement le bot
- Log dans channel admin
- Notifie l'utilisateur par DM
- **IRRÉVERSIBLE**

**Quand l'utiliser :**
- Partage de licence détecté (niveau 4)
- Violation des règles
- Fraude / Chargebacks PayPal
- Abus du système

**Utilisation :**
```
/revoke key:ABCD-1234-EFGH-5678
```

### Liste des licences

**Commande :** `/licenses filter:active`

**Filtres disponibles :**
- `all` - Toutes les licences
- `active` - Licences actives uniquement
- `expired` - Licences expirées
- `suspended` - Licences suspendues

**Affichage :**
- Top 20 licences (par date de création)
- Clé, utilisateur, statut, expiration
- Votes effectués

**Utilisation :**
```
/licenses filter:active
```

### Cleanup des licences expirées

**Via Dashboard :** `/admin` > Gestion Licences > Cleanup

**Action :**
- Supprime les licences expirées depuis > 7 jours
- Confirmation requise avant suppression
- Affiche le nombre de licences supprimées
- **IRRÉVERSIBLE**

**Recommandation :**
- Exécuter une fois par mois
- Libère l'espace dans la base de données
- Améliore les performances

---

## 💰 GESTION SOLDES & PAIEMENTS

### Ajouter du solde à un utilisateur

**Commande :** `/addbalance user:@User amount:10 reason:Bonus`

**Paramètres :**
- `user` : Utilisateur Discord (requis)
- `amount` : Montant en euros (requis, min 0.01€, max 1000€)
- `reason` : Raison du crédit (optionnel)

**Action :**
- Crédite le solde instantanément
- Enregistre la transaction
- Notifie l'utilisateur par DM
- Log dans channel admin

**Cas d'usage :**
- Compensation pour bug
- Bonus événementiel
- Remboursement partiel
- Cadeau promotionnel

**Utilisation :**
```
/addbalance user:@Jean amount:5 reason:Compensation bug serveur
```

### Voir les transactions récentes

**Via Dashboard :** `/admin` > Soldes & Paiements > Voir les transactions

**Affiche les 10 dernières transactions :**
- Utilisateur
- Montant (crédit/débit)
- Raison
- Date/Heure

**Utilisation courante :**
- Vérifier les paiements PayPal
- Auditer les achats de licences
- Détecter les anomalies

### Webhook PayPal

**URL :** `https://nemesis-production-bc24.up.railway.app/webhook/paypal`

**Configuration PayPal :**
1. Compte Business PayPal > Paramètres
2. Notifications > IPN (Instant Payment Notification)
3. URL de notification : Coller l'URL webhook
4. Activer les notifications IPN

**Fonctionnement :**
- Réception automatique des paiements
- Extraction du Discord User ID depuis la note PayPal
- Crédit automatique du solde
- Notification DM à l'utilisateur
- Log admin

**Vérification :**
- Logs Railway : `[PAYPAL] Webhook reçu`
- Vérifier que le solde est crédité
- Tester avec PayPal Sandbox d'abord

---

## 📊 STATISTIQUES

**Via Dashboard :** `/admin` > Statistiques

**Affichage en temps réel :**

### Stats globales
- 👥 Utilisateurs totaux
- ✅ Utilisateurs actifs
- ❌ Licences expirées
- ⚠️ Utilisateurs suspendus
- 🎮 Total de votes
- 🔢 Total de vérifications

### Stats détaillées
- Top 5 utilisateurs par votes
- Revenus du mois actuel
- Votes aujourd'hui
- Nouvelles licences ce mois
- Taux d'expiration

**Utilisation :**
- Suivre la croissance
- Identifier les utilisateurs actifs
- Détecter les anomalies
- Planifier les capacités

---

## 🔧 MAINTENANCE

### Fix Channels manquants

**Via Dashboard :** `/admin` > Maintenance > Fix channels

**Action :**
- Scanne toutes les licences actives
- Crée les channels privés manquants
- Lie les channels aux licences
- Affiche le résultat (créés / erreurs)

**Quand l'utiliser :**
- Après mise à jour système
- Si des utilisateurs n'ont pas de channel
- Maintenance préventive

### Clean licences invalides

**Via Dashboard :** `/admin` > Maintenance > Clean invalid

**Action :**
- Supprime les licences corrompues :
  - Sans Discord User ID
  - Sans date d'expiration
  - Données manquantes
- Affiche le nombre de licences supprimées
- **IRRÉVERSIBLE**

**Quand l'utiliser :**
- Après migration de base de données
- Si des erreurs de création se sont produites
- Nettoyage de base de données

---

## 🔐 SÉCURITÉ & ANTI-PARTAGE

### Système de détection progressif

**Niveaux automatiques :**

#### 🟢 Niveau 1 : Normal (0-2 IPs)
- **Action :** Aucune
- **Statut :** Actif
- **Log :** IP_ADDED

#### 🟡 Niveau 2 : Avertissement (3 IPs)
- **Action :** Alerte Discord admin
- **Statut :** Actif (surveillance)
- **Log :** IP_WARNING
- **Notification :** User + Admin

#### 🟠 Niveau 3 : Suspension (4 IPs)
- **Action :** Suspension 24h automatique
- **Statut :** Suspended
- **Log :** IP_BLOCKED
- **Notification :** User + Admin
- **Réactivation :** Automatique après 24h

#### 🔴 Niveau 4 : Révocation (5+ IPs)
- **Action :** Révocation définitive
- **Statut :** Revoked
- **Log :** IP_REVOKED
- **Notification :** User + Admin
- **Réactivation :** Manuelle uniquement

### Logs de sécurité

**Channel Admin :** Tous les événements de sécurité sont loggés

**Informations visibles :**
- IP complète (admins uniquement)
- Discord User ID
- Clé de licence
- Action effectuée
- Timestamp

**User Channel :** IP masquée (XXX.XXX.XXX.123)

### Actions manuelles

**Cas légitime détecté :**
1. `/reset-ips user:@User` - Réinitialiser les IPs
2. `/unsuspend user:@User` - Débloquer si suspendu

**Cas frauduleux confirmé :**
1. `/revoke key:XXXX-XXXX-XXXX-XXXX` - Révoquer définitivement
2. Bannir du Discord (optionnel)
3. Blacklist l'IP (manuel MongoDB si nécessaire)

---

## 🛠️ COMMANDES TECHNIQUES

### Accès à la base de données

**MongoDB URI :** Stocké dans Railway ENV

**Collections principales :**
- `licenses` - Licences utilisateurs
- `logs` - Historique des actions
- `balances` - Soldes et transactions

### Commandes MongoDB utiles

**Voir toutes les licences actives :**
```javascript
db.licenses.find({ status: 'active' }).pretty()
```

**Compter les utilisateurs par statut :**
```javascript
db.licenses.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])
```

**Trouver les licences expirées non nettoyées :**
```javascript
db.licenses.find({ 
  status: 'expired',
  expiresAt: { $lt: new Date(Date.now() - 7*24*60*60*1000) }
})
```

**Voir les logs des dernières 24h :**
```javascript
db.logs.find({
  timestamp: { $gte: new Date(Date.now() - 24*60*60*1000) }
}).sort({ timestamp: -1 })
```

### Backup & Restauration

**Backup automatique :**
- MongoDB Atlas : Backups quotidiens activés
- Rétention : 7 jours

**Backup manuel :**
```bash
mongodump --uri="MONGODB_URI" --out=/backup/nemesis-$(date +%Y%m%d)
```

**Restauration :**
```bash
mongorestore --uri="MONGODB_URI" /backup/nemesis-20260125
```

---

## 📊 ANALYTICS & REPORTING

### Métriques clés à surveiller

**Quotidiennes :**
- Votes effectués
- Nouvelles licences activées
- Licences expirées
- Erreurs de vote
- Suspensions anti-partage

**Hebdomadaires :**
- Revenus (via transactions)
- Taux de rétention (licences renouvelées)
- Top utilisateurs
- Taux d'échec des votes

**Mensuelles :**
- Croissance utilisateurs
- Revenus totaux
- Churn rate
- Performance système

### Exports

**Exporter les stats :**
```javascript
// Dans MongoDB
db.licenses.aggregate([
  {
    $group: {
      _id: null,
      totalVotes: { $sum: "$usageCount" },
      avgVotes: { $avg: "$usageCount" }
    }
  }
])
```

---

## ⚠️ GESTION DES INCIDENTS

### Vote massif échoué

**Symptômes :**
- Plusieurs utilisateurs rapportent des échecs
- Channel logs montrent des erreurs identiques

**Diagnostic :**
1. Vérifier Railway logs
2. Vérifier status des sites (Karnak/Hyperion)
3. Tester manuellement un vote

**Actions :**
1. Si site down : Attendre le retour
2. Si bot bug : Restart Railway app
3. Si Chrome extension : Publier update

**Communication :**
- Annonce dans #annonces Discord
- Estimation du temps de résolution
- Mise à jour régulière

### Paiement non crédité

**Symptômes :**
- User signale paiement PayPal non reçu

**Diagnostic :**
1. Vérifier logs Railway : `[PAYPAL]`
2. Vérifier PayPal Business account
3. Vérifier que l'user a mis son Discord ID dans la note

**Actions :**
1. Si webhook non reçu : Crédit manuel via `/addbalance`
2. Si Discord ID manquant : Demander preuve de paiement + crédit manuel
3. Si fraude suspectée : Investiguer avant crédit

### Licence partagée détectée

**Symptômes :**
- Alerte anti-partage niveau 3-4
- User conteste

**Diagnostic :**
1. `/userlogs user:@User` - Vérifier l'historique IP
2. Vérifier les timestamps des connexions
3. Demander explications à l'user

**Actions :**

**Si légitime (VPN, mobile data, déménagement) :**
- `/reset-ips user:@User`
- `/unsuspend user:@User` si besoin
- Expliquer la politique

**Si frauduleux confirmé :**
- Maintenir la suspension/révocation
- Pas de remboursement
- Avertissement ou ban Discord

---

## 📞 SUPPORT UTILISATEURS

### Process de ticket

1. User ouvre un ticket dans #support
2. Admin vérifie avec `/userinfo`
3. Admin vérifie logs avec `/userlogs`
4. Admin effectue l'action nécessaire
5. Admin explique la résolution
6. Fermeture du ticket

### Réponses types

**Licence expirée :**
```
Bonjour,

Votre licence a expiré le [DATE]. 
Vous pouvez en racheter une via /menu > Acheter une licence.

Vos données sont conservées 7 jours après expiration.
```

**Vote échoué :**
```
Bonjour,

J'ai vérifié vos logs. Le vote a échoué car :
- [RAISON]

Solution : [ACTION À FAIRE]

Si le problème persiste, n'hésitez pas à me recontacter.
```

**Solde non crédité :**
```
Bonjour,

Je vois que votre paiement PayPal n'a pas été automatiquement crédité.

Pouvez-vous me fournir :
- Votre Transaction ID PayPal
- Le montant payé
- Confirmation que vous avez mis votre Discord User ID dans la note

Je créditerai votre solde manuellement.
```

---

## 🔄 MISES À JOUR & DÉPLOIEMENT

### Process de mise à jour

**1. Développement**
- Coder la feature/fix localement
- Tester en local
- Commit sur GitHub

**2. Test**
- Deploy sur environnement de test
- Tester toutes les fonctionnalités critiques
- Vérifier les logs

**3. Production**
- Deploy sur Railway (push main branch)
- Vérifier que le bot redémarre correctement
- Tester une commande simple (`/menu`)
- Surveiller les logs 1h

**4. Communication**
- Annonce dans #annonces si feature majeure
- Update du changelog.json
- Update de la doc utilisateur

### Rollback en cas de problème

**Railway :**
1. Aller dans Deployments
2. Sélectionner le déploiement précédent
3. Redeploy

**Hotfix rapide :**
```bash
git revert HEAD
git push origin main
```

---

## 📝 CHECKLIST ADMIN

### Quotidienne
- [ ] Vérifier les alertes anti-partage
- [ ] Répondre aux tickets support
- [ ] Vérifier les logs Railway (erreurs)

### Hebdomadaire
- [ ] Vérifier les stats globales
- [ ] Cleanup licences expirées si nécessaire
- [ ] Vérifier les paiements PayPal

### Mensuelle
- [ ] Analyser les revenus
- [ ] Exporter les métriques
- [ ] Planifier les améliorations
- [ ] Backup manuel de la DB

---

## 🆘 CONTACTS D'URGENCE

**Problème critique (bot down) :**
- Railway Dashboard : Restart app
- GitHub : Check last commits
- Discord : Annoncer l'incident

**Accès système :**
- Railway : [Votre compte admin]
- MongoDB : [Votre compte admin]
- PayPal Business : [Votre compte]
- GitHub : [Votre repo]

---

**Guide Administrateur - Nemesis Vote**
*Dernière mise à jour : 25/01/2026*
