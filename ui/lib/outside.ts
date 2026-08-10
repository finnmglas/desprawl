// owner: finn
// goal: a system, or the library that speaks to it

/**
 * A client ships inside the repo and speaks a protocol: axios sends the request, the
 * thing that answers is the system. Only a system belongs outside the wall.
 */
const CLIENT = new Set([
  "axios",
  "Axios",
  "ky",
  "got",
  "superagent",
  "node-fetch",
  "undici",
  "SWR",
  "TanStack Query",
  "React Query",
  "Apollo",
  "urql",
  "GraphQL",
  "tRPC",
  "gRPC",
  "Socket.IO",
  "ws",
  "AI SDK",
  "LangChain",
  "Zod",
  "Ofetch",
  "Wretch",
  "Axios Retry",
])

/** where it runs, as opposed to what it calls */
const HOST = new Set([
  "Vercel",
  "Netlify",
  "Cloudflare",
  "Cloudflare Pages",
  "Cloudflare Workers",
  "Fly.io",
  "Render",
  "Railway",
  "Heroku",
  "AWS",
  "Amazon S3",
  "AWS Lambda",
  "Azure",
  "Google Cloud",
  "Firebase",
  "DigitalOcean",
  "Deno Deploy",
  "GitHub Pages",
  "Kubernetes",
  "Docker",
])

/** what it is for and which way it runs. Unnamed ones still draw */
export const MEANS: Record<string, { what: string; way: "out" | "in" | "both" }> = {
  Vercel: { what: "deploys and runs here", way: "out" },
  Netlify: { what: "deploys and runs here", way: "out" },
  Cloudflare: { what: "deploys and runs here", way: "out" },
  "Fly.io": { what: "deploys and runs here", way: "out" },
  Railway: { what: "deploys and runs here", way: "out" },
  Render: { what: "deploys and runs here", way: "out" },
  Heroku: { what: "deploys and runs here", way: "out" },
  "GitHub Pages": { what: "published from the repo", way: "out" },
  AWS: { what: "infrastructure it runs on", way: "out" },
  "Google Cloud": { what: "infrastructure it runs on", way: "out" },
  Azure: { what: "infrastructure it runs on", way: "out" },
  Kubernetes: { what: "where the containers run", way: "out" },
  Docker: { what: "how it is packaged", way: "out" },
  Stripe: { what: "payments", way: "out" },
  Supabase: { what: "database and auth", way: "both" },
  Convex: { what: "backend and data", way: "both" },
  Firebase: { what: "database and auth", way: "both" },
  Clerk: { what: "sign in", way: "both" },
  Auth0: { what: "sign in", way: "both" },
  NextAuth: { what: "sign in", way: "both" },
  OpenAI: { what: "model calls", way: "out" },
  Anthropic: { what: "model calls", way: "out" },
  Sentry: { what: "error reports", way: "out" },
  PostHog: { what: "product analytics", way: "out" },
  Crowdin: { what: "translations", way: "in" },
  Algolia: { what: "search", way: "out" },
  Resend: { what: "email", way: "out" },
  Twilio: { what: "messaging", way: "out" },
  hCaptcha: { what: "bot checks", way: "both" },
  Cloudinary: { what: "images", way: "both" },
  "Amazon S3": { what: "file storage", way: "both" },
  Redis: { what: "cache", way: "both" },
  PostgreSQL: { what: "database", way: "both" },
  MongoDB: { what: "database", way: "both" },
}

export const isClient = (label: string): boolean => CLIENT.has(label)
export const isHost = (label: string): boolean => HOST.has(label)
