import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { getLocale } from "../i18n";
import { getStrengthFromConfidence } from './constants.jsx';
import { traduireConstantes } from './constantesTraduites.js';

/**
 * Rapport PDF d'une enquête.
 *
 * Extrait du monolithe : 300 lignes de mise en page qui ne partagent aucun état
 * avec le graphe, et qui y étaient indémêlables du reste. Ici, la fonction ne
 * reçoit que des données et un élément DOM à photographier - elle est lisible
 * seule, et modifiable sans toucher au canvas.
 *
 * @param {object}      p
 * @param {Array}       p.entities
 * @param {Array}       p.links
 * @param {Array}       p.stickers
 * @param {Array}       p.timeline
 * @param {object}      p.caseInfo   titre et description de l'enquête
 * @param {HTMLElement} p.canvasEl   conteneur du graphe, pour la capture d'écran
 * @param {object}      p.theme      palette courante (jetons de couleur)
 */
/**
 * @param tr fonction de traduction, fournie par l'appelant : ce module n'est
 *           pas un composant et ne peut pas lire le contexte React. Le repli
 *           rend la clé, visible donc corrigeable.
 */
export async function exporterPdf({ entities = [], links = [], stickers = [], timeline = [], caseInfo = {}, canvasEl = null, theme = {}, tr = (k) => k }) {
  const t = theme;
  // Le catalogue est de la donnée en français : sans cette vue traduite, un
  // rapport exporté depuis l'interface anglaise ou allemande affichait encore
  // « Téléphone » et « Propriétaire de » dans ses tableaux.
  const { CATEGORIES, ALL_ITEMS, LINK_TYPES } = traduireConstantes(tr);
  const pdf = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const W=210, H=297, M=15, CW=W-2*M; // A4 dims + margins
  const now=new Date();
  const fmtD=d=>d?new Date(d).toLocaleDateString(getLocale(),{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"-";
  let y=0;

  // HELPERS
  const addPage=()=>{pdf.addPage();y=M;};
  const checkPage=(need)=>{if(y+need>H-M)addPage();};
  const setC=(hex)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);pdf.setTextColor(r,g,b);return[r,g,b];};
  const setF=(hex)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);pdf.setFillColor(r,g,b);};
  const gray=(v)=>pdf.setTextColor(v,v,v);
  const black=()=>pdf.setTextColor(30,30,30);
  const muted=()=>pdf.setTextColor(120,120,130);
  /**
   * Les polices standard de jsPDF sont encodées en **WinAnsi**. Un caractère
   * hors de ce jeu - un emoji - ressort en charabia (👤 devenait « Ø=Üd »),
   * sans erreur ni avertissement.
   *
   * On les retire donc au dernier moment, en enveloppant `pdf.text` : c'est
   * le SEUL point de passage, il couvre les quarante appels existants comme
   * ceux à venir, et surtout le texte saisi par l'enquêteur - un emoji dans
   * le nom d'une entité produisait exactement le même charabia.
   *
   * Le jeu conservé n'est PAS Latin-1 : WinAnsi lui ajoute une vingtaine de
   * signes typographiques entre 0x80 et 0x9F. Filtrer sur Latin-1 seul mangeait
   * le tiret cadratin, les apostrophes et guillemets typographiques, les points
   * de suspension et le symbole euro - dont le pied de page de cet export même
   * fait usage.
   */
  const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•--˜™š›œžŸ';
  const HORS_WINANSI = new RegExp(`[^\\n\\x20-\\xFF${WINANSI_EXTRA}]`, 'g');
  const sansHorsLatin1 = (v) => typeof v === 'string'
    ? v.replace(HORS_WINANSI, '').replace(/[^\S\n]{2,}/g, ' ').trim()
    : v;
  const ecrireTexte = pdf.text.bind(pdf);
  pdf.text = (txt, ...reste) => ecrireTexte(Array.isArray(txt) ? txt.map(sansHorsLatin1) : sansHorsLatin1(txt), ...reste);

  // Même nettoyage avant la découpe : `splitTextToSize` mesure la largeur, et
  // mesurer une chaîne qui ne sera pas celle imprimée fausse les retours.
  const wrapText=(text,maxW,fontSize)=>{pdf.setFontSize(fontSize);return pdf.splitTextToSize(sansHorsLatin1(text||""),maxW);};
  // Footer on every page
  const addFooter=(pageNum)=>{pdf.setFontSize(7);muted();pdf.text(`OSINTMapper v0.1 - ${caseInfo.title||"Export"} - ${fmtD(now)}`,M,H-8);pdf.text(`${pageNum}`,W-M,H-8,{align:"right"});};

  // ═══ PAGE 1: COVER + GRAPH CAPTURE ═══
  // Background
  pdf.setFillColor(13,17,23);pdf.rect(0,0,W,H,"F");

  // Title block
  pdf.setFontSize(28);pdf.setTextColor(88,166,255);
  pdf.text("OSINT",W/2-25,40);pdf.setTextColor(226,228,237);pdf.text("Mapper",W/2+8,40);
  pdf.setFontSize(10);pdf.setTextColor(120,130,150);
  pdf.text(tr("pdf.titre"),W/2,50,{align:"center"});

  // Case info
  pdf.setFontSize(18);pdf.setTextColor(226,228,237);
  pdf.text(caseInfo.title||"Sans titre",W/2,70,{align:"center"});
  if(caseInfo.description){pdf.setFontSize(10);pdf.setTextColor(140,150,168);const descLines=wrapText(caseInfo.description,CW,10);pdf.text(descLines,W/2,80,{align:"center"});}
  
  pdf.setFontSize(9);pdf.setTextColor(100,110,130);
  pdf.text(`Date: ${fmtD(now)}`,W/2,95,{align:"center"});
  pdf.text(`${entities.length} entites  |  ${links.length} liens  |  ${stickers.length} stickers`,W/2,101,{align:"center"});

  // Graph capture
  try{
    const svgEl=canvasEl?.querySelector("svg");
    if(svgEl){
      const canvas=await html2canvas(canvasEl,{backgroundColor:"#0d1117",scale:1.5,useCORS:true,logging:false});
      const imgData=canvas.toDataURL("image/jpeg",0.85);
      const imgW=CW, imgH=Math.min((canvas.height/canvas.width)*imgW, 150);
      pdf.addImage(imgData,"JPEG",M,110,imgW,imgH);
    }
  }catch(e){console.warn("Graph capture failed:",e);}

  addFooter(1);
  let pageNum=1;

  // ═══ PAGE 2: RESUME GLOBAL ═══
  addPage(); pageNum++;
  // Header bar
  pdf.setFillColor(88,166,255);pdf.rect(M,y,CW,8,"F");
  pdf.setFontSize(12);pdf.setTextColor(255,255,255);pdf.text(tr("pdf.resumeGlobal"),M+3,y+6);y+=14;

  // Stats par categorie
  const catStats={};
  entities.forEach(e=>{const cat=CATEGORIES.find(c=>c.id===e.type);const label=cat?.label||e.type;catStats[label]=(catStats[label]||0)+1;});
  
  pdf.setFontSize(10);black();pdf.setFont(undefined,"bold");pdf.text(tr("pdf.entitesParCategorie"),M,y);y+=6;
  pdf.setFont(undefined,"normal");pdf.setFontSize(9);
  Object.entries(catStats).sort((a,b)=>b[1]-a[1]).forEach(([cat,n])=>{
    checkPage(5);
    const cat2=CATEGORIES.find(c=>c.label===cat);
    if(cat2){setF(cat2.color);pdf.rect(M,y-3,3,3,"F");}
    black();pdf.text(`${cat} : ${n}`,M+6,y);y+=5;
  });
  y+=6;

  // Link type stats
  const linkStats={};
  links.forEach(l=>{const lt=LINK_TYPES.find(t=>t.id===l.type)||LINK_TYPES[0];linkStats[lt.label]=(linkStats[lt.label]||0)+1;});
  checkPage(10);
  pdf.setFontSize(10);pdf.setFont(undefined,"bold");black();pdf.text(tr("pdf.liensParType"),M,y);y+=6;
  pdf.setFont(undefined,"normal");pdf.setFontSize(9);
  Object.entries(linkStats).sort((a,b)=>b[1]-a[1]).forEach(([type,n])=>{
    checkPage(5);black();pdf.text(`${type} : ${n}`,M+6,y);y+=5;
  });
  y+=6;

  // Confidence distribution
  const confBuckets={"90-100%":0,"70-89%":0,"40-69%":0,"< 40%":0};
  links.forEach(l=>{const c=l.confidence||0;if(c>=90)confBuckets["90-100%"]++;else if(c>=70)confBuckets["70-89%"]++;else if(c>=40)confBuckets["40-69%"]++;else confBuckets["< 40%"]++;});
  checkPage(10);
  pdf.setFontSize(10);pdf.setFont(undefined,"bold");black();pdf.text(tr("pdf.distributionConfiance"),M,y);y+=6;
  pdf.setFont(undefined,"normal");pdf.setFontSize(9);
  const confColors={"90-100%":t.success,"70-89%":"#3b82f6","40-69%":t.warning,"< 40%":t.danger};
  Object.entries(confBuckets).forEach(([range,n])=>{
    checkPage(5);setF(confColors[range]);pdf.rect(M,y-3,3,3,"F");black();pdf.text(`${range} : ${n} lien${n>1?"s":""}`,M+6,y);y+=5;
  });

  // Compact entity table
  y+=8;checkPage(20);
  pdf.setFontSize(10);pdf.setFont(undefined,"bold");black();pdf.text("Synthese des entites",M,y);y+=6;
  // Table header
  pdf.setFillColor(30,40,55);pdf.rect(M,y-4,CW,6,"F");
  pdf.setFontSize(7);pdf.setTextColor(200,210,230);pdf.setFont(undefined,"bold");
  pdf.text(tr("pdf.colType"),M+2,y);pdf.text(tr("pdf.colLabel"),M+30,y);pdf.text(tr("pdf.colDescription"),M+85,y);pdf.text(tr("pdf.liens"),M+150,y);pdf.text(tr("pdf.colAuteur"),M+163,y);y+=4;

  pdf.setFont(undefined,"normal");
  entities.forEach((ent,i)=>{
    checkPage(6);
    if(i%2===0){pdf.setFillColor(22,27,34);pdf.rect(M,y-3.5,CW,5,"F");}
    const cat=CATEGORIES.find(c=>c.id===ent.type);
    const info=ALL_ITEMS[ent.subtype]||{};
    const lc=links.filter(l=>l.from===ent.id||l.to===ent.id).length;
    pdf.setFontSize(7);
    muted();pdf.text((cat?.label||ent.type).slice(0,12),M+2,y);
    black();pdf.text((ent.label||"-").slice(0,28),M+30,y);
    muted();pdf.text((ent.description||info.desc||"-").slice(0,35),M+85,y);
    black();pdf.text(String(lc),M+153,y);
    muted();pdf.text((ent.author||"-").slice(0,12),M+163,y);
    y+=5;
  });
  addFooter(pageNum);

  // ═══ FICHES DETAILLEES PAR ENTITE ═══
  entities.forEach(ent=>{
    addPage();pageNum++;
    const cat=CATEGORIES.find(c=>c.id===ent.type);
    const info=ALL_ITEMS[ent.subtype]||{label:ent.label,desc:"",color:ent.color};
    const eColor=ent.color||info.color||"#6366f1";
    const inLinks=links.filter(l=>l.to===ent.id);
    const outLinks=links.filter(l=>l.from===ent.id);

    // Entity header bar
    const [cr,cg,cb]=setC(eColor);pdf.setFillColor(cr,cg,cb);pdf.rect(M,y,CW,10,"F");
    pdf.setFontSize(13);pdf.setTextColor(255,255,255);pdf.setFont(undefined,"bold");
    pdf.text(`${ent.label}`,M+3,y+7);
    pdf.setFontSize(8);pdf.text((cat?.label||ent.type)+" / "+(info.label||ent.subtype),M+CW-2,y+7,{align:"right"});
    y+=14;

    // Status + meta row
    pdf.setFontSize(9);pdf.setFont(undefined,"normal");
    const st=ent.metadata?.status||"unverified";
    const stLabel={confirmed:tr("pdf.confirme"),unverified:tr("pdf.aVerifier"),denied:tr("pdf.infirme"),archived:tr("pdf.archive")}[st]||st;
    muted();pdf.text("Statut:",M,y);black();pdf.text(stLabel,M+20,y);
    muted();pdf.text(tr("pdf.auteur"),M+55,y);black();pdf.text(ent.author||"-",M+75,y);
    muted();pdf.text(tr("pdf.creeLe"),M+110,y);black();pdf.text(fmtD(ent.createdAt),M+130,y);
    y+=7;

    // Description
    if(ent.description){
      checkPage(12);
      pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();pdf.text(tr("pdf.description"),M,y);y+=5;
      pdf.setFont(undefined,"normal");pdf.setFontSize(8.5);
      const dl=wrapText(ent.description,CW-4,8.5);
      dl.forEach(line=>{checkPage(4);gray(60);pdf.text(line,M+2,y);y+=4;});
      y+=3;
    }

    // Notes
    if(ent.notes){
      checkPage(12);
      pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();pdf.text(tr("pdf.notes"),M,y);y+=5;
      pdf.setFont(undefined,"normal");pdf.setFontSize(8.5);
      const nl=wrapText(ent.notes,CW-4,8.5);
      nl.forEach(line=>{checkPage(4);gray(60);pdf.text(line,M+2,y);y+=4;});
      y+=3;
    }

    // Metadata
    const meta=ent.metadata||{};
    const metaEntries=Object.entries(meta).filter(([k,v])=>v&&!["status","photo"].includes(k));
    if(metaEntries.length>0){
      checkPage(10);
      pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();pdf.text(tr("pdf.metadonnees"),M,y);y+=5;
      pdf.setFont(undefined,"normal");pdf.setFontSize(8);
      metaEntries.forEach(([k,v])=>{
        checkPage(5);
        muted();pdf.text(k+":",M+2,y);black();pdf.text(String(v).slice(0,60),M+30,y);y+=4.5;
      });
      y+=3;
    }

    // Incoming links
    if(inLinks.length>0){
      checkPage(10);
      pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();
      pdf.text(`Liens entrants (${inLinks.length})`,M,y);y+=5;
      pdf.setFont(undefined,"normal");pdf.setFontSize(8);
      inLinks.forEach(lk=>{
        checkPage(5);
        const fromEnt=entities.find(e=>e.id===lk.from);
        const lt=LINK_TYPES.find(t=>t.id===lk.type)||LINK_TYPES[0];
        const conf=lk.confidence||0;
        const confCol=t[getStrengthFromConfidence(conf).tone]; // mêmes paliers que le graphe
        setF(confCol);pdf.rect(M+2,y-2.5,2,2,"F");
        black();pdf.text(`${fromEnt?.label||"?"} → ${lt.label} → ${ent.label}`,M+6,y);
        muted();pdf.text(`${conf}%`,M+CW-10,y);
        if(lk.label){pdf.text(`(${lk.label})`,M+CW-30,y);}
        y+=4.5;
      });
      y+=3;
    }

    // Outgoing links
    if(outLinks.length>0){
      checkPage(10);
      pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();
      pdf.text(`Liens sortants (${outLinks.length})`,M,y);y+=5;
      pdf.setFont(undefined,"normal");pdf.setFontSize(8);
      outLinks.forEach(lk=>{
        checkPage(5);
        const toEnt=entities.find(e=>e.id===lk.to);
        const lt=LINK_TYPES.find(t=>t.id===lk.type)||LINK_TYPES[0];
        const conf=lk.confidence||0;
        const confCol=t[getStrengthFromConfidence(conf).tone]; // mêmes paliers que le graphe
        setF(confCol);pdf.rect(M+2,y-2.5,2,2,"F");
        black();pdf.text(`${ent.label} → ${lt.label} → ${toEnt?.label||"?"}`,M+6,y);
        muted();pdf.text(`${conf}%`,M+CW-10,y);
        y+=4.5;
      });
      y+=3;
    }

    // Comments
    if(ent.comments?.length>0){
      checkPage(10);
      pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();
      pdf.text(`Commentaires (${ent.comments.length})`,M,y);y+=5;
      pdf.setFont(undefined,"normal");pdf.setFontSize(8);
      ent.comments.forEach(c=>{
        checkPage(8);
        muted();pdf.text(`${c.author||"?"} - ${fmtD(c.date)}`,M+2,y);y+=4;
        black();const cl=wrapText(c.text,CW-8,8);
        cl.forEach(line=>{checkPage(4);pdf.text(line,M+4,y);y+=3.5;});
        y+=3;
      });
    }

    addFooter(pageNum);
  });

  // ═══ TABLEAU RECAPITULATIF DES LIENS ═══
  if(links.length>0){
    addPage();pageNum++;
    pdf.setFillColor(88,166,255);pdf.rect(M,y,CW,8,"F");
    pdf.setFontSize(12);pdf.setTextColor(255,255,255);pdf.setFont(undefined,"bold");
    pdf.text(`TABLEAU DES LIENS (${links.length})`,M+3,y+6);y+=14;

    // Table header
    pdf.setFillColor(30,40,55);pdf.rect(M,y-4,CW,6,"F");
    pdf.setFontSize(7);pdf.setTextColor(200,210,230);pdf.setFont(undefined,"bold");
    pdf.text(tr("pdf.colDe"),M+2,y);pdf.text(tr("pdf.colType"),M+50,y);pdf.text(tr("pdf.colVers"),M+90,y);pdf.text(tr("pdf.colConf"),M+140,y);pdf.text(tr("pdf.colLabel"),M+155,y);y+=4;

    pdf.setFont(undefined,"normal");
    links.forEach((lk,i)=>{
      checkPage(6);
      if(i%2===0){pdf.setFillColor(22,27,34);pdf.rect(M,y-3.5,CW,5,"F");}
      const fromEnt=entities.find(e=>e.id===lk.from);
      const toEnt=entities.find(e=>e.id===lk.to);
      const lt=LINK_TYPES.find(t=>t.id===lk.type)||LINK_TYPES[0];
      const conf=lk.confidence||0;
      const confCol=t[getStrengthFromConfidence(conf).tone]; // mêmes paliers que le graphe
      
      pdf.setFontSize(7);
      black();pdf.text((fromEnt?.label||"?").slice(0,25),M+2,y);
      muted();pdf.text((lt.icon+" "+lt.label).slice(0,20),M+50,y);
      black();pdf.text((toEnt?.label||"?").slice(0,25),M+90,y);
      setC(confCol);pdf.text(`${conf}%`,M+143,y);
      muted();pdf.text((lk.label||"").slice(0,15),M+155,y);
      y+=5;
    });
    addFooter(pageNum);
  }

  // ═══ TIMELINE ═══
  if(timeline.length>0){
    addPage();pageNum++;
    pdf.setFillColor(88,166,255);pdf.rect(M,y,CW,8,"F");
    pdf.setFontSize(12);pdf.setTextColor(255,255,255);pdf.setFont(undefined,"bold");
    pdf.text(`TIMELINE (${Math.min(timeline.length,80)} derniers evenements)`,M+3,y+6);y+=14;

    pdf.setFont(undefined,"normal");
    timeline.slice(0,80).forEach((ev,i)=>{
      checkPage(6);
      if(i%2===0){pdf.setFillColor(22,27,34);pdf.rect(M,y-3.5,CW,5,"F");}
      pdf.setFontSize(7);
      muted();pdf.text(fmtD(ev.timestamp),M+2,y);
      black();pdf.text((ev.action||"-").slice(0,60),M+40,y);
      muted();pdf.text((ev.user||"-").slice(0,15),M+CW-20,y);
      y+=5;
    });
    addFooter(pageNum);
  }

  // Save
  pdf.save(`${(caseInfo.title||"OSINTMapper").replace(/[^a-zA-Z0-9]/g,"_")}_${now.toISOString().slice(0,10)}.pdf`);
}
