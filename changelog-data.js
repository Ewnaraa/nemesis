// changelog-data.js - Données du changelog Nemesis Vote

const changelogData = {
  "2.6.1": {
    title: "🎉 Votre Espace Personnel Discord",
    date: "25 Janvier 2025",
    description: "Vous avez maintenant votre propre salon privé pour suivre tous vos votes !",
    features: [
      "🎉 Vous avez maintenant votre propre salon Discord privé !",
      "📊 Suivez tous vos votes en temps réel dans ce salon",
      "⏰ Voyez exactement quand vous pourrez revoter",
      "💬 Tapez `/mylogs` pour le retrouver facilement",
      "🎮 Sachez sur quel serveur vous avez voté (Karnak ou Hyperion)"
    ],
    improvements: [
      "Vos informations privées (IP) ne sont visibles que par les admins",
      "Interface des logs plus jolie et plus claire",
      "Les admins ont de nouvelles commandes pour mieux vous aider"
    ]
  },
  "2.6.0": {
    title: "🔧 Corrections Importantes",
    date: "24 Janvier 2025",
    description: "Stabilité et sécurité améliorées",
    features: [
      "Nouvelles commandes admin Discord (/reset-ips, /unsuspend)"
    ],
    improvements: [
      "Meilleure détection de votre vraie adresse IP",
      "Protection renforcée contre les doubles votes",
      "Moins d'erreurs techniques"
    ]
  },
  "2.5.0": {
    title: "🛡️ Fini les Votes Perdus !",
    date: "24 Janvier 2025",
    description: "Le bot vérifie maintenant 3 fois avant de voter pour éviter les erreurs",
    features: [
      "Hyperion vous prévient AVANT si vous êtes encore en cooldown",
      "Plus besoin d'attendre pour rien, le bot vérifie 3 fois",
      "Vos licences expirées sont automatiquement nettoyées"
    ],
    improvements: [
      "5 minutes de marge en plus sur Hyperion pour être sûr",
      "Voir le classement des meilleurs voteurs",
      "Filtres avancés pour voir vos licences"
    ]
  },
  "2.4.0": {
    title: "🔐 Sécurité & Licences",
    date: "18 Janvier 2025",
    description: "Protection de votre compte et système de licences",
    features: [
      "Vous devez maintenant activer une licence pour utiliser le bot",
      "Gérez votre licence directement sur Discord",
      "Protection contre le partage de compte",
      "Parrainez vos amis et gagnez des réductions !"
    ],
    improvements: [
      "Votre compte est maintenant protégé",
      "Interface d'activation simple et jolie",
      "Suivez vos statistiques de votes"
    ]
  }
};

module.exports = { changelogData };
