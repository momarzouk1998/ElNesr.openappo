const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../public/elnesr-logo.png');
const outputPath = path.join(__dirname, '../public/elnesr-logo.webp');

async function compressLogo() {
  try {
    console.log('Compressing logo...');
    console.log('Original size:', fs.statSync(inputPath).size / 1024 / 1024, 'MB');
    
    await sharp(inputPath)
      .webp({ quality: 80, effort: 6 })
      .resize(800, null, { 
        withoutEnlargement: true,
        fit: 'inside'
      })
      .toFile(outputPath);
    
    const newSize = fs.statSync(outputPath).size / 1024;
    console.log('Compressed size:', newSize, 'KB');
    console.log('Saved to:', outputPath);
  } catch (error) {
    console.error('Error compressing logo:', error);
  }
}

compressLogo();
