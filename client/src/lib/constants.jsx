// ============================================================================
// OSINTMapper Constants — Entity types, Link types, Helpers
// Extracted from v1 monolith
// ============================================================================

// ============================================================================
// CATEGORIES — 17 categories with sub-items
// ============================================================================

export const CATEGORIES = [
  { id: "person", label: "Personne", icon: "👤", color: "#6366f1", items: [
    { id: "person_male", label: "Homme", desc: "Personne identifiée homme", color: "#6366f1" },
    { id: "person_female", label: "Femme", desc: "Personne identifiée femme", color: "#ec4899" },
    { id: "person_other", label: "Autre / Inconnu", desc: "Genre non déterminé", color: "#8b5cf6" },
  ]},
  { id: "pseudo", label: "Pseudo / Alias", icon: "🎭", color: "#8b5cf6", items: [
    { id: "pseudo_username", label: "Pseudo", desc: "Nom d'utilisateur en ligne", color: "#8b5cf6" },
    { id: "pseudo_gamertag", label: "Gamertag", desc: "Pseudo de jeu vidéo", color: "#10b981" },
    { id: "pseudo_alias", label: "Alias", desc: "Nom d'emprunt / surnom", color: "#f59e0b" },
  ]},
  { id: "email", label: "Email", icon: "📧", color: "#3b82f6", items: [
    { id: "email_gmail", label: "Gmail", desc: "Adresse Google Mail", color: "#EA4335" },
    { id: "email_outlook", label: "Outlook", desc: "Adresse Microsoft", color: "#0078D4" },
    { id: "email_proton", label: "ProtonMail", desc: "Adresse chiffrée", color: "#6D4AFF" },
    { id: "email_yahoo", label: "Yahoo Mail", desc: "Adresse Yahoo", color: "#720E9E" },
    { id: "email_custom", label: "Domaine propre", desc: "Email personnalisé", color: "#3b82f6" },
    { id: "email_other", label: "Autre fournisseur", desc: "Non listé", color: "#94a3b8" },
  ]},
  { id: "phone", label: "Téléphone", icon: "📱", color: "#06b6d4", items: [
    { id: "phone_mobile", label: "Mobile", desc: "Téléphone portable", color: "#06b6d4" },
    { id: "phone_landline", label: "Fixe", desc: "Ligne fixe", color: "#64748b" },
    { id: "phone_voip", label: "VoIP", desc: "Numéro virtuel", color: "#8b5cf6" },
    { id: "phone_burner", label: "Jetable / Burner", desc: "Numéro temporaire", color: "#ef4444" },
    { id: "phone_sim", label: "Carte SIM", desc: "Carte SIM identifiée", color: "#14b8a6" },
    { id: "phone_iphone", label: "iPhone", desc: "Terminal Apple", color: "#a1a1aa" },
    { id: "phone_android", label: "Android", desc: "Terminal Android", color: "#22c55e" },
    { id: "phone_tablet", label: "Tablette", desc: "iPad, tablette Android", color: "#f59e0b" },
    { id: "phone_imei", label: "IMEI", desc: "Identifiant terminal", color: "#f97316" },
    { id: "phone_line", label: "Ligne téléphonique", desc: "Ligne / abonnement identifié", color: "#3b82f6" },
  ]},
  { id: "social", label: "Réseaux sociaux", icon: "💬", color: "#ec4899", items: [
    { id: "snapchat", label: "Snapchat", desc: "Compte Snapchat", color: "#FFFC00" },
    { id: "instagram", label: "Instagram", desc: "Compte Instagram", color: "#E4405F" },
    { id: "facebook", label: "Facebook", desc: "Compte Facebook", color: "#1877F2" },
    { id: "x_twitter", label: "X (Twitter)", desc: "Compte X / Twitter", color: "#1DA1F2" },
    { id: "tiktok", label: "TikTok", desc: "Compte TikTok", color: "#00F2EA" },
    { id: "linkedin", label: "LinkedIn", desc: "Profil professionnel", color: "#0A66C2" },
    { id: "telegram", label: "Telegram", desc: "Compte Telegram", color: "#26A5E4" },
    { id: "discord", label: "Discord", desc: "Utilisateur Discord", color: "#5865F2" },
    { id: "reddit", label: "Reddit", desc: "Compte Reddit", color: "#FF4500" },
    { id: "youtube", label: "YouTube", desc: "Chaîne YouTube", color: "#FF0000" },
    { id: "whatsapp", label: "WhatsApp", desc: "Numéro WhatsApp", color: "#25D366" },
    { id: "signal", label: "Signal", desc: "Compte Signal", color: "#3A76F0" },
    { id: "twitch", label: "Twitch", desc: "Chaîne Twitch", color: "#9146FF" },
    { id: "github", label: "GitHub", desc: "Profil GitHub", color: "#8B949E" },
    { id: "other_social", label: "Autre réseau", desc: "Non listé", color: "#94a3b8" },
  ]},
  { id: "location", label: "Lieu géographique", icon: "📍", color: "#10b981", items: [
    { id: "loc_address", label: "Adresse", desc: "Adresse postale précise", color: "#10b981" },
    { id: "loc_city", label: "Ville", desc: "Ville ou commune", color: "#14b8a6" },
    { id: "loc_country", label: "Pays", desc: "Pays ou territoire", color: "#059669" },
    { id: "loc_gps", label: "Coordonnées GPS", desc: "Lat / Long", color: "#0d9488" },
    { id: "loc_poi", label: "Point d'intérêt", desc: "Lieu remarquable", color: "#f59e0b" },
  ]},
  { id: "ip", label: "Adresse IP", icon: "🌐", color: "#f59e0b", items: [
    { id: "ip_v4", label: "IPv4", desc: "Adresse IPv4", color: "#f59e0b" },
    { id: "ip_v6", label: "IPv6", desc: "Adresse IPv6", color: "#d97706" },
    { id: "ip_range", label: "Plage IP", desc: "Range / subnet", color: "#92400e" },
  ]},
  { id: "organization", label: "Organisation", icon: "🏢", color: "#ef4444", items: [
    { id: "org_company", label: "Entreprise", desc: "Société commerciale", color: "#3b82f6" },
    { id: "org_ngo", label: "ONG / Association", desc: "But non lucratif", color: "#10b981" },
    { id: "org_gov", label: "Gouvernement", desc: "Entité gouvernementale", color: "#6366f1" },
    { id: "org_criminal", label: "Org. criminelle", desc: "Organisation criminelle", color: "#ef4444" },
    { id: "org_other", label: "Autre", desc: "Type non listé", color: "#94a3b8" },
  ]},
  { id: "domain", label: "Domaine / URL", icon: "🔗", color: "#14b8a6", items: [
    { id: "domain_site", label: "Site web", desc: "URL complète", color: "#14b8a6" },
    { id: "domain_name", label: "Nom de domaine", desc: "Domaine enregistré", color: "#0d9488" },
    { id: "domain_onion", label: ".onion", desc: "Service Tor caché", color: "#7c3aed" },
  ]},
  { id: "vehicle", label: "Véhicule", icon: "🚗", color: "#f97316", items: [
    { id: "vehicle_car", label: "Voiture", desc: "Véhicule automobile", color: "#f97316" },
    { id: "vehicle_moto", label: "Moto", desc: "Deux-roues motorisé", color: "#ef4444" },
    { id: "vehicle_truck", label: "Camion", desc: "Poids lourd", color: "#64748b" },
    { id: "vehicle_van", label: "Utilitaire", desc: "Véhicule utilitaire", color: "#78716c" },
    { id: "vehicle_boat", label: "Bateau", desc: "Navire ou embarcation", color: "#06b6d4" },
    { id: "vehicle_aircraft", label: "Aéronef", desc: "Avion / hélicoptère", color: "#3b82f6" },
  ]},
  { id: "wallet", label: "Wallet Crypto", icon: "₿", color: "#eab308", items: [
    { id: "wallet_btc", label: "Bitcoin", desc: "Wallet BTC", color: "#F7931A" },
    { id: "wallet_eth", label: "Ethereum", desc: "Wallet ETH", color: "#627EEA" },
    { id: "wallet_sol", label: "Solana", desc: "Wallet SOL", color: "#9945FF" },
    { id: "wallet_bnb", label: "BNB Chain", desc: "Wallet BNB", color: "#F3BA2F" },
    { id: "wallet_xmr", label: "Monero", desc: "Wallet XMR", color: "#FF6600" },
    { id: "wallet_usdt", label: "Stablecoin", desc: "USDT / USDC", color: "#26A17B" },
    { id: "wallet_other", label: "Autre crypto", desc: "Non listé", color: "#94a3b8" },
  ]},
  { id: "document", label: "Document", icon: "📄", color: "#64748b", items: [
    { id: "doc_id", label: "Pièce d'identité", desc: "CNI, permis, etc.", color: "#6366f1" },
    { id: "doc_passport", label: "Passeport", desc: "Document de voyage", color: "#ef4444" },
    { id: "doc_invoice", label: "Facture", desc: "Document financier", color: "#f59e0b" },
    { id: "doc_screenshot", label: "Capture d'écran", desc: "Screenshot / preuve", color: "#ec4899" },
    { id: "doc_contract", label: "Contrat", desc: "Document légal", color: "#64748b" },
    { id: "doc_other", label: "Autre document", desc: "Type non listé", color: "#94a3b8" },
  ]},
  { id: "event", label: "Événement", icon: "📅", color: "#f43f5e", items: [
    { id: "event_incident", label: "Incident", desc: "Événement sécuritaire", color: "#ef4444" },
    { id: "event_meeting", label: "Réunion", desc: "Rencontre / meeting", color: "#6366f1" },
    { id: "event_transaction", label: "Transaction", desc: "Échange financier", color: "#f59e0b" },
    { id: "event_travel", label: "Voyage", desc: "Déplacement / trajet", color: "#10b981" },
    { id: "event_connection", label: "Connexion", desc: "Connexion réseau / login", color: "#06b6d4" },
    { id: "event_other", label: "Autre événement", desc: "Non listé", color: "#94a3b8" },
  ]},
  { id: "media", label: "Média", icon: "🎬", color: "#a855f7", items: [
    { id: "media_image", label: "Image", desc: "Photo / capture", color: "#ec4899" },
    { id: "media_video", label: "Vidéo", desc: "Fichier vidéo", color: "#ef4444" },
    { id: "media_audio", label: "Audio", desc: "Enregistrement audio", color: "#f59e0b" },
    { id: "media_archive", label: "Archive", desc: "Fichier compressé / archive", color: "#64748b" },
  ]},
  { id: "techid", label: "Identifiant technique", icon: "🧮", color: "#0ea5e9", items: [
    { id: "tech_mac", label: "Adresse MAC", desc: "Identifiant matériel réseau", color: "#0ea5e9" },
    { id: "tech_imei", label: "IMEI", desc: "Identifiant mobile", color: "#06b6d4" },
    { id: "tech_serial", label: "N° de série", desc: "Numéro de série appareil", color: "#64748b" },
    { id: "tech_hash", label: "Hash (SHA/MD5)", desc: "Empreinte de fichier", color: "#8b5cf6" },
    { id: "tech_ssid", label: "SSID WiFi", desc: "Nom de réseau sans fil", color: "#10b981" },
  ]},
  { id: "financial", label: "Financier", icon: "💳", color: "#16a34a", items: [
    { id: "fin_bank", label: "Compte bancaire", desc: "Compte en banque", color: "#16a34a" },
    { id: "fin_iban", label: "IBAN", desc: "Numéro IBAN", color: "#15803d" },
    { id: "fin_card", label: "Carte bancaire", desc: "CB / Visa / MC", color: "#f59e0b" },
    { id: "fin_transaction", label: "Transaction", desc: "Mouvement financier", color: "#3b82f6" },
    { id: "fin_paypal", label: "PayPal", desc: "Compte PayPal", color: "#0070ba" },
  ]},
  { id: "custom", label: "Autre (personnalisé)", icon: "⭐", color: "#94a3b8", items: [
    { id: "custom_blank", label: "Bloc vide", desc: "Entièrement personnalisable", color: "#94a3b8" },
    { id: "custom_note", label: "Note", desc: "Note libre / mémo", color: "#f59e0b" },
    { id: "custom_flag", label: "Flag / Alerte", desc: "Point d'attention", color: "#ef4444" },
  ]},
  { id: "judicial", label: "Judiciaire", icon: "⚖️", color: "#7c3aed", items: [
    { id: "jud_procedure", label: "Procédure", desc: "Dossier judiciaire / enquête", color: "#7c3aed" },
    { id: "jud_pv", label: "Procès-verbal", desc: "PV d'audition, constatation", color: "#6366f1" },
    { id: "jud_mandat", label: "Mandat / Réquisition", desc: "Mandat de perquisition, réquisition opérateur", color: "#f59e0b" },
    { id: "jud_scelle", label: "Scellé", desc: "Objet mis sous scellé", color: "#64748b" },
    { id: "jud_garde_a_vue", label: "Garde à vue", desc: "Mesure de GAV", color: "#ef4444" },
    { id: "jud_mis_en_cause", label: "Mis en cause", desc: "Personne mise en cause", color: "#dc2626" },
    { id: "jud_temoin", label: "Témoin", desc: "Témoin auditionné", color: "#3b82f6" },
    { id: "jud_victime", label: "Victime", desc: "Personne victime", color: "#f59e0b" },
    { id: "jud_plainte", label: "Plainte", desc: "Dépôt de plainte", color: "#8b5cf6" },
  ]},
  { id: "infraction", label: "Infractions (NATINF)", icon: "🚨", color: "#dc2626", items: [
    { id: "inf_vol", label: "Vol / Recel", desc: "Vol simple, aggravé, recel de biens", color: "#ef4444" },
    { id: "inf_escroquerie", label: "Escroquerie", desc: "Escroquerie, abus de confiance, filouterie", color: "#f59e0b" },
    { id: "inf_stupefiants", label: "Stupéfiants", desc: "Usage, détention, cession, trafic, import/export", color: "#10b981" },
    { id: "inf_violence", label: "Violences", desc: "Volontaires, involontaires, en réunion, avec arme", color: "#dc2626" },
    { id: "inf_menace", label: "Menaces / Harcèlement", desc: "Menaces de mort, harcèlement moral/sexuel, cyberharcèlement", color: "#f97316" },
    { id: "inf_sexuel", label: "Atteintes sexuelles", desc: "Agression sexuelle, viol, exhibition, corruption de mineur", color: "#be123c" },
    { id: "inf_homicide", label: "Homicide", desc: "Meurtre, assassinat, homicide involontaire", color: "#7f1d1d" },
    { id: "inf_cyber", label: "Cybercriminalité", desc: "Accès frauduleux STAD, atteinte aux données, ransomware", color: "#3b82f6" },
    { id: "inf_faux", label: "Faux et usage de faux", desc: "Faux documents, usurpation d'identité", color: "#8b5cf6" },
    { id: "inf_ame", label: "Association de malfaiteurs", desc: "AME, bande organisée", color: "#991b1b" },
    { id: "inf_blanchiment", label: "Blanchiment", desc: "Blanchiment de capitaux, non-justification de ressources", color: "#16a34a" },
    { id: "inf_routier", label: "Infractions routières", desc: "CEA, défaut de permis, refus d'obtempérer, délit de fuite", color: "#64748b" },
    { id: "inf_degradation", label: "Dégradation / Destruction", desc: "Dégradation volontaire, incendie, destruction", color: "#78716c" },
    { id: "inf_tef", label: "Travail illégal / TEF", desc: "Travail dissimulé, TEH, exploitation", color: "#0891b2" },
    { id: "inf_arme", label: "Infraction armes", desc: "Détention, port, acquisition, fabrication illicite", color: "#b91c1c" },
    { id: "inf_terrorisme", label: "Terrorisme", desc: "Association de malfaiteurs terroriste, apologie, financement", color: "#1e1b4b" },
    { id: "inf_atteinte_biens", label: "Atteinte aux biens", desc: "Extorsion, chantage, abus de faiblesse", color: "#a16207" },
    { id: "inf_famille", label: "Infractions familiales", desc: "Non-représentation d'enfant, abandon de famille, bigamie", color: "#ec4899" },
    { id: "inf_environnement", label: "Atteinte environnement", desc: "Pollution, déchets illicites, cruauté animale", color: "#059669" },
    { id: "inf_autre", label: "Autre infraction", desc: "Code NATINF à préciser dans les métadonnées", color: "#94a3b8" },
  ]},
  { id: "evidence", label: "Preuve / Indice", icon: "🔬", color: "#0891b2", items: [
    { id: "evi_trace_adn", label: "Trace ADN", desc: "Prélèvement / profil ADN", color: "#10b981" },
    { id: "evi_empreinte", label: "Empreinte", desc: "Empreinte digitale / palmaire", color: "#06b6d4" },
    { id: "evi_balistique", label: "Balistique", desc: "Arme, projectile, douille", color: "#ef4444" },
    { id: "evi_video_surv", label: "Vidéosurveillance", desc: "Extrait caméra / VSU", color: "#8b5cf6" },
    { id: "evi_telephonie", label: "Fadette / Téléphonie", desc: "Réquisition opérateur, fadettes", color: "#3b82f6" },
    { id: "evi_geoloc", label: "Donnée géoloc", desc: "Bornage, GPS, triangulation", color: "#10b981" },
    { id: "evi_numerique", label: "Preuve numérique", desc: "Extraction téléphone, disque dur", color: "#0ea5e9" },
    { id: "evi_temoignage", label: "Témoignage", desc: "Déclaration recueillie", color: "#f59e0b" },
    { id: "evi_photo_scene", label: "Photo de scène", desc: "Cliché ITT, scène de crime", color: "#ec4899" },
    { id: "evi_objet", label: "Objet saisi", desc: "Objet matériel collecté", color: "#64748b" },
  ]},
  { id: "telecom", label: "Télécommunications", icon: "📡", color: "#0284c7", items: [
    { id: "tel_antenne", label: "Antenne relais", desc: "BTS / station de base", color: "#0284c7" },
    { id: "tel_bornage", label: "Bornage", desc: "Cellule de bornage identifiée", color: "#0891b2" },
    { id: "tel_sms", label: "SMS", desc: "Message texte intercepté / requis", color: "#06b6d4" },
    { id: "tel_appel", label: "Appel", desc: "Communication vocale", color: "#3b82f6" },
    { id: "tel_data", label: "Donnée data", desc: "Trafic data / navigation", color: "#8b5cf6" },
    { id: "tel_operateur", label: "Opérateur", desc: "Orange, SFR, Bouygues, Free", color: "#64748b" },
  ]},
];

