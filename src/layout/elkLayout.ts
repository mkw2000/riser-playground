import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

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

interface LayoutSpec {
  sheet: { title: string };
  panel: { x: number; y: number };
  circuits: Circuit[];
  devices: Device[];
  eols: EOL[];
}

interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  labels?: Array<{ text: string }>;
}

interface ElkEdgeSection {
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  bendPoints?: Array<{ x: number; y: number }>;
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: Array<{ text: string }>;
  sections?: ElkEdgeSection[];
}

interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
}

interface LayoutResult {
  nodes: Map<string, { x: number; y: number; width: number; height: number }>;
  edges: Map<string, { 
    id: string;
    source: string;
    target: string;
    bendPoints: Array<{ x: number; y: number }>;
    color: string;
  }>;
}

const SYMBOL_SIZES: Record<string, { width: number; height: number }> = {
  FACP: { width: 40, height: 20 },
  Cell: { width: 30, height: 15 },
  Smoke: { width: 14, height: 14 },
  Pull: { width: 12, height: 12 },
  EOL: { width: 12, height: 6 },
};

export async function elkLayout(spec: LayoutSpec): Promise<LayoutResult> {
  const nodes: ElkNode[] = [];
  const edges: ElkEdge[] = [];
  const nodeIdMap = new Map<string, Device | { type: string; x: number; y: number; circuit?: string }>();
  
  // Add panel as a node
  const panelId = 'panel';
  nodes.push({
    id: panelId,
    width: SYMBOL_SIZES.FACP.width,
    height: SYMBOL_SIZES.FACP.height,
    x: spec.panel.x,
    y: spec.panel.y,
  });
  nodeIdMap.set(panelId, { type: 'FACP', x: spec.panel.x, y: spec.panel.y });

  // Add virtual bus nodes for each circuit at their calculated Y positions
  const busNodes = new Map<string, string>();
  spec.circuits.forEach((circuit) => {
    const circuitDevices = spec.devices.filter(d => d.circuit === circuit.id);
    if (circuitDevices.length > 0) {
      const lowestBottom = Math.max(
        ...circuitDevices.map(d => d.y + (SYMBOL_SIZES[d.type]?.height || 20))
      );
      const busY = lowestBottom + 5;
      const busNodeId = `bus-${circuit.id}`;
      busNodes.set(circuit.id, busNodeId);
      
      // Add invisible bus node spanning the width of devices
      const minX = Math.min(...circuitDevices.map(d => d.x));
      const maxX = Math.max(...circuitDevices.map(d => d.x));
      nodes.push({
        id: busNodeId,
        width: maxX - minX + 100, // Extra width for connections
        height: 1,
        x: minX - 50,
        y: busY,
      });
    }
  });

  // Add all devices as nodes
  spec.devices.forEach((device, idx) => {
    const nodeId = `device-${idx}`;
    const size = SYMBOL_SIZES[device.type] || { width: 20, height: 20 };
    nodes.push({
      id: nodeId,
      width: size.width,
      height: size.height,
      x: device.x,
      y: device.y,
    });
    nodeIdMap.set(nodeId, device);
  });

  // Add EOLs as nodes at their bus positions
  spec.eols.forEach((eol, idx) => {
    const circuit = spec.circuits.find(c => c.id === eol.circuit);
    if (circuit) {
      const circuitDevices = spec.devices.filter(d => d.circuit === circuit.id);
      if (circuitDevices.length > 0) {
        const lowestBottom = Math.max(
          ...circuitDevices.map(d => d.y + (SYMBOL_SIZES[d.type]?.height || 20))
        );
        const busY = lowestBottom + 5;
        const dropLen = eol.drop || 4;
        
        const nodeId = `eol-${idx}`;
        nodes.push({
          id: nodeId,
          width: SYMBOL_SIZES.EOL.width,
          height: SYMBOL_SIZES.EOL.height,
          x: eol.x - 6,
          y: busY + dropLen - 3,
        });
        nodeIdMap.set(nodeId, { type: 'EOL', x: eol.x, y: busY + dropLen, circuit: eol.circuit });
      }
    }
  });

  // Create edges for each circuit
  spec.circuits.forEach((circuit) => {
    const busNodeId = busNodes.get(circuit.id);
    if (!busNodeId) return;

    const circuitDevices = spec.devices
      .map((d, idx) => ({ device: d, id: `device-${idx}` }))
      .filter(({ device }) => device.circuit === circuit.id)
      .sort((a, b) => a.device.x - b.device.x);

    if (circuitDevices.length > 0) {
      // Panel to bus
      edges.push({
        id: `${circuit.id}-panel-to-bus`,
        sources: [panelId],
        targets: [busNodeId],
      });

      // Bus to each device
      circuitDevices.forEach((cd, idx) => {
        edges.push({
          id: `${circuit.id}-bus-to-dev-${idx}`,
          sources: [busNodeId],
          targets: [cd.id],
        });
      });

      // Bus to EOL if exists
      const eol = spec.eols.find(e => e.circuit === circuit.id);
      if (eol) {
        const eolIdx = spec.eols.indexOf(eol);
        edges.push({
          id: `${circuit.id}-bus-to-eol`,
          sources: [busNodeId],
          targets: [`eol-${eolIdx}`],
        });
      }
    }
  });

  // Panel stubs for PANEL circuit devices
  const panelDevices = spec.devices
    .map((d, idx) => ({ device: d, id: `device-${idx}` }))
    .filter(({ device }) => device.circuit === 'PANEL');
  
  panelDevices.forEach((pd, idx) => {
    edges.push({
      id: `panel-stub-${idx}`,
      sources: [panelId],
      targets: [pd.id],
    });
  });

  // Configure ELK with fixed positions
  const graph: ElkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'fixed',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '0',
      'elk.spacing.edgeNode': '0',
      'elk.layered.spacing.edgeNodeBetweenLayers': '0',
      'elk.org.eclipse.elk.fixed.insets': '0',
    },
    children: nodes.map(node => ({
      ...node,
      layoutOptions: {
        'elk.position': `(${node.x},${node.y})`,
      }
    })),
    edges: edges,
  };

  // Run ELK layout
  const layoutedGraph = await elk.layout(graph as any) as any;

  // Process results
  const result: LayoutResult = {
    nodes: new Map(),
    edges: new Map(),
  };

  // Extract node positions
  layoutedGraph.children?.forEach((node: any) => {
    result.nodes.set(node.id, {
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width,
      height: node.height,
    });
  });

  // Extract edge routing with bend points
  layoutedGraph.edges?.forEach((edge: any) => {
    const circuitId = edge.id.split('-')[0];
    const circuit = spec.circuits.find(c => c.id === circuitId) || 
                   spec.circuits.find(c => edge.id.includes(c.id));
    const color = edge.id.startsWith('panel-stub') ? 'black' : (circuit?.color || 'black');

    const bendPoints: Array<{ x: number; y: number }> = [];
    
    // Get source and target positions
    const sourceNode = result.nodes.get(edge.sources[0]);
    const targetNode = result.nodes.get(edge.targets[0]);
    
    if (sourceNode && targetNode) {
      // Add source connection point
      bendPoints.push({
        x: sourceNode.x + sourceNode.width / 2,
        y: sourceNode.y + sourceNode.height
      });

      // Add ELK bend points if available
      if ((edge as any).sections && (edge as any).sections.length > 0) {
        const section = (edge as any).sections[0];
        if (section.bendPoints) {
          bendPoints.push(...section.bendPoints);
        }
      }

      // Add target connection point
      bendPoints.push({
        x: targetNode.x + targetNode.width / 2,
        y: targetNode.y
      });
    }

    result.edges.set(edge.id, {
      id: edge.id,
      source: edge.sources[0],
      target: edge.targets[0],
      bendPoints,
      color,
    });
  });

  return result;
}