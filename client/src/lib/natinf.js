/**
 * Base NATINF allégée — codes les plus courants en enquête judiciaire.
 * Structure: { code, label, texte, categorie, quantum, famille }
 * famille correspond aux sous-types inf_* dans CATEGORIES.
 */
export const NATINF_DB = [
  // ═══ VOLS / RECELS ═══
  { code: "6402", label: "Vol simple", texte: "Art. 311-3 CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_vol" },
  { code: "6438", label: "Vol avec violences n'ayant pas entraîné d'ITT", texte: "Art. 311-4 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_vol" },
  { code: "6441", label: "Vol avec violences ayant entraîné une ITT ≤ 8 jours", texte: "Art. 311-4 CP", categorie: "délit", quantum: "7 ans, 100 000€", famille: "inf_vol" },
  { code: "6446", label: "Vol avec violences ayant entraîné une ITT > 8 jours", texte: "Art. 311-5 CP", categorie: "délit", quantum: "7 ans, 100 000€", famille: "inf_vol" },
  { code: "6476", label: "Vol en réunion", texte: "Art. 311-4 7° CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_vol" },
  { code: "6462", label: "Vol avec effraction", texte: "Art. 311-5 3° CP", categorie: "délit", quantum: "7 ans, 100 000€", famille: "inf_vol" },
  { code: "6522", label: "Vol à main armée", texte: "Art. 311-8 CP", categorie: "crime", quantum: "20 ans RC", famille: "inf_vol" },
  { code: "6566", label: "Recel de bien provenant d'un délit", texte: "Art. 321-1 CP", categorie: "délit", quantum: "5 ans, 375 000€", famille: "inf_vol" },
  { code: "6574", label: "Recel de bien provenant d'un crime", texte: "Art. 321-1 CP", categorie: "délit", quantum: "5 ans, 375 000€", famille: "inf_vol" },
  { code: "6416", label: "Vol dans un véhicule", texte: "Art. 311-4 8° CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_vol" },
  { code: "6404", label: "Vol à l'étalage", texte: "Art. 311-3 CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_vol" },
  { code: "6420", label: "Vol par ruse", texte: "Art. 311-4 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_vol" },

  // ═══ ESCROQUERIE / ABUS DE CONFIANCE ═══
  { code: "7806", label: "Escroquerie", texte: "Art. 313-1 CP", categorie: "délit", quantum: "5 ans, 375 000€", famille: "inf_escroquerie" },
  { code: "7816", label: "Escroquerie en bande organisée", texte: "Art. 313-2 CP", categorie: "délit", quantum: "10 ans, 1 000 000€", famille: "inf_escroquerie" },
  { code: "7870", label: "Abus de confiance", texte: "Art. 314-1 CP", categorie: "délit", quantum: "3 ans, 375 000€", famille: "inf_escroquerie" },
  { code: "7890", label: "Abus de faiblesse", texte: "Art. 223-15-2 CP", categorie: "délit", quantum: "3 ans, 375 000€", famille: "inf_escroquerie" },
  { code: "7830", label: "Filouterie", texte: "Art. 313-5 CP", categorie: "délit", quantum: "5 ans, 375 000€", famille: "inf_escroquerie" },
  { code: "10980", label: "Fraude informatique (escroquerie par moyen numérique)", texte: "Art. 313-1 CP", categorie: "délit", quantum: "5 ans, 375 000€", famille: "inf_escroquerie" },

  // ═══ STUPÉFIANTS ═══
  { code: "1190", label: "Usage illicite de stupéfiants", texte: "Art. L3421-1 CSP", categorie: "délit", quantum: "1 an, 3 750€", famille: "inf_stupefiants" },
  { code: "1192", label: "Détention de stupéfiants", texte: "Art. 222-37 CP", categorie: "délit", quantum: "10 ans, 7 500 000€", famille: "inf_stupefiants" },
  { code: "1194", label: "Cession ou offre de stupéfiants", texte: "Art. 222-39 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_stupefiants" },
  { code: "1196", label: "Transport de stupéfiants", texte: "Art. 222-36 CP", categorie: "délit", quantum: "10 ans, 7 500 000€", famille: "inf_stupefiants" },
  { code: "1200", label: "Acquisition de stupéfiants", texte: "Art. 222-37 CP", categorie: "délit", quantum: "10 ans, 7 500 000€", famille: "inf_stupefiants" },
  { code: "1198", label: "Importation de stupéfiants", texte: "Art. 222-36 CP", categorie: "crime", quantum: "30 ans RC, 7 500 000€", famille: "inf_stupefiants" },
  { code: "1202", label: "Trafic de stupéfiants en bande organisée", texte: "Art. 222-34 CP", categorie: "crime", quantum: "RC perpétuité", famille: "inf_stupefiants" },
  { code: "1204", label: "Production ou fabrication de stupéfiants", texte: "Art. 222-35 CP", categorie: "crime", quantum: "20 ans RC, 7 500 000€", famille: "inf_stupefiants" },
  { code: "1206", label: "Blanchiment du produit du trafic de stupéfiants", texte: "Art. 222-38 CP", categorie: "délit", quantum: "10 ans, 750 000€", famille: "inf_stupefiants" },

  // ═══ VIOLENCES ═══
  { code: "4502", label: "Violence volontaire sans ITT", texte: "Art. 222-13 CP (R.624-1 CP)", categorie: "contravention", quantum: "750€", famille: "inf_violence" },
  { code: "4504", label: "Violence volontaire ayant entraîné ITT ≤ 8 jours", texte: "Art. 222-13 CP (R.625-1 CP)", categorie: "contravention", quantum: "1 500€", famille: "inf_violence" },
  { code: "4506", label: "Violence volontaire ayant entraîné ITT > 8 jours", texte: "Art. 222-11 CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_violence" },
  { code: "4508", label: "Violence ayant entraîné mutilation ou infirmité permanente", texte: "Art. 222-9 CP", categorie: "délit", quantum: "10 ans, 150 000€", famille: "inf_violence" },
  { code: "4510", label: "Violence ayant entraîné la mort sans intention de la donner", texte: "Art. 222-7 CP", categorie: "crime", quantum: "15 ans RC", famille: "inf_violence" },
  { code: "4520", label: "Violence sur conjoint/concubin ITT ≤ 8 jours", texte: "Art. 222-13 6° CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_violence" },
  { code: "4522", label: "Violence sur conjoint/concubin ITT > 8 jours", texte: "Art. 222-12 6° CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_violence" },
  { code: "4530", label: "Violence sur mineur de 15 ans", texte: "Art. 222-13 1° CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_violence" },
  { code: "4540", label: "Violence avec arme", texte: "Art. 222-13 10° CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_violence" },
  { code: "4550", label: "Violence en réunion", texte: "Art. 222-13 8° CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_violence" },
  { code: "4560", label: "Violence sur personne dépositaire de l'autorité publique", texte: "Art. 222-13 4° CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_violence" },

  // ═══ MENACES / HARCÈLEMENT ═══
  { code: "4702", label: "Menace de mort", texte: "Art. 222-17 CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_menace" },
  { code: "4704", label: "Menace de mort réitérée", texte: "Art. 222-17 al.2 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_menace" },
  { code: "4710", label: "Menace avec ordre de remplir une condition", texte: "Art. 222-18 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_menace" },
  { code: "10760", label: "Harcèlement moral", texte: "Art. 222-33-2 CP", categorie: "délit", quantum: "2 ans, 30 000€", famille: "inf_menace" },
  { code: "10762", label: "Harcèlement sexuel", texte: "Art. 222-33 CP", categorie: "délit", quantum: "2 ans, 30 000€", famille: "inf_menace" },
  { code: "30754", label: "Cyberharcèlement (harcèlement par voie numérique)", texte: "Art. 222-33-2-2 CP", categorie: "délit", quantum: "2 ans, 30 000€", famille: "inf_menace" },
  { code: "30756", label: "Harcèlement de conjoint", texte: "Art. 222-33-2-1 CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_menace" },
  { code: "10730", label: "Appels malveillants réitérés", texte: "Art. 222-16 CP", categorie: "délit", quantum: "1 an, 15 000€", famille: "inf_menace" },

  // ═══ ATTEINTES SEXUELLES ═══
  { code: "5200", label: "Viol", texte: "Art. 222-23 CP", categorie: "crime", quantum: "15 ans RC", famille: "inf_sexuel" },
  { code: "5210", label: "Viol sur mineur de 15 ans", texte: "Art. 222-23-1 CP", categorie: "crime", quantum: "20 ans RC", famille: "inf_sexuel" },
  { code: "5220", label: "Viol en réunion", texte: "Art. 222-24 CP", categorie: "crime", quantum: "20 ans RC", famille: "inf_sexuel" },
  { code: "5300", label: "Agression sexuelle", texte: "Art. 222-27 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_sexuel" },
  { code: "5310", label: "Agression sexuelle sur mineur de 15 ans", texte: "Art. 222-29-1 CP", categorie: "délit", quantum: "10 ans, 150 000€", famille: "inf_sexuel" },
  { code: "5400", label: "Atteinte sexuelle sur mineur", texte: "Art. 227-25 CP", categorie: "délit", quantum: "7 ans, 100 000€", famille: "inf_sexuel" },
  { code: "5410", label: "Corruption de mineur", texte: "Art. 227-22 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_sexuel" },
  { code: "5420", label: "Exhibition sexuelle", texte: "Art. 222-32 CP", categorie: "délit", quantum: "1 an, 15 000€", famille: "inf_sexuel" },
  { code: "27648", label: "Diffusion d'images pédopornographiques", texte: "Art. 227-23 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_sexuel" },
  { code: "33530", label: "Sextorsion / chantage à caractère sexuel", texte: "Art. 312-1 / 222-33 CP", categorie: "délit", quantum: "7 ans", famille: "inf_sexuel" },

  // ═══ HOMICIDES ═══
  { code: "4002", label: "Meurtre", texte: "Art. 221-1 CP", categorie: "crime", quantum: "30 ans RC", famille: "inf_homicide" },
  { code: "4004", label: "Assassinat (meurtre avec préméditation)", texte: "Art. 221-3 CP", categorie: "crime", quantum: "RC perpétuité", famille: "inf_homicide" },
  { code: "4010", label: "Homicide involontaire", texte: "Art. 221-6 CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_homicide" },
  { code: "4006", label: "Empoisonnement", texte: "Art. 221-5 CP", categorie: "crime", quantum: "30 ans RC", famille: "inf_homicide" },
  { code: "4020", label: "Tentative de meurtre", texte: "Art. 221-1 / 121-4 CP", categorie: "crime", quantum: "30 ans RC", famille: "inf_homicide" },

  // ═══ CYBERCRIMINALITÉ ═══
  { code: "10800", label: "Accès frauduleux à un STAD", texte: "Art. 323-1 CP", categorie: "délit", quantum: "3 ans, 100 000€", famille: "inf_cyber" },
  { code: "10802", label: "Maintien frauduleux dans un STAD", texte: "Art. 323-1 CP", categorie: "délit", quantum: "3 ans, 100 000€", famille: "inf_cyber" },
  { code: "10804", label: "Atteinte au fonctionnement d'un STAD", texte: "Art. 323-2 CP", categorie: "délit", quantum: "5 ans, 150 000€", famille: "inf_cyber" },
  { code: "10806", label: "Introduction/modification/suppression de données dans un STAD", texte: "Art. 323-3 CP", categorie: "délit", quantum: "5 ans, 150 000€", famille: "inf_cyber" },
  { code: "10808", label: "Détention/diffusion de programme malveillant", texte: "Art. 323-3-1 CP", categorie: "délit", quantum: "3 ans, 100 000€", famille: "inf_cyber" },
  { code: "30760", label: "Usurpation d'identité en ligne", texte: "Art. 226-4-1 CP", categorie: "délit", quantum: "1 an, 15 000€", famille: "inf_cyber" },
  { code: "28900", label: "Atteinte au secret des correspondances électroniques", texte: "Art. 226-15 CP", categorie: "délit", quantum: "1 an, 45 000€", famille: "inf_cyber" },
  { code: "32500", label: "Collecte frauduleuse de données personnelles", texte: "Art. 226-18 CP", categorie: "délit", quantum: "5 ans, 300 000€", famille: "inf_cyber" },
  { code: "33000", label: "Ransomware / extorsion numérique", texte: "Art. 312-1 + 323-1 CP", categorie: "délit", quantum: "7 ans", famille: "inf_cyber" },
  { code: "33100", label: "Phishing / hameçonnage", texte: "Art. 313-1 / 226-4-1 CP", categorie: "délit", quantum: "5 ans, 375 000€", famille: "inf_cyber" },

  // ═══ FAUX ET USAGE DE FAUX ═══
  { code: "8100", label: "Faux en écriture", texte: "Art. 441-1 CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_faux" },
  { code: "8102", label: "Usage de faux", texte: "Art. 441-1 CP", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_faux" },
  { code: "8110", label: "Faux document administratif", texte: "Art. 441-2 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_faux" },
  { code: "8120", label: "Faux en écriture publique", texte: "Art. 441-4 CP", categorie: "délit", quantum: "10 ans, 150 000€", famille: "inf_faux" },
  { code: "8150", label: "Usurpation d'identité", texte: "Art. 434-23 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_faux" },
  { code: "8160", label: "Fourniture de fausse identité", texte: "Art. 434-23 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_faux" },

  // ═══ ASSOCIATION DE MALFAITEURS ═══
  { code: "9100", label: "Association de malfaiteurs (délictuelle)", texte: "Art. 450-1 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_ame" },
  { code: "9102", label: "Association de malfaiteurs (criminelle)", texte: "Art. 450-1 CP", categorie: "délit", quantum: "10 ans, 150 000€", famille: "inf_ame" },
  { code: "9110", label: "Direction d'association de malfaiteurs", texte: "Art. 450-1 CP", categorie: "délit", quantum: "10 ans, 150 000€", famille: "inf_ame" },

  // ═══ BLANCHIMENT ═══
  { code: "9200", label: "Blanchiment simple", texte: "Art. 324-1 CP", categorie: "délit", quantum: "5 ans, 375 000€", famille: "inf_blanchiment" },
  { code: "9202", label: "Blanchiment aggravé (habitude/bande organisée)", texte: "Art. 324-2 CP", categorie: "délit", quantum: "10 ans, 750 000€", famille: "inf_blanchiment" },
  { code: "9210", label: "Non-justification de ressources", texte: "Art. 321-6 CP", categorie: "délit", quantum: "3 ans, 75 000€", famille: "inf_blanchiment" },

  // ═══ INFRACTIONS ROUTIÈRES ═══
  { code: "14002", label: "Conduite en état alcoolique (≥0.8g/l)", texte: "Art. L234-1 CR", categorie: "délit", quantum: "2 ans, 4 500€", famille: "inf_routier" },
  { code: "14004", label: "Conduite sous l'emprise de stupéfiants", texte: "Art. L235-1 CR", categorie: "délit", quantum: "2 ans, 4 500€", famille: "inf_routier" },
  { code: "14010", label: "Défaut de permis de conduire", texte: "Art. L221-2 CR", categorie: "délit", quantum: "1 an, 15 000€", famille: "inf_routier" },
  { code: "14020", label: "Refus d'obtempérer", texte: "Art. L233-1 CR", categorie: "délit", quantum: "2 ans, 15 000€", famille: "inf_routier" },
  { code: "14022", label: "Refus d'obtempérer avec mise en danger", texte: "Art. L233-1-1 CR", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_routier" },
  { code: "14030", label: "Délit de fuite", texte: "Art. 434-10 CP", categorie: "délit", quantum: "3 ans, 75 000€", famille: "inf_routier" },
  { code: "14040", label: "Récidive de CEA", texte: "Art. L234-1 CR", categorie: "délit", quantum: "4 ans, 9 000€", famille: "inf_routier" },
  { code: "14050", label: "Grand excès de vitesse (≥50 km/h)", texte: "Art. L413-1 CR", categorie: "délit", quantum: "3 mois, 3 750€", famille: "inf_routier" },

  // ═══ DÉGRADATION / DESTRUCTION ═══
  { code: "7002", label: "Destruction/dégradation de bien d'autrui", texte: "Art. 322-1 CP", categorie: "délit", quantum: "2 ans, 30 000€", famille: "inf_degradation" },
  { code: "7010", label: "Destruction par incendie", texte: "Art. 322-5 CP", categorie: "délit", quantum: "10 ans, 150 000€", famille: "inf_degradation" },
  { code: "7020", label: "Dégradation de véhicule", texte: "Art. 322-1 CP", categorie: "délit", quantum: "2 ans, 30 000€", famille: "inf_degradation" },
  { code: "7030", label: "Tag / graffiti", texte: "Art. 322-1 CP", categorie: "contravention", quantum: "3 750€", famille: "inf_degradation" },

  // ═══ TRAVAIL ILLÉGAL / TEF ═══
  { code: "11002", label: "Travail dissimulé", texte: "Art. L8221-5 CT", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_tef" },
  { code: "11010", label: "Emploi d'étranger sans titre", texte: "Art. L8256-2 CT", categorie: "délit", quantum: "5 ans, 15 000€ par travailleur", famille: "inf_tef" },
  { code: "11100", label: "Traite des êtres humains", texte: "Art. 225-4-1 CP", categorie: "délit", quantum: "7 ans, 150 000€", famille: "inf_tef" },
  { code: "11110", label: "Traite des êtres humains aggravée (mineur)", texte: "Art. 225-4-2 CP", categorie: "crime", quantum: "10 ans, 1 500 000€", famille: "inf_tef" },

  // ═══ INFRACTIONS ARMES ═══
  { code: "12002", label: "Détention d'arme de catégorie A/B sans autorisation", texte: "Art. L317-4 CSI", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_arme" },
  { code: "12010", label: "Port d'arme de catégorie D", texte: "Art. R317-1 CSI", categorie: "contravention", quantum: "750€", famille: "inf_arme" },
  { code: "12020", label: "Port d'arme prohibée", texte: "Art. L317-6 CSI", categorie: "délit", quantum: "3 ans, 45 000€", famille: "inf_arme" },
  { code: "12030", label: "Acquisition illicite d'arme", texte: "Art. L317-4 CSI", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_arme" },
  { code: "12040", label: "Fabrication/modification illicite d'arme", texte: "Art. L317-4 CSI", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_arme" },

  // ═══ TERRORISME ═══
  { code: "20002", label: "Association de malfaiteurs terroriste criminelle", texte: "Art. 421-2-1 CP", categorie: "crime", quantum: "20 ans RC", famille: "inf_terrorisme" },
  { code: "20004", label: "Association de malfaiteurs terroriste délictuelle", texte: "Art. 421-2-1 CP", categorie: "délit", quantum: "10 ans, 225 000€", famille: "inf_terrorisme" },
  { code: "20010", label: "Apologie du terrorisme", texte: "Art. 421-2-5 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_terrorisme" },
  { code: "20020", label: "Financement du terrorisme", texte: "Art. 421-2-2 CP", categorie: "délit", quantum: "10 ans, 225 000€", famille: "inf_terrorisme" },

  // ═══ ATTEINTES AUX BIENS ═══
  { code: "7502", label: "Extorsion", texte: "Art. 312-1 CP", categorie: "délit", quantum: "7 ans, 100 000€", famille: "inf_atteinte_biens" },
  { code: "7510", label: "Chantage", texte: "Art. 312-10 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_atteinte_biens" },

  // ═══ INFRACTIONS FAMILIALES ═══
  { code: "15002", label: "Non-représentation d'enfant", texte: "Art. 227-5 CP", categorie: "délit", quantum: "1 an, 15 000€", famille: "inf_famille" },
  { code: "15010", label: "Abandon de famille", texte: "Art. 227-3 CP", categorie: "délit", quantum: "2 ans, 15 000€", famille: "inf_famille" },
  { code: "15020", label: "Violation d'ordonnance de protection", texte: "Art. 227-4-2 CP", categorie: "délit", quantum: "2 ans, 15 000€", famille: "inf_famille" },
  { code: "15030", label: "Soustraction de mineur", texte: "Art. 227-7 CP", categorie: "délit", quantum: "1 an, 15 000€", famille: "inf_famille" },

  // ═══ ENVIRONNEMENT ═══
  { code: "16002", label: "Dépôt illicite de déchets", texte: "Art. L541-46 CE", categorie: "délit", quantum: "2 ans, 75 000€", famille: "inf_environnement" },
  { code: "16010", label: "Actes de cruauté envers un animal", texte: "Art. 521-1 CP", categorie: "délit", quantum: "5 ans, 75 000€", famille: "inf_environnement" },
  { code: "16020", label: "Pollution des eaux", texte: "Art. L216-6 CE", categorie: "délit", quantum: "2 ans, 75 000€", famille: "inf_environnement" },
];

/**
 * Search NATINF database by code, label or famille.
 * @param {string} query - search term
 * @param {string} [famille] - filter by famille (inf_vol, inf_stupefiants, etc.)
 * @param {number} [limit=15] - max results
 * @returns {Array} matching NATINF entries
 */
export function searchNATINF(query, famille, limit = 15) {
  const q = (query || '').toLowerCase().trim();
  let results = NATINF_DB;
  if (famille) results = results.filter(n => n.famille === famille);
  if (q) results = results.filter(n =>
    n.code.includes(q) ||
    n.label.toLowerCase().includes(q) ||
    n.texte.toLowerCase().includes(q) ||
    n.categorie.includes(q)
  );
  return results.slice(0, limit);
}
