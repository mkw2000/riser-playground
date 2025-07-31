import { chromium } from 'playwright';

async function testElkRouting() {
  console.log('🧪 Starting comprehensive ELK routing tests...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture layout results via console hooks
  let layoutResults = null;
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Browser error:', msg.text());
    } else if (msg.text().includes('ELK layout completed')) {
      console.log('✅ Layout completed:', msg.text());
    } else if (msg.text().includes('Compiling DSL to ELK graph')) {
      console.log('📝 Using DSL compiler');
    } else {
      // Try to parse layout results from console
      try {
        const text = msg.text();
        if (text.includes('layout completed with')) {
          console.log('📊', text);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  });
  
  page.on('pageerror', error => {
    console.log('❌ Page error:', error.message);
  });
  
  try {
    console.log('📋 Test 1: App loading...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000); // Give extra time for layout completion
    
    const loadingText = await page.textContent('body');
    
    if (loadingText.includes('Loading layout...')) {
      console.log('❌ Still showing "Loading layout..." - ELK failed to load');
      return false;
    } else if (loadingText.includes('ELK Layout Error')) {
      console.log('❌ ELK Layout Error found');
      return false;
    }
    console.log('✅ App loaded successfully');
    
    const svg = await page.$('svg');
    if (!svg) {
      console.log('❌ No SVG found');
      return false;
    }
    console.log('✅ SVG found - app is rendering');
    
    // Count routing paths
    const polylines = await page.$$('polyline');
    console.log(`✅ Found ${polylines.length} polylines (routing paths)`);
    
    console.log('📋 Test 2: DSL format detection...');
    // Check if the editor contains DSL format content
    const editorContent = await page.evaluate(() => {
      const editor = window.monaco?.editor?.getEditors()[0];
      return editor ? editor.getValue() : '';
    });
    
    const isDSLFormat = editorContent.includes('"panel":') && editorContent.includes('"ports":');
    console.log(`✅ Format detected: ${isDSLFormat ? 'DSL' : 'Legacy'}`);
    
    console.log('📋 Test 3: Basic test setup...');
    await page.goto('http://localhost:5174/?debugGrid=1');
    await page.waitForTimeout(2000);
    
    const debugRects = await page.$$('rect[stroke="blue"], rect[stroke="red"]');
    console.log(`✅ Debug mode shows ${debugRects.length} debug rectangles`);
    
    console.log('📋 Test 4: Loading DSL example...');
    // Load the DSL example
    const dslExample = {
      sheet: { 
        title: "TEST FLOOR", 
        laneGap: 28 
      },
      panel: {
        id: "FACP",
        ports: [
          { id: "SLC", side: "WEST", label: "SLC" },
          { id: "NAC1", side: "EAST", label: "NAC 1" }
        ]
      },
      circuits: [
        {
          id: "SLC",
          from: { panel: "FACP", port: "SLC" },
          orientation: "WEST",
          spacing: 36,
          devices: [
            { type: "Smoke" }, { type: "Smoke" }, { type: "Pull" }
          ],
          endcap: { type: "EOL", value: "75Ω" }
        },
        {
          id: "NAC1",
          from: { panel: "FACP", port: "NAC1" },
          orientation: "EAST", 
          spacing: 36,
          devices: [
            { type: "HornStrobe" }, { type: "HornStrobe" }
          ],
          endcap: { type: "EOL", value: "75Ω" }
        }
      ],
      symbols: {
        Smoke: { w: 18, h: 18 },
        Pull: { w: 14, h: 14 },
        HornStrobe: { w: 22, h: 16 },
        EOL: { w: 18, h: 12 }
      }
    };
    
    await page.evaluate((spec) => {
      const editor = window.monaco?.editor?.getEditors()[0];
      if (editor) {
        editor.setValue(JSON.stringify(spec, null, 2));
      }
    }, dslExample);
    
    await page.waitForTimeout(3000); // Wait for layout to recalculate
    
    console.log('✅ DSL example loaded');
    
    console.log('📋 Test 5: Basic layout validation...');
    const currentPolylines = await page.$$('polyline');
    console.log(`✅ Layout generated ${currentPolylines.length} polylines`);
    
    if (currentPolylines.length < 2) {
      console.log('❌ Expected at least 2 polylines, got', currentPolylines.length);
      return false;
    }
    
    console.log('📋 Test 6: Geometry assertions for SLC circuit...');
    // Check if SLC routes left from panel
    const slcFound = false;
    let panelX = 0;
    
    // Extract polyline points for SLC edge
    const slcEdgePoints = await page.evaluate(() => {
      const polylines = Array.from(document.querySelectorAll('polyline'));
      const slcPolyline = polylines.find(p => p.id && p.id.includes('SLC'));
      if (!slcPolyline) return null;
      
      const points = slcPolyline.getAttribute('points').split(' ');
      return points.map(point => {
        const [x, y] = point.split(',').map(Number);
        return { x, y };
      });
    });
    
    if (!slcEdgePoints) {
      console.log('❌ Could not find SLC edge polyline');
      return false;
    }
    
    if (slcEdgePoints.length > 1) {
      const startPoint = slcEdgePoints[0];
      const firstBendPoint = slcEdgePoints[1];
      
      console.log(`📍 SLC edge start: (${startPoint.x}, ${startPoint.y})`);
      console.log(`📍 SLC first bend: (${firstBendPoint.x}, ${firstBendPoint.y})`);
      
      if (firstBendPoint.x > startPoint.x) {
        console.log('❌ SLC first bend should be left (lower x) from panel, but x increased');
        return false;
      } else {
        console.log('✅ SLC routes left from panel (x decreased)');
      }
    }
    
    console.log('📋 Test 7: Geometry assertions for NAC1 circuit...');
    // Check if NAC1 routes right from panel  
    const nacEdgePoints = await page.evaluate(() => {
      const polylines = Array.from(document.querySelectorAll('polyline'));
      const nacPolyline = polylines.find(p => p.id && p.id.includes('NAC'));
      if (!nacPolyline) return null;
      
      const points = nacPolyline.getAttribute('points').split(' ');
      return points.map(point => {
        const [x, y] = point.split(',').map(Number);
        return { x, y };
      });
    });
    
    if (!nacEdgePoints) {
      console.log('❌ Could not find NAC1 edge polyline');
      return false;
    }
    
    if (nacEdgePoints.length > 1) {
      const startPoint = nacEdgePoints[0];
      const firstBendPoint = nacEdgePoints[1];
      
      console.log(`📍 NAC1 edge start: (${startPoint.x}, ${startPoint.y})`);
      console.log(`📍 NAC1 first bend: (${firstBendPoint.x}, ${firstBendPoint.y})`);
      
      if (firstBendPoint.x < startPoint.x) {
        console.log('❌ NAC1 first bend should be right (higher x) from panel, but x decreased');
        return false;
      } else {
        console.log('✅ NAC1 routes right from panel (x increased)');
      }
    }
    
    console.log('📋 Test 8: Device and EOL rendering...');
    const symbols = await page.$$('g > rect, g > circle, g > polygon, g > polyline');
    console.log(`✅ Found ${symbols.length} symbol elements`);
    
    if (symbols.length < 8) { // Should have at least panel + 3 devices + 2 EOLs
      console.log('❌ Expected more symbols, got', symbols.length);
      return false;
    }
    
    console.log('📋 Test 9: Lane spacing verification...');
    // Verify lanes are vertically spaced appropriately
    const yCoordinates = [];
    for (let i = 0; i < currentPolylines.length; i++) {
      const points = await page.evaluate((index) => {
        const polylines = Array.from(document.querySelectorAll('polyline'));
        const polyline = polylines[index];
        if (!polyline) return [];
        
        const points = polyline.getAttribute('points').split(' ');
        return points.map(point => parseFloat(point.split(',')[1])); // Just y coordinates
      }, i);
      yCoordinates.push(...points);
    }
    
    const uniqueYCoords = [...new Set(yCoordinates)].sort((a, b) => a - b);
    console.log(`✅ Found ${uniqueYCoords.length} unique y-coordinates`);
    
    if (uniqueYCoords.length > 3) {
      const avgSpacing = uniqueYCoords.reduce((sum, y, i) => {
        if (i === 0) return sum;
        return sum + (y - uniqueYCoords[i - 1]);
      }, 0) / (uniqueYCoords.length - 1);
      
      console.log(`📊 Average lane spacing: ${avgSpacing.toFixed(2)}px`);
      if (avgSpacing < 20 || avgSpacing > 40) {
        console.log(`⚠️  Lane spacing ${avgSpacing} seems unusual (expected ~28px)`);
      } else {
        console.log('✅ Lane spacing looks reasonable');
      }
    }
    
    console.log('🎉 All tests passed! ✅');
    return true;
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

// Run the test
testElkRouting().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});