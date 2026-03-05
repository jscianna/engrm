import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/api/memories(.*)", "/api/settings(.*)", "/api/dashboard(.*)"]);
const isAdminRoute = createRouteMatcher(["/api/admin(.*)"]);

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
  
  // Skip Clerk auth for admin routes (they use their own API key auth)
  if (isAdminRoute(request)) {
    return NextResponse.next();
  }
  
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Only run middleware on protected routes - skip everything else
    "/dashboard/:path*",
    "/api/memories/:path*",
    "/api/dashboard/:path*",
    "/api/settings/:path*",
  ],
};
