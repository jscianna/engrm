import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customerId = await getOrCreateStripeCustomer(userId);
    const origin = new URL(request.url).origin;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("[Stripe Portal] Error:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
