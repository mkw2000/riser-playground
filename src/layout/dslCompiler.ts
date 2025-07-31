import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

// DSL Schema Interfaces
interface DSLSheet {
  title: string;
  laneGap?: number;
}

interface DSLPanel {
  id: string;
  ports: DSLPort[];
}

interface DSLPort {
  id: string;
  side: 'WEST' | 'EAST' | 'NORTH' | 'SOUTH';
  label: string;
}

interface DSLCircuit {
  id: string;
  from: { panel: string; port: string };
  orientation: 'WEST' | 'EAST';
  spacing: number;
  devices: { type: string }[];
  endcap: { type: string; value?: string };
}

interface DSLSymbols {
  [key: string]: { w: number; h: number };
}

export interface DSLSpec {
  sheet: DSLSheet;
  panel: DSLPanel;
  circuits: DSLCircuit[];
  symbols: DSLSymbols;
}

// ELK Graph Interfaces
interface ElkPort {
  id: string;
  layoutOptions?: Record<string, unknown>;
}

interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  labels?: Array<{ text: string }>;
  layoutOptions?: Record<string, unknown>;
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

export interface CompilerResult {
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

// Symbol sizes from existing App.tsx and DSL symbols
export async function compileDSLToELK(dslSpec: DSLSpec): Promise<CompilerResult> {
  console.log('Compiling DSL to ELK graph:', dslSpec);
  
  const nodes: ElkNode[] = [];
  const edges: ElkEdge[] = [];
  
  // Create panel node with fixed ports
  const panelId = dslSpec.panel.id;
  const panelPorts: ElkPort[] = dslSpec.panel.ports.map(port => ({
    id: `${panelId}.${port.id}`,
    layoutOptions: {
      'elk.port.side': port.side,
      'elk.portConstraints': 'FIXED_SIDE'
    }
  }));
  
  // Get panel size - using FACP size from existing symbols
  const panelSize = { width: 40, height: 20 };
  
  nodes.push({
    id: panelId,
    width: panelSize.width,
    height: panelSize.height,
    labels: [{ text: 'FACP' }],
    ports: panelPorts,
    layoutOptions: {
      'elk.partitioning.partition': 1, // Center partition
      'elk.portConstraints': 'FIXED_SIDE'
    }
  });

  // Process each circuit and create device chain directly
  dslSpec.circuits.forEach((circuit) => {
    const isLeftLane = circuit.orientation === 'WEST';
    const partition = isLeftLane ? 0 : 2; // Left or right partition
    
    let prevNodeId = panelId;
    let prevPort = `${panelId}.${circuit.from.port}`;
    
    // Create device nodes in chain
    circuit.devices.forEach((device, deviceIndex) => {
      const deviceId = `circuit-${circuit.id}-device-${deviceIndex}`;
      const symbolSize = dslSpec.symbols[device.type] || { w: 20, h: 20 };
      
      nodes.push({
        id: deviceId,
        width: symbolSize.w,
        height: symbolSize.h,
        labels: [{ text: device.type }],
        layoutOptions: {
          'elk.partitioning.partition': partition
        }
      });

      // Create edge from previous node/device to this device
      edges.push({
        id: `edge-${circuit.id}-${deviceIndex}`,
        sources: [prevNodeId],
        targets: [deviceId],
        sourcePort: prevPort
      });
      
      prevNodeId = deviceId;
      prevPort = ''; // No port for next connections
    });

    // Create endcap device
    const endcap = circuit.endcap;
    const endcapId = `circuit-${circuit.id}-endcap`;
    const endcapSize = dslSpec.symbols[endcap.type] || { w: 20, h: 20 };
    
    nodes.push({
      id: endcapId,
      width: endcapSize.w,
      height: endcapSize.h,
      labels: [{ text: endcap.type + ' ' + (endcap.value || '') }],
      layoutOptions: {
        'elk.partitioning.partition': partition
      }
    });

    // Connect last device to endcap
    edges.push({
      id: `edge-${circuit.id}-endcap`,
      sources: [prevNodeId],
      targets: [endcapId],
    });
  });

  // Configure root layout with partitioning and spacing
  const laneGap = dslSpec.sheet.laneGap || 28;
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNode': laneGap.toString(),
      'elk.layered.spacing.nodeNodeBetweenLayers': '36',
      'elk.spacing.edgeNode': '20',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.partitioning.activate': 'true',
      'elk.layered.compaction.strategy': 'EDGE_LENGTH',
    },
    children: nodes,
    edges: edges,
  };

  console.log('Compiling ELK graph with options:', graph.layoutOptions);

  interface LayoutNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface LayoutEdge {
  id: string;
  sources?: string[];
  targets?: string[];
  sections?: Array<{
    startPoint?: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
    endPoint?: { x: number; y: number };
  }>;
}

interface LayoutGraph {
  children?: LayoutNode[];
  edges?: LayoutEdge[];
}

let layoutedGraph: LayoutGraph;
  try {
    layoutedGraph = await elk.layout(graph) as LayoutGraph;
    console.log('ELK layout successful');
  } catch (error) {
    console.error('ELK layout failed:', error);
    throw error;
  }

  // Extract results
  const result: CompilerResult = {
    nodes: new Map(),
    edges: new Map(),
  };

  // Extract all node positions
  layoutedGraph.children?.forEach((node: LayoutNode) => {
    result.nodes.set(node.id, {
      x: node.x || 0,
      y: node.y || 0,
      width: node.width || 20,
      height: node.height || 20,
    });
  });

  // Extract edges with bend points
  layoutedGraph.edges?.forEach((edge: LayoutEdge) => {
    const bendPoints: Array<{ x: number; y: number }> = [];
    
    if (edge.sections && edge.sections.length > 0) {
      edge.sections.forEach((section: {
        startPoint?: { x: number; y: number };
        bendPoints?: Array<{ x: number; y: number }>;
        endPoint?: { x: number; y: number };
      }) => {
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

    // Determine circuit ID from edge ID
    let circuitId = 'unknown';
    if (edge.id.includes('SLC')) {
      circuitId = 'SLC';
    } else if (edge.id.includes('NAC')) {
      circuitId = 'NAC';
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

  console.log('DSL compilation completed with', result.nodes.size, 'nodes and', result.edges.size, 'edges');
  return result;
}