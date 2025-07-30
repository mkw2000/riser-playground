import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

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

interface LayoutSpec {
  sheet: { title: string };
  panel?: { x: number; y: number };
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


interface LayoutResult {
  nodes: Map<string, { x: number; y: number; width: number; height: number }>;
  edges: Map<string, { 
    id: string;
    source: string;
    target: string;
    bendPoints: Array<{ x: number; y: number }>;
    color: string;
    circuitId: string;
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
  console.log('elkLayout called with spec:', spec);
  
  const nodes: ElkNode[] = [];
  const edges: ElkEdge[] = [];
  
  // Add panel node (no manual positioning)
  const panelId = 'panel';
  nodes.push({
    id: panelId,
    width: SYMBOL_SIZES.FACP.width,
    height: SYMBOL_SIZES.FACP.height,
  });

  // Add device nodes (no manual positioning)
  spec.devices.forEach((device, idx) => {
    const nodeId = `device-${idx}`;
    const size = SYMBOL_SIZES[device.type] || { width: 20, height: 20 };
    nodes.push({
      id: nodeId,
      width: size.width,
      height: size.height,
      labels: [{ text: device.type }],
    });
  });

  // Add EOL nodes for each circuit
  spec.circuits.forEach((circuit, idx) => {
    const eol = spec.eols?.find(e => e.circuit === circuit.id);
    if (eol) {
      nodes.push({
        id: `eol-${circuit.id}`,
        width: SYMBOL_SIZES.EOL.width,
        height: SYMBOL_SIZES.EOL.height,
        labels: [{ text: 'EOL' }],
      });
    }
  });

  // Create circuit-based edges (devices in series)
  spec.circuits.forEach((circuit) => {
    const circuitDevices = spec.devices
      .map((d, idx) => ({ device: d, id: `device-${idx}` }))
      .filter(({ device }) => device.circuit === circuit.id);

    if (circuitDevices.length === 0) return;

    // Create series connection: Panel -> Device1 -> Device2 -> ... -> EOL
    let previousNode = panelId;
    
    circuitDevices.forEach(({ id }, idx) => {
      edges.push({
        id: `${circuit.id}-${idx}`,
        sources: [previousNode],
        targets: [id],
      });
      previousNode = id;
    });

    // Connect last device to EOL if exists
    const eol = spec.eols?.find(e => e.circuit === circuit.id);
    if (eol) {
      edges.push({
        id: `${circuit.id}-eol`,
        sources: [previousNode],
        targets: [`eol-${circuit.id}`],
      });
    }
  });

  // Panel stubs for PANEL devices
  const panelCircuitDevices = spec.devices
    .map((d, idx) => ({ device: d, id: `device-${idx}` }))
    .filter(({ device }) => device.circuit === 'PANEL');
  
  panelCircuitDevices.forEach(({ id }, idx) => {
    edges.push({
      id: `panel-stub-${idx}`,
      sources: [panelId],
      targets: [id],
    });
  });

  console.log('Created nodes:', nodes.length, 'edges:', edges.length);

  // Configure ELK for fire alarm diagram layout
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '30',
      'elk.layered.spacing.nodeNodeBetweenLayers': '40',
      'elk.spacing.edgeNode': '15',
    },
    children: nodes,
    edges: edges,
  };

  console.log('Calling ELK layout with graph:', graph);
  
  let layoutedGraph: any;
  try {
    layoutedGraph = await elk.layout(graph as any);
    console.log('ELK layout successful:', layoutedGraph);
  } catch (error) {
    console.error('ELK layout failed:', error);
    throw error;
  }

  // Use ELK's calculated positions and edge routing
  const result: LayoutResult = {
    nodes: new Map(),
    edges: new Map(),
  };

  // Extract node positions from ELK results
  layoutedGraph.children?.forEach((node: any) => {
    result.nodes.set(node.id, {
      x: node.x || 0,
      y: node.y || 0,
      width: node.width || 20,
      height: node.height || 20,
    });
  });

  // Extract edge routing from ELK results
  layoutedGraph.edges?.forEach((edge: any) => {
    const bendPoints: Array<{ x: number; y: number }> = [];
    
    // Add edge sections as bend points
    if (edge.sections && edge.sections.length > 0) {
      edge.sections.forEach((section: any) => {
        if (section.startPoint) {
          bendPoints.push({ x: section.startPoint.x, y: section.startPoint.y });
        }
        if (section.bendPoints) {
          bendPoints.push(...section.bendPoints);
        }
        if (section.endPoint) {
          bendPoints.push({ x: section.endPoint.x, y: section.endPoint.y });
        }
      });
    }

    // Find circuit info for styling
    let circuitId = 'unknown';
    let dashArray;
    
    if (edge.id.includes('NAC')) {
      circuitId = 'NAC1';
      dashArray = '3,2'; // Dashed for NAC circuits
    } else if (edge.id.includes('SLC')) {
      circuitId = 'SLC';
      // SLC uses solid lines (no dashArray)
    } else if (edge.id.includes('panel-stub')) {
      circuitId = 'PANEL';
    }

    result.edges.set(edge.id, {
      id: edge.id,
      source: edge.sources?.[0] || '',
      target: edge.targets?.[0] || '',
      bendPoints: bendPoints,
      color: 'black',
      circuitId: circuitId,
    });
  });

  console.log('ELK layout completed with', result.nodes.size, 'nodes and', result.edges.size, 'edges');
  return result;
}

// Fallback manual layout function
function createManualLayout(spec: LayoutSpec): LayoutResult {
  console.log('Creating manual fallback layout');
  
  const result: LayoutResult = {
    nodes: new Map(),
    edges: new Map(),
  };

  // Add panel node
  result.nodes.set('panel', {
    x: spec.panel.x,
    y: spec.panel.y,
    width: SYMBOL_SIZES.FACP.width,
    height: SYMBOL_SIZES.FACP.height,
  });

  // Add device nodes
  spec.devices.forEach((device, idx) => {
    const size = SYMBOL_SIZES[device.type] || { width: 20, height: 20 };
    result.nodes.set(`device-${idx}`, {
      x: device.x,
      y: device.y,
      width: size.width,
      height: size.height,
    });
  });

  // Simple direct connections as fallback
  spec.circuits.forEach((circuit) => {
    const circuitDevices = spec.devices
      .filter(device => device.circuit === circuit.id);

    circuitDevices.forEach((device, idx) => {
      const deviceIdx = spec.devices.indexOf(device);
      const panelX = spec.panel.x + SYMBOL_SIZES.FACP.width / 2;
      const panelY = spec.panel.y + SYMBOL_SIZES.FACP.height;
      const deviceX = device.x + (SYMBOL_SIZES[device.type]?.width || 20) / 2;
      const deviceY = device.y;

      result.edges.set(`${circuit.id}-${idx}`, {
        id: `${circuit.id}-${idx}`,
        source: 'panel',
        target: `device-${deviceIdx}`,
        bendPoints: [
          { x: panelX, y: panelY },
          { x: deviceX, y: deviceY }
        ],
        color: circuit.color,
        circuitId: circuit.id,
      });
    });
  });

  return result;
}