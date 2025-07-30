import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Editor from "@monaco-editor/react";

/******************************************************************************************
 * FIRE‑RISER LIVE EDITOR (v0.5)                                                          *
 * -------------------------------------------------------------------------------------- *
 *  • EOL resistor now attaches with a visible drop‑wire, not floating on the bus         *
 *  • Allows per‑circuit override of EOL drop length (defaults to 4 mm)                   *
 *  • Cell stub refined to align flush with symbol bottom                                 *
 ******************************************************************************************/

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

/* bottom‑edge offsets so wires stop at the symbol frame */
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
function Riser({ spec }: { spec: any }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, transform.scale * scaleFactor));

      // Zoom towards mouse position
      const scaleChange = newScale / transform.scale;
      const newX = mouseX - (mouseX - transform.x) * scaleChange;
      const newY = mouseY - (mouseY - transform.y) * scaleChange;

      setTransform({ x: newX, y: newY, scale: newScale });
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [transform]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);
  /* Devices */
  const deviceNodes = spec.devices.map((d: any, idx: number) => {
    const Cmp = SYMBOLS[d.type as SymbolKey];
    return Cmp ? <Cmp key={idx} x={d.x} y={d.y} /> : null;
  });

  /* Circuits */
  const circuitsSvg = spec.circuits.map((circ: any) => {
    const devs = spec.devices.filter((d: any) => d.circuit === circ.id);
    if (devs.length === 0) return null;

    // Baseline for this circuit (below lowest device)
    const lowestBottom = Math.max(
      ...devs.map((d: any) => d.y + BOTTOM_Y[d.type as SymbolKey])
    );
    const BUS_Y = lowestBottom + 5;

    // Panel attach
    const panelAttach: [number, number] = [
      spec.panel.x + 20,
      spec.panel.y + BOTTOM_Y.FACP,
    ];

    // Order devices left→right
    devs.sort((a: any, b: any) => a.x - b.x);
    const pts: number[][] = [
      panelAttach,
      [panelAttach[0], BUS_Y],
      [devs[0].x, BUS_Y],
    ];

    devs.forEach((d: any, idx: number) => {
      const bottom = d.y + BOTTOM_Y[d.type as SymbolKey];
      pts.push([d.x, bottom]);
      if (idx < devs.length - 1) {
        pts.push([d.x, BUS_Y], [devs[idx + 1].x, BUS_Y]);
      }
    });

    // Build elements (line + optional EOL stub)
    const group: React.ReactElement[] = [];
    group.push(<Line key="bus" pts={pts} color={circ.color} />);

    // EOL logic
    const eol = spec.eols.find((e: any) => e.circuit === circ.id);
    if (eol) {
      const dropLen = eol.drop || 4; // can override drop length per EOL
      const eolStubPts = [
        [eol.x, BUS_Y],
        [eol.x, BUS_Y + dropLen],
      ];
      group.push(<Line key="eol-stub" pts={eolStubPts} color={circ.color} />);
      group.push(
        <SYMBOLS.EOL key="eol" x={eol.x - 6} y={BUS_Y + dropLen - 3} />
      );
    }

    return <g key={circ.id}>{group}</g>;
  });

  /* Panel stubs (Cell, Annunciator) */
  const panelStubs = spec.devices
    .filter((d: any) => d.circuit === "PANEL")
    .map((d: any, i: number) => {
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

  return (
    <div className="relative w-full h-full overflow-hidden">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className="bg-white cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {circuitsSvg}
          {panelStubs}
          {SYMBOLS.FACP({ x: spec.panel.x, y: spec.panel.y })}
          {deviceNodes}
          <text x={10} y={195} fontSize={11}>
            {spec.sheet.title}
          </text>
        </g>
      </svg>
      <div className="absolute top-2 left-2 text-xs text-gray-600 bg-white/80 px-2 py-1 rounded">
        Zoom: {Math.round(transform.scale * 100)}% | Double-click to reset
      </div>
    </div>
  );
}

/* ─────────────────────────────── App shell ─── */
export default function App() {
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
