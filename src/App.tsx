import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import Editor from "@monaco-editor/react";
import { elkLayout } from "./layout/elkLayout";
// import { tscircuitLayout } from "./layout/tscircuitLayout";
import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";
// @ts-ignore
import DxfWriter from "dxf-writer";

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
// const BOTTOM_Y: Record<SymbolKey, number> = {
//   FACP: 20,
//   Cell: 15,
//   Smoke: 14,
//   Pull: 12,
//   EOL: 0,
//   HornStrobe: 18,
// };

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
    { "type": "Smoke", "circuit": "SLC" },
    { "type": "Smoke", "circuit": "SLC" },
    { "type": "Smoke", "circuit": "SLC" },
    { "type": "Pull",  "circuit": "SLC" },
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
function Riser({
  spec,
  onExportDXF,
}: {
  spec: Spec;
  onExportDXF?: (layoutData: any) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 3 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [layoutData, setLayoutData] = useState<Awaited<
    ReturnType<typeof elkLayout>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debugGrid =
    new URLSearchParams(window.location.search).get("debugGrid") === "1";

  // Calculate initial scale and position to center the drawing
  const calculateInitialTransform = useCallback(() => {
    if (!svgRef.current || !layoutData) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const viewportWidth = rect.width;
    const viewportHeight = rect.height;

    // Find bounds of all nodes
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    layoutData.nodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });

    // Add some padding around the content
    const padding = 50;
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    // Calculate scale to fit content in viewport with some margin
    const scaleX = (viewportWidth * 0.8) / contentWidth;
    const scaleY = (viewportHeight * 0.8) / contentHeight;
    const scale = Math.min(scaleX, scaleY, 5); // Cap at 5x zoom

    // Center the content
    const centerX =
      (viewportWidth - contentWidth * scale) / 2 - (minX - padding) * scale;
    const centerY =
      (viewportHeight - contentHeight * scale) / 2 - (minY - padding) * scale;

    setTransform({ x: centerX, y: centerY, scale });
  }, [layoutData]);

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
      const newScale = Math.max(
        0.1,
        Math.min(5, transform.scale * scaleFactor)
      );

      // Zoom towards mouse position
      const scaleChange = newScale / transform.scale;
      const newX = mouseX - (mouseX - transform.x) * scaleChange;
      const newY = mouseY - (mouseY - transform.y) * scaleChange;

      setTransform({ x: newX, y: newY, scale: newScale });
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [transform]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        // Left click
        setIsDragging(true);
        setDragStart({
          x: e.clientX - transform.x,
          y: e.clientY - transform.y,
        });
      }
    },
    [transform]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        setTransform((prev) => ({
          ...prev,
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        }));
      }
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    calculateInitialTransform();
  }, [calculateInitialTransform]);

  useEffect(() => {
    console.log("Starting ELK layout with spec:", spec);
    setError(null);
    setLayoutData(null);

    const layoutFunction = elkLayout;
    const layoutName = "ELK";

    layoutFunction(spec)
      .then((data) => {
        console.log(`${layoutName} layout completed:`, data);
        setLayoutData(data);
        setError(null);
      })
      .catch((error) => {
        console.error(`${layoutName} layout error:`, error);
        setError(error.message || `${layoutName} layout failed`);
        setLayoutData(null);
      });
  }, [spec]);

  // Auto-center and scale when layout data changes
  useEffect(() => {
    if (layoutData) {
      // Small delay to ensure SVG is rendered
      setTimeout(calculateInitialTransform, 100);
      // Pass layout data to parent for DXF export
      if (onExportDXF) {
        onExportDXF(layoutData);
      }
    }
  }, [layoutData, calculateInitialTransform, onExportDXF]);

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
      if (edge.circuitId === "NAC1" || edge.circuitId?.startsWith("NAC")) {
        dashArray = "3,2"; // Dashed for NAC circuits
      }
      // SLC and other circuits use solid lines (no dashArray)

      circuitPaths.push(
        <Line key={id} pts={points} color="black" dashArray={dashArray} />
      );
    }
  });

  // Render EOL resistors from ELK layout
  spec.circuits.forEach((circuit) => {
    const eolNode = layoutData.nodes.get(`eol-${circuit.id}`);
    if (eolNode) {
      circuitPaths.push(
        <SYMBOLS.EOL key={`eol-${circuit.id}`} x={eolNode.x} y={eolNode.y} />
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
        <g
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
        >
          <g className="wires">{circuitPaths}</g>
          <g className="symbols">
            {layoutData.nodes.get("panel") &&
              SYMBOLS.FACP({
                x: layoutData.nodes.get("panel")!.x,
                y: layoutData.nodes.get("panel")!.y,
              })}
            {deviceNodes}
          </g>
          {debugOverlay}
          <text
            x={400}
            y={250}
            fontSize={14}
            textAnchor="middle"
            fontWeight="bold"
          >
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
  const [splitRatio, setSplitRatio] = useState<number>(50); // Percentage for editor width
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  
  const spec = useMemo(() => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }, [json]);

  // Handle mouse events for dragging the divider
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const xPos = e.clientX - containerRect.left;
      const percentage = Math.max(10, Math.min(90, (xPos / containerRect.width) * 100));
      setSplitRatio(percentage);
    };
    
    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const exportToPDF = useCallback(async () => {
    if (!spec) return;

    try {
      // Find the SVG element
      const svgElement = document.querySelector("svg");
      if (!svgElement) {
        console.error("SVG element not found");
        return;
      }

      // Clone the SVG to avoid modifying the original
      const svgClone = svgElement.cloneNode(true) as SVGSVGElement;

      // Clean up the SVG for export - remove transform attributes that might cause issues
      const transformedGroup = svgClone.querySelector("g[transform]");
      if (transformedGroup) {
        // Apply the transform to get the actual coordinates
        const transform = transformedGroup.getAttribute("transform") || "";
        const match = transform.match(
          /translate\(([^,]+),\s*([^)]+)\)\s*scale\(([^)]+)\)/
        );

        if (match) {
          const [, translateX, translateY, scale] = match;
          const tx = parseFloat(translateX);
          const ty = parseFloat(translateY);
          const s = parseFloat(scale);

          // Remove the transform attribute
          transformedGroup.removeAttribute("transform");

          // Apply the transformation to all child elements
          const allElements = transformedGroup.querySelectorAll("*");
          allElements.forEach((element) => {
            if (element.tagName === "g" && element.getAttribute("transform")) {
              const childTransform = element.getAttribute("transform") || "";
              const translateMatch = childTransform.match(
                /translate\(([^,]+),\s*([^)]+)\)/
              );
              if (translateMatch) {
                const [, x, y] = translateMatch;
                const newX = parseFloat(x) * s + tx;
                const newY = parseFloat(y) * s + ty;
                element.setAttribute(
                  "transform",
                  `translate(${newX}, ${newY}) scale(${s})`
                );
              }
            }
          });
        }
      }

      // Set proper SVG dimensions for PDF
      const bbox = svgClone.getBBox
        ? svgClone.getBBox()
        : { x: 0, y: 0, width: 400, height: 300 };
      const padding = 20;
      const svgWidth = bbox.width + padding * 2;
      const svgHeight = bbox.height + padding * 2;

      svgClone.setAttribute("width", svgWidth.toString());
      svgClone.setAttribute("height", svgHeight.toString());
      svgClone.setAttribute(
        "viewBox",
        `${bbox.x - padding} ${bbox.y - padding} ${svgWidth} ${svgHeight}`
      );

      // Create PDF in landscape orientation
      const pdf = new jsPDF("l", "mm", "a4");

      // Convert SVG to PDF using svg2pdf.js
      await svg2pdf(svgClone, pdf, {
        x: 10,
        y: 10,
        width: 277, // A4 landscape width minus margins
        height: 190, // A4 landscape height minus margins
      });

      // Add title below the diagram
      const title = spec.sheet?.title || "Fire Riser Diagram";
      pdf.setFontSize(14);
      pdf.text(title, 10, 210);

      // Add export timestamp
      pdf.setFontSize(8);
      pdf.text(`Exported: ${new Date().toLocaleString()}`, 10, 220);

      // Save the PDF
      pdf.save(`${title.replace(/\s+/g, "_")}_riser_diagram.pdf`);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      alert(
        `PDF export failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }, [spec]);

  const [currentLayoutData, setCurrentLayoutData] = useState<any>(null);

  const handleLayoutData = useCallback((layoutData: any) => {
    setCurrentLayoutData(layoutData);
  }, []);

  const exportToDXFBlocks = useCallback(() => {
    if (!spec || !currentLayoutData) return;

    try {
      const scale = 0.5;
      let dxfContent =
        "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n";

      // Define FACP block
      dxfContent +=
        "0\nBLOCK\n8\nBLOCKS\n2\nFACP\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n20.0\n21\n0.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n20.0\n20\n0.0\n30\n0.0\n11\n20.0\n21\n-10.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n20.0\n20\n-10.0\n30\n0.0\n11\n0.0\n21\n-10.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n0.0\n20\n-10.0\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n";
      dxfContent +=
        "0\nTEXT\n8\n0\n10\n10.0\n20\n-5.0\n30\n0.0\n40\n3.0\n72\n1\n11\n10.0\n21\n-5.0\n31\n0.0\n1\nFACP\n";
      dxfContent += "0\nENDBLK\n8\nBLOCKS\n";

      // Define Cell block
      dxfContent +=
        "0\nBLOCK\n8\nBLOCKS\n2\nCELL\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n15.0\n21\n0.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n15.0\n20\n0.0\n30\n0.0\n11\n15.0\n21\n-7.5\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n15.0\n20\n-7.5\n30\n0.0\n11\n0.0\n21\n-7.5\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n0.0\n20\n-7.5\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n";
      dxfContent +=
        "0\nTEXT\n8\n0\n10\n7.5\n20\n-3.75\n30\n0.0\n40\n2.0\n72\n1\n11\n7.5\n21\n-3.75\n31\n0.0\n1\nCELL\n";
      dxfContent += "0\nENDBLK\n8\nBLOCKS\n";

      // Define Pull Station block
      dxfContent +=
        "0\nBLOCK\n8\nBLOCKS\n2\nPULL\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n6.0\n21\n0.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n6.0\n20\n0.0\n30\n0.0\n11\n6.0\n21\n-6.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n6.0\n20\n-6.0\n30\n0.0\n11\n0.0\n21\n-6.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n0.0\n20\n-6.0\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n";
      dxfContent +=
        "0\nTEXT\n8\n0\n10\n3.0\n20\n-3.0\n30\n0.0\n40\n2.0\n72\n1\n11\n3.0\n21\n-3.0\n31\n0.0\n1\nPULL\n";
      dxfContent += "0\nENDBLK\n8\nBLOCKS\n";

      // Define Smoke Detector block
      dxfContent +=
        "0\nBLOCK\n8\nBLOCKS\n2\nSMOKE\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n";
      dxfContent += "0\nCIRCLE\n8\n0\n10\n7.0\n20\n-7.0\n30\n0.0\n40\n7.0\n";
      dxfContent +=
        "0\nTEXT\n8\n0\n10\n7.0\n20\n-7.0\n30\n0.0\n40\n2.0\n72\n1\n11\n7.0\n21\n-7.0\n31\n0.0\n1\nS\n";
      dxfContent += "0\nENDBLK\n8\nBLOCKS\n";

      // Define Horn/Strobe block
      dxfContent +=
        "0\nBLOCK\n8\nBLOCKS\n2\nHORNSTROBE\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n2.0\n20\n-2.0\n30\n0.0\n11\n10.0\n21\n-2.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n10.0\n20\n-2.0\n30\n0.0\n11\n6.0\n21\n-8.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n6.0\n20\n-8.0\n30\n0.0\n11\n2.0\n21\n-2.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n1.0\n20\n-8.0\n30\n0.0\n11\n11.0\n21\n-8.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n11.0\n20\n-8.0\n30\n0.0\n11\n11.0\n21\n-18.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n11.0\n20\n-18.0\n30\n0.0\n11\n1.0\n21\n-18.0\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n1.0\n20\n-18.0\n30\n0.0\n11\n1.0\n21\n-8.0\n31\n0.0\n";
      dxfContent += "0\nCIRCLE\n8\n0\n10\n6.0\n20\n-13.0\n30\n0.0\n40\n2.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n4.5\n20\n-11.5\n30\n0.0\n11\n7.5\n21\n-14.5\n31\n0.0\n";
      dxfContent +=
        "0\nLINE\n8\n0\n10\n7.5\n20\n-11.5\n30\n0.0\n11\n4.5\n21\n-14.5\n31\n0.0\n";
      dxfContent +=
        "0\nTEXT\n8\n0\n10\n6.0\n20\n-9.0\n30\n0.0\n40\n1.5\n72\n1\n11\n6.0\n21\n-9.0\n31\n0.0\n1\nHS\n";
      dxfContent += "0\nENDBLK\n8\nBLOCKS\n";

      // Define EOL block
      dxfContent +=
        "0\nBLOCK\n8\nBLOCKS\n2\nEOL\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n";
      const eolPoints = [0, 0, 2, -3, 4, 3, 6, -3, 8, 3, 10, -3, 12, 0];
      for (let i = 0; i < eolPoints.length - 2; i += 2) {
        dxfContent += `0\nLINE\n8\n0\n10\n${eolPoints[i].toFixed(
          1
        )}\n20\n${eolPoints[i + 1].toFixed(1)}\n30\n0.0\n11\n${eolPoints[
          i + 2
        ].toFixed(1)}\n21\n${eolPoints[i + 3].toFixed(1)}\n31\n0.0\n`;
      }
      dxfContent += "0\nENDBLK\n8\nBLOCKS\n";

      dxfContent += "0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";

      // Draw circuit lines
      for (const [, edge] of currentLayoutData.edges.entries()) {
        if (edge.bendPoints && edge.bendPoints.length >= 2) {
          const points = edge.bendPoints;
          for (let i = 0; i < points.length - 1; i++) {
            dxfContent += `0\nLINE\n8\nCIRCUITS\n10\n${(
              points[i].x * scale
            ).toFixed(3)}\n20\n${(-points[i].y * scale).toFixed(
              3
            )}\n30\n0.0\n11\n${(points[i + 1].x * scale).toFixed(3)}\n21\n${(
              -points[i + 1].y * scale
            ).toFixed(3)}\n31\n0.0\n`;
          }
        }
      }

      // Insert FACP panel block
      const panelNode = currentLayoutData.nodes.get("panel");
      if (panelNode) {
        const x = panelNode.x * scale;
        const y = -panelNode.y * scale;
        dxfContent += `0\nINSERT\n8\nPANEL\n2\nFACP\n10\n${x.toFixed(
          3
        )}\n20\n${y.toFixed(3)}\n30\n0.0\n41\n${scale.toFixed(
          3
        )}\n42\n${scale.toFixed(3)}\n43\n${scale.toFixed(3)}\n50\n0.0\n`;
      }

      // Insert device blocks
      spec.devices.forEach((device: Device, idx: number) => {
        const nodeData = currentLayoutData.nodes.get(`device-${idx}`);
        if (!nodeData) return;

        const x = nodeData.x * scale;
        const y = -nodeData.y * scale;

        let blockName = "";
        let layerName = "";

        switch (device.type) {
          case "Cell":
            blockName = "CELL";
            layerName = "DEVICES";
            break;
          case "Pull":
            blockName = "PULL";
            layerName = "DEVICES";
            break;
          case "Smoke":
            blockName = "SMOKE";
            layerName = "DEVICES";
            break;
          case "HornStrobe":
            blockName = "HORNSTROBE";
            layerName = "DEVICES";
            break;
          default:
            return;
        }

        dxfContent += `0\nINSERT\n8\n${layerName}\n2\n${blockName}\n10\n${x.toFixed(
          3
        )}\n20\n${y.toFixed(3)}\n30\n0.0\n41\n${scale.toFixed(
          3
        )}\n42\n${scale.toFixed(3)}\n43\n${scale.toFixed(3)}\n50\n0.0\n`;
      });

      // Insert EOL blocks
      spec.circuits.forEach((circuit: Circuit) => {
        const eolNode = currentLayoutData.nodes.get(`eol-${circuit.id}`);
        if (eolNode) {
          const x = eolNode.x * scale;
          const y = -eolNode.y * scale;
          dxfContent += `0\nINSERT\n8\nEOL\n2\nEOL\n10\n${x.toFixed(
            3
          )}\n20\n${y.toFixed(3)}\n30\n0.0\n41\n${scale.toFixed(
            3
          )}\n42\n${scale.toFixed(3)}\n43\n${scale.toFixed(3)}\n50\n0.0\n`;
        }
      });

      // Add title
      const title = spec.sheet?.title || "Fire Riser Diagram";
      dxfContent += `0\nTEXT\n8\nTITLE\n10\n10.0\n20\n-100.0\n30\n0.0\n40\n5.0\n72\n0\n11\n10.0\n21\n-100.0\n31\n0.0\n1\n${title}\n`;
      dxfContent += "0\nENDSEC\n0\nEOF";

      // Download
      const blob = new Blob([dxfContent], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/\s+/g, "_")}_blocks_riser_diagram.dxf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting DXF:", error);
    }
  }, [spec, currentLayoutData]);

  return (
    <div 
      ref={containerRef}
      className="h-screen w-screen flex"
      style={{ cursor: isDragging.current ? 'col-resize' : 'default' }}
    >
      <div style={{ width: `${splitRatio}%` }} className="h-full">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={json}
          onChange={(v) => setJson(v ?? "")}
          theme="vs-dark"
          options={{ minimap: { enabled: false } }}
          className="h-full"
        />
      </div>
      
      {/* Draggable divider */}
      <div 
        className="w-2 bg-gray-300 hover:bg-blue-400 cursor-col-resize flex items-center justify-center"
        onMouseDown={handleMouseDown}
      >
        <div className="w-1 h-10 bg-gray-500 rounded"></div>
      </div>
      
      <div style={{ width: `${100 - splitRatio}%` }} className="h-full bg-gray-50 overflow-auto relative">
        {spec && (
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <button
              onClick={exportToPDF}
              className="export-button bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg transition-colors duration-200 text-sm font-medium"
            >
              Export to PDF
            </button>
            <button
              onClick={exportToDXFBlocks}
              className="export-button bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-lg transition-colors duration-200 text-sm font-medium"
            >
              Export to DXF
            </button>
          </div>
        )}
        <div className="w-full h-full flex items-center justify-center p-4">
          {spec ? (
            <Riser spec={spec} onExportDXF={handleLayoutData} />
          ) : (
            <p className="text-red-600">JSON parse error</p>
          )}
        </div>
      </div>
    </div>
  );
}
