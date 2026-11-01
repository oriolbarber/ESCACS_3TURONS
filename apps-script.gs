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
 * Al full apareixeran tres pestanyes: DADES (no la toquis), SOL·LICITUDS (inscripcions del públic,
 * amb els correus; no es publica mai) i PARTIDES (partides online).
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
const PART = 'PARTIDES';      // partides online (jugades; la paraula clau es guarda xifrada)

// Lectura pública: qualsevol pot veure els tornejos
function doGet(e) {
  const op = e && e.parameter && e.parameter.op;
  if (op === 'games') return sortida({ ok: true, list: llistaPartides() });
  if (op === 'game') return sortida({ ok: true, game: unaPartida(String(e.parameter.gid || '')) });
  return sortida(llegir());
}

// Escriptura: només amb el PIN
function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return sortida({ ok: false, error: 'format' }); }
  // Inscripció pública: no cal PIN
  if (req.action === 'request') return sortida(novaSolicitud(req));
  // Partides online: la paraula clau pactada fa de contrasenya de cada partida
  if (req.action === 'gameCreate') return sortida(ambBloqueig(() => crearPartida(req)));
  if (req.action === 'gameMove') return sortida(ambBloqueig(() => moure(req)));
  if (req.action === 'gameResign') return sortida(ambBloqueig(() => abandonar(req)));
  if (req.action === 'gameDraw') return sortida(ambBloqueig(() => taules(req)));
  if (req.action === 'gameCheck') return sortida(ambBloqueig(() => { const c = comprova(req); return c.error ? { ok: false, error: c.error } : { ok: true, game: publica(c.p.row) }; }));

  if (String(req.pin) !== String(PIN)) return sortida({ ok: false, error: 'pin' });
  if (req.action === 'check') return sortida({ ok: true });
  if (req.action === 'requests') return sortida({ ok: true, list: llistaSolicituds() });
  if (req.action === 'resolve') return sortida(resolSolicitud(req));
  if (req.action === 'gameReset') return sortida(ambBloqueig(() => reiniciarPartida(req)));

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

/* ---------- partides online ----------
   Columnes: gid · clau (xifrada) · blanques · negres · jugades (UCI separades per espais) · estat · resultat · motiu · taules · actualitzat */
