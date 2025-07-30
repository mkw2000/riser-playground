# Fire‑Riser Live Editor

> **Instant fire‑alarm riser drawings from pure JSON.** Edit the job spec on the left – see the drawing update on the right – export SVG/PDF for AutoCAD submittals.

---

## ✨ What’s inside

| Layer             | Tech                                          | Why                                                                   |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| UI                | **React 18 + Vite**                           | Fast HMR for live preview.                                            |
| Canvas            | **SVG** via lightweight JSX                   | Crisp vectors, scales to PDF/DWG.                                     |
| Editor            | **Monaco Editor**                             | VS Code‑grade JSON editing with linting & IntelliSense hooks.         |
| Symbols           | Tiny bespoke lib (see `SYMBOLS` in `App.tsx`) | Add/adjust icons in one place.                                        |
| Layout engine     | **ELK.js**                                    | Auto-routes orthogonal circuit buses with proper bend points.         |
| Wiring engine     | **ELK.js** with custom routing logic          | Auto-routes circuit buses with proper orthogonal paths and EOL drops. |
| Styling           | **Tailwind CSS**                              | Utility classes keep markup terse.                                    |
| Export (optional) | `svgexport` CLI                               | SVG → PDF at true scale (e.g. `2970:2100` pixels ≈ 200 mm × 140 mm).  |

---

## 🚀 Quick start

```bash
# 1 · Clone & install
pnpm i  # or npm / yarn

# 2 · Run dev server
pnpm dev
# → http://localhost:5173 (hot‑reload)
```

### Build standalone SVG / PDF

```bash
# Outputs ./dist/riser.svg\pnpm build:svg

# Optional PDF (requires svgexport globally or in dev deps)
svgexport dist/riser.svg dist/riser.pdf 2970:2100
```

> 🔍 Import the resulting PDF into AutoCAD with `` (or attach as an underlay) to keep everything vector‑clean and layerable.

---

## 🗂 Project structure

```
.
├── src/
│   ├── App.tsx        ← live editor + viewer (core logic)
│   ├── symbols.tsx    ← all schematic icons in one spot
│   └── index.css      ← Tailwind base
├── public/
│   └── job‑sample.json← starter spec loaded on boot
├── vite.config.ts
└── package.json
```

Feel free to reorganize – the core is just **one React component**.

---

## 📝 JSON spec cheat‑sheet

| Field         | Required | Notes                                                                                                                 |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `sheet.title` | ✔️       | Shown bottom‑left.                                                                                                    |
| `panel`       | ✔️       | `{ x, y }` anchor for FACP symbol.                                                                                    |
| `circuits[]`  | ✔️       | `{ id, class (A/B), color }`. Used for wiring bus & legend.                                                           |
| `devices[]`   | ✔️       | `{ type, circuit, x, y }`.`type` must exist in `SYMBOLS`. `circuit:"PANEL"` draws a stub straight from the FACP pins. |
| `eols[]`      | ✖️       | `{ circuit, x, drop? }` – `drop` length in mm; default 4.                                                             |
| Any field     |          | Extra properties are ignored → forward‑compatible.                                                                    |

```jsonc
{
  "devices": [
    { "type": "Smoke", "circuit": "SLC", "x": 40, "y": 110 },
    { "type": "Pull", "circuit": "NAC1", "x": 150, "y": 110 }
  ]
}
```

> Coordinates are **absolute mm** in sheet space. Want per‑floor offsets instead? Add a `floor` prop and tweak `Riser()`.

---

## ➕ Adding new symbols

1. Open `symbols.tsx`.
2. Create a React component that emits SVG primitives.
3. Add it to the `SYMBOLS` map **and** update `BOTTOM_Y` (the symbol’s height).

```tsx
const HornStrobe = ({ x, y }: XY) => (
  <g transform={`translate(${x} ${y})`} className="stroke-red fill-none">
    <polygon points="0,0 14,0 7,12" />
    <text x={7} y={-2} fontSize={6} textAnchor="middle">
      B
    </text>
  </g>
);
SYMBOLS.HS = HornStrobe;
BOTTOM_Y.HS = 12;
```

The editor instantly reloads – just reference `"type": "HS"` in your JSON.

---

## 🛣 Road‑map / nice‑to‑haves

| Status | Item                                           |
| ------ | ---------------------------------------------- |
| 🟢     | Live editor + SVG viewer                       |
| 🟢     | Multi‑circuit bus routing + EOL drops          |
| 🟡     | Auto‑generated **wiring** & **symbol** legends |
| 🟡     | Per‑floor stacking & automatic floor labels    |
| 🟡     | Voltage‑drop / battery calc sidebar            |
| 🔲     | DXF direct export (bypass PDF)                 |
| 🔲     | CI lint + Prettier + Husky                     |
| 🔲     | Unit tests on routing engine                   |

Contributions welcome – open a PR or issue!

---

## ⚙️ ELK.js Layout Configuration

The application uses ELK.js for automatic orthogonal routing of circuit buses. To tune the layout algorithm, modify the options in `src/layout/elkLayout.ts`:

```typescript
layoutOptions: {
  'elk.algorithm': 'layered',               // Main layout algorithm
  'elk.direction': 'DOWN',                  // Layout direction
  'elk.layered.spacing.edgeNodeBetweenLayers': '10',  // Vertical spacing
  'elk.layered.spacing.nodeNodeBetweenLayers': '20',  // Horizontal spacing
  'elk.edgeRouting': 'ORTHOGONAL',        // Ensures 90° angles only
}
```

**Debug mode**: Add `?debugGrid=1` to the URL to overlay ELK's node/edge bounding boxes for troubleshooting layout issues.

---

## 🤝 Contributing guidelines

- **ESLint & Prettier** run on commit. Keep components small, pure, and typed.
- Use **Conventional Commits** (`feat:`, `fix:`, `docs:`) so release notes stay tidy.
- For sizeable features, open a draft PR early and discuss approach.

---

## 🪪 License

MIT – _as‑is, no warranty_. If you submit to an AHJ and get red‑lined, that’s on the drafter 😄. But send bug reports anyway!
