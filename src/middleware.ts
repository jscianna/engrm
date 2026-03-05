import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)", 
  "/api/memories(.*)", 
  "/api/settings(.*)", 
  "/api/dashboard(.*)",
  "/api/v1/auth(.*)",
  "/api/dream-cycle(.*)",
  "/api/feedback(.*)",
]);
// Routes that use API key auth instead of Clerk
const isApiKeyAuthRoute = createRouteMatcher(["/api/admin(.*)", "/api/v1(?!/auth)(.*)"]);

// Block bot scanner paths (WordPress, PHP vulns, etc.)
// Use startsWith to avoid false positives (e.g., UUID starting with "db")
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
  
  // Block scanner bots immediately (return 404, not redirect)
  if (isBlockedPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  
  // Skip Clerk auth for routes that use API key auth
  if (isApiKeyAuthRoute(request)) {
    return NextResponse.next();
  }
  
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes that use Clerk auth
    "/api/:path*",
    // Always run for dashboard
    "/dashboard/:path*",
  ],
};
