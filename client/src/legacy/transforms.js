// OSINT Transforms — local parsing + API lookups
// Each transform: { id, label, icon, types: [subtypes], fn: (entity) => Promise<Result[]> }
// Result: { label, subtype, description?, metadata?, notes? }

// === FRENCH PHONE OPERATOR LOOKUP (by prefix) ===
const FR_OPERATORS = {
  "06":{op:"Mobile FR",prefixes:{"0600":"Orange","0601":"Orange","0602":"Orange","0603":"Orange","0604":"Orange","0605":"Orange","0606":"SFR","0607":"SFR","0608":"SFR","0609":"SFR","0610":"SFR","0611":"SFR","0612":"SFR","0613":"SFR","0614":"SFR","0615":"Bouygues","0616":"Bouygues","0617":"Bouygues","0618":"Bouygues","0619":"Bouygues","0620":"Bouygues","0621":"Bouygues","0622":"SFR","0623":"SFR","0624":"Orange","0625":"Orange","0626":"Orange","0627":"Orange","0628":"Free","0629":"Free","0630":"Orange","0631":"Orange","0632":"Orange","0633":"Orange","0634":"Orange","0635":"Free","0636":"Free","0637":"Free","0638":"Bouygues","0639":"Bouygues","0640":"Bouygues","0641":"Bouygues","0642":"Bouygues","0643":"Bouygues","0644":"SFR","0645":"SFR","0646":"SFR","0647":"Orange","0648":"Orange","0649":"Orange","0650":"Free","0651":"Free","0652":"Free","0653":"Free","0654":"Free","0655":"Bouygues","0656":"Bouygues","0657":"Bouygues","0658":"Orange","0659":"Orange","0660":"Orange","0661":"Orange","0662":"Orange","0663":"SFR","0664":"SFR","0665":"SFR","0666":"SFR","0667":"SFR","0668":"SFR","0669":"SFR","0670":"SFR","0671":"SFR","0672":"SFR","0673":"SFR","0674":"Free","0675":"Free","0676":"Orange","0677":"Orange","0678":"Orange","0679":"Orange","0680":"Orange","0681":"Orange","0682":"Orange","0683":"Orange","0684":"SFR","0685":"SFR","0686":"SFR","0687":"Bouygues","0688":"Bouygues","0689":"Bouygues","0690":"Orange","0691":"Orange","0692":"Orange","0693":"Orange","0694":"Orange","0695":"Bouygues","0696":"Bouygues","0697":"SFR","0698":"SFR","0699":"SFR"}},
  "07":{op:"Mobile FR",prefixes:{"0700":"Orange","0701":"Orange","0702":"Orange","0703":"Bouygues","0704":"Bouygues","0705":"Bouygues","0706":"SFR","0707":"SFR","0708":"SFR","0709":"SFR","0710":"SFR","0711":"Bouygues","0712":"Bouygues","0713":"Free","0714":"Free","0715":"Free","0744":"Bouygues","0745":"Bouygues","0749":"Free","0750":"Free","0751":"Free","0752":"Free","0753":"Free","0756":"SFR","0757":"SFR","0758":"SFR","0760":"Orange","0761":"Orange","0762":"Orange","0763":"Orange","0766":"SFR","0767":"SFR","0768":"SFR","0769":"SFR","0770":"Orange","0771":"Orange","0772":"Orange","0773":"Orange","0774":"Orange","0775":"Bouygues","0776":"Bouygues","0777":"Bouygues","0778":"Bouygues","0780":"Orange","0781":"Orange","0782":"Orange","0783":"Orange","0784":"SFR","0785":"SFR","0786":"SFR","0787":"Bouygues","0788":"Bouygues","0789":"Bouygues"}}
};

function detectFROperator(phone) {
  // Normalize to 0X format
  let n = phone.replace(/[\s.\-()]/g, "");
  if (n.startsWith("+33")) n = "0" + n.slice(3);
  if (n.startsWith("0033")) n = "0" + n.slice(4);
  if (!n.startsWith("06") && !n.startsWith("07")) return null;
  const prefix4 = n.slice(0, 4);
  const block = FR_OPERATORS[n.slice(0, 2)];
  if (!block) return null;
  return block.prefixes[prefix4] || null;
}