export const ALL_ITEMS = {};
CATEGORIES.forEach(c => c.items.forEach(it => { ALL_ITEMS[it.id] = { ...it, category: c.id, categoryLabel: c.label, categoryIcon: c.icon }; }));


export const LINK_TYPES = [
  { id: "related", label: "est lié à", color: "#94a3b8", dash: "" },
  { id: "owns", label: "propriétaire de", color: "#6366f1", dash: "" },
  { id: "located", label: "localisé à", color: "#10b981", dash: "" },
  { id: "uses", label: "utilise", color: "#3b82f6", dash: "" },
  { id: "knows", label: "connaît", color: "#f59e0b", dash: "" },
  { id: "member", label: "membre de", color: "#ef4444", dash: "" },
  { id: "alias", label: "alias de", color: "#8b5cf6", dash: "6 3" },
  { id: "contacted", label: "a contacté", color: "#ec4899", dash: "" },
  { id: "suspected", label: "suspecté de", color: "#f97316", dash: "4 4" },
  { id: "custom", label: "personnalisé", color: "#94a3b8", dash: "" },
];

// PHONE PREFIX → FLAG
const PHONE_FLAGS={"+33":"🇫🇷","+1":"🇺🇸","+44":"🇬🇧","+49":"🇩🇪","+34":"🇪🇸","+39":"🇮🇹","+32":"🇧🇪","+41":"🇨🇭","+31":"🇳🇱","+351":"🇵🇹","+7":"🇷🇺","+86":"🇨🇳","+81":"🇯🇵","+82":"🇰🇷","+91":"🇮🇳","+55":"🇧🇷","+52":"🇲🇽","+61":"🇦🇺","+971":"🇦🇪","+966":"🇸🇦","+90":"🇹🇷","+48":"🇵🇱","+46":"🇸🇪","+47":"🇳🇴","+45":"🇩🇰","+358":"🇫🇮","+30":"🇬🇷","+420":"🇨🇿","+36":"🇭🇺","+40":"🇷🇴","+380":"🇺🇦","+212":"🇲🇦","+213":"🇩🇿","+216":"🇹🇳","+20":"🇪🇬","+27":"🇿🇦","+234":"🇳🇬","+254":"🇰🇪","+62":"🇮🇩","+66":"🇹🇭","+84":"🇻🇳","+63":"🇵🇭","+65":"🇸🇬","+60":"🇲🇾","+852":"🇭🇰","+886":"🇹🇼","+972":"🇮🇱","+98":"🇮🇷","+92":"🇵🇰","+880":"🇧🇩","+94":"🇱🇰","+353":"🇮🇪","+352":"🇱🇺","+377":"🇲🇨","+376":"🇦🇩"};
function getPhoneFlag(label){if(!label)return null;const m=label.match(/^\+\d+/);if(!m)return null;const num=m[0];const sorted=Object.keys(PHONE_FLAGS).sort((a,b)=>b.length-a.length);for(const prefix of sorted){if(num.startsWith(prefix))return PHONE_FLAGS[prefix];}return null;}

