# ♞ Escacs 3 Turons

Gestor de tornejos d'escacs de l'Institut Els 3 Turons (Arenys de Mar).

**Web:** https://oriolbarber.github.io/ESCACS_3TURONS/

## Com s'usa
- **Vista pública** (per defecte): rondes, resultats i classificació, sense botons d'editar.
- **Inscripció pública**: qualsevol persona pot sol·licitar la inscripció (nom i correu) al torneig obert o als propers. Els correus no es publiquen mai.
- **Mode organització**: *⋮ → Mode organització* + PIN. Permet crear tornejos, acceptar o rebutjar sol·licituds, inscriure professorat i alumnat i posar resultats.

## Dades compartides amb Google Sheets (recomanat)
Les dades es guarden en un full de Google. Qui té el PIN pot posar resultats des de qualsevol dispositiu i tothom ho veu en directe (cada 20 s).

1. Crea un full de càlcul nou a Google Drive.
2. *Extensions → Apps Script*, enganxa-hi el contingut d'`apps-script.gs` i canvia el `PIN`.
3. *Implementa → Nova implementació → Aplicació web* — Executa com a: **Jo** · Accés: **Qualsevol persona**.
4. Copia l'URL acabat en `/exec` i posa'l a `API_URL` dins d'`index.html` (ja configurat) (o a la web: *⋮ → Google Sheets*, només per a aquell dispositiu).

Si dues persones desen alhora, la web combina els canvis automàticament (resultats i inscripcions).

## Sense Google Sheets (mode local)
Si `API_URL` és buit, les dades es guarden al navegador de l'organització i es publiquen pujant `dades.json` al repositori (*⋮ → Publicar al web*).

## Fitxers
- `index.html` — l'aplicació (un sol fitxer, sense dependències).
- `apps-script.gs` — codi per al full de Google.
- `dades.json` — (opcional, mode local) dades publicades.
- `logo.png` — logotip del centre en blanc (ja va incrustat a `index.html`).
