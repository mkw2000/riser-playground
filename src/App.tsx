import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { elkLayout } from "./layout/elkLayout";

interface Device {
  type: string;
  circuit: string;
  x?: number;
  y?: number;
}

interface Circuit {
  id: string;
  class: string;
  color: string;
}
interface EOL {
  circuit: string;
  x?: number;
  drop?: number;
}

interface Spec {
  sheet: { title: string };
  panel?: { x: number; y: number };
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
  HornStrobe: ({ x, y }: { x: number; y: number }) => (
    <g transform={`translate(${x} ${y})`} className="stroke-black fill-none">
      {/* Horn speaker triangle */}
      <polygon points="2,2 10,2 6,8" strokeWidth={0.8} />
      {/* Rounded square base */}
      <rect x={1} y={8} width={10} height={10} rx={2} strokeWidth={0.8} />
      {/* Center circle */}
      <circle cx={6} cy={13} r={2} strokeWidth={0.8} />
      {/* Cross pattern inside circle */}
      <line x1={4.5} y1={11.5} x2={7.5} y2={14.5} strokeWidth={0.6} />
      <line x1={7.5} y1={11.5} x2={4.5} y2={14.5} strokeWidth={0.6} />
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
  HornStrobe: 18,
};

/* ─────────────────────────────── starter JSON ─── */
const defaultSpec = `{
  "sheet": { "title": "FIRST FLOOR" },
  "circuits": [
    { "id": "SLC",  "class": "B", "color": "black" },
    { "id": "NAC1", "class": "B", "color": "black" }
  ],
  "devices": [
    { "type": "Cell",  "circuit": "PANEL" },
    { "type": "HornStrobe", "circuit": "NAC1" },
    { "type": "Smoke", "circuit": "SLC" },
    { "type": "Pull",  "circuit": "SLC" }
  ],
  "eols": [
    { "circuit": "NAC1" },
    { "circuit": "SLC" }
  ]
}`;

/* ─────────────────────────────── primitives ─── */
const Line = ({
  pts,
  color = "black",
  dashArray,
}: {
  pts: number[][];
  color?: string;
  dashArray?: string;
}) => (
  <polyline
    points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
    fill="none"
    stroke={color}
    strokeWidth={0.6}
    strokeDasharray={dashArray}
    vectorEffect="non-scaling-stroke"
  />
);

/* ─────────────────────────────── main renderer ─── */
function Riser({ spec }: { spec: Spec }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [layoutData, setLayoutData] = useState<Awaited<
    ReturnType<typeof elkLayout>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debugGrid =
    new URLSearchParams(window.location.search).get("debugGrid") === "1";

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

  useEffect(() => {
    console.log("Starting ELK layout with spec:", spec);
    setError(null);
    setLayoutData(null);

    elkLayout(spec)
      .then((data) => {
        console.log("ELK layout completed:", data);
        setLayoutData(data);
        setError(null);
      })
      .catch((error) => {
        console.error("ELK layout error:", error);
        setError(error.message || "ELK layout failed");
        setLayoutData(null);
      });
  }, [spec]);

  if (error) {
    return <div style={{ color: "red" }}>ELK Layout Error: {error}</div>;
  }

  if (!layoutData) {
    return <div>Loading layout...</div>;
  }

  /* Devices */
  const deviceNodes = spec.devices.map((d: Device, idx: number) => {
    const nodeData = layoutData.nodes.get(`device-${idx}`);
    if (!nodeData) return null;
    const Cmp = SYMBOLS[d.type as SymbolKey];
    return Cmp ? <Cmp key={idx} x={nodeData.x} y={nodeData.y} /> : null;
  });

  /* Circuit buses from ELK edges */
  const circuitPaths: React.ReactElement[] = [];

  // Render all edges from ELK layout
  Array.from(layoutData.edges.entries()).forEach(([id, edge]) => {
    if (edge.bendPoints && edge.bendPoints.length >= 2) {
      const points = edge.bendPoints.map((p) => [p.x, p.y] as [number, number]);
      
      // Determine dash pattern based on circuit type
      let dashArray;
      if (edge.circuitId === 'NAC1' || edge.circuitId?.startsWith('NAC')) {
        dashArray = "3,2"; // Dashed for NAC circuits
      }
      // SLC and other circuits use solid lines (no dashArray)
      
      circuitPaths.push(
        <Line 
          key={id} 
          pts={points} 
          color="black" 
          dashArray={dashArray}
        />
      );
    }
  });

  // Render EOL resistors from ELK layout
  spec.circuits.forEach((circuit) => {
    const eolNode = layoutData.nodes.get(`eol-${circuit.id}`);
    if (eolNode) {
      circuitPaths.push(
        <SYMBOLS.EOL
          key={`eol-${circuit.id}`}
          x={eolNode.x}
          y={eolNode.y}
        />
      );
    }
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
              stroke={id.startsWith("bus-") ? "red" : "blue"}
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
          <g className="wires">
            {circuitPaths}
          </g>
          <g className="symbols">
            {layoutData.nodes.get('panel') && 
              SYMBOLS.FACP({ 
                x: layoutData.nodes.get('panel')!.x, 
                y: layoutData.nodes.get('panel')!.y 
              })
            }
            {deviceNodes}
          </g>
          {debugOverlay}
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
