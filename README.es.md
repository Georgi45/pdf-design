# pdf-design

**Tu IA hace PDFs que parecen webs impresas. Esta skill lo arregla.**

![El mismo informe como PDF típico de IA y con pdf-design](examples/img/before-after.png)

Pídele a Claude, o a cualquier agente de IA, «un informe bonito en PDF» y casi siempre te da una página web enviada a la impresora: un marco blanco en cada hoja, una portada oscura flotando en medio de un A4, hojas que se acaban a la mitad. **pdf-design** enseña a tu agente a maquetar como un diseñador, hoja por hoja, y a revisar su propio trabajo antes de darte el PDF.

*Read in English: [README.md](README.md)*

- **Cada hoja se diseña entera.** Fondos a sangre, portadas, separadores y cierre. A4, A4 apaisado o 16:9.
- **Texto de verdad.** Vectorial y seleccionable, con las fuentes incrustadas. Nada de capturas pegadas en un PDF.
- **Se revisa sola.** Un script mide cada hoja (contenido cortado, texto encima del pie, hojas medio vacías, fuentes que faltan) y saca un PNG de cada una para que el agente la mire antes de entregar.
- **Temas.** Seis incluidos: `poster`, `gallery`, `ledger`, `archive`, `product` y `stage` — y cada uno es un diseño entero, no una paleta: sus propios márgenes, escala tipográfica, esquinas, filetes y adorno. ¿Ya tienes marca? Apunta `brand.mjs` a tu `DESIGN.md`, a tus tokens de diseño, a un CSS o a tu web y te escribe el tema.
- **Nada que compilar.** Sin npm install. Node 22+ y el Chrome que ya tienes.

## Ejemplos

- [Informe A4 para un cliente, tema `product` (PDF)](examples/report-a4.pdf) · [código](examples/report-a4.html)
- [Propuesta 16:9, tema `stage` (PDF)](examples/deck-16-9.pdf) · [código](examples/deck-16-9.html)
- [Las mismas tres páginas en los seis temas](examples/themes/) · [código](examples/themes/showcase.html)
- [El «antes»: el mismo informe impreso como siempre (PDF)](examples/before/report-web-style.pdf)

## Instalar

| Dónde | Cómo |
|---|---|
| Cualquier agente (Claude Code, Codex, Cursor, Gemini CLI, Copilot…) | `npx skills add Georgi45/pdf-design` |
| Claude Code, como plugin | `/plugin marketplace add https://github.com/Georgi45/pdf-design` y después `/plugin install pdf-design@pdf-design` |
| claude.ai (experimental) | Descarga `pdf-design.zip` de [Releases](https://github.com/Georgi45/pdf-design/releases) → Customize → Skills → Upload. Hace falta tener activada la ejecución de código. |
| A mano | Copia `skills/pdf-design/` en la carpeta de skills de tu agente, por ejemplo `~/.claude/skills/`. |

O pega esto en tu agente: *«Instala la skill de github.com/Georgi45/pdf-design»*.

**Requisitos:** Node.js 22+ y Chrome, Chromium o Edge (o define `CHROME_PATH`).

## Cómo se usa

Pide el documento y ya:

> Hazme un informe en PDF de los números del trimestre para el cliente. A4, tema product.

> Convierte esta propuesta en un PDF 16:9.

El agente:
1. Te enseña un **plan de hojas**: una idea y un titular por hoja.
2. Monta cada hoja en HTML con los diseños de la skill.
3. La imprime con `scripts/print.mjs`.
4. Mira todas las hojas y arregla lo que marque el control.
5. Te da el PDF.

También puedes imprimir a mano:

```
node skills/pdf-design/scripts/print.mjs mi-informe.html
```

## Por qué los PDF de la IA parecen webs

Los navegadores no entienden de páginas. Cuando un agente escribe HTML y lo imprime, Chrome añade márgenes, encoge el contenido para que quepa y corta donde puede. El resultado es una web en papel.

pdf-design le da la vuelta:
- Cada hoja es una `<section class="sheet">` de tamaño fijo, con su propio fondo. Nada pasa de una hoja a la siguiente.
- `print.mjs` pone `@page` con el tamaño exacto de la hoja, sin márgenes y con los fondos activados. También incrusta las fuentes y las imágenes, porque Chrome imprime antes de que terminen de cargar.
- Antes de imprimir mide cada hoja. Después revisa el propio PDF: número de páginas, fuentes incrustadas y fuentes de sustitución.
- El agente recibe un PNG por hoja y tiene que mirarlos. Así se acaba el «aquí tienes tu PDF» con la hoja 4 rota.

## Tu marca

Vienen seis temas. Si tu empresa ya tiene un estilo, no hace falta reescribirlo a mano:

```
node skills/pdf-design/scripts/brand.mjs ./DESIGN.md ./tokens.json --name acme -o ./acme.css --fonts
node skills/pdf-design/scripts/brand.mjs https://acme.com --name acme --fonts
```

Lee un `DESIGN.md`, tokens de diseño DTCG, un CSS, una página HTML o una URL en vivo; saca los
colores y las tipografías, descarga las fuentes, comprueba el contraste de cada par texto/fondo y
escribe dos archivos: el tema y una hoja de muestra que imprimes y miras.

```html
<body class="format-a4" data-theme="./acme.css">
```

Lee lo que imprime: te dice de qué token salió cada color y qué valores tuvo que mover para que el
texto se lea. Es un primer borrador que tú corriges, no un veredicto. Puedes auditar cualquier tema
con `node skills/pdf-design/scripts/brand.mjs --check ./acme.css`.

¿Prefieres escribirlo tú? Copia el de `skills/pdf-design/assets/themes/*.css` que más se parezca, junto a tu documento
y cambia los valores. Descarga cualquier fuente de Google Fonts con:

```
node skills/pdf-design/scripts/fonts.mjs "Familia:wght@400..700"
```

## Preguntas

**¿Por qué no hacer capturas de cada hoja?** Muchas herramientas lo hacen. El texto deja de ser texto: no se puede seleccionar, buscar ni copiar un teléfono, y se ve borroso al imprimir.

**¿Funciona en claude.ai?** Necesita un navegador para imprimir. Funciona en agentes con terminal (Claude Code, Codex, Cursor, Gemini CLI). En claude.ai depende de que haya Chromium en su entorno: tómalo como experimental.

**¿Puedo editar el PDF después?** Edita el HTML y vuelve a imprimir. Esa es la gracia: el diseño vive en código que el agente puede cambiar.

## Licencia

MIT. Las fuentes incluidas tienen licencia SIL Open Font License (ver `skills/pdf-design/assets/fonts/licenses`).

Hecho por **Georgi** · [X](https://x.com/georgi5_) · [Instagram](https://instagram.com/georgi5_). Si te ahorra tiempo, una ⭐ ayuda a que la encuentre más gente.
