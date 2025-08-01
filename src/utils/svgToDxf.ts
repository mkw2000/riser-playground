// Client-side SVG to DXF conversion
// This is a simplified converter that handles basic shapes

interface Point {
  x: number;
  y: number;
}

export function convertSvgToDxf(svgString: string): string {
  // Parse SVG
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = svgDoc.querySelector('svg');
  
  if (!svg) {
    throw new Error('Invalid SVG');
  }

  // Get viewBox or dimensions
  const viewBox = svg.getAttribute('viewBox');
  let width = 1000, height = 1000;
  
  if (viewBox) {
    const [, , w, h] = viewBox.split(' ').map(Number);
    width = w;
    height = h;
  } else {
    width = parseFloat(svg.getAttribute('width') || '1000');
    height = parseFloat(svg.getAttribute('height') || '1000');
  }

  // Start DXF content
  let dxf = '';
  
  // DXF Header
  dxf += '0\nSECTION\n2\nHEADER\n';
  dxf += '9\n$ACADVER\n1\nAC1014\n';
  dxf += '9\n$INSBASE\n10\n0.0\n20\n0.0\n30\n0.0\n';
  dxf += '9\n$EXTMIN\n10\n0.0\n20\n0.0\n30\n0.0\n';
  dxf += `9\n$EXTMAX\n10\n${width}\n20\n${height}\n30\n0.0\n`;
  dxf += '0\nENDSEC\n';

  // Tables section
  dxf += '0\nSECTION\n2\nTABLES\n';
  dxf += '0\nTABLE\n2\nLTYPE\n70\n1\n';
  dxf += '0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n';
  dxf += '0\nENDTAB\n';
  dxf += '0\nTABLE\n2\nLAYER\n70\n1\n';
  dxf += '0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n';
  dxf += '0\nENDTAB\n';
  dxf += '0\nENDSEC\n';

  // Entities section
  dxf += '0\nSECTION\n2\nENTITIES\n';

  // Process SVG elements
  const elements = svg.querySelectorAll('line, polyline, circle, rect, path, text');
  
  elements.forEach((element) => {
    switch (element.tagName.toLowerCase()) {
      case 'line':
        dxf += convertLine(element as SVGLineElement);
        break;
      case 'polyline':
        dxf += convertPolyline(element as SVGPolylineElement);
        break;
      case 'circle':
        dxf += convertCircle(element as SVGCircleElement);
        break;
      case 'rect':
        dxf += convertRect(element as SVGRectElement);
        break;
      case 'text':
        dxf += convertText(element as SVGTextElement);
        break;
      case 'path':
        // Simplified path handling - convert to polylines
        dxf += convertPath(element as SVGPathElement);
        break;
    }
  });

  dxf += '0\nENDSEC\n0\nEOF';
  
  return dxf;
}

function convertLine(line: SVGLineElement): string {
  const x1 = parseFloat(line.getAttribute('x1') || '0');
  const y1 = parseFloat(line.getAttribute('y1') || '0');
  const x2 = parseFloat(line.getAttribute('x2') || '0');
  const y2 = parseFloat(line.getAttribute('y2') || '0');
  
  return `0\nLINE\n8\n0\n10\n${x1}\n20\n${-y1}\n30\n0.0\n11\n${x2}\n21\n${-y2}\n31\n0.0\n`;
}

function convertPolyline(polyline: SVGPolylineElement): string {
  const points = polyline.getAttribute('points') || '';
  const pointPairs = points.trim().split(/\s+/).map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
  
  if (pointPairs.length < 2) return '';
  
  let dxf = '';
  for (let i = 0; i < pointPairs.length - 1; i++) {
    const p1 = pointPairs[i];
    const p2 = pointPairs[i + 1];
    dxf += `0\nLINE\n8\n0\n10\n${p1.x}\n20\n${-p1.y}\n30\n0.0\n11\n${p2.x}\n21\n${-p2.y}\n31\n0.0\n`;
  }
  
  return dxf;
}

function convertCircle(circle: SVGCircleElement): string {
  const cx = parseFloat(circle.getAttribute('cx') || '0');
  const cy = parseFloat(circle.getAttribute('cy') || '0');
  const r = parseFloat(circle.getAttribute('r') || '0');
  
  return `0\nCIRCLE\n8\n0\n10\n${cx}\n20\n${-cy}\n30\n0.0\n40\n${r}\n`;
}

function convertRect(rect: SVGRectElement): string {
  const x = parseFloat(rect.getAttribute('x') || '0');
  const y = parseFloat(rect.getAttribute('y') || '0');
  const width = parseFloat(rect.getAttribute('width') || '0');
  const height = parseFloat(rect.getAttribute('height') || '0');
  
  // Convert rectangle to 4 lines
  let dxf = '';
  dxf += `0\nLINE\n8\n0\n10\n${x}\n20\n${-y}\n30\n0.0\n11\n${x + width}\n21\n${-y}\n31\n0.0\n`;
  dxf += `0\nLINE\n8\n0\n10\n${x + width}\n20\n${-y}\n30\n0.0\n11\n${x + width}\n21\n${-(y + height)}\n31\n0.0\n`;
  dxf += `0\nLINE\n8\n0\n10\n${x + width}\n20\n${-(y + height)}\n30\n0.0\n11\n${x}\n21\n${-(y + height)}\n31\n0.0\n`;
  dxf += `0\nLINE\n8\n0\n10\n${x}\n20\n${-(y + height)}\n30\n0.0\n11\n${x}\n21\n${-y}\n31\n0.0\n`;
  
  return dxf;
}

function convertText(text: SVGTextElement): string {
  const x = parseFloat(text.getAttribute('x') || '0');
  const y = parseFloat(text.getAttribute('y') || '0');
  const content = text.textContent || '';
  const fontSize = parseFloat(getComputedStyle(text).fontSize || '12');
  
  return `0\nTEXT\n8\n0\n10\n${x}\n20\n${-y}\n30\n0.0\n40\n${fontSize}\n1\n${content}\n`;
}

function convertPath(path: SVGPathElement): string {
  // This is a simplified path converter
  // For complex paths, you'd need a full SVG path parser
  const d = path.getAttribute('d') || '';
  
  // Extract points from simple paths (M and L commands only)
  const points: Point[] = [];
  const commands = d.match(/[ML]\s*[\d\.\-,\s]+/g) || [];
  
  commands.forEach(cmd => {
    const parts = cmd.match(/[\d\.\-]+/g) || [];
    for (let i = 0; i < parts.length; i += 2) {
      points.push({
        x: parseFloat(parts[i]),
        y: parseFloat(parts[i + 1] || '0')
      });
    }
  });
  
  let dxf = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    dxf += `0\nLINE\n8\n0\n10\n${p1.x}\n20\n${-p1.y}\n30\n0.0\n11\n${p2.x}\n21\n${-p2.y}\n31\n0.0\n`;
  }
  
  return dxf;
}