import Stripe from "stripe";
import { getDb } from "@/lib/turso";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  typescript: true,
});

/**
 * Ensure the stripe_customers table exists.
 * Called lazily on first customer lookup.
 */
let stripeTableInitialized = false;
async function ensureStripeCustomersTable(): Promise<void> {
  if (stripeTableInitialized) return;
  const client = getDb();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS stripe_customers (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  stripeTableInitialized = true;
}

/**
 * Get or create a Stripe customer for a given Clerk userId.
 * Stores the mapping in the stripe_customers table.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email?: string | null,
): Promise<string> {
  await ensureStripeCustomersTable();
  const client = getDb();

  // Check existing mapping
  const result = await client.execute({
    sql: `SELECT stripe_customer_id FROM stripe_customers WHERE user_id = ? LIMIT 1`,
    args: [userId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row?.stripe_customer_id) {
    return row.stripe_customer_id as string;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    metadata: { clerkUserId: userId },
    ...(email ? { email } : {}),
  });

  const now = new Date().toISOString();
  await client.execute({
    sql: `
      INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id
    `,
    args: [userId, customer.id, now],
  });

  return customer.id;
}

/**
 * Look up a Clerk userId from a Stripe customer ID.
 */
export async function getUserIdByStripeCustomerId(
  stripeCustomerId: string,
): Promise<string | null> {
  await ensureStripeCustomersTable();
  const client = getDb();

  const result = await client.execute({
    sql: `SELECT user_id FROM stripe_customers WHERE stripe_customer_id = ? LIMIT 1`,
    args: [stripeCustomerId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? (row.user_id as string) : null;
}
