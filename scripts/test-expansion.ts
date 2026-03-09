import { expandQuery, detectQueryIntent } from '../src/lib/query-expansion';

const testQueries = [
  "Why PostgreSQL instead of MongoDB?",
  "What branching strategy do we use?",
  "Why did we choose React over Vue?",
  "What is the Redis TTL?",
  "When do JWT tokens expire?",
];

for (const q of testQueries) {
  const intent = detectQueryIntent(q);
  const variants = expandQuery(q);
  console.log(`\nQuery: ${q}`);
  console.log(`Intent: ${intent}`);
  console.log(`Variants: ${JSON.stringify(variants, null, 2)}`);
}
