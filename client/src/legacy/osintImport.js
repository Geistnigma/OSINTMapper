// OSINT Industries JSON Import Parser
// Converts OSINT Industries export into Mind Map entities + links

// Platform → subtype mapping
const PLATFORM_MAP = {
  facebook: "social_facebook", instagram: "social_instagram", twitter: "social_twitter",
  tiktok: "social_tiktok", telegram: "social_telegram", reddit: "social_reddit",
  linkedin: "social_linkedin", snapchat: "social_snapchat", discord: "social_discord",
  youtube: "social_youtube", github: "social_github", pinterest: "social_pinterest",
  tumblr: "social_tumblr", mastodon: "social_mastodon", threads: "social_threads",
  twitch: "social_twitch", soundcloud: "social_soundcloud", spotify: "social_spotify",
  steam: "social_steam", xbox: "social_xbox", playstation: "social_playstation",
};

function getSubtypeForModule(moduleName) {
  const lower = moduleName.toLowerCase();
  for (const [key, subtype] of Object.entries(PLATFORM_MAP)) {
    if (lower.includes(key)) return subtype;
  }
  // Email modules
  if (lower.includes("email") || lower.includes("mail")) return null; // handled separately
  // Gaming
  if (lower.includes("fortnite") || lower.includes("destiny") || lower.includes("chess") || lower.includes("game")) return "social_gaming";
  // Default: social other
  return "social_other";
}

// Generate unique ID
let _oid = 0;
function oid() { return "oi_" + Date.now().toString(36) + "_" + (++_oid).toString(36); }

/**
 * Parse OSINT Industries export JSON
 * @param {Array} data - Raw JSON array from OSINT Industries
 * @param {string} targetName - The search query / target name
 * @returns {{ preview, entities, links }}
 */
export function parseOSINTExport(data, targetName) {
  if (!Array.isArray(data)) throw new Error("Le fichier doit être un tableau JSON");

  const foundModules = data.filter(d => d.status === "found");
  const entities = [];
  const links = [];
  const emailSet = new Set();
  const nameSet = new Set();
  const locationSet = new Set();

  // === PREVIEW STATS ===
  const preview = {
    totalModules: data.length,
    foundModules: foundModules.length,
    platforms: [],
    emails: [],
    names: [],
    locations: [],
    hasImage: false,
  };

  // Collect data from all modules
  foundModules.forEach(mod => {
    const sf = mod.spec_format?.[0] || {};
    const fs = mod.front_schemas?.[0] || {};

    const info = {
      module: mod.module,
      prettyName: mod.pretty_name || mod.schemaModule || mod.module,
      reliable: mod.reliable_source !== false,
      registered: sf.registered?.value === true,
      profileUrl: sf.profile_url?.value || "",
      pictureUrl: sf.picture_url?.value || fs.image || "",
      name: sf.name?.value || "",
      username: sf.username?.value || "",
      firstName: sf.first_name?.value || "",
      lastName: sf.last_name?.value || "",
      email: sf.email?.value || "",
      emailHint: sf.email_hint?.value || "",
      location: sf.location?.value || "",
      bio: sf.bio?.value || "",
      verified: sf.verified?.value || false,
      private: sf.private?.value || false,
      id: sf.id?.value || "",
      creationDate: sf.creation_date?.value || fs.timeline?.registered_date || "",
      lastSeen: sf.last_seen?.value || fs.timeline?.last_seen_date || "",
    };

    preview.platforms.push({
      name: info.prettyName,
      module: info.module,
      url: info.profileUrl,
      username: info.username || info.name,
      reliable: info.reliable,
      selected: true, // user can deselect
    });

    if (info.email && !emailSet.has(info.email.toLowerCase())) {
      emailSet.add(info.email.toLowerCase());
      preview.emails.push(info.email);
    }
    if (info.emailHint && !emailSet.has(info.emailHint.toLowerCase())) {
      emailSet.add(info.emailHint.toLowerCase());
      preview.emails.push(info.emailHint + " (indice)");
    }

    const displayName = info.name || info.username || info.firstName;
    if (displayName && displayName.toLowerCase() !== targetName.toLowerCase() && !nameSet.has(displayName.toLowerCase())) {
      nameSet.add(displayName.toLowerCase());
      preview.names.push(displayName);
    }

    if (info.location && !locationSet.has(info.location.toLowerCase())) {
      locationSet.add(info.location.toLowerCase());
      preview.locations.push({ text: info.location, source: info.prettyName });
    }

    if (info.pictureUrl && !info.pictureUrl.startsWith("data:")) preview.hasImage = true;
  });

  return { preview, foundModules };
}

