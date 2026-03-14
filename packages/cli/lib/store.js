import chalk from 'chalk';
import { storeMemory } from './api.js';

export async function store(text, options) {
  const apiKey = options.key || process.env.FATHIPPO_API_KEY;
  
  if (!apiKey) {
    console.log(chalk.red('No API key provided.'));
    console.log(chalk.dim('Set FATHIPPO_API_KEY or use --key <key>'));
    return;
  }
  
  const title = options.title || text.slice(0, 50) + (text.length > 50 ? '...' : '');
  
  try {
    const result = await storeMemory(title, text, apiKey);
    console.log(chalk.green('✅ Memory stored'));
    console.log(chalk.dim(`   ID: ${result.memory.id}`));
    console.log(chalk.dim(`   Title: ${result.memory.title}`));
  } catch (err) {
    console.log(chalk.red(`❌ Failed: ${err.message}`));
  }
}
