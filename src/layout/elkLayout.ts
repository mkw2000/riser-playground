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

  // Add device nodes
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

  // Create edges with proper sections
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

  // Try the simplest possible ELK configuration
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': 'DOWN'
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
    
    // Fallback: return manual layout if ELK fails
    console.log('Falling back to manual layout');
    return createManualLayout(spec);
  }

  // Instead of using ELK routing results, create proper circuit buses manually
  const result: LayoutResult = {
    nodes: new Map(),
    edges: new Map(),
  };

  // Use original positions for nodes (ignore ELK positioning)
  result.nodes.set('panel', {
    x: spec.panel.x,
    y: spec.panel.y,
    width: SYMBOL_SIZES.FACP.width,
    height: SYMBOL_SIZES.FACP.height,
  });

  spec.devices.forEach((device, idx) => {
    const size = SYMBOL_SIZES[device.type] || { width: 20, height: 20 };
    result.nodes.set(`device-${idx}`, {
      x: device.x,
      y: device.y,
      width: size.width,
      height: size.height,
    });
  });

  spec.eols?.forEach((eol, idx) => {
    const circuit = spec.circuits.find(c => c.id === eol.circuit);
    if (circuit) {
      const circuitDevices = spec.devices.filter(d => d.circuit === circuit.id);
      const lowestBottom = circuitDevices.length > 0 
        ? Math.max(...circuitDevices.map(d => d.y + (SYMBOL_SIZES[d.type]?.height || 20)))
        : 100;
      const busY = lowestBottom + 5;
      const dropLen = eol.drop || 4;
      
      result.nodes.set(`eol-${idx}`, {
        x: eol.x - 6,
        y: busY + dropLen - 3,
        width: SYMBOL_SIZES.EOL.width,
        height: SYMBOL_SIZES.EOL.height,
      });
    }
  });

  // Create proper circuit bus routing manually
  spec.circuits.forEach((circuit) => {
    const circuitDevices = spec.devices
      .filter(device => device.circuit === circuit.id)
      .sort((a, b) => a.x - b.x);

    if (circuitDevices.length === 0) return;

    // Calculate bus Y level
    const lowestBottom = Math.max(
      ...circuitDevices.map(d => d.y + (SYMBOL_SIZES[d.type]?.height || 20))
    );
    const busY = lowestBottom + 5;
    const panelX = spec.panel.x + SYMBOL_SIZES.FACP.width / 2;
    const panelY = spec.panel.y + SYMBOL_SIZES.FACP.height;

    // Create complete bus path
    const busPoints: Array<{ x: number; y: number }> = [];
    
    // Start from panel
    busPoints.push({ x: panelX, y: panelY });
    busPoints.push({ x: panelX, y: busY });
    
    // Go to first device
    const firstDeviceX = circuitDevices[0].x + (SYMBOL_SIZES[circuitDevices[0].type]?.width || 20) / 2;
    busPoints.push({ x: firstDeviceX, y: busY });
    
    // Connect all devices
    for (let i = 0; i < circuitDevices.length; i++) {
      const device = circuitDevices[i];
      const deviceX = device.x + (SYMBOL_SIZES[device.type]?.width || 20) / 2;
      const deviceY = device.y;

      // If not first device, add horizontal segment
      if (i > 0) {
        busPoints.push({ x: deviceX, y: busY });
      }

      // Add vertical drop to device
      busPoints.push({ x: deviceX, y: deviceY });
      // Return to bus
      busPoints.push({ x: deviceX, y: busY });
    }

    // Connect to EOL if exists
    const eol = spec.eols?.find(e => e.circuit === circuit.id);
    if (eol) {
      const dropLen = eol.drop || 4;
      busPoints.push({ x: eol.x, y: busY });
      busPoints.push({ x: eol.x, y: busY + dropLen });
    }

    // Create single bus edge
    result.edges.set(`${circuit.id}-bus`, {
      id: `${circuit.id}-bus`,
      source: 'panel',
      target: eol ? `eol-${spec.eols?.indexOf(eol) ?? 0}` : `device-${spec.devices.indexOf(circuitDevices[circuitDevices.length - 1])}`,
      bendPoints: busPoints,
      color: circuit.color,
    });
  });

  // Panel stubs for PANEL devices
  const directPanelDevices = spec.devices.filter(d => d.circuit === 'PANEL');
  directPanelDevices.forEach((device, idx) => {
    const panelX = spec.panel.x + SYMBOL_SIZES.FACP.width / 2;
    const panelY = spec.panel.y + SYMBOL_SIZES.FACP.height;
    const deviceX = device.x + (SYMBOL_SIZES[device.type]?.width || 20) / 2;
    const deviceY = device.y;

    result.edges.set(`panel-stub-${idx}`, {
      id: `panel-stub-${idx}`,
      source: 'panel',
      target: `device-${spec.devices.indexOf(device)}`,
      bendPoints: [
        { x: panelX, y: panelY },
        { x: panelX, y: deviceY },
        { x: deviceX, y: deviceY }
      ],
      color: 'black',
    });
  });

  console.log('Manual circuit buses created with', result.nodes.size, 'nodes and', result.edges.size, 'edges');
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
      });
    });
  });

  return result;
}