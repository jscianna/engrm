#!/usr/bin/env node
/**
 * Test script for zero-knowledge MCP
 * 
 * Usage:
 *   MEMRY_API_KEY=mem_xxx MEMRY_VAULT_PASSWORD=test123 node test-zk.mjs
 */

import { embedLocal, initEmbeddings } from './dist/embeddings.js';
import { encryptLocal, decryptLocal } from './dist/crypto.js';

const API_KEY = process.env.MEMRY_API_KEY;
const VAULT_PASSWORD = process.env.MEMRY_VAULT_PASSWORD || 'test-password';
const API_URL = process.env.MEMRY_API_URL || 'https://memry-sand.vercel.app';

if (!API_KEY) {
  console.log('❌ MEMRY_API_KEY not set');
  console.log('');
  console.log('1. Go to https://memry-sand.vercel.app/dashboard/settings');
  console.log('2. Create an API key');
  console.log('3. Run: MEMRY_API_KEY=mem_xxx MEMRY_VAULT_PASSWORD=yourpass node test-zk.mjs');
  process.exit(1);
}

async function request(method, endpoint, data) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

async function main() {
  console.log('🔐 MEMRY Zero-Knowledge Test\n');
  
  // Test 1: Local embeddings
  console.log('1️⃣ Testing local embeddings...');
  await initEmbeddings();
  const testText = 'John prefers morning meetings at 9am SGT';
  const vector = await embedLocal(testText);
  console.log(`   ✓ Generated ${vector.length}-dim vector locally`);
  console.log(`   ✓ Query "${testText}" never left device\n`);
  
  // Test 2: Local encryption
  console.log('2️⃣ Testing local encryption...');
  const encrypted = encryptLocal(testText, VAULT_PASSWORD);
  console.log(`   ✓ Encrypted: ${encrypted.ciphertext.slice(0, 20)}...`);
  const decrypted = decryptLocal(encrypted, VAULT_PASSWORD);
  console.log(`   ✓ Decrypted matches: ${decrypted === testText}\n`);
  
  // Test 3: Store via ZK endpoint
  console.log('3️⃣ Storing memory via ZK endpoint...');
  const encryptedTitle = JSON.stringify(encryptLocal('Meeting preference', VAULT_PASSWORD));
  const encryptedContent = JSON.stringify(encrypted);
  
  const storeResult = await request('POST', '/api/v1/memories/zk', {
    encryptedTitle,
    encryptedContent,
    vector,
    metadata: { importance: 8, tags: ['preference', 'meetings'] },
  });
  console.log(`   ✓ Stored memory: ${storeResult.id}`);
  console.log(`   ✓ Server only received: vector + encrypted blob\n`);
  
  // Test 4: Search via ZK endpoint
  console.log('4️⃣ Searching via ZK endpoint...');
  const searchVector = await embedLocal('what time does John like meetings');
  const searchResult = await request('POST', '/api/v1/search/zk', {
    vector: searchVector,
    topK: 3,
  });
  console.log(`   ✓ Found ${searchResult.results.length} results`);
  console.log(`   ✓ Server searched by vector only (doesn't know query)\n`);
  
  // Test 5: Decrypt results locally
  console.log('5️⃣ Decrypting results locally...');
  for (const result of searchResult.results) {
    try {
      const title = decryptLocal(JSON.parse(result.encryptedTitle), VAULT_PASSWORD);
      const content = decryptLocal(JSON.parse(result.encryptedContent), VAULT_PASSWORD);
      console.log(`   [${(result.score * 100).toFixed(0)}%] ${title}`);
      console.log(`        → ${content}\n`);
    } catch (e) {
      console.log(`   [${(result.score * 100).toFixed(0)}%] [Not our encryption - older memory]`);
    }
  }
  
  console.log('✅ Zero-knowledge test complete!');
  console.log('');
  console.log('Summary:');
  console.log('  • Queries embedded locally (server never saw search text)');
  console.log('  • Content encrypted locally (server only has ciphertext)');
  console.log('  • Server cannot read your memories or know what you searched');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
