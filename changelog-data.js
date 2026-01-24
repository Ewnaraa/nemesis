// changelog-data.js
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
      "Voir le classement des meilleurs voteurs"
    ]
  }
};

module.exports = { changelogData };