// === EMAIL PROVIDERS ===
const EMAIL_PROVIDERS = {
  "gmail.com":"Google","googlemail.com":"Google","outlook.com":"Microsoft","hotmail.com":"Microsoft",
  "live.com":"Microsoft","msn.com":"Microsoft","yahoo.com":"Yahoo","yahoo.fr":"Yahoo","aol.com":"AOL",
  "protonmail.com":"ProtonMail","proton.me":"ProtonMail","pm.me":"ProtonMail","tutanota.com":"Tutanota",
  "icloud.com":"Apple","me.com":"Apple","mac.com":"Apple","free.fr":"Free","orange.fr":"Orange",
  "wanadoo.fr":"Orange","sfr.fr":"SFR","numericable.fr":"SFR","laposte.net":"La Poste",
  "bouyguestelecom.fr":"Bouygues","gmx.com":"GMX","gmx.fr":"GMX","mail.com":"Mail.com",
  "yandex.com":"Yandex","zoho.com":"Zoho","fastmail.com":"Fastmail","hey.com":"Basecamp",
};

// === SOCIAL PLATFORM DETECTION ===
const SOCIAL_PATTERNS = [
  { re: /facebook\.com|fb\.com/i, platform: "Facebook", icon: "📘" },
  { re: /twitter\.com|x\.com/i, platform: "X (Twitter)", icon: "🐦" },
  { re: /instagram\.com/i, platform: "Instagram", icon: "📸" },
  { re: /linkedin\.com/i, platform: "LinkedIn", icon: "💼" },
  { re: /tiktok\.com/i, platform: "TikTok", icon: "🎵" },
  { re: /youtube\.com|youtu\.be/i, platform: "YouTube", icon: "▶️" },
  { re: /snapchat\.com/i, platform: "Snapchat", icon: "👻" },
  { re: /telegram\.org|t\.me/i, platform: "Telegram", icon: "✈️" },
  { re: /discord\.gg|discord\.com/i, platform: "Discord", icon: "🎮" },
  { re: /reddit\.com/i, platform: "Reddit", icon: "🤖" },
  { re: /github\.com/i, platform: "GitHub", icon: "🐙" },
  { re: /twitch\.tv/i, platform: "Twitch", icon: "🟣" },
  { re: /pinterest\.com/i, platform: "Pinterest", icon: "📌" },
  { re: /whatsapp\.com/i, platform: "WhatsApp", icon: "💬" },
  { re: /signal\.org/i, platform: "Signal", icon: "🔒" },
];

// === PHONE COUNTRY PREFIXES ===
const PHONE_COUNTRIES = {
  "+33":"France","+1":"États-Unis/Canada","+44":"Royaume-Uni","+49":"Allemagne","+34":"Espagne",
  "+39":"Italie","+32":"Belgique","+41":"Suisse","+31":"Pays-Bas","+351":"Portugal","+7":"Russie",
  "+86":"Chine","+81":"Japon","+82":"Corée du Sud","+91":"Inde","+55":"Brésil","+52":"Mexique",
  "+61":"Australie","+971":"Émirats arabes unis","+966":"Arabie saoudite","+90":"Turquie",
  "+212":"Maroc","+213":"Algérie","+216":"Tunisie","+20":"Égypte","+27":"Afrique du Sud",
};

// ============================================================================
// TRANSFORM DEFINITIONS
// ============================================================================

