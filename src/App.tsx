import React, { useState, useMemo, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { elkLayout } from "./layout/elkLayout";

interface Device {
  type: string;
  circuit: string;
  x: number;
  y: number;
}

interface Circuit {
  id: string;
  class: string;
  color: string;
}

interface EOL {
  circuit: string;
  x: number;
  drop?: number;
}

interface Spec {
  sheet: { title: string };
  panel: { x: number; y: number };
  circuits: Circuit[];
  devices: Device[];
  eols: EOL[];
}

/* eslint-disable no-irregular-whitespace */
/******************************************************************************************
 * FIRE-RISER LIVE EDITOR (v0.5)                                                          *
 * -------------------------------------------------------------------------------------- *
 *  • EOL resistor now attaches with a visible drop-wire, not floating on the bus         *
 *  • Allows per-circuit override of EOL drop length (defaults to 4 mm)                   *
 *  • Cell stub refined to align flush with symbol bottom                                 *
 ******************************************************************************************/
/* eslint-enable no-irregular-whitespace */

/* ─────────────────────────────── symbol library ─── */
const SYMBOLS = {
  FACP: ({ x, y }: { x: number; y: number }) => (
    <g transform={`translate(${x} ${y})`} className="stroke-black fill-none">
      <rect width={40} height={20} />
      <text
        x={20}
        y={13}
        fontSize={9}
        textAnchor="middle"
        className="fill-black"
      >
        FACP
      </text>
    </g>
  ),
  Cell: ({ x, y }: { x: number; y: number }) => (
    <g transform={`translate(${x} ${y})`} className="stroke-black fill-none">
      <rect width={30} height={15} />
      <text
        x={15}
        y={10}
        fontSize={7}
        textAnchor="middle"
        className="fill-black"
      >
        CELL
      </text>
    </g>
  ),
  Smoke: ({ x, y }: { x: number; y: number }) => (
    <g transform={`translate(${x} ${y})`} className="stroke-black fill-none">
      <circle cx={7} cy={7} r={7} />
      <text
        x={7}
        y={10.5}
        fontSize={7}
        textAnchor="middle"
        className="fill-black"
      >
        S
      </text>
    </g>
  ),
  Pull: ({ x, y }: { x: number; y: number }) => (
    <g transform={`translate(${x} ${y})`} className="stroke-black fill-none">
      <rect width={12} height={12} />
      <text
        x={6}
        y={8.5}
        fontSize={6.5}
        textAnchor="middle"
        className="fill-black"
      >
        F
      </text>
    </g>
  ),
  EOL: ({ x, y }: { x: number; y: number }) => (
    <g transform={`translate(${x} ${y})`} className="stroke-black fill-none">
      <polyline points="0,0 2,-3 4,3 6,-3 8,3 10,-3 12,0" strokeWidth={0.6} />
    </g>
  ),
} as const;

type SymbolKey = keyof typeof SYMBOLS;

/* bottom-edge offsets so wires stop at the symbol frame */
const BOTTOM_Y: Record<SymbolKey, number> = {
  FACP: 20,
  Cell: 15,
  Smoke: 14,
  Pull: 12,
  EOL: 0,
};

/* ─────────────────────────────── starter JSON ─── */
const defaultSpec = `{
  "sheet": { "title": "FIRST FLOOR" },
  "panel": { "x": 100, "y": 40 },
  "circuits": [
    { "id": "SLC",  "class": "B", "color": "black" },
    { "id": "NAC1", "class": "B", "color": "red" }
  ],
  "devices": [
    { "type": "Cell",  "circuit": "PANEL", "x": 130, "y": 20 },
    { "type": "Smoke", "circuit": "SLC",   "x": 30,  "y": 100 },
    { "type": "Pull",  "circuit": "SLC",   "x": 60,  "y": 100 },
    { "type": "Pull",  "circuit": "NAC1",  "x": 140, "y": 100 }
  ],
  "eols": [
    { "circuit": "SLC",  "x": 60 },
    { "circuit": "NAC1", "x": 155 }
  ]
}`;

/* ─────────────────────────────── primitives ─── */
const Line = ({
  pts,
  color = "black",
}: {
  pts: number[][];
  color?: string;
}) => (
  <polyline
    points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
    fill="none"
    stroke={color}
    strokeWidth={0.6}
    vectorEffect="non-scaling-stroke"
  />
);

/* ─────────────────────────────── main renderer ─── */
function Riser({ spec }: { spec: Spec }) {
  const [layoutData, setLayoutData] = useState<Awaited<
    ReturnType<typeof elkLayout>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debugGrid =
    new URLSearchParams(window.location.search).get("debugGrid") === "1";

  useEffect(() => {
    console.log('Starting ELK layout with spec:', spec);
    setError(null);
    setLayoutData(null);
    
    elkLayout(spec)
      .then((data) => {
        console.log('ELK layout completed:', data);
        setLayoutData(data);
        setError(null);
      })
      .catch((error) => {
        console.error('ELK layout error:', error);
        setError(error.message || 'ELK layout failed');
        setLayoutData(null);
      });
  }, [spec]);

  if (error) {
    return <div style={{color: 'red'}}>ELK Layout Error: {error}</div>;
  }

  if (!layoutData) {
    return <div>Loading layout...</div>;
  }

  /* Devices */
  const deviceNodes = spec.devices.map((d: Device, idx: number) => {
    const Cmp = SYMBOLS[d.type as SymbolKey];
    return Cmp ? <Cmp key={idx} x={d.x} y={d.y} /> : null;
  });

  /* Circuit buses from ELK edges */
  const circuitPaths: React.ReactElement[] = [];
  
  // Render all edges from ELK layout
  Array.from(layoutData.edges.entries()).forEach(([id, edge]) => {
    if (edge.bendPoints && edge.bendPoints.length >= 2) {
      const points = edge.bendPoints.map(p => [p.x, p.y] as [number, number]);
      circuitPaths.push(
        <Line key={id} pts={points} color={edge.color} />
      );
    }
  });

  // Render EOL resistors separately
  spec.eols.forEach((eol: EOL) => {
    const circuit = spec.circuits.find(c => c.id === eol.circuit);
    if (circuit) {
      const circuitDevices = spec.devices.filter(d => d.circuit === circuit.id);
      if (circuitDevices.length > 0) {
        const lowestBottom = Math.max(
          ...circuitDevices.map(d => d.y + BOTTOM_Y[d.type as SymbolKey])
        );
        const busY = lowestBottom + 5;
        const dropLen = eol.drop || 4;
        
        circuitPaths.push(
          <SYMBOLS.EOL
            key={`eol-${circuit.id}`}
            x={eol.x - 6}
            y={busY + dropLen - 3}
          />
        );
      }
    }
  });

  /* Panel stubs (Cell, Annunciator) */
  const panelStubs = spec.devices
    .filter((d: Device) => d.circuit === "PANEL")
    .map((d: Device, i: number) => {
      const bottom = d.y + BOTTOM_Y[d.type as SymbolKey];
      return (
        <Line
          key={`stub-${i}`}
          pts={[
            [spec.panel.x + 20, spec.panel.y],
            [spec.panel.x + 20, bottom],
            [d.x + 15, bottom],
          ]}
        />
      );
    });

  /* Debug overlay */
  const debugOverlay =
    debugGrid && layoutData ? (
      <g opacity={0.3}>
        {Array.from(layoutData.nodes.entries()).map(([id, node]) => (
          <g key={id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              fill="none"
              stroke={id.startsWith('bus-') ? 'red' : 'blue'}
              strokeWidth={0.5}
              strokeDasharray="2,2"
            />
            <text x={node.x + 2} y={node.y - 2} fontSize={6} fill="blue">
              {id}
            </text>
          </g>
        ))}
        {Array.from(layoutData.edges.entries()).map(([id, edge]) => (
          <g key={`debug-${id}`}>
            <polyline
              points={edge.bendPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="green"
              strokeWidth={0.5}
              strokeDasharray="1,1"
            />
            {edge.bendPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={1} fill="green" />
            ))}
          </g>
        ))}
      </g>
    ) : null;

  return (
    <svg width={600} height={400} viewBox="0 0 300 200" className="bg-white">
      {circuitPaths}
      {panelStubs}
      {SYMBOLS.FACP({ x: spec.panel.x, y: spec.panel.y })}
      {deviceNodes}
      {debugOverlay}
      <text x={10} y={195} fontSize={11}>
        {spec.sheet.title}
      </text>
    </svg>
  );
}

/* ─────────────────────────────── App shell ─── */
export default function App(): React.ReactElement {
  const [json, setJson] = useState<string>(defaultSpec);
  const spec = useMemo(() => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }, [json]);

  return (
    <div className="h-screen grid grid-cols-2">
      <Editor
        height="100%"
        defaultLanguage="json"
        value={json}
        onChange={(v) => setJson(v ?? "")}
        theme="vs-dark"
        options={{ minimap: { enabled: false } }}
        className="border-r"
      />

      <div className="flex items-center justify-center p-4 bg-gray-50 overflow-auto">
        {spec ? (
          <Riser spec={spec} />
        ) : (
          <p className="text-red-600">JSON parse error</p>
        )}
      </div>
    </div>
  );
}
