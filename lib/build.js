// lib/build.js
import { XMLParser } from 'fast-xml-parser';

export const FEEDS = {
  "Andalucía": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC61_RSS.xml",
  "Aragón": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC62_RSS.xml",
  "Asturias": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC63_RSS.xml",
  "Illes Balears": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC64_RSS.xml",
  "Canarias": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC65_RSS.xml",
  "Cantabria": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC66_RSS.xml",
  "Castilla y León": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC67_RSS.xml",
  "Castilla - La Mancha": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC68_RSS.xml",
  "Cataluña": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC69_RSS.xml",
  "Extremadura": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC70_RSS.xml",
  "Galicia": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC71_RSS.xml",
  "Madrid": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC72_RSS.xml",
  "Murcia": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC73_RSS.xml",
  "Navarra": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC74_RSS.xml",
  "País Vasco": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC75_RSS.xml",
  "La Rioja": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC76_RSS.xml",
  "Comunitat Valenciana": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC77_RSS.xml",
  "Ceuta": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC78_RSS.xml",
  "Melilla": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC79_RSS.xml"
};

const TZ = 'Europe/Madrid';
const compressedRe = /\.(zip|rar|7z|gz|tgz|tar)(\?.*)?$/i;
const estadoCompletoRe = /estado\s+completo\s+de\s+avisos/i;
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", trimValues: true });

export function todayKey() {
  const now = new Date();
  const y = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric' }).format(now);
  const m = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month:'2-digit' }).format(now);
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, day:'2-digit' }).format(now);
  return `aemet:${y}-${m}-${d}`;
}

export async function buildPayload() {
  const all = [];
  await Promise.all(Object.entries(FEEDS).map(async ([region, url]) => {
    try {
      const rssText = await (await fetch(url, { headers: { "Accept": "application/rss+xml" } })).text();
      const rssObj = parser.parse(rssText);
      const items = findRssItems(rssObj).map(it => ({
        region,
        title: it.title || "",
        link: it.link || "",
        pubDate: it.pubDate || it.pubdate || "",
        description: (it.description || "").trim()
      }))
      .filter(it => isTodayES(it.pubDate))
      .filter(it => !mustExclude(it.title, it.link));

      // enriquecer con XML destino (description + instruction)
      const enriched = await Promise.all(items.map(async it => {
        let enrichedDesc = it.description;
        try {
          if (it.link && !compressedRe.test(it.link)) {
            const xmlText = await (await fetch(it.link)).text();
            const xobj = parser.parse(xmlText);
            const desc = deepPick(xobj, ["description","descripcion","resumen","detalle","texto"]);
            const instr = deepPick(xobj, ["instruction","instrucciones","recomendaciones","precauciones","medidas"]);
            const full = [desc, instr].filter(Boolean).join(" — ");
            if (full) enrichedDesc = full;
          }
        } catch {}
        return { ...it, sev: sevInfo(it.title), enrichedDesc };
      }));

      all.push(...enriched);
    } catch {}
  }));

  all.sort((a,b) => (b.sev.weight - a.sev.weight) || (new Date(b.pubDate) - new Date(a.pubDate)));

  return {
    lastUpdate: new Date().toISOString(),
    items: all
  };
}

function isTodayES(pubDateStr) {
  if (!pubDateStr) return false;
  const d = new Date(pubDateStr);
  const fmt = (date) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
  return fmt(d) === fmt(new Date());
}
function mustExclude(title="", link="") {
  const t = (title||"").trim();
  const l = (link||"").trim();
  if (compressedRe.test(l)) return true; // .tgz/.gz/...
  if (/^aviso$/i.test(t) && compressedRe.test(l)) return true;
  if (estadoCompletoRe.test(t)) return true;
  return false;
}
function sevInfo(title="") {
  const t = (title||"").toLowerCase();
  if (t.includes("rojo"))    return { label:"Rojo",    color:"#dc2626", key:"red",    weight:3 };
  if (t.includes("naranja")) return { label:"Naranja", color:"#f59e0b", key:"orange", weight:2 };
  if (t.includes("amarillo"))return { label:"Amarillo",color:"#eab308", key:"yellow", weight:1 };
  return { label:"Aviso", color:"#6b7280", key:"none", weight:0 };
}
// encuentra items en rss/atom de forma robusta
function findRssItems(obj) {
  if (obj?.rss?.channel?.item) return Array.isArray(obj.rss.channel.item) ? obj.rss.channel.item : [obj.rss.channel.item];
  if (obj?.feed?.entry) return Array.isArray(obj.feed.entry) ? obj.feed.entry : [obj.feed.entry];
  const out = [];
  (function walk(o){
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (o.title && (o.link || o.pubDate || o.description)) out.push(o);
    Object.values(o).forEach(walk);
  })(obj);
  return out;
}
function deepPick(obj, keys) {
  let found = "";
  (function walk(o){
    if (found || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    for (const k of keys) {
      if (typeof o[k] === 'string' && o[k].trim()) { found = o[k].trim(); return; }
    }
    Object.values(o).forEach(walk);
  })(obj);
  return found;
}
