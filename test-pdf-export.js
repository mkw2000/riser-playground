import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_URL = 'http://localhost:5174/';
const DOWNLOAD_DIR = path.join(__dirname, 'test-downloads');
const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');

// Ensure directories exist
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

class PDFExportTester {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.testResults = {
      initialLoad: null,
      diagramLoad: null,
      exportTrigger: null,
      downloadSuccess: null,
      pdfQuality: null,
      performance: null,
      errors: []
    };
  }

  async setup() {
    console.log('🚀 Setting up browser and context...');
    
    this.browser = await chromium.launch({ 
      headless: true, // Running in headless mode for better stability
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    
    this.context = await this.browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1920, height: 1080 }
    });
    
    this.page = await this.context.newPage();
    
    // Set up console logging
    this.page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        this.testResults.errors.push({
          type: type,
          text: msg.text(),
          timestamp: new Date().toISOString()
        });
        console.log(`📝 Console ${type}: ${msg.text()}`);
      }
    });
    
    // Set up error handling
    this.page.on('pageerror', error => {
      this.testResults.errors.push({
        type: 'pageerror',
        text: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      console.error('❌ Page error:', error.message);
    });
    
    // Set up network monitoring
    this.page.on('response', response => {
      if (!response.ok()) {
        console.log(`🌐 Network error: ${response.status()} ${response.url()}`);
      }
    });
  }

  async testInitialLoad() {
    console.log('📱 Testing initial application load...');
    const startTime = Date.now();
    
    try {
      await this.page.goto(TEST_URL, { waitUntil: 'networkidle' });
      
      // Take screenshot of initial state
      await this.page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '01-initial-load.png'),
        fullPage: true 
      });
      
      // Check if main elements are present
      const editor = await this.page.locator('.monaco-editor').first();
      const diagram = await this.page.locator('svg').first();
      
      await editor.waitFor({ timeout: 10000 });
      console.log('✅ Monaco editor loaded');
      
      await diagram.waitFor({ timeout: 10000 });
      console.log('✅ SVG diagram container loaded');
      
      const loadTime = Date.now() - startTime;
      this.testResults.initialLoad = {
        success: true,
        loadTime: loadTime,
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ Initial load successful (${loadTime}ms)`);
      
    } catch (error) {
      this.testResults.initialLoad = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      console.error('❌ Initial load failed:', error.message);
      throw error;
    }
  }

  async testDiagramLoad() {
    console.log('🎨 Testing diagram rendering and content...');
    
    try {
      // Wait for ELK layout to complete
      await this.page.waitForFunction(() => {
        const loadingElements = Array.from(document.querySelectorAll('div')).filter(
          el => el.textContent && el.textContent.includes('Loading layout...')
        );
        return loadingElements.length === 0;
      }, { timeout: 15000 });
      
      // Wait for diagram elements to be rendered
      await this.page.waitForSelector('svg g.symbols', { timeout: 10000 });
      await this.page.waitForSelector('svg g.wires', { timeout: 10000 });
      
      // Take screenshot showing JSON editor and visual diagram
      await this.page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '02-diagram-loaded.png'),
        fullPage: true 
      });
      
      // Check for specific diagram elements
      const symbols = await this.page.locator('svg g.symbols > *').count();
      const wires = await this.page.locator('svg g.wires > *').count();
      const title = await this.page.locator('svg text').first();
      
      console.log(`✅ Found ${symbols} symbols and ${wires} wire elements`);
      
      // Verify title is present
      const titleText = await title.textContent();
      console.log(`✅ Diagram title: "${titleText}"`);
      
      // Check for Export button
      const exportButton = await this.page.locator('button:has-text("Export to PDF")');
      await exportButton.waitFor({ timeout: 5000 });
      console.log('✅ Export to PDF button found');
      
      this.testResults.diagramLoad = {
        success: true,
        symbolCount: symbols,
        wireCount: wires,
        title: titleText,
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ Diagram load test completed successfully');
      
    } catch (error) {
      this.testResults.diagramLoad = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      console.error('❌ Diagram load test failed:', error.message);
      throw error;
    }
  }

  async testPDFExport() {
    console.log('📄 Testing PDF export functionality...');
    
    try {
      const exportStartTime = Date.now();
      
      // Set up download promise before clicking
      const downloadPromise = this.page.waitForEvent('download', { timeout: 30000 });
      
      // Take screenshot before export
      await this.page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '03-before-export.png'),
        fullPage: true 
      });
      
      // Click the Export to PDF button
      const exportButton = await this.page.locator('button:has-text("Export to PDF")');
      await exportButton.click();
      console.log('✅ Export button clicked');
      
      // Take screenshot after clicking (might show loading state)
      await this.page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '04-export-triggered.png'),
        fullPage: true 
      });
      
      // Wait for download to start
      const download = await downloadPromise;
      const exportTime = Date.now() - exportStartTime;
      
      console.log(`✅ Download initiated (${exportTime}ms)`);
      console.log(`📁 Download filename: ${download.suggestedFilename()}`);
      
      // Save the downloaded file
      const downloadPath = path.join(DOWNLOAD_DIR, download.suggestedFilename() || 'exported-diagram.pdf');
      await download.saveAs(downloadPath);
      
      // Verify file exists and has content
      const stats = fs.statSync(downloadPath);
      const fileSizeKB = Math.round(stats.size / 1024);
      
      console.log(`✅ PDF saved: ${downloadPath}`);
      console.log(`📊 File size: ${fileSizeKB} KB`);
      
      this.testResults.exportTrigger = {
        success: true,
        exportTime: exportTime,
        timestamp: new Date().toISOString()
      };
      
      this.testResults.downloadSuccess = {
        success: true,
        filename: download.suggestedFilename(),
        filePath: downloadPath,
        fileSize: stats.size,
        fileSizeKB: fileSizeKB,
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ PDF export test completed successfully');
      return downloadPath;
      
    } catch (error) {
      this.testResults.exportTrigger = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      this.testResults.downloadSuccess = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      console.error('❌ PDF export test failed:', error.message);
      throw error;
    }
  }

  async testPDFQuality(pdfPath) {
    console.log('🔍 Testing PDF quality and completeness...');
    
    try {
      // Basic file validation
      const stats = fs.statSync(pdfPath);
      
      // Check if file is not empty
      if (stats.size === 0) {
        throw new Error('PDF file is empty');
      }
      
      // Check if file starts with PDF header
      const buffer = fs.readFileSync(pdfPath);
      const header = buffer.toString('ascii', 0, 4);
      
      if (header !== '%PDF') {
        throw new Error('File does not appear to be a valid PDF');
      }
      
      // Basic size validation (should be reasonable for a diagram)
      const minSizeKB = 10; // Minimum reasonable size
      const maxSizeMB = 50; // Maximum reasonable size
      const sizeKB = stats.size / 1024;
      const sizeMB = sizeKB / 1024;
      
      if (sizeKB < minSizeKB) {
        console.warn(`⚠️ PDF file seems small (${Math.round(sizeKB)}KB)`);
      }
      
      if (sizeMB > maxSizeMB) {
        console.warn(`⚠️ PDF file seems large (${Math.round(sizeMB)}MB)`);
      }
      
      // Check for PDF structure
      const content = buffer.toString('ascii');
      const hasObjects = content.includes('/Type /Catalog') || content.includes('obj');
      const hasStream = content.includes('stream');
      
      this.testResults.pdfQuality = {
        success: true,
        validHeader: header === '%PDF',
        fileSize: stats.size,
        hasObjects: hasObjects,
        hasStream: hasStream,
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ PDF quality validation passed');
      console.log(`📋 Valid PDF header: ${header === '%PDF'}`);
      console.log(`📋 Contains objects: ${hasObjects}`);
      console.log(`📋 Contains streams: ${hasStream}`);
      
    } catch (error) {
      this.testResults.pdfQuality = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      console.error('❌ PDF quality test failed:', error.message);
      throw error;
    }
  }

  async testPerformance() {
    console.log('⚡ Testing export performance...');
    
    try {
      const iterations = 3;
      const times = [];
      
      for (let i = 0; i < iterations; i++) {
        console.log(`⚡ Performance test iteration ${i + 1}/${iterations}`);
        
        const startTime = Date.now();
        const downloadPromise = this.page.waitForEvent('download', { timeout: 30000 });
        
        const exportButton = await this.page.locator('button:has-text("Export to PDF")');
        await exportButton.click();
        
        const download = await downloadPromise;
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        times.push(duration);
        console.log(`⚡ Iteration ${i + 1} completed in ${duration}ms`);
        
        // Clean up download
        const tempPath = path.join(DOWNLOAD_DIR, `perf-test-${i + 1}.pdf`);
        await download.saveAs(tempPath);
        
        // Wait a bit between iterations
        await this.page.waitForTimeout(1000);
      }
      
      const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      this.testResults.performance = {
        success: true,
        iterations: iterations,
        times: times,
        averageTime: avgTime,
        minTime: minTime,
        maxTime: maxTime,
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ Performance test completed`);
      console.log(`📊 Average time: ${avgTime}ms`);
      console.log(`📊 Min time: ${minTime}ms`);
      console.log(`📊 Max time: ${maxTime}ms`);
      
    } catch (error) {
      this.testResults.performance = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      console.error('❌ Performance test failed:', error.message);
    }
  }

  async testErrorScenarios() {
    console.log('🚨 Testing error scenarios...');
    
    try {
      // Test with invalid JSON
      console.log('🚨 Testing with invalid JSON...');
      
      const editor = await this.page.locator('.monaco-editor').first();
      await editor.click();
      
      // Clear and enter invalid JSON
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.type('{ invalid json');
      
      await this.page.waitForTimeout(2000);
      
      // Try to export (should either fail gracefully or not be available)
      const exportButton = await this.page.locator('button:has-text("Export to PDF")');
      const isEnabled = await exportButton.isEnabled();
      
      if (isEnabled) {
        console.log('⚠️ Export button still enabled with invalid JSON');
      } else {
        console.log('✅ Export button properly disabled with invalid JSON');
      }
      
      // Take screenshot of error state
      await this.page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '05-invalid-json-test.png'),
        fullPage: true 
      });
      
      // Restore valid JSON
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.type(`{
  "sheet": { "title": "TEST FLOOR" },
  "circuits": [
    { "id": "SLC",  "class": "B", "color": "black" },
    { "id": "NAC1", "class": "B", "color": "black" }
  ],
  "devices": [
    { "type": "Cell",  "circuit": "PANEL" },
    { "type": "HornStrobe", "circuit": "NAC1" },
    { "type": "Smoke", "circuit": "SLC" },
    { "type": "Pull",  "circuit": "SLC" }
  ],
  "eols": [
    { "circuit": "NAC1" },
    { "circuit": "SLC" }
  ]
}`);
      
      // Wait for diagram to reload
      await this.page.waitForTimeout(3000);
      
      console.log('✅ Error scenario testing completed');
      
    } catch (error) {
      console.error('❌ Error scenario testing failed:', error.message);
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    if (this.page) {
      await this.page.close();
    }
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  generateReport() {
    console.log('\n📊 COMPREHENSIVE TEST REPORT 📊');
    console.log('=' .repeat(50));
    
    const report = {
      testSuite: 'PDF Export Functionality',
      timestamp: new Date().toISOString(),
      testUrl: TEST_URL,
      results: this.testResults
    };
    
    // Print summary
    console.log('\n📋 TEST SUMMARY:');
    console.log(`Initial Load: ${this.testResults.initialLoad?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Diagram Load: ${this.testResults.diagramLoad?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Export Trigger: ${this.testResults.exportTrigger?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Download Success: ${this.testResults.downloadSuccess?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`PDF Quality: ${this.testResults.pdfQuality?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Performance: ${this.testResults.performance?.success ? '✅ PASS' : '❌ FAIL'}`);
    
    // Print performance details
    if (this.testResults.performance?.success) {
      console.log('\n⚡ PERFORMANCE METRICS:');
      console.log(`Average Export Time: ${this.testResults.performance.averageTime}ms`);
      console.log(`Fastest Export: ${this.testResults.performance.minTime}ms`);
      console.log(`Slowest Export: ${this.testResults.performance.maxTime}ms`);
    }
    
    // Print file details
    if (this.testResults.downloadSuccess?.success) {
      console.log('\n📁 FILE DETAILS:');
      console.log(`Filename: ${this.testResults.downloadSuccess.filename}`);
      console.log(`File Size: ${this.testResults.downloadSuccess.fileSizeKB} KB`);
      console.log(`File Path: ${this.testResults.downloadSuccess.filePath}`);
    }
    
    // Print errors
    if (this.testResults.errors.length > 0) {
      console.log('\n🚨 ERRORS ENCOUNTERED:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. [${error.type}] ${error.text}`);
      });
    }
    
    // Save detailed report
    const reportPath = path.join(__dirname, 'pdf-export-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📋 Detailed report saved: ${reportPath}`);
    
    // Print final status
    const overallSuccess = [
      this.testResults.initialLoad?.success,
      this.testResults.diagramLoad?.success,
      this.testResults.exportTrigger?.success,
      this.testResults.downloadSuccess?.success,
      this.testResults.pdfQuality?.success
    ].every(Boolean);
    
    console.log('\n' + '=' .repeat(50));
    console.log(`🎯 OVERALL TEST STATUS: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('=' .repeat(50));
    
    return report;
  }

  async runFullTestSuite() {
    console.log('🚀 Starting comprehensive PDF export test suite...\n');
    
    try {
      await this.setup();
      await this.testInitialLoad();
      await this.testDiagramLoad();
      
      const pdfPath = await this.testPDFExport();
      await this.testPDFQuality(pdfPath);
      await this.testPerformance();
      await this.testErrorScenarios();
      
    } catch (error) {
      console.error('💥 Test suite encountered a critical error:', error.message);
    } finally {
      await this.cleanup();
      return this.generateReport();
    }
  }
}

// Run the test suite
async function main() {
  const tester = new PDFExportTester();
  await tester.runFullTestSuite();
}

// Execute if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default PDFExportTester;