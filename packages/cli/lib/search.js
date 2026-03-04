import chalk from 'chalk';
import { searchMemories } from './api.js';

export async function search(query, options) {
  const apiKey = options.key || process.env.ENGRM_API_KEY;
  
  if (!apiKey) {
    console.log(chalk.red('No API key provided.'));
    console.log(chalk.dim('Set ENGRM_API_KEY or use --key <key>'));
    return;
  }
  
  try {
    const results = await searchMemories(query, apiKey, parseInt(options.limit));
    
    if (results.length === 0) {
      console.log(chalk.yellow('No memories found.'));
      return;
    }
    
    console.log(chalk.cyan(`\n🔍 Found ${results.length} memories:\n`));
    
    for (const result of results) {
      const score = (result.score * 100).toFixed(0);
      console.log(chalk.bold(`${result.memory.title}`));
      console.log(chalk.dim(`   Score: ${score}% | ${result.memory.createdAt.slice(0, 10)}`));
      console.log(chalk.white(`   ${result.memory.text.slice(0, 150)}...`));
      console.log();
    }
  } catch (err) {
    console.log(chalk.red(`❌ Search failed: ${err.message}`));
  }
}