const PC = { gid: 0, clau: 1, w: 2, b: 3, mv: 4, estat: 5, res: 6, motiu: 7, taules: 8, upd: 9 };
function fullPart() {
  const ss = SpreadsheetApp.getActive();
  let f = ss.getSheetByName(PART);
  if (!f) { f = ss.insertSheet(PART); f.appendRow(['gid', 'clau', 'blanques', 'negres', 'jugades', 'estat', 'resultat', 'motiu', 'taules', 'actualitzat']); f.setFrozenRows(1); }
  return f;
}
function ambBloqueig(fn) { const l = LockService.getScriptLock(); l.waitLock(15000); try { return fn(); } finally { l.releaseLock(); } }
function xifra(gid, key) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'escacs3t:' + gid + ':' + String(key || ''), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(d);
}
function totesPartides() {
  const f = fullPart(); const n = f.getLastRow();
  return n < 2 ? [] : f.getRange(2, 1, n - 1, 10).getValues();
}
function trobaPartida(gid) {
  const rows = totesPartides();
  for (let i = 0; i < rows.length; i++) if (String(rows[i][PC.gid]) === gid) return { row: rows[i], fila: i + 2 };
  return null;
}
function publica(r) {
  const mv = String(r[PC.mv] || '').trim();
  return { gid: String(r[PC.gid]), w: String(r[PC.w]), b: String(r[PC.b]), moves: mv ? mv.split(' ') : [], estat: String(r[PC.estat]),
           res: String(r[PC.res] || ''), motiu: String(r[PC.motiu] || ''), taules: String(r[PC.taules] || ''),
           upd: r[PC.upd] instanceof Date ? r[PC.upd].toISOString() : String(r[PC.upd] || '') };
}
function llistaPartides() {
  return totesPartides().map(r => { const g = publica(r); return { gid: g.gid, n: g.moves.length, estat: g.estat, res: g.res, taules: g.taules, upd: g.upd }; });
}
function unaPartida(gid) { const p = trobaPartida(gid); return p ? publica(p.row) : null; }
function desaFila(fila, r) { r[PC.upd] = new Date(); fullPart().getRange(fila, 1, 1, 10).setValues([r]); }
function comprova(req) {
  const gid = String(req.gid || '');
  const p = trobaPartida(gid);
  if (!p) return { error: 'noexisteix' };
  if (String(p.row[PC.clau]) !== xifra(gid, req.key)) return { error: 'clau' };
  if (String(p.row[PC.estat]) !== 'joc') return { error: 'acabada' };
  return { p: p };
}
// Busca l'aparellament (gid = torneig:ronda:partida) a les dades del torneig
function aparellament(data, gid) {
  const parts = gid.split(':'); if (parts.length !== 3 || !data) return null;
  const t = (data.tournaments || []).find(x => x.id === parts[0]); if (!t) return null;
  const r = (t.rounds || [])[Number(parts[1])]; const g = r && r[Number(parts[2])];
  return g ? { t: t, g: g } : null;
}
function crearPartida(req) {
  const gid = String(req.gid || '').slice(0, 80);
  const key = String(req.key || '');
  if (key.length < 3) return { ok: false, error: 'curta' };
  if (trobaPartida(gid)) return { ok: false, error: 'existeix' };
  const a = aparellament(llegir().data, gid);
  if (!a || !a.g.b || a.g.res || a.t.status !== 'enjoc') return { ok: false, error: 'aparellament' };
  fullPart().appendRow(["'" + gid, xifra(gid, key), "'" + String(req.w || '').slice(0, 80), "'" + String(req.b || '').slice(0, 80), '', 'joc', '', '', '', new Date()]);
  return { ok: true, game: unaPartida(gid) };
}
function moure(req) {
  const c = comprova(req); if (c.error) return { ok: false, error: c.error };
  const r = c.p.row; const mv = String(r[PC.mv] || '').trim(); const moves = mv ? mv.split(' ') : [];
  if (Number(req.ply) !== moves.length) return { ok: false, error: 'torn', game: publica(r) };
  if ((moves.length % 2 === 0 ? 'w' : 'b') !== req.side) return { ok: false, error: 'torn', game: publica(r) };
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(req.uci))) return { ok: false, error: 'jugada' };
  moves.push(String(req.uci));
  r[PC.mv] = "'" + moves.join(' '); r[PC.taules] = '';
  if (req.end && ['1-0', '0-1', '½-½'].indexOf(req.end.res) >= 0) acaba(r, req.end.res, String(req.end.motiu || '').slice(0, 60));
  desaFila(c.p.fila, r);
  return { ok: true, game: publica(r) };
}
function abandonar(req) {
  const c = comprova(req); if (c.error) return { ok: false, error: c.error };
  const r = c.p.row;
  acaba(r, req.side === 'w' ? '0-1' : '1-0', req.side === 'w' ? 'abandonen les blanques' : 'abandonen les negres');
  desaFila(c.p.fila, r);
  return { ok: true, game: publica(r) };
}
function taules(req) {
  const c = comprova(req); if (c.error) return { ok: false, error: c.error };
  const r = c.p.row; const side = req.side === 'b' ? 'b' : 'w'; const oferta = String(r[PC.taules] || '');
  if (req.op === 'offer') r[PC.taules] = side;
  else if (req.op === 'decline') r[PC.taules] = '';
  else if (req.op === 'accept' && oferta && oferta !== side) acaba(r, '½-½', 'taules pactades');
  else return { ok: false, error: 'taules' };
  desaFila(c.p.fila, r);
  return { ok: true, game: publica(r) };
}
// En acabar, el resultat s'escriu sol a la ronda del torneig
function acaba(r, res, motiu) {
  r[PC.estat] = 'fi'; r[PC.res] = res; r[PC.motiu] = motiu; r[PC.taules] = '';
  const cur = llegir(); const a = aparellament(cur.data, String(r[PC.gid]));
  if (a && !a.g.res) { a.g.res = res; escriure(cur.data, cur.ver + 1); }
}
function reiniciarPartida(req) {
  const p = trobaPartida(String(req.gid || ''));
  if (p) fullPart().deleteRow(p.fila);
  return { ok: true };
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
