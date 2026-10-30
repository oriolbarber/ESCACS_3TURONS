/**
 * ESCACS 3 TURONS — magatzem de dades a Google Sheets
 * ----------------------------------------------------
 * 1. Crea un full de càlcul nou a Google Drive (p. ex. "Escacs 3 Turons - dades").
 * 2. Extensions → Apps Script. Esborra el que hi hagi i enganxa aquest fitxer sencer.
 * 3. Canvia el PIN de la línia de sota i desa (icona del disquet).
 * 4. Implementa → Nova implementació → tipus "Aplicació web".
 *      - Executa com a: Jo
 *      - Qui hi té accés: Qualsevol persona
 *    Autoritza els permisos que et demani i copia l'URL que acaba en /exec.
 * Al full apareixeran dues pestanyes: DADES (no la toquis) i SOL·LICITUDS (inscripcions del públic,
 * amb els correus; no es publica mai).
 *
 * 5. Enganxa aquest URL a la web (⋮ → Google Sheets) o passa'l perquè quedi fix al codi.
 *
 * Si després canvies aquest codi o el PIN: Implementa → Gestiona les implementacions →
 * ✎ → Versió: "Nova versió" → Implementa. Així l'URL no canvia.
 */

const PIN = '1234';          // ← canvia'l: és la clau per entrar al mode organització
const FULL = 'DADES';         // pestanya on es guarden les dades (no la toquis a mà)
const TROS = 40000;           // caràcters per cel·la (el límit de Sheets és 50.000)
const SOL = 'SOL·LICITUDS';   // inscripcions del públic (privat: els correus només es veuen amb el PIN)
const MAX_PENDENTS = 300;     // límit de sol·licituds pendents (protecció bàsica contra abusos)

// Lectura pública: qualsevol pot veure els tornejos
function doGet() {
  return sortida(llegir());
}

// Escriptura: només amb el PIN
function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return sortida({ ok: false, error: 'format' }); }
  // Inscripció pública: no cal PIN
  if (req.action === 'request') return sortida(novaSolicitud(req));

  if (String(req.pin) !== String(PIN)) return sortida({ ok: false, error: 'pin' });
  if (req.action === 'check') return sortida({ ok: true });
  if (req.action === 'requests') return sortida({ ok: true, list: llistaSolicituds() });
  if (req.action === 'resolve') return sortida(resolSolicitud(req));

  if (req.action === 'save') {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const actual = llegir();
      // Si algú altre ha desat mentrestant, retornem la versió nova perquè la web la combini
      if (actual.ver !== Number(req.base)) return sortida({ ok: false, conflict: true, ver: actual.ver, data: actual.data });
      const ver = actual.ver + 1;
      escriure(req.data, ver);
      return sortida({ ok: true, ver: ver });
    } finally {
      lock.releaseLock();
    }
  }
  return sortida({ ok: false, error: 'acció' });
}

/* ---------- sol·licituds d'inscripció ---------- */
function fullSol() {
  const ss = SpreadsheetApp.getActive();
  let f = ss.getSheetByName(SOL);
  if (!f) { f = ss.insertSheet(SOL); f.appendRow(['id', 'data', 'nom', 'email', 'torneigId', 'torneig', 'estat', 'jugadorId']); f.setFrozenRows(1); }
  return f;
}
function novaSolicitud(req) {
  if (req.hp) return { ok: true };                                  // camp parany ple: robot, ho ignorem
  const nom = String(req.nom || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const email = String(req.email || '').trim().toLowerCase().slice(0, 120);
  const tid = String(req.tid || '').slice(0, 40);
  const tnom = String(req.tnom || '').slice(0, 120);
  if (nom.length < 3) return { ok: false, error: 'nom' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'email' };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const f = fullSol();
    const files = f.getLastRow() > 1 ? f.getRange(2, 1, f.getLastRow() - 1, 8).getValues() : [];
    const pend = files.filter(r => r[6] === 'pendent');
    if (pend.some(r => String(r[3]) === email && String(r[4]) === tid)) return { ok: true, dup: true };
    if (pend.length >= MAX_PENDENTS) return { ok: false, error: 'ple' };
    f.appendRow([Utilities.getUuid().slice(0, 8), new Date(), "'" + nom, email, tid, "'" + tnom, 'pendent', '']);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function llistaSolicituds() {
  const f = fullSol(); const n = f.getLastRow(); if (n < 2) return [];
  return f.getRange(2, 1, n - 1, 8).getValues()
    .filter(r => r[6] !== 'acceptada')
    .slice(-400)
    .map(r => ({ id: String(r[0]), data: r[1] instanceof Date ? r[1].toISOString() : String(r[1]), nom: String(r[2]), email: String(r[3]), tid: String(r[4]), tnom: String(r[5]), estat: String(r[6]) }));
}
function resolSolicitud(req) {
  const estats = ['acceptada', 'rebutjada', 'pendent'];
  if (estats.indexOf(req.estat) < 0) return { ok: false, error: 'estat' };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const f = fullSol(); const n = f.getLastRow(); if (n < 2) return { ok: false, error: 'id' };
    const ids = f.getRange(2, 1, n - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(req.id)); if (i < 0) return { ok: false, error: 'id' };
    f.getRange(i + 2, 7, 1, 2).setValues([[req.estat, String(req.pid || '')]]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ---------- utilitats ---------- */
function full() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(FULL) || ss.insertSheet(FULL);
}

function llegir() {
  const f = full();
  const ver = Number(f.getRange('B1').getValue()) || 0;
  const n = f.getLastRow();
  if (n < 2) return { ver: ver, data: null };
  const text = f.getRange(2, 1, n - 1, 1).getValues().map(r => String(r[0])).join('');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (err) { data = null; }
  return { ver: ver, data: data };
}

function escriure(data, ver) {
  const f = full();
  const text = JSON.stringify(data);
  const trossos = [];
  // L'apòstrof força text pla (evita que Sheets interpreti "=..." com una fórmula)
  for (let i = 0; i < text.length; i += TROS) trossos.push(["'" + text.slice(i, i + TROS)]);
  f.clear();
  f.getRange('A1:B1').setValues([['versió (no editar)', ver]]);
  if (trossos.length) f.getRange(2, 1, trossos.length, 1).setValues(trossos);
}

function sortida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
