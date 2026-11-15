#!/usr/bin/env node
/** Print which model providers and tools the super-agent can use right now. */
import { agentStatus } from './loop.js';

const status = agentStatus();
console.log(JSON.stringify(status, null, 2));
if (!status.ready) {
  console.log('\nNo provider configured. Fastest free fixes:');
  console.log('  1. GEMINI_API_KEY   https://aistudio.google.com/apikey');
  console.log('  2. GROQ_API_KEY     https://console.groq.com/keys');
  console.log('  3. install Ollama and run: ollama pull qwen2.5-coder:7b');
  process.exitCode = 1;
}
