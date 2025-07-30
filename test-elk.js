import { chromium } from 'playwright';

async function testElkRouting() {
  console.log('Starting Playwright test...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Listen for console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Browser error:', msg.text());
    } else {
      console.log('📝 Browser log:', msg.text());
    }
  });
  
  // Listen for page errors
  page.on('pageerror', error => {
    console.log('❌ Page error:', error.message);
  });
  
  try {
    console.log('Navigating to localhost:5174...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    
    // Wait for the app to load
    await page.waitForTimeout(3000);
    
    // Check if we see "Loading layout..." or an error
    const loadingText = await page.textContent('body');
    
    if (loadingText.includes('Loading layout...')) {
      console.log('❌ Still showing "Loading layout..." - ELK failed to load');
    } else if (loadingText.includes('ELK Layout Error')) {
      console.log('❌ ELK Layout Error found');
      const errorText = await page.textContent('body');
      console.log('Error details:', errorText);
    } else {
      console.log('✅ App loaded successfully - no loading or error messages');
      
      // Check if SVG exists
      const svg = await page.$('svg');
      if (svg) {
        console.log('✅ SVG found - app is rendering');
        
        // Count polylines (should be the routed paths)
        const polylines = await page.$$('polyline');
        console.log(`✅ Found ${polylines.length} polylines (routing paths)`);
        
        // Check debug mode
        await page.goto('http://localhost:5174/?debugGrid=1');
        await page.waitForTimeout(1000);
        
        const debugRects = await page.$$('rect[stroke="blue"], rect[stroke="red"]');
        console.log(`✅ Debug mode shows ${debugRects.length} debug rectangles`);
        
      } else {
        console.log('❌ No SVG found');
      }
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

testElkRouting();