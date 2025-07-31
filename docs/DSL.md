# Fire-Riser DSL Specification v0

The Fire-Riser DSL (Domain Specific Language) provides a simple, declarative way to define fire alarm riser diagrams with deterministic circuit orientation and automatic layout.

## Overview

The DSL uses JSON format to describe:
- Panel configuration with fixed port sides
- Circuit lanes with specific orientation (WEST/EAST)
- Device chains with configurable spacing
- End of line (EOL) terminations
- Symbol definitions

## Core Schema

```typescript
interface DSLSpec {
  sheet: { 
    title: string; 
    laneGap?: number;  // Vertical spacing between lanes (default: 28px)
  };
  panel: {
    id: string;  // Panel identifier (typically "FACP")
    ports: DSLPort[];
  };
  circuits: DSLCircuit[];
  symbols: DSLSymbols;
}

interface DSLPort {
  id: string;                           // Port identifier (e.g., "SLC", "NAC1")
  side: 'WEST' | 'EAST' | 'NORTH' | 'SOUTH';  // Fixed side placement
  label: string;                        // Display label
}

interface DSLCircuit {
  id: string;
  from: { 
    panel: string;   // Panel ID
    port: string    // Port ID on panel
  };
  orientation: 'WEST' | 'EAST';        // Circuit direction from panel
  spacing: number;                     // Spacing between devices in this circuit
  devices: { type: string }[];         // Chain of devices
  endcap: { 
    type: string;                      // End device type (typically "EOL")
    value?: string;                    // Optional display value
  };
}

interface DSLSymbols {
  [key: string]: {
    w: number;  // Width in pixels
    h: number;  // Height in pixels
  };
}
```

## Circuit Orientation Rules

### SLC (Signaling Line Circuit)
- **Must leave on the WEST side**
- Routes horizontally to the left from the FACP
- Devices are spaced according to `circuit.spacing`
- Ends with EOL resistor

### NAC (Notification Appliance Circuit)  
- **Must leave on the EAST side**
- Routes horizontally to the right from the FACP
- Devices are spaced according to `circuit.spacing`
- Ends with EOL resistor

## Example 1: Basic Configuration

```json
{
  "sheet": { 
    "title": "FIRST FLOOR", 
    "laneGap": 28 
  },
  "panel": {
    "id": "FACP",
    "ports": [
      { "id": "SLC",  "side": "WEST", "label": "SLC" },
      { "id": "NAC1", "side": "EAST", "label": "NAC 1" }
    ]
  },
  "circuits": [
    {
      "id": "SLC",
      "from": { "panel": "FACP", "port": "SLC" },
      "orientation": "WEST",
      "spacing": 36,
      "devices": [
        { "type": "Smoke" }, 
        { "type": "Smoke" }, 
        { "type": "Pull" }
      ],
      "endcap": { 
        "type": "EOL", 
        "value": "75Ω" 
      }
    },
    {
      "id": "NAC1",
      "from": { "panel": "FACP", "port": "NAC1" },
      "orientation": "EAST",
      "spacing": 36,
      "devices": [
        { "type": "HornStrobe" }, 
        { "type": "HornStrobe" }
      ],
      "endcap": { 
        "type": "EOL", 
        "value": "75Ω" 
      }
    }
  ],
  "symbols": {
    "Smoke":      { "w": 18, "h": 18 },
    "Pull":       { "w": 14, "h": 14 },
    "HornStrobe": { "w": 22, "h": 16 },
    "EOL":        { "w": 18, "h": 12 }
  }
}
```

This produces:
- FACP panel centered at top
- SLC circuit with 2 smoke detectors and 1 pull station routed left
- NAC1 circuit with 2 horn strobes routed right  
- 75Ω EOL resistors at end of each circuit
- 28px vertical spacing between circuit lanes

## Example 2: Multi-Building Complex

```json
{
  "sheet": { 
    "title": "OFFICE TOWER - FLOOR 42", 
    "laneGap": 30 
  },
  "panel": {
    "id": "FACP-MAIN",
    "ports": [
      { "id": "SLC_A", "side": "WEST", "label": "SLC A-ZONE" },
      { "id": "SLC_B", "side": "WEST", "label": "SLC B-ZONE" },
      { "id": "NAC1",  "side": "EAST", "label": "NAC WING A" },
      { "id": "NAC2",  "side": "EAST", "label": "NAC WING B" }
    ]
  },
  "circuits": [
    {
      "id": "SLC_A",
      "from": { "panel": "FACP-MAIN", "port": "SLC_A" },
      "orientation": "WEST",
      "spacing": 40,
      "devices": [
        { "type": "Smoke" },
        { "type": "Smoke" },
        { "type": "Smoke" },
        { "type": "Heat" },
        { "type": "Pull" },
        { "type": "Smoke" }
      ],
      "endcap": { "type": "EOL", "value": "75Ω" }
    },
    {
      "id": "SLC_B", 
      "from": { "panel": "FACP-MAIN", "port": "SLC_B" },
      "orientation": "WEST",
      "spacing": 40,
      "devices": [
        { "type": "Smoke" },
        { "type": "Pull" },
        { "type": "Smoke" },
        { "type": "Heat" }
      ],
      "endcap": { "type": "EOL", "value": "75Ω" }
    },
    {
      "id": "NAC1",
      "from": { "panel": "FACP-MAIN", "port": "NAC1" },
      "orientation": "EAST",
      "spacing": 32,
      "devices": [
        { "type": "HornStrobe" },
        { "type": "HornStrobe" },
        { "type": "Horn" },
        { "type": "Strobe" },
        { "type": "HornStrobe" }
      ],
      "endcap": { "type": "EOL", "value": "75Ω" }
    },
    {
      "id": "NAC2",
      "from": { "panel": "FACP-MAIN", "port": "NAC2" },
      "orientation": "EAST",
      "spacing": 32,
      "devices": [
        { "type": "HornStrobe" },
        { "type": "HornStrobe" },
        { "type": "HornStrobe" }
      ],
      "endcap": { "type": "EOL", "value": "75Ω" }
    }
  ],
  "symbols": {
    "Smoke":      { "w": 18, "h": 18 },
    "Heat":       { "w": 16, "h": 16 },
    "Pull":       { "w": 14, "h": 14 },
    "HornStrobe": { "w": 22, "h": 16 },
    "Horn":       { "w": 20, "h": 14 },
    "Strobe":     { "w": 18, "h": 14 },
    "EOL":        { "w": 18, "h": 12 }
  }
}
```

