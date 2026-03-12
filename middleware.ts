import proxy from "./src/proxy";

export default proxy;

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
