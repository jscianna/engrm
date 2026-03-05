import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)", 
  "/api/memories(.*)", 
  "/api/settings(.*)", 
  "/api/dashboard(.*)",
  "/api/dream-cycle(.*)",
  "/api/feedback(.*)",
]);

// Routes that use API key auth instead of Clerk (skip auth.protect)
const isApiKeyAuthRoute = createRouteMatcher([
  "/api/admin(.*)", 
  "/api/v1(.*)",
  "/api/health(.*)",
]);

// Block bot scanner paths
const BLOCKED_PATH_PREFIXES = [
  "/wp-admin", "/wp-login", "/wp-content", "/wp-includes", "/wp-config",
  "/wordpress", "/xmlrpc", "/phpmyadmin", "/administrator", 
  "/.env", "/.git", "/config.php", "/backup.zip", "/db.sql", "/sql/",
];

function isBlockedPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".php")) return true;
  return BLOCKED_PATH_PREFIXES.some(p => lower.startsWith(p));
}

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  
  if (isBlockedPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  
  // Skip Clerk auth for API key auth routes
  if (isApiKeyAuthRoute(request)) {
    return NextResponse.next();
  }
  
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/:path*",
  ],
};
