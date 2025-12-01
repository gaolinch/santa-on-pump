const sharp = require('sharp');
const path = require('path');

async function generateOGImage() {
  const publicDir = path.join(__dirname, '../public');
  const logoPath = path.join(publicDir, 'santa-logo.png');
  const outputPath = path.join(publicDir, 'santa-og.png');

  try {
    console.log('🎅 Generating Open Graph image...');
    
    // Create a gradient background (1200x630)
    const background = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: { r: 15, g: 32, b: 39, alpha: 1 }
      }
    })
    .png()
    .toBuffer();

    // Load and resize the logo
    const logo = await sharp(logoPath)
      .resize(300, 300, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();

    // Create SVG text overlay
    const textSvg = `
      <svg width="1200" height="630">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#16a34a;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#22c55e;stop-opacity:1" />
          </linearGradient>
        </defs>
        
        <!-- Santa Title -->
        <text x="600" y="380" text-anchor="middle" font-family="Arial, sans-serif" font-size="90" font-weight="bold" fill="url(#grad1)">
          Santa
        </text>
        
        <!-- Subtitle -->
        <text x="600" y="450" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="#ffffff">
          The On-Chain Advent Calendar
        </text>
        
        <!-- Description -->
        <text x="600" y="510" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#94a3b8">
          24 Days of Crypto Gifts on Solana
        </text>
        
        <!-- Date Badge -->
        <rect x="450" y="540" width="300" height="60" rx="10" fill="none" stroke="#22c55e" stroke-width="3"/>
        <text x="600" y="580" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#22c55e">
          December 1-24, 2025
        </text>
      </svg>
    `;

    // Composite everything together
    await sharp(background)
      .composite([
        {
          input: logo,
          top: 50,
          left: 450
        },
        {
          input: Buffer.from(textSvg),
          top: 0,
          left: 0
        }
      ])
      .png()
      .toFile(outputPath);

    console.log('✅ Open Graph image generated successfully!');
    console.log(`📁 Saved to: ${outputPath}`);
    console.log('🔗 Access at: /santa-og.png');
  } catch (error) {
    console.error('❌ Error generating OG image:', error);
    process.exit(1);
  }
}

generateOGImage();