// ADDRESS NORMALIZATION (FR abbreviations)
const ADDR_ABBR={"imp.":"impasse","imp ":"impasse ","bd ":"boulevard ","bd.":"boulevard","bld ":"boulevard ","bld.":"boulevard","av.":"avenue","av ":"avenue ","pl.":"place","pl ":"place ","rte ":"route ","rte.":"route","chem.":"chemin","chem ":"chemin ","all.":"allée","all ":"allée ","sq.":"square","sq ":"square ","fg.":"faubourg","fg ":"faubourg ","pass.":"passage","pass ":"passage ","res.":"résidence","res ":"résidence ","lot.":"lotissement","lot ":"lotissement ","zac ":"zone d'aménagement ","zi ":"zone industrielle ","crs ":"cours ","crs.":"cours","quai ":"quai ","r.":"rue","r ":"rue "};
function normalizeAddress(addr){let s=addr;for(const[ab,full]of Object.entries(ADDR_ABBR)){s=s.replace(new RegExp("\\b"+ab.replace(".","\\."),"gi"),full);}return s;}

// DATE FORMATTER FR
export function fmtDate(d){if(!d)return"";try{const dt=new Date(d);return dt.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"})+" "+dt.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});}catch{return"";}}
export function fmtDateShort(d){if(!d)return"";try{return new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});}catch{return"";}}

const LINK_STRENGTHS = [
  { id: "confirmed", label: "✓ Confirmé", desc: "70% et plus", width: 2.5, dash: "", opacity: 1, badge: "✓", badgeColor: "#10b981", min: 70 },
  { id: "probable", label: "~ Probable", desc: "30% à 69%", width: 1.8, dash: "", opacity: 0.8, badge: "~", badgeColor: "#f59e0b", min: 30 },
  { id: "possible", label: "? Possible", desc: "1% à 29%", width: 1.2, dash: "6 4", opacity: 0.5, badge: "?", badgeColor: "#ef4444", min: 1 },
  { id: "unknown", label: "— Non qualifié", desc: "0%", width: 1.5, dash: "2 3", opacity: 0.6, badge: "—", badgeColor: "#64748b", min: 0 },
];
export function getStrengthFromConfidence(conf) {
  if (conf >= 70) return LINK_STRENGTHS[0];
  if (conf >= 30) return LINK_STRENGTHS[1];
  if (conf >= 1) return LINK_STRENGTHS[2];
  return LINK_STRENGTHS[3];
}

// STICKERS
const STICKERS = [
  { id: "thumbsup", emoji: "👍", label: "Validé" },
  { id: "thumbsdown", emoji: "👎", label: "Rejeté" },
  { id: "question", emoji: "❓", label: "À vérifier" },
  { id: "exclamation", emoji: "❗", label: "Important" },
  { id: "warning", emoji: "⚠️", label: "Attention" },
  { id: "check", emoji: "✅", label: "Confirmé" },
  { id: "cross", emoji: "❌", label: "Faux / Éliminé" },
  { id: "star", emoji: "⭐", label: "Prioritaire" },
  { id: "fire", emoji: "🔥", label: "Urgent" },
  { id: "eye", emoji: "👁️", label: "Sous surveillance" },
  { id: "lock", emoji: "🔒", label: "Confidentiel" },
  { id: "flag", emoji: "🚩", label: "Red flag" },
  { id: "target", emoji: "🎯", label: "Cible" },
  { id: "clock2", emoji: "⏰", label: "En attente" },
  { id: "skull", emoji: "💀", label: "Dangereux" },
  { id: "money", emoji: "💰", label: "Flux financier" },
];

const POSTIT_COLORS = ["#fef08a","#bbf7d0","#bfdbfe","#fecaca","#e9d5ff","#fed7aa","#d1d5db"];


// PLUGINS REGISTRY
const PLUGINS = [
  // Visualisation
  { id: "timeline", label: "Timeline", icon: "🕐", desc: "Chronologie des actions, commentaires et dates du graphe", category: "Visualisation" },
  { id: "map", label: "Carte géographique", icon: "🗺️", desc: "Affiche les entités géolocalisées sur une carte interactive Leaflet", category: "Visualisation" },
  { id: "layout", label: "Auto-layout", icon: "🔀", desc: "Réarrangement automatique du graphe par algorithme de forces", category: "Visualisation" },
  { id: "filters", label: "Filtres d'entités", icon: "🔍", desc: "Masquer/afficher les entités par type pour clarifier la vue", category: "Visualisation" },
  { id: "stats", label: "Statistiques", icon: "📊", desc: "Dashboard avec répartition des entités, liens, activité et métriques clés", category: "Visualisation" },
  { id: "heatmap", label: "Heatmap de liens", icon: "🌡️", desc: "Visualisation de la densité de connexions entre entités avec gradient de couleur", category: "Visualisation" },
  { id: "clusters", label: "Détection de clusters", icon: "🧬", desc: "Identifie automatiquement les groupes d'entités fortement connectées entre elles", category: "Visualisation" },
  // Collaboration
  { id: "whiteboard", label: "Tableau blanc", icon: "🎨", desc: "Espace de dessin collaboratif avec formes, texte et stickers", category: "Collaboration" },
  { id: "chat", label: "Chat intégré", icon: "💬", desc: "Messagerie temps réel entre collaborateurs dans la salle", category: "Collaboration" },
  { id: "annotations", label: "Annotations", icon: "📝", desc: "Post-its et notes épinglées directement sur le graphe avec mentions @user", category: "Collaboration" },
  // Import / Export
  { id: "osint_import", label: "OSINT Industries", icon: "🔎", desc: "Import d'exports JSON OSINT Industries avec aperçu sélectif des modules", category: "Import / Export" },
  { id: "maltego", label: "Maltego Import", icon: "🦅", desc: "Import de graphes Maltego au format MTGX/CSV (entités + liens)", category: "Import / Export" },
  { id: "csv_import", label: "Import CSV", icon: "📄", desc: "Import d'entités et liens depuis un fichier CSV/TSV structuré", category: "Import / Export" },
  { id: "screenshot", label: "Capture d'écran", icon: "📸", desc: "Export du graphe en image PNG haute résolution", category: "Import / Export" },
  { id: "pdf_export", label: "Rapport PDF", icon: "📕", desc: "Génère un rapport PDF complet avec graphe, entités, liens et timeline", category: "Import / Export" },
  { id: "sherlock_import", label: "Sherlock Import", icon: "🕵️", desc: "Import des résultats Sherlock (recherche de pseudos multi-plateforme)", category: "Import / Export" },
  { id: "holehe_import", label: "Holehe Import", icon: "📬", desc: "Import des résultats Holehe (vérification d'emails sur 100+ sites)", category: "Import / Export" },
  // Enrichissement
  { id: "transforms", label: "Transforms", icon: "🔬", desc: "Enrichissement local + API : opérateur FR, domaine, WHOIS, géoloc IP, email rep...", category: "Enrichissement" },
  { id: "shodan", label: "Shodan Lookup", icon: "🛰️", desc: "Recherche d'informations sur les IPs et domaines via l'API Shodan", category: "Enrichissement" },
  { id: "haveibeenpwned", label: "Have I Been Pwned", icon: "🔓", desc: "Vérifie si un email apparaît dans des fuites de données connues", category: "Enrichissement" },
  { id: "socialscan", label: "Social Scan", icon: "👤", desc: "Recherche automatique d'un pseudo sur 100+ réseaux sociaux", category: "Enrichissement" },
  { id: "dns_lookup", label: "DNS Lookup", icon: "🌐", desc: "Résolution DNS complète : A, AAAA, MX, TXT, NS, SOA, CNAME", category: "Enrichissement" },
  { id: "reverse_image", label: "Reverse Image", icon: "🖼️", desc: "Recherche inversée d'image via Google, Yandex, TinEye", category: "Enrichissement" },
  { id: "phone_lookup", label: "Phone Intel", icon: "📱", desc: "Lookup avancé de numéros : opérateur, type de ligne, pays, HLR", category: "Enrichissement" },
  { id: "crypto_trace", label: "Crypto Tracer", icon: "₿", desc: "Suivi d'adresses Bitcoin/Ethereum avec visualisation des transactions", category: "Enrichissement" },
  // Sécurité
  { id: "anonymize", label: "Anonymisation", icon: "🔒", desc: "Masquer tous les labels pour partage sécurisé d'écran ou screenshot", category: "Sécurité" },
  { id: "encryption", label: "Chiffrement local", icon: "🛡️", desc: "Chiffre les exports JSON avec mot de passe AES-256-GCM", category: "Sécurité" },
  { id: "audit_log", label: "Journal d'audit", icon: "📋", desc: "Log détaillé et horodaté de toutes les modifications avec auteur", category: "Sécurité" },
  { id: "auto_backup", label: "Auto-backup", icon: "💾", desc: "Sauvegarde automatique du graphe toutes les 5 minutes en local", category: "Sécurité" },
];

export const themes = {
  dark: { bg:"#0d1117",surface:"#161b22",surfaceAlt:"#1c2333",border:"#2a3140",borderHover:"#3d4868",text:"#e2e4ed",textSecondary:"#8b8fa8",textMuted:"#4e5568",accent:"#58a6ff",accentHover:"#79b8ff",canvasBg:"#0d1117",canvasGrid:"#1a2030",shadow:"rgba(0,0,0,0.6)",danger:"#f85149",success:"#3fb950",catHover:"#1f2937",itemBg:"#172030",itemHover:"#1e2d42",itemBorder:"#253044",tooltip:"#1e293b",tooltipBorder:"#334155" },
  light: { bg:"#f6f8fa",surface:"#ffffff",surfaceAlt:"#f1f3f9",border:"#d8dee4",borderHover:"#bcc3ce",text:"#1f2328",textSecondary:"#656d76",textMuted:"#9ca3af",accent:"#0969da",accentHover:"#0550ae",canvasBg:"#f0f2f8",canvasGrid:"#dfe2e8",shadow:"rgba(0,0,0,0.08)",danger:"#cf222e",success:"#1a7f37",catHover:"#e8ebf0",itemBg:"#ffffff",itemHover:"#f0f3f9",itemBorder:"#e2e5f0",tooltip:"#ffffff",tooltipBorder:"#d1d5db" },
};


export const genId = () => Math.random().toString(36).slice(2, 10);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const getCenter = (e) => ({ x: e.x + 80, y: e.y + 30 });
export const getEdge = (c, tgt, hw = 80, hh = 30) => { const dx=tgt.x-c.x,dy=tgt.y-c.y; if(!dx&&!dy)return c; const s=Math.abs(dx)/hw>Math.abs(dy)/hh?hw/Math.abs(dx):hh/Math.abs(dy); return{x:c.x+dx*s,y:c.y+dy*s}; };

export const I = {
  search:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  x:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  trash:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  link:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  sun:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  moon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  download:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  zoomIn:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg>,
  zoomOut:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M8 11h6"/></svg>,
  fit:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
  users:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  clock:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  copy:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  chev:(o)=><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{transform:o?"rotate(90deg)":"rotate(0)",transition:"transform 0.2s"}}><polyline points="9 18 15 12 9 6"/></svg>,
  bolt:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  grid:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
};

export const HOLD_DELAY = 300;
export const MOVE_THRESHOLD = 5;

// Tooltip component