/**
 * Generate entities and links from selected modules
 * @param {Array} foundModules - All found modules
 * @param {Array} selectedModules - Module names to import (from preview selection)
 * @param {string} targetName - Target name
 * @param {{ x: number, y: number }} origin - Where to place entities
 * @returns {{ entities: Array, links: Array }}
 */
export function generateEntities(foundModules, selectedModules, targetName, origin) {
  const entities = [];
  const links = [];
  const emailMap = {}; // email → entity id (dedup)
  const locationMap = {}; // location → entity id (dedup)
  const nameMap = {}; // name → entity id (dedup)
  const cx = origin.x, cy = origin.y;

  // 1. Central target entity
  const targetId = oid();
  entities.push({
    id: targetId,
    label: targetName,
    type: "person",
    subtype: "person_main",
    color: "#6366f1",
    x: cx, y: cy,
    description: `Cible OSINT Industries — ${foundModules.length} modules trouvés`,
    notes: "",
    metadata: { importedFrom: "OSINT Industries", importDate: new Date().toISOString() },
    comments: [],
  });

  // Filter selected modules
  const selected = foundModules.filter(mod => {
    const name = mod.pretty_name || mod.schemaModule || mod.module;
    return selectedModules.includes(name);
  });

  // 2. Group by type for concentric layout
  const emailModules = [];
  const socialModules = [];

  selected.forEach(mod => {
    const sf = mod.spec_format?.[0] || {};
    if (sf.email?.value) emailModules.push(mod);
    else socialModules.push(mod);
  });

  // 3. Create entities — Social platforms (ring 1)
  const ring1Radius = 300;
  const ring1Step = (Math.PI * 2) / Math.max(socialModules.length, 1);

  socialModules.forEach((mod, i) => {
    const sf = mod.spec_format?.[0] || {};
    const fs = mod.front_schemas?.[0] || {};
    const prettyName = mod.pretty_name || mod.module;
    const subtype = getSubtypeForModule(mod.module) || "social_other";
    const angle = ring1Step * i - Math.PI / 2;

    const name = sf.name?.value || sf.username?.value || prettyName;
    const profileUrl = sf.profile_url?.value || "";
    const bio = sf.bio?.value || "";
    const creationDate = sf.creation_date?.value || fs.timeline?.registered_date || "";
    const location = sf.location?.value || "";
    const pictureUrl = sf.picture_url?.value || fs.image || "";
    const verified = sf.verified?.value || false;

    const entId = oid();
    entities.push({
      id: entId,
      label: `${prettyName}`,
      type: "social",
      subtype: subtype,
      color: "#ec4899",
      x: Math.round(cx + Math.cos(angle) * ring1Radius),
      y: Math.round(cy + Math.sin(angle) * ring1Radius),
      description: [
        profileUrl ? `URL: ${profileUrl}` : "",
        name ? `Nom: ${name}` : "",
        bio ? `Bio: ${bio}` : "",
        verified ? "✓ Vérifié" : "",
      ].filter(Boolean).join("\n"),
      notes: [
        creationDate ? `Créé: ${creationDate}` : "",
        sf.last_seen?.value ? `Vu: ${sf.last_seen.value}` : "",
        sf.id?.value ? `ID: ${sf.id.value}` : "",
      ].filter(Boolean).join("\n"),
      metadata: {
        photo: pictureUrl && !pictureUrl.startsWith("data:") ? pictureUrl : "",
        date: creationDate ? creationDate.split("T")[0] : "",
        importedFrom: "OSINT Industries",
        profileUrl,
      },
      comments: [],
    });

    // Link to target
    links.push({
      id: oid(), from: targetId, to: entId,
      type: "related", label: "compte", color: "#ec4899",
      strength: mod.reliable_source !== false ? "confirmed" : "possible",
      confidence: mod.reliable_source !== false ? 90 : 50,
      date: "", comments: [], bidirectional: false,
    });

    // Create alias entity if name differs significantly from target
    if (name && name.toLowerCase() !== targetName.toLowerCase()) {
      const nameKey = name.toLowerCase();
      if (!nameMap[nameKey]) {
        const aliasId = oid();
        nameMap[nameKey] = aliasId;
        entities.push({
          id: aliasId,
          label: name,
          type: "person",
          subtype: "person_alias",
          color: "#a78bfa",
          x: Math.round(cx + Math.cos(angle) * (ring1Radius + 160)),
          y: Math.round(cy + Math.sin(angle) * (ring1Radius + 160)),
          description: `Alias sur ${prettyName}`,
          notes: "", metadata: { importedFrom: "OSINT Industries" }, comments: [],
        });
      }
      links.push({
        id: oid(), from: entId, to: nameMap[nameKey],
        type: "identity", label: "alias", color: "#a78bfa",
        strength: "probable", confidence: 70,
        date: "", comments: [], bidirectional: false,
      });
    }

    // Create location entity if present
    if (location) {
      const locKey = location.toLowerCase();
      if (!locationMap[locKey]) {
        const locId = oid();
        locationMap[locKey] = locId;
        entities.push({
          id: locId,
          label: location,
          type: "location",
          subtype: "loc_city",
          color: "#10b981",
          x: Math.round(cx + Math.cos(angle + 0.3) * (ring1Radius + 220)),
          y: Math.round(cy + Math.sin(angle + 0.3) * (ring1Radius + 220)),
          description: `Localisation déclarée sur ${prettyName}`,
          notes: "", metadata: { importedFrom: "OSINT Industries" }, comments: [],
        });
      }
      links.push({
        id: oid(), from: entId, to: locationMap[locKey],
        type: "located", label: "localisation", color: "#10b981",
        strength: "possible", confidence: 40,
        date: "", comments: [], bidirectional: false,
      });
    }
  });

  // 4. Create entities — Emails (ring 2)
  const ring2Radius = 200;
  const allEmails = new Set();

  // Collect all emails (from email modules + email hints)
  selected.forEach(mod => {
    const sf = mod.spec_format?.[0] || {};
    if (sf.email?.value) allEmails.add(sf.email.value);
    if (sf.email_hint?.value) allEmails.add(sf.email_hint.value);
  });

  const emailArr = [...allEmails];
  const ring2Step = (Math.PI * 2) / Math.max(emailArr.length, 1);

  emailArr.forEach((email, i) => {
    const angle = ring2Step * i;
    const isHint = email.includes("*");
    const entId = oid();
    emailMap[email.toLowerCase()] = entId;

    entities.push({
      id: entId,
      label: email,
      type: "email",
      subtype: isHint ? "email_alias" : "email_personal",
      color: isHint ? "#f59e0b" : "#f43f5e",
      x: Math.round(cx + Math.cos(angle) * ring2Radius),
      y: Math.round(cy + Math.sin(angle) * ring2Radius),
      description: isHint ? "Email partiel (indice Facebook)" : "Email trouvé via OSINT Industries",
      notes: "", metadata: { importedFrom: "OSINT Industries" }, comments: [],
    });

    links.push({
      id: oid(), from: targetId, to: entId,
      type: "uses", label: isHint ? "email (indice)" : "email", color: "#f43f5e",
      strength: isHint ? "possible" : "confirmed",
      confidence: isHint ? 40 : 90,
      date: "", comments: [], bidirectional: false,
    });

    // Link email to its platform module
    selected.forEach(mod => {
      const sf = mod.spec_format?.[0] || {};
      if (sf.email?.value?.toLowerCase() === email.toLowerCase()) {
        const platEnt = entities.find(e => e.label === (mod.pretty_name || mod.module));
        if (platEnt) {
          links.push({
            id: oid(), from: platEnt.id, to: entId,
            type: "uses", label: "inscrit avec", color: "#f43f5e",
            strength: "confirmed", confidence: 90,
            date: "", comments: [], bidirectional: false,
          });
        }
      }
    });
  });

  return { entities, links };
}
