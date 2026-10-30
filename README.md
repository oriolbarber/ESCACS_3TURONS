# ♞ Escacs 3 Turons

Gestor de tornejos d'escacs de l'Institut Els 3 Turons (Arenys de Mar).

**Web:** https://oriolbarber.github.io/ESCACS_3TURONS/

## Com s'usa
- **Vista pública** (per defecte): rondes, resultats i classificació, sense botons d'editar. Mostra sempre la darrera versió de `dades.json`.
- **Mode organització**: *⋮ → Mode organització* i PIN (el primer cop es crea). Permet crear tornejos, inscriure professorat i alumnat i posar resultats. El dispositiu s'hi queda fins que en surts.
- Les dades de treball es guarden al navegador del dispositiu de l'organització.
- El PIN només evita canvis per error; les dades oficials les protegeix GitHub (només qui pot pujar fitxers al repositori publica `dades.json`).
- Per publicar els resultats per a tothom: **⋮ → Publicar al web → Descarregar dades.json** i puja aquest fitxer aquí, al costat d'`index.html`.

## Fitxers
- `index.html` — l'aplicació (un sol fitxer, sense dependències).
- `dades.json` — (opcional) dades publicades; la web les carrega a la primera visita.
- `logo.png` — (opcional) logotip del centre en blanc per a la capçalera.
