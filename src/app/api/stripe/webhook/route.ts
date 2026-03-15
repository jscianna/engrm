import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, getUserIdByStripeCustomerId } from "@/lib/stripe";
import { setUserEntitlementPlan } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe Webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          session.client_reference_id ??
          (session.customer
            ? await getUserIdByStripeCustomerId(
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer.id,
              )
            : null);

        if (userId) {
          await setUserEntitlementPlan(userId, "hosted");
          console.log(`[Stripe Webhook] Upgraded user ${userId} to hosted plan`);
        } else {
          console.warn("[Stripe Webhook] checkout.session.completed: could not resolve userId");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        const userId = await getUserIdByStripeCustomerId(customerId);
        if (userId) {
          await setUserEntitlementPlan(userId, "free");
          console.log(`[Stripe Webhook] Downgraded user ${userId} to free plan`);
        } else {
          console.warn(
            `[Stripe Webhook] customer.subscription.deleted: no user found for customer ${customerId}`,
          );
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge without error
        break;
    }
  } catch (error) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
    // Still return 200 to prevent Stripe retries on app-level errors
  }

  return NextResponse.json({ received: true });
}
