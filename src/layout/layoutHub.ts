import { compileDSLToELK, DSLSpec } from './dslCompiler';
import { elkLayout, LayoutSpec } from './elkLayout';

export type { LayoutResult, CompilerResult } from './elkLayout';
export type { DSLSpec } from './dslCompiler';

// Type guard to check if a spec uses the new DSL format
function isDSLSpec(spec: unknown): spec is DSLSpec {
  const specObj = spec as { panel?: unknown; circuits?: unknown };
  const panel = specObj.panel as { ports?: unknown };
  const circuits = specObj.circuits as Array<unknown>;
  const firstCircuit = circuits && circuits.length > 0 ? circuits[0] as { from?: unknown } : null;
  const circuitFrom = firstCircuit?.from as { panel?: unknown; port?: unknown };
  
  return Boolean(panel?.ports && Array.isArray(panel.ports) &&
         circuits && Array.isArray(circuits) &&
         circuits.length > 0 &&
         firstCircuit?.from &&
         circuitFrom?.panel &&
         circuitFrom?.port);
}

// Composite layout function that handles both old and new formats
export async function layout(spec: LayoutSpec | DSLSpec) {
  if (isDSLSpec(spec)) {
    // Use new DSL compiler
    return compileDSLToELK(spec);
  } else {
    // Use existing ELK layout
    return elkLayout(spec as LayoutSpec);
  }
}

// Export individual layouts for those who need them
export { elkLayout as legacyLayout };
export { compileDSLToELK as dslLayout };