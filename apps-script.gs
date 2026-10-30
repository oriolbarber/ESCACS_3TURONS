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
 * 5. Enganxa aquest URL a la web (⋮ → Google Sheets) o passa'l perquè quedi fix al codi.
 *
 * Si després canvies aquest codi o el PIN: Implementa → Gestiona les implementacions →
 * ✎ → Versió: "Nova versió" → Implementa. Així l'URL no canvia.
 */

const PIN = '1234';          // ← canvia'l: és la clau per entrar al mode organització
const FULL = 'DADES';         // pestanya on es guarden les dades (no la toquis a mà)
const TROS = 40000;           // caràcters per cel·la (el límit de Sheets és 50.000)

// Lectura pública: qualsevol pot veure els tornejos
function doGet() {
  return sortida(llegir());
}

// Escriptura: només amb el PIN
function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return sortida({ ok: false, error: 'format' }); }
  if (String(req.pin) !== String(PIN)) return sortida({ ok: false, error: 'pin' });
  if (req.action === 'check') return sortida({ ok: true });

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
