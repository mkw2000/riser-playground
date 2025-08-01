// Quick test to verify the Vector Express API connectivity
import fetch from 'node-fetch';

const testSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect x="10" y="10" width="80" height="80" fill="red"/>
  <circle cx="50" cy="50" r="20" fill="blue"/>
</svg>`;

console.log('Testing Vector Express API...');
console.log('SVG size:', testSVG.length, 'characters');

// Test getting conversion options
fetch('https://vector.express/api/v2/public/convert/svg/auto/dxf')
  .then(res => res.json())
  .then(data => {
    console.log('\nAPI Response:', JSON.stringify(data, null, 2));
    
    if (Array.isArray(data)) {
      console.log('\nAvailable converters:');
      data.forEach(opt => {
        console.log(`- ${opt.prog}: ${opt.path}`);
      });
      console.log('\n✅ Vector Express API is accessible!');
    } else {
      console.log('\n✅ Vector Express API is accessible!');
      console.log('Response type:', typeof data);
    }
  })
  .catch(err => {
    console.error('❌ Error fetching conversion options:', err.message);
  });