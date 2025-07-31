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

interface ElkPort {
  id: string;
  layoutOptions?: Record<string, any>;
}

interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  labels?: Array<{ text: string }>;
  layoutOptions?: Record<string, any>;
  ports?: ElkPort[];
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
  sourcePort?: string;
  targetPort?: string;
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
  HornStrobe: { width: 12, height: 18 },
  EOL: { width: 12, height: 6 },
};

export async function elkLayout(spec: LayoutSpec): Promise<LayoutResult> {
  console.log('elkLayout called with spec:', spec);
  
  const nodes: ElkNode[] = [];
  const edges: ElkEdge[] = [];
  
  // Add panel node with ports for different circuit sides
  const panelId = 'panel';
  nodes.push({
    id: panelId,
    width: SYMBOL_SIZES.FACP.width,
    height: SYMBOL_SIZES.FACP.height,
    labels: [{ text: 'FACP' }],
    ports: [
      {
        id: 'panel-left',
        layoutOptions: {
          'elk.port.side': 'WEST'
        }
      },
      {
        id: 'panel-right', 
        layoutOptions: {
          'elk.port.side': 'EAST'
        }
      },
      {
        id: 'panel-top',
        layoutOptions: {
          'elk.port.side': 'NORTH'
        }
      }
    ]
  });

  // Add device nodes
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
  spec.circuits.forEach((circuit) => {
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

  // Create series connections for each circuit using specific ports
  spec.circuits.forEach((circuit) => {
    const circuitDevices = spec.devices
      .map((d, idx) => ({ device: d, id: `device-${idx}` }))
      .filter(({ device }) => device.circuit === circuit.id);

    if (circuitDevices.length === 0) return;

    // Determine which panel port to use based on circuit type
    let panelPort = 'panel-top'; // default
    if (circuit.id.startsWith('NAC')) {
      panelPort = 'panel-left';
    } else if (circuit.id === 'SLC') {
      panelPort = 'panel-right';
    }

    // Create series connection: Panel port -> Device1 -> Device2 -> ... -> EOL
    let previousNode = panelId;
    let previousPort = panelPort;
    
    circuitDevices.forEach(({ id }, idx) => {
      const edge: any = {
        id: `${circuit.id}-${idx}`,
        sources: [previousNode],
        targets: [id],
      };
      
      // Add source port if this is the first connection from panel
      if (previousNode === panelId && previousPort) {
        edge.sourcePort = previousPort;
      }
      
      edges.push(edge);
      previousNode = id;
      previousPort = ''; // subsequent connections don't need ports
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

  // Panel stubs for PANEL devices using top port
  const panelCircuitDevices = spec.devices
    .map((d, idx) => ({ device: d, id: `device-${idx}` }))
    .filter(({ device }) => device.circuit === 'PANEL');
  
  panelCircuitDevices.forEach(({ id }, idx) => {
    edges.push({
      id: `panel-stub-${idx}`,
      sources: [panelId],
      targets: [id],
      sourcePort: 'panel-top',
    });
  });

  console.log('Created nodes:', nodes.length, 'edges:', edges.length);

  // Configure ELK for fire alarm diagram layout with directional hints
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '30',
      'elk.layered.spacing.nodeNodeBetweenLayers': '50',
      'elk.spacing.edgeNode': '20',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
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

  // Extract layout results from ELK
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
    
    if (edge.id.includes('NAC')) {
      circuitId = 'NAC1';
    } else if (edge.id.includes('SLC')) {
      circuitId = 'SLC';
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

