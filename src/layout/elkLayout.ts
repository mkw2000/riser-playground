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
  console.log('elkLayout called with spec:', spec);
  
  const nodes: ElkNode[] = [];
  const edges: ElkEdge[] = [];
  
  // Add panel node
  const panelId = 'panel';
  nodes.push({
    id: panelId,
    width: SYMBOL_SIZES.FACP.width,
    height: SYMBOL_SIZES.FACP.height,
    x: spec.panel.x,
    y: spec.panel.y,
  });

  // Add device nodes with their original positions
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
  });

  // Add EOL nodes
  spec.eols?.forEach((eol, idx) => {
    const circuit = spec.circuits.find(c => c.id === eol.circuit);
    if (circuit) {
      const circuitDevices = spec.devices.filter(d => d.circuit === circuit.id);
      const lowestBottom = circuitDevices.length > 0 
        ? Math.max(...circuitDevices.map(d => d.y + (SYMBOL_SIZES[d.type]?.height || 20)))
        : 100;
      const busY = lowestBottom + 5;
      const dropLen = eol.drop || 4;
      
      nodes.push({
        id: `eol-${idx}`,
        width: SYMBOL_SIZES.EOL.width,
        height: SYMBOL_SIZES.EOL.height,
        x: eol.x - 6,
        y: busY + dropLen - 3,
      });
    }
  });

  // Create simple edges: panel to each circuit device
  spec.circuits.forEach((circuit) => {
    const circuitDevices = spec.devices
      .map((d, idx) => ({ device: d, id: `device-${idx}` }))
      .filter(({ device }) => device.circuit === circuit.id);

    // Connect panel to each device in this circuit
    circuitDevices.forEach(({ id }, idx) => {
      edges.push({
        id: `${circuit.id}-${idx}`,
        sources: [panelId],
        targets: [id],
      });
    });

    // Connect to EOL if exists
    const eol = spec.eols?.find(e => e.circuit === circuit.id);
    if (eol) {
      const eolIdx = spec.eols?.indexOf(eol) ?? 0;
      edges.push({
        id: `${circuit.id}-eol`,
        sources: [panelId],
        targets: [`eol-${eolIdx}`],
      });
    }
  });

  // Panel stubs for PANEL devices  
  const panelDevices = spec.devices
    .map((d, idx) => ({ device: d, id: `device-${idx}` }))
    .filter(({ device }) => device.circuit === 'PANEL');
  
  panelDevices.forEach(({ id }, idx) => {
    edges.push({
      id: `panel-stub-${idx}`,
      sources: [panelId],
      targets: [id],
    });
  });

  console.log('Created nodes:', nodes.length, 'edges:', edges.length);

  // Create ELK graph with fixed positions
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'org.eclipse.elk.fixed',
      'elk.edgeRouting': 'ORTHOGONAL'
    },
    children: nodes,
    edges: edges,
  };

  console.log('Calling ELK layout...');
  
  let layoutedGraph: any;
  try {
    layoutedGraph = await elk.layout(graph as any);
    console.log('ELK layout successful');
  } catch (error) {
    console.error('ELK layout failed:', error);
    throw error;
  }

  // Process results
  const result: LayoutResult = {
    nodes: new Map(),
    edges: new Map(),
  };

  // Extract node positions (should be same as input for fixed algorithm)
  layoutedGraph.children?.forEach((node: any) => {
    result.nodes.set(node.id, {
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width,
      height: node.height,
    });
  });

  // Extract edge routing
  layoutedGraph.edges?.forEach((edge: any) => {
    const circuitId = edge.id.split('-')[0];
    const circuit = spec.circuits.find(c => c.id === circuitId);
    const color = edge.id.startsWith('panel-stub') ? 'black' : (circuit?.color || 'black');

    const bendPoints: Array<{ x: number; y: number }> = [];
    
    // Get source and target nodes
    const sourceNode = result.nodes.get(edge.sources[0]);
    const targetNode = result.nodes.get(edge.targets[0]);
    
    if (sourceNode && targetNode) {
      // Simple orthogonal routing: straight down from source, then across, then down to target
      const sourceX = sourceNode.x + sourceNode.width / 2;
      const sourceY = sourceNode.y + sourceNode.height;
      const targetX = targetNode.x + targetNode.width / 2;
      const targetY = targetNode.y;
      
      // Create orthogonal path
      if (Math.abs(sourceX - targetX) > 5) {
        // Need horizontal segment
        const midY = sourceY + (targetY - sourceY) / 2;
        bendPoints.push(
          { x: sourceX, y: sourceY },
          { x: sourceX, y: midY },
          { x: targetX, y: midY },
          { x: targetX, y: targetY }
        );
      } else {
        // Direct vertical
        bendPoints.push(
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY }
        );
      }
    }

    result.edges.set(edge.id, {
      id: edge.id,
      source: edge.sources[0],
      target: edge.targets[0],
      bendPoints,
      color,
    });
  });

  console.log('Returning result with', result.nodes.size, 'nodes and', result.edges.size, 'edges');
  return result;
}