export const TRANSFORMS = [
  // ── PHONE ──
  {
    id: "phone_operator_fr",
    label: "🔍 Opérateur FR (local)",
    icon: "📡",
    types: ["phone"],
    local: true,
    fn: (ent) => {
      const op = detectFROperator(ent.label);
      if (!op) return [{ error: `Impossible de déterminer l'opérateur pour "${ent.label}". Le numéro doit être français (06/07).` }];
      return [{ label: op, subtype: "org_company", description: `Opérateur téléphonique de ${ent.label}`, linkLabel: "opérateur" }];
    }
  },
  {
    id: "phone_country",
    label: "🌍 Pays d'origine",
    icon: "🏴",
    types: ["phone"],
    local: true,
    fn: (ent) => {
      const n = ent.label.replace(/[\s.\-()]/g, "");
      const sorted = Object.keys(PHONE_COUNTRIES).sort((a, b) => b.length - a.length);
      for (const prefix of sorted) {
        if (n.startsWith(prefix)) return [{ label: PHONE_COUNTRIES[prefix], subtype: "loc_country", description: `Indicatif ${prefix}`, linkLabel: "pays" }];
      }
      if (n.startsWith("0")) return [{ label: "France (probable)", subtype: "loc_country", description: "Numéro national commençant par 0", linkLabel: "pays" }];
      return [{ error: "Indicatif pays non reconnu" }];
    }
  },
  {
    id: "phone_format",
    label: "📋 Format E.164",
    icon: "📋",
    types: ["phone"],
    local: true,
    fn: (ent) => {
      let n = ent.label.replace(/[\s.\-()]/g, "");
      if (n.startsWith("0") && !n.startsWith("00")) n = "+33" + n.slice(1);
      return [{ rename: n, info: `Format E.164: ${n}` }];
    }
  },
  {
    id: "phone_hlr",
    label: "📡 HLR Lookup (API)",
    icon: "📡",
    types: ["phone"],
    local: false,
    fn: async (ent) => {
      let n = ent.label.replace(/[\s.\-()]/g, "");
      if (n.startsWith("0") && !n.startsWith("00")) n = "+33" + n.slice(1);
      try {
        const r = await fetch(`http://apilayer.net/api/validate?access_key=demo&number=${encodeURIComponent(n)}&format=1`);
        const d = await r.json();
        if (!d.valid) return [{ error: "Numéro invalide selon l'API" }];
        const results = [];
        if (d.carrier) results.push({ label: d.carrier, subtype: "org_company", description: `Opérateur de ${n}`, linkLabel: "opérateur" });
        if (d.line_type) results.push({ label: `Type: ${d.line_type}`, subtype: "phone_line", description: `${d.line_type} — ${n}`, linkLabel: "type ligne" });
        if (d.country_name) results.push({ label: d.country_name, subtype: "loc_country", description: `Pays du numéro`, linkLabel: "pays" });
        return results.length ? results : [{ info: `Numéro valide: ${d.international_format}` }];
      } catch (e) { return [{ error: "Erreur API: " + e.message }]; }
    }
  },

  // ── EMAIL ──
  {
    id: "email_domain",
    label: "🌐 Extraire le domaine",
    icon: "🌐",
    types: ["email"],
    local: true,
    fn: (ent) => {
      const m = ent.label.match(/@(.+)$/);
      if (!m) return [{ error: "Pas de domaine détecté" }];
      return [{ label: m[1], subtype: "web_domain", description: `Domaine de ${ent.label}`, linkLabel: "domaine" }];
    }
  },
  {
    id: "email_username",
    label: "👤 Extraire le username",
    icon: "👤",
    types: ["email"],
    local: true,
    fn: (ent) => {
      const m = ent.label.match(/^([^@]+)@/);
      if (!m) return [{ error: "Pas de username détecté" }];
      return [{ label: m[1], subtype: "pseudo_username", description: `Username de ${ent.label}`, linkLabel: "username" }];
    }
  },
  {
    id: "email_provider",
    label: "🏢 Identifier le provider",
    icon: "🏢",
    types: ["email"],
    local: true,
    fn: (ent) => {
      const m = ent.label.match(/@(.+)$/);
      if (!m) return [{ error: "Domaine non détecté" }];
      const domain = m[1].toLowerCase();
      const provider = EMAIL_PROVIDERS[domain];
      if (!provider) return [{ label: domain, subtype: "org_company", description: `Provider email (domaine custom)`, linkLabel: "provider" }];
      return [{ label: provider, subtype: "org_company", description: `Provider de ${domain}`, linkLabel: "provider" }];
    }
  },
  {
    id: "email_reputation",
    label: "🛡️ Réputation email (API)",
    icon: "🛡️",
    types: ["email"],
    local: false,
    fn: async (ent) => {
      try {
        const r = await fetch(`https://emailrep.io/${encodeURIComponent(ent.label)}`, { headers: { "Accept": "application/json" } });
        if (!r.ok) return [{ error: `API error: ${r.status}` }];
        const d = await r.json();
        const results = [];
        results.push({ label: `Réputation: ${d.reputation || "?"}`, subtype: "doc_report", description: `Score: ${d.reputation}, Suspicious: ${d.suspicious?"Oui":"Non"}, Jetable: ${d.details?.disposable?"Oui":"Non"}, Spam: ${d.details?.spam?"Oui":"Non"}`, linkLabel: "réputation", notes: JSON.stringify(d.details, null, 2) });
        return results;
      } catch (e) { return [{ error: "Erreur API: " + e.message }]; }
    }
  },

  // ── DOMAIN / URL ──
  {
    id: "domain_root",
    label: "🌐 Domaine racine",
    icon: "🌐",
    types: ["web"],
    local: true,
    fn: (ent) => {
      let d = ent.label.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
      const parts = d.split(".");
      if (parts.length > 2) d = parts.slice(-2).join(".");
      return [{ label: d, subtype: "web_domain", description: "Domaine racine", linkLabel: "domaine racine" }];
    }
  },
  {
    id: "domain_tld",
    label: "🏷️ Extraire le TLD",
    icon: "🏷️",
    types: ["web"],
    local: true,
    fn: (ent) => {
      const d = ent.label.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const tld = d.split(".").pop();
      return [{ label: `.${tld}`, subtype: "doc_report", description: `TLD de ${d}`, linkLabel: "TLD" }];
    }
  },
  {
    id: "domain_whois",
    label: "📋 WHOIS (API)",
    icon: "📋",
    types: ["web", "ip"],
    local: false,
    fn: async (ent) => {
      let d = ent.label.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
      try {
        const r = await fetch(`https://api.whois.vu/?q=${encodeURIComponent(d)}`);
        const data = await r.json();
        if (!data || data.error) return [{ error: data?.error || "WHOIS non disponible" }];
        const results = [];
        if (data.registrar) results.push({ label: data.registrar, subtype: "org_company", description: `Registrar de ${d}`, linkLabel: "registrar" });
        if (data.creation_date) results.push({ label: `Créé le ${data.creation_date}`, subtype: "doc_report", description: `Date de création du domaine`, linkLabel: "date création" });
        if (data.registrant) results.push({ label: data.registrant, subtype: "person_alias", description: `Registrant de ${d}`, linkLabel: "registrant" });
        return results.length ? results : [{ info: "WHOIS retourné mais sans données exploitables", notes: JSON.stringify(data, null, 2) }];
      } catch (e) { return [{ error: "Erreur WHOIS: " + e.message }]; }
    }
  },

  // ── SOCIAL ──
  {
    id: "social_platform",
    label: "📱 Détecter la plateforme",
    icon: "📱",
    types: ["social"],
    local: true,
    fn: (ent) => {
      for (const sp of SOCIAL_PATTERNS) {
        if (sp.re.test(ent.label) || sp.re.test(ent.description || "")) {
          return [{ label: sp.platform, subtype: "org_company", description: `Plateforme détectée depuis ${ent.label}`, linkLabel: "plateforme" }];
        }
      }
      return [{ error: "Plateforme non reconnue" }];
    }
  },
  {
    id: "social_username",
    label: "👤 Extraire le pseudo",
    icon: "👤",
    types: ["social"],
    local: true,
    fn: (ent) => {
      const url = ent.label;
      // Try to extract username from URL patterns
      const patterns = [
        /(?:twitter\.com|x\.com)\/([^/?#]+)/i,
        /instagram\.com\/([^/?#]+)/i,
        /facebook\.com\/([^/?#]+)/i,
        /linkedin\.com\/in\/([^/?#]+)/i,
        /tiktok\.com\/@?([^/?#]+)/i,
        /github\.com\/([^/?#]+)/i,
        /t\.me\/([^/?#]+)/i,
        /youtube\.com\/@([^/?#]+)/i,
      ];
      for (const re of patterns) {
        const m = url.match(re);
        if (m && m[1]) return [{ label: m[1], subtype: "pseudo_username", description: `Pseudo extrait de ${url}`, linkLabel: "pseudo" }];
      }
      return [{ error: "Impossible d'extraire un pseudo" }];
    }
  },

  // ── IP ──
  {
    id: "ip_type",
    label: "🔢 Type d'IP",
    icon: "🔢",
    types: ["ip"],
    local: true,
    fn: (ent) => {
      const ip = ent.label.trim();
      const isV6 = ip.includes(":");
      const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|::1|fc|fd)/i.test(ip);
      const typeStr = `${isV6 ? "IPv6" : "IPv4"} — ${isPrivate ? "Privée" : "Publique"}`;
      return [{ label: typeStr, subtype: "doc_report", description: `Type d'adresse IP`, linkLabel: "type" }];
    }
  },
  {
    id: "ip_geoloc",
    label: "📍 Géolocaliser l'IP (API)",
    icon: "📍",
    types: ["ip"],
    local: false,
    fn: async (ent) => {
      const ip = ent.label.trim();
      try {
        const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}`);
        const d = await r.json();
        if (d.status !== "success") return [{ error: d.message || "IP non trouvée" }];
        const results = [];
        if (d.isp) results.push({ label: d.isp, subtype: "org_company", description: `ISP de ${ip}`, linkLabel: "ISP" });
        if (d.country) results.push({ label: `${d.city || ""}, ${d.country}`.replace(/^, /, ""), subtype: "loc_city", description: `Géoloc: ${d.lat}, ${d.lon}`, metadata: { lat: String(d.lat), lng: String(d.lon) }, linkLabel: "localisation" });
        if (d.org) results.push({ label: d.org, subtype: "org_company", description: `Organisation de ${ip}`, linkLabel: "organisation" });
        return results.length ? results : [{ info: "IP localisée mais sans données exploitables" }];
      } catch (e) { return [{ error: "Erreur API: " + e.message }]; }
    }
  },

  // ── PERSON ──
  {
    id: "person_split",
    label: "✂️ Séparer prénom / nom",
    icon: "✂️",
    types: ["person"],
    local: true,
    fn: (ent) => {
      const parts = ent.label.trim().split(/\s+/);
      if (parts.length < 2) return [{ error: "Le nom doit contenir au moins 2 mots" }];
      const prenom = parts[0], nom = parts.slice(1).join(" ");
      return [
        { label: prenom, subtype: "person_main", description: "Prénom", linkLabel: "prénom" },
        { label: nom, subtype: "person_main", description: "Nom de famille", linkLabel: "nom" },
      ];
    }
  },
  {
    id: "person_email_guess",
    label: "📧 Générer emails probables",
    icon: "📧",
    types: ["person"],
    local: true,
    fn: (ent) => {
      const parts = ent.label.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/);
      if (parts.length < 2) return [{ error: "Il faut prénom + nom" }];
      const [p, ...rest] = parts;
      const n = rest.join("");
      const combos = [
        `${p}.${n}@gmail.com`, `${p}${n}@gmail.com`, `${p[0]}${n}@gmail.com`,
        `${p}.${n}@outlook.com`, `${p}.${n}@yahoo.fr`, `${p}.${n}@hotmail.fr`,
      ];
      return combos.map(email => ({ label: email, subtype: "email_personal", description: `Email probable de ${ent.label}`, linkLabel: "email probable" }));
    }
  },

  // ── LOCATION ──
  {
    id: "loc_extract_country",
    label: "🏴 Extraire le pays",
    icon: "🏴",
    types: ["location"],
    local: true,
    fn: (ent) => {
      const addr = ent.metadata?.address || ent.description || ent.label;
      // Try to find country from common patterns
      const countries = ["France","Belgique","Suisse","Canada","Allemagne","Espagne","Italie","Royaume-Uni","États-Unis","Maroc","Algérie","Tunisie"];
      for (const c of countries) {
        if (addr.toLowerCase().includes(c.toLowerCase())) return [{ label: c, subtype: "loc_country", description: `Pays extrait de "${addr}"`, linkLabel: "pays" }];
      }
      // Try postal code (France)
      const cp = addr.match(/\b(\d{5})\b/);
      if (cp) return [{ label: "France (code postal détecté)", subtype: "loc_country", description: `CP: ${cp[1]}`, linkLabel: "pays" }];
      return [{ error: "Pays non détecté" }];
    }
  },
];

export function getTransformsForEntity(entity) {
  return TRANSFORMS.filter(tr => tr.types.includes(entity.type));
}
