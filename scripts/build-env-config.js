#!/usr/bin/env node
/**
 * Build script: Generate env-config.json with client-side environment variables
 * Run by Vercel during build
 */

const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'public');
const outputFile = path.join(outputDir, 'env-config.json');

// Variables to expose to the client (non-sensitive only)
const envConfig = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  // IMPORTANT: NEVER expose SUPABASE_JWT_SECRET or LLM_API_KEY to client
};

// Ensure public directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write env-config.json
fs.writeFileSync(outputFile, JSON.stringify(envConfig, null, 2));

console.log('✓ Generated env-config.json');
console.log(`  SUPABASE_URL: ${envConfig.SUPABASE_URL ? '✓ set' : '✗ missing'}`);
console.log(`  SUPABASE_ANON_KEY: ${envConfig.SUPABASE_ANON_KEY ? '✓ set' : '✗ missing'}`);

// Verify sensitive variables are NOT exposed
if (process.env.SUPABASE_JWT_SECRET) {
  // Just verify it's not written to the file
  const content = fs.readFileSync(outputFile, 'utf8');
  if (content.includes(process.env.SUPABASE_JWT_SECRET)) {
    console.error('✗ CRITICAL: SUPABASE_JWT_SECRET leaked to client!');
    process.exit(1);
  }
  console.log('✓ SUPABASE_JWT_SECRET: safely kept server-side');
}

if (process.env.LLM_API_KEY) {
  const content = fs.readFileSync(outputFile, 'utf8');
  if (content.includes(process.env.LLM_API_KEY)) {
    console.error('✗ CRITICAL: LLM_API_KEY leaked to client!');
    process.exit(1);
  }
  console.log('✓ LLM_API_KEY: safely kept server-side');
}

console.log('✓ Build successful: env-config.json created');
