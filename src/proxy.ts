import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public surface: the home page (renders its own signed-out state), published
// apps, and the AI proxy that published apps call from a sandboxed origin.
const isPublicRoute = createRouteMatcher(["/", "/p/(.*)", "/api/app-ai"]);

export const proxy = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
