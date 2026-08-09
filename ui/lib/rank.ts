// owner: finn
// goal: the thing a repo is built on comes before the thing it sprinkles on top

/** lower is more structural. Anything unlisted sits in the middle */
// prettier-ignore
const RANK: Record<string, number> = {
  // what the app is: a meta framework, then the library under it, then the server
  "Next.js": 0, Nuxt: 0, SvelteKit: 0, Remix: 0, Astro: 0, RedwoodJS: 0, "TanStack Start": 0,
  Angular: 0, Gatsby: 0, Vike: 0, Quasar: 0, Expo: 0, "React Native": 0, Electron: 0, Tauri: 0,
  React: 1, Vue: 1, Svelte: 1, Solid: 1, Preact: 1, Qwik: 1,
  Express: 2, Fastify: 2, NestJS: 2, Hono: 2, Koa: 2, Elysia: 2, hapi: 2, AdonisJS: 2,
  Nitro: 2, h3: 2, Feathers: 2, restify: 2, polka: 2, Strapi: 2, Medusa: 2, Keystone: 2,

  // ui: a design system, then primitives, then the styling engine, then helpers and widgets
  shadcn: 0, MUI: 0, "Ant Design": 0, Chakra: 0, Mantine: 0, HeroUI: 0, NextUI: 0, Fluent: 0,
  Carbon: 0, Blueprint: 0, Bootstrap: 0, Vuetify: 0, Ionic: 0, daisyUI: 0, PrimeReact: 0,
  "Base UI": 1, Radix: 1, "Headless UI": 1, "React Aria": 1, Ariakit: 1, DiceUI: 1,
  Tailwind: 2, Panda: 2, "styled-components": 2, Emotion: 2, Sass: 2, Less: 2, Stylus: 2,
  UnoCSS: 2, "vanilla-extract": 2, Stitches: 2, Linaria: 2, "styled-jsx": 2,
  PostCSS: 3, cva: 3, clsx: 3, classnames: 3, "tailwind-variants": 3,
  cmdk: 4, Sonner: 4, Vaul: 4, Embla: 4, "dnd kit": 4, "TanStack Table": 4, "AG Grid": 4,
  Motion: 5, GSAP: 5, "React Spring": 5,
  Lucide: 6, Tabler: 6, Phosphor: 6, "React Icons": 6,

  // data: the store first, then the client, then the odd service
  Postgres: 0, MySQL: 0, SQLite: 0, MongoDB: 0, Redis: 0, Convex: 0, Supabase: 0, Firebase: 0,
  Neon: 0, PlanetScale: 0, "Vercel Postgres": 0, Upstash: 0, libSQL: 0,
  Prisma: 1, Drizzle: 1, Kysely: 1, TypeORM: 1, Sequelize: 1, Knex: 1, Mongoose: 1,
  GraphQL: 2, tRPC: 2, Apollo: 2, "Socket.IO": 2, WebSocket: 2,
  axios: 3, ky: 3, got: 3, "node-fetch": 3, ofetch: 3,

  // build: the bundler, then the monorepo tool, then the release and hook plumbing
  Vite: 0, webpack: 0, Turbopack: 0, Rspack: 0, Rolldown: 0, esbuild: 0, Rollup: 0, Parcel: 0,
  Turborepo: 1, Nx: 1, Lerna: 1, Make: 1, just: 1, Task: 1,
  tsup: 2, unbuild: 2, tsdown: 2, bunchee: 2, microbundle: 2, SWC: 2, Babel: 2,
  Changesets: 3, "semantic-release": 3, "release-it": 3, Husky: 4, "lint-staged": 4,
  commitlint: 4, "simple-git-hooks": 4, TypeDoc: 4,
}

/** stable: equal ranks keep the order they were detected in */
export const byWeight = (items: string[]): string[] =>
  items
    .map((label, i) => ({
      label,
      i,
      rank: RANK[label.replace(/\s+\S+$/, "")] ?? RANK[label] ?? 3.5,
    }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((entry) => entry.label)
