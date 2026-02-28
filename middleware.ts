import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/api/memories(.*)"]);
const isAdminRoute = createRouteMatcher(["/api/admin(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  // Skip Clerk auth for admin routes (they use their own API key auth)
  if (isAdminRoute(request)) {
    return NextResponse.next();
  }
  
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
