import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { priceId?: string };
    const { priceId } = body;

    if (!priceId || typeof priceId !== "string") {
      return NextResponse.json({ error: "priceId is required" }, { status: 400 });
    }

    const customerId = await getOrCreateStripeCustomer(userId);
    const origin = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/settings?upgraded=true`,
      cancel_url: `${origin}/dashboard/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Stripe Checkout] Error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