This demonstrates:
- Multiple circuits on each side (2x SLC on WEST, 2x NAC on EAST)
- Custom device types (Heat, Horn, Strobe)
- Consistent vertical spacing (30px) between lanes
- Varying device spacing per circuit (40px for SLC, 32px for NAC)
- Complex device chains with 4-6 devices each

## Layout Algorithm

The DSL compiler uses the following process:

1. **Panel Creation**: Creates FACP panel with fixed WEST/EAST ports
2. **Partition Assignment**: 
   - WEST circuits → Left partition (position 0)
   - Panel → Center partition (position 1) 
   - EAST circuits → Right partition (position 2)
3. **Device Chaining**: Creates linear chains of devices connected by edges
4. **ELK Layout**: Uses partitioning to ensure proper left/right placement
5. **Edge Routing**: Generates orthogonal paths with proper bend points

### ELK Configuration
```typescript
layoutOptions: {
  'elk.algorithm': 'org.eclipse.elk.layered',
  'elk.direction': 'RIGHT',
  'elk.partitioning.activate': 'true',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.spacing.nodeNode': '28',         // laneGap from sheet
  'elk.layered.spacing.nodeNodeBetweenLayers': '36'  // Circuit spacing
}
```

## Symbol Mapping

The DSL symbols map to the existing SVG components:

| DSL Type | SVG Component | Default Size |
|----------|---------------|---------------|
| Smoke | Smoke detector circle with "S" | 18×18 |
| Pull | Square with "F" (Fire) | 14×14 |
| Heat | Square with "H" | 16×16 |
| Horn | Horn symbol | 20×14 |
| Strobe | Strobe symbol | 18×14 |
| HornStrobe | Combined horn & strobe | 22×16 |
| EOL | Resistor zigzag | 18×12 |

## Validation Rules

The DSL processor validates:

1. **Port Side Consistency**: SLC must use WEST, NAC must use EAST
2. **Circuit References**: circuit.from.port must exist in panel.ports
3. **Symbol Definitions**: All device types must exist in symbols section
4. **Orientation Matching**: circuit.orientation must match port.side
5. **Unique IDs**: All circuit IDs must be unique

## Migration from Legacy Format

To convert from the old format to DSL:

**Old Format:**
```json
{
  "sheet": { "title": "FIRST FLOOR" },
  "circuits": [
    { "id": "SLC", "class": "B", "color": "black" },
    { "id": "NAC1", "class": "B", "color": "black" }
  ],
  "devices": [
    { "type": "Smoke", "circuit": "SLC", "x": 40, "y": 110 },
    { "type": "HornStrobe", "circuit": "NAC1", "x": 150, "y": 110 }
  ],
  "eols": [
    { "circuit": "NAC1" },
    { "circuit": "SLC" }
  ]
}
```

**New DSL Format:**
```json
{
  "sheet": { "title": "FIRST FLOOR" },
  "panel": {
    "id": "FACP",
    "ports": [
      { "id": "SLC", "side": "WEST", "label": "SLC" },
      { "id": "NAC1", "side": "EAST", "label": "NAC 1" }
    ]
  },
  "circuits": [
    { "id": "SLC", "from": { "panel": "FACP", "port": "SLC" },
      "orientation": "WEST", "spacing": 36,
      "devices": [{ "type": "Smoke" }],
      "endcap": { "type": "EOL", "value": "75Ω" }
    },
    { "id": "NAC1", "from": { "panel": "FACP", "port": "NAC1" },
      "orientation": "EAST", "spacing": 36,
      "devices": [{ "type": "HornStrobe" }],
      "endcap": { "type": "EOL", "value": "75Ω" }
    }
  ],
  "symbols": { ... }
}
```

## Benefits over Legacy Format

1. **Deterministic Orientation**: Guaranteed SLC left, NAC right placement
2. **No Manual Coordinates**: Automatic layout eliminates x, y positioning
3. **Clear Circuit Structure**: Devices grouped in logical circuits
4. **Consistent Spacing**: Configurable spacing per circuit type
5. **Visual Organization**: Lane-based layout with vertical separation
6. **Easier Editing**: Text-based rather than coordinate-based

## Testing

The test suite includes geometry assertions to verify:
- SLC circuits route left (first bend x-coordinate < panel.x)
- NAC circuits route right (first bend x-coordinate > panel.x + panel.width)
- Proper vertical lane spacing (~28px default)
- All symbols render correctly
- Endcaps appear at circuit endpoints

Run tests: `pnpm test`