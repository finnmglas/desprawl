// owner: finn
// goal: what kind of project this is, read off manifests and marker files

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { git } from "./model.ts"
import { CODE } from "./scan.ts"
import type { Ai, Manifest, Node, Pinning, Stack } from "./model.ts"

/** A dependency name, or a prefix ending in /, mapped to the label it implies. */
type Table = Record<string, string>

// prettier-ignore
const FRAMEWORKS: Table = {
  react: "React", "react-dom": "React", next: "Next.js", nuxt: "Nuxt", vue: "Vue",
  svelte: "Svelte", "@sveltejs/kit": "SvelteKit", "@angular/core": "Angular", "solid-js": "Solid",
  astro: "Astro", "@remix-run/react": "Remix", preact: "Preact", "react-native": "React Native",
  expo: "Expo", electron: "Electron", "@tauri-apps/api": "Tauri", gatsby: "Gatsby",
  express: "Express", fastify: "Fastify", "@nestjs/core": "NestJS", koa: "Koa", hono: "Hono",
  "@hapi/hapi": "hapi", "aws-lambda": "Lambda",
  "@builder.io/qwik": "Qwik", "@redwoodjs/core": "RedwoodJS", "@adonisjs/core": "AdonisJS",
  "@strapi/strapi": "Strapi", "@medusajs/medusa": "Medusa", "@keystone-6/core": "Keystone",
  elysia: "Elysia", h3: "h3", nitropack: "Nitro", "@capacitor/core": "Capacitor",
  quasar: "Quasar", vike: "Vike", "@tanstack/react-start": "TanStack Start",
  "@feathersjs/feathers": "Feathers", restify: "restify", polka: "polka",
}

// prettier-ignore
const STATE: Table = {
  zustand: "Zustand", redux: "Redux", "@reduxjs/toolkit": "Redux Toolkit", mobx: "MobX",
  jotai: "Jotai", recoil: "Recoil", valtio: "Valtio", xstate: "XState", pinia: "Pinia",
  "@tanstack/react-query": "TanStack Query", "@tanstack/query-core": "TanStack Query",
  swr: "SWR", "apollo-client": "Apollo", "@apollo/client": "Apollo", effector: "Effector",
  "@ngrx/store": "NgRx", vuex: "Vuex", nanostores: "Nano Stores",
  immer: "Immer", "redux-saga": "Redux Saga", rxjs: "RxJS", "@preact/signals": "Signals",
  "@legendapp/state": "Legend State", "@tanstack/store": "TanStack Store",
  "react-hook-form": "React Hook Form", "@hookform/": "React Hook Form",
  "@tanstack/react-form": "TanStack Form",
}

// prettier-ignore
const UI: Table = {
  tailwindcss: "Tailwind", "@mui/material": "MUI", antd: "Ant Design", "@chakra-ui/react": "Chakra",
  bootstrap: "Bootstrap", "react-bootstrap": "Bootstrap", "@radix-ui/": "Radix",
  "@base-ui/react": "Base UI", "@headlessui/react": "Headless UI", daisyui: "daisyUI",
  "@mantine/core": "Mantine", "styled-components": "styled-components", "@emotion/react": "Emotion",
  bulma: "Bulma", "primereact: ": "PrimeReact", "@diceui/": "DiceUI", "class-variance-authority": "cva",
  "@nextui-org/react": "NextUI", vuetify: "Vuetify", "@ionic/react": "Ionic",
  "@heroui/react": "HeroUI", "@ariakit/react": "Ariakit", "@base-ui-components/react": "Base UI",
  "@fluentui/react-components": "Fluent", "@carbon/react": "Carbon", "@blueprintjs/core": "Blueprint",
  "react-aria-components": "React Aria", "lucide-react": "Lucide", "react-icons": "React Icons",
  "@tabler/icons-react": "Tabler", "@phosphor-icons/react": "Phosphor", "framer-motion": "Motion",
  motion: "Motion", "@react-spring/web": "React Spring", gsap: "GSAP", cmdk: "cmdk",
  sonner: "Sonner", vaul: "Vaul", "@dnd-kit/core": "dnd kit", "@tanstack/react-table": "TanStack Table",
  "ag-grid-react": "AG Grid", "embla-carousel-react": "Embla",
  "radix-ui": "Radix", shadcn: "shadcn", "@dnd-kit/": "dnd kit", "@floating-ui/": "Floating UI",
  "@tiptap/": "Tiptap", "@codemirror/": "CodeMirror", "@lexical/": "Lexical",
  "@monaco-editor/react": "Monaco", "@tanstack/react-virtual": "TanStack Virtual",
  "next-themes": "next-themes", "@fontsource": "Fontsource",
}

// prettier-ignore
const CONNECTS: Table = {
  axios: "axios", ky: "ky", got: "got", "node-fetch": "node-fetch", ofetch: "ofetch",
  convex: "Convex", "@prisma/client": "Prisma", "drizzle-orm": "Drizzle", mongoose: "Mongoose",
  pg: "Postgres", mysql2: "MySQL", "better-sqlite3": "SQLite", redis: "Redis", ioredis: "Redis",
  "@supabase/supabase-js": "Supabase", firebase: "Firebase", "firebase-admin": "Firebase",
  "@directus/sdk": "Directus", "@trpc/client": "tRPC", "@trpc/server": "tRPC", graphql: "GraphQL",
  socket: "sockets", "socket.io": "Socket.IO", ws: "WebSocket", "@aws-sdk/client-s3": "S3",
  stripe: "Stripe", "@sentry/node": "Sentry", "@sentry/react": "Sentry", openai: "OpenAI",
  "@anthropic-ai/sdk": "Anthropic",
  kysely: "Kysely", typeorm: "TypeORM", sequelize: "Sequelize", knex: "Knex",
  "@libsql/client": "libSQL", "@neondatabase/serverless": "Neon", "@planetscale/database": "PlanetScale",
  "@vercel/postgres": "Vercel Postgres", "@upstash/redis": "Upstash", mongodb: "MongoDB",
  "@elastic/elasticsearch": "Elasticsearch", meilisearch: "Meilisearch", algoliasearch: "Algolia",
  nodemailer: "Nodemailer", resend: "Resend", "@sendgrid/mail": "SendGrid", twilio: "Twilio",
  "@slack/web-api": "Slack", "discord.js": "Discord", ai: "AI SDK", "@ai-sdk/openai": "AI SDK",
  langchain: "LangChain", "@langchain/core": "LangChain", llamaindex: "LlamaIndex",
  ollama: "Ollama", "@google/generative-ai": "Gemini", "@mistralai/mistralai": "Mistral",
  replicate: "Replicate", "@huggingface/inference": "Hugging Face", "@lemonsqueezy/lemonsqueezy.js": "Lemon Squeezy",
  "launchdarkly-js-client-sdk": "LaunchDarkly", "@unleash/proxy-client-react": "Unleash",
  "@growthbook/growthbook": "GrowthBook", "@statsig/js-client": "Statsig",
  "@ai-sdk/": "AI SDK", "@convex-dev/": "Convex", "@clerk/": "Clerk", "@google-cloud/": "Google Cloud",
  "@aws-sdk/": "AWS", "@azure/": "Azure", "@crowdin/cli": "Crowdin", "@hcaptcha/react-hcaptcha": "hCaptcha",
}

// prettier-ignore
const TESTING: Table = {
  vitest: "Vitest", jest: "Jest", mocha: "Mocha", "@playwright/test": "Playwright",
  cypress: "Cypress", "@testing-library/react": "Testing Library", ava: "AVA",
  jasmine: "Jasmine", karma: "Karma", supertest: "supertest", pytest: "pytest",
  msw: "MSW", nock: "nock", sinon: "Sinon", chai: "Chai", puppeteer: "Puppeteer",
  webdriverio: "WebdriverIO", "selenium-webdriver": "Selenium", testcafe: "TestCafe",
  "@stryker-mutator/core": "Stryker", "fast-check": "fast-check", "@faker-js/faker": "Faker",
  k6: "k6", artillery: "Artillery", autocannon: "autocannon", c8: "c8", nyc: "nyc",
}

// prettier-ignore
const BUILDERS: Table = {
  vite: "Vite", webpack: "webpack", rollup: "Rollup", esbuild: "esbuild", parcel: "Parcel",
  turbo: "Turborepo", nx: "Nx", lerna: "Lerna", tsup: "tsup", rspack: "Rspack",
  "@swc/core": "SWC", babel: "Babel", "@babel/core": "Babel", gulp: "Gulp", grunt: "Grunt",
  unbuild: "unbuild", tsdown: "tsdown", bunchee: "bunchee", microbundle: "microbundle",
  rolldown: "Rolldown", "@changesets/cli": "Changesets", "semantic-release": "semantic-release",
  "release-it": "release-it", husky: "Husky", "lint-staged": "lint-staged",
  "@commitlint/cli": "commitlint", "simple-git-hooks": "simple-git-hooks", typedoc: "TypeDoc",
}

// prettier-ignore
const LINTERS: Table = {
  eslint: "ESLint", "@biomejs/biome": "Biome", oxlint: "oxlint", tslint: "TSLint (dead)",
  standard: "standard", xo: "xo", stylelint: "Stylelint",
  knip: "Knip", depcheck: "depcheck", madge: "Madge", "dependency-cruiser": "dependency-cruiser",
  "ts-prune": "ts-prune", publint: "publint", "@arethetypeswrong/cli": "are the types wrong",
  syncpack: "syncpack", sherif: "Sherif",
  "eslint-config-next": "ESLint", "@eslint/eslintrc": "ESLint", gitleaks: "Gitleaks",
}

// prettier-ignore
const FORMATTERS: Table = { prettier: "Prettier", "@biomejs/biome": "Biome", oxfmt: "oxfmt", dprint: "dprint" , "@ianvs/prettier-plugin-sort-imports": "Prettier" }

// prettier-ignore
const RUNTIME: Table = {
  "@types/node": "Node", "bun-types": "Bun", "@cloudflare/workers-types": "Workers",
  "@deno/types": "Deno", "@types/aws-lambda": "Lambda", wrangler: "Workers",
  "@types/bun": "Bun", "@vercel/node": "Vercel", "@netlify/functions": "Netlify",
  "firebase-functions": "Firebase", "aws-cdk-lib": "AWS CDK", sst: "SST", serverless: "Serverless",
  "@pulumi/pulumi": "Pulumi",
}

// prettier-ignore
const STYLING: Table = {
  sass: "Sass", less: "Less", stylus: "Stylus", postcss: "PostCSS", autoprefixer: "PostCSS",
  "@vanilla-extract/css": "vanilla-extract", "unocss": "UnoCSS", "tailwind-merge": "Tailwind",
  clsx: "clsx", classnames: "classnames",
  "@pandacss/dev": "Panda", "@stitches/react": "Stitches", "@linaria/core": "Linaria",
  "styled-jsx": "styled-jsx", "tailwind-variants": "tailwind-variants",
  "@tailwindcss/postcss": "Tailwind", "tw-animate-css": "Tailwind",
}

// prettier-ignore
const CONTENT: Table = {
  "next-intl": "i18n", "react-i18next": "i18n", i18next: "i18n", "vue-i18n": "i18n",
  "@lingui/core": "i18n", "next-mdx-remote": "MDX", "@mdx-js/react": "MDX",
  contentlayer: "Contentlayer", "@sanity/client": "Sanity", "contentful": "Contentful",
  storyblok: "Storyblok", "@storybook/react": "Storybook", "@payloadcms/next": "Payload",
  velite: "Velite", "fumadocs-core": "Fumadocs", nextra: "Nextra", "@docusaurus/core": "Docusaurus",
  vitepress: "VitePress", "@keystatic/core": "Keystatic", tinacms: "TinaCMS",
  "@prismicio/client": "Prismic", "gray-matter": "gray-matter", remark: "remark", rehype: "rehype",
  shiki: "Shiki", prismjs: "Prism", "highlight.js": "highlight.js", marked: "marked",
}

// prettier-ignore
const VISUALS: Table = {
  "@react-three/": "React Three Fiber", three: "three.js", "@turf/": "Turf", d3: "D3",
  "d3-force": "D3", dagre: "dagre", cytoscape: "Cytoscape", "chart.js": "Chart.js",
  echarts: "ECharts", recharts: "Recharts", "@nivo/core": "nivo", "@visx/visx": "visx",
  victory: "Victory", "plotly.js": "Plotly", konva: "Konva", "pixi.js": "PixiJS",
  "mapbox-gl": "Mapbox", "maplibre-gl": "MapLibre", leaflet: "Leaflet", "@deck.gl/core": "deck.gl",
}

// prettier-ignore
const OBSERVE: Table = {
  "@sentry/nextjs": "Sentry", posthog: "PostHog", "posthog-js": "PostHog",
  "@vercel/analytics": "Vercel Analytics", "@vercel/speed-insights": "Vercel Analytics",
  "@datadog/browser-rum": "Datadog", "@opentelemetry/api": "OpenTelemetry", mixpanel: "Mixpanel",
  "@amplitude/analytics-browser": "Amplitude", pino: "pino", winston: "winston",
  "@bugsnag/js": "Bugsnag", rollbar: "Rollbar", "logrocket": "LogRocket", newrelic: "New Relic",
  "prom-client": "Prometheus", "@axiomhq/js": "Axiom", "@grafana/faro-web-sdk": "Grafana Faro",
  consola: "consola", loglevel: "loglevel", debug: "debug",
}

// prettier-ignore
const AUTH: Table = {
  "next-auth": "NextAuth", "@auth/core": "Auth.js", "@clerk/nextjs": "Clerk",
  "@auth0/auth0-react": "Auth0", passport: "Passport", jsonwebtoken: "JWT", jose: "JWT",
  "@supabase/auth-helpers-nextjs": "Supabase Auth", lucia: "Lucia", bcrypt: "bcrypt",
  "better-auth": "Better Auth", "@workos-inc/node": "WorkOS", "@kinde-oss/kinde-auth-nextjs": "Kinde",
  "openid-client": "OpenID", argon2: "argon2", "@node-rs/argon2": "argon2", "iron-session": "iron session",
  "@stytch/nextjs": "Stytch", "keycloak-js": "Keycloak", "@propelauth/react": "PropelAuth",
}

// every dependency table, and the field it fills
// prettier-ignore
const TABLES: [string, Table][] = [
  ["frameworks", FRAMEWORKS], ["state", STATE], ["ui", UI], ["connects", CONNECTS],
  ["testing", TESTING], ["build", BUILDERS], ["runtimes", RUNTIME], ["styling", STYLING],
  ["content", CONTENT], ["visuals", VISUALS], ["observability", OBSERVE], ["auth", AUTH], ["linters", LINTERS],
  ["formatters", FORMATTERS],
]

/** a file whose presence names the host it deploys to */
// prettier-ignore
const HOSTED: [RegExp, string][] = [
  [/^(.*\/)?vercel\.json$/, "Vercel"],
  [/^(.*\/)?netlify\.toml$/, "Netlify"],
  [/^(.*\/)?wrangler\.(toml|jsonc?)$/, "Cloudflare"],
  [/^(.*\/)?fly\.toml$/, "Fly.io"],
  [/^(.*\/)?railway\.(json|toml)$/, "Railway"],
  [/^(.*\/)?render\.ya?ml$/, "Render"],
  [/^(.*\/)?Procfile$/, "Heroku"],
  [/^(.*\/)?heroku\.ya?ml$/, "Heroku"],
  [/^(.*\/)?firebase\.json$/, "Firebase"],
  [/^(.*\/)?amplify\.ya?ml$/, "AWS"],
  [/^(.*\/)?samconfig\.toml$/, "AWS"],
  [/^(.*\/)?cdk\.json$/, "AWS"],
  [/^(.*\/)?sst\.config\.[cm]?ts$/, "AWS"],
  [/^(.*\/)?\.platform\.app\.ya?ml$/, "Platform.sh"],
  [/^(.*\/)?captain-definition$/, "CapRover"],
  [/^\.do\/(app|deploy)\.ya?ml$/, "DigitalOcean"],
  [/^(.*\/)?supabase\/config\.toml$/, "Supabase"],
  [/^(.*\/)?[\w.-]*cloudbuild[\w.-]*\.ya?ml$/, "Google Cloud"],
  [/^(.*\/)?\.gcloudignore$/, "Google Cloud"],
  [/^(.*\/)?buildspec[\w.-]*\.ya?ml$/, "AWS"],
  [/^(.*\/)?appspec\.(ya?ml|json)$/, "AWS"],
  [/^\.ebextensions\//, "AWS"],
  [/^(.*\/)?staticwebapp\.config\.json$/, "Azure"],
  [/^(.*\/)?skaffold\.ya?ml$/, "Kubernetes"],
]

/**
 * A file whose name half the world uses. app.yaml is app engine only when it names a
 * runtime, template.yaml is SAM only when it says so, and serverless.yml can target
 * any cloud. Each has to say what it is before it counts as anything.
 */
// prettier-ignore
const AMBIGUOUS: [RegExp, RegExp, string][] = [
  [/^(.*\/)?app\.ya?ml$/, /^\s*runtime:\s*\S/m, "Google Cloud"],
  [/^(.*\/)?template\.ya?ml$/, /AWSTemplateFormatVersion|Transform:\s*(-\s*)?AWS::Serverless/, "AWS"],
  [/^(.*\/)?serverless\.ya?ml$/, /name:\s*aws\b/, "AWS"],
  [/^(.*\/)?serverless\.ya?ml$/, /name:\s*google\b/, "Google Cloud"],
  [/^(.*\/)?serverless\.ya?ml$/, /name:\s*azure\b/, "Azure"],
]

/** what a terraform provider, a workflow step or a registry says about the target */
// prettier-ignore
const DEPLOYS: [RegExp, string][] = [
  [/provider\s+"aws"|aws-actions\/|\bamazonaws\.com|\baws\s+(s3|ecs|lambda|ecr)\b/, "AWS"],
  [/provider\s+"google"|google-github-actions\/|\bgcr\.io|-docker\.pkg\.dev|\bgcloud\s/, "Google Cloud"],
  [/provider\s+"azurerm"|azure\/login|\bazurecr\.io|\baz\s+(webapp|containerapp)\b/, "Azure"],
  [/provider\s+"hcloud"|hetznercloud\/|\bhcloud\s/, "Hetzner"],
  [/provider\s+"digitalocean"|digitalocean\/action|registry\.digitalocean\.com|\bdoctl\s/, "DigitalOcean"],
  [/provider\s+"scaleway"|\bscw\s/, "Scaleway"],
  [/cloudflare\/wrangler-action|\bwrangler\s+(deploy|publish)/, "Cloudflare"],
  [/amondnet\/vercel-action|vercel\/action|\bvercel\s+(deploy|--prod)/, "Vercel"],
  [/nwtgck\/actions-netlify|netlify\/actions|\bnetlify\s+deploy/, "Netlify"],
  [/superfly\/flyctl|\bflyctl?\s+deploy/, "Fly.io"],
  [/bervProject\/railway|\brailway\s+up/, "Railway"],
  [/johnbeynon\/render-deploy|api\.render\.com/, "Render"],
  [/akhileshns\/heroku-deploy|\bgit\s+push\s+heroku/, "Heroku"],
  [/actions\/deploy-pages|peaceiris\/actions-gh-pages/, "GitHub Pages"],
  [/firebase-tools|FirebaseExtended\/action-hosting-deploy|\bfirebase\s+deploy/, "Firebase"],
  [/\bkubectl\s+apply|azure\/k8s-deploy|helm\s+upgrade/, "Kubernetes"],
]

/**
 * A package that only works on one platform, which is the same as saying it runs there.
 * An ignored link folder is not evidence, whatever it looks like: `create-next-app`
 * writes `.vercel` into every repo it makes, deployed there or not.
 */
// prettier-ignore
const PLATFORM: Table = {
  "@vercel/analytics": "Vercel", "@vercel/speed-insights": "Vercel", "@vercel/blob": "Vercel",
  "@vercel/kv": "Vercel", "@vercel/postgres": "Vercel", "@vercel/edge-config": "Vercel",
  "@vercel/og": "Vercel", "@vercel/functions": "Vercel", "@netlify/blobs": "Netlify",
  "@netlify/edge-functions": "Netlify", "@cloudflare/next-on-pages": "Cloudflare",
  "@cloudflare/workers-types": "Cloudflare", "@opennextjs/cloudflare": "Cloudflare",
  "@aws-sdk/client-lambda": "AWS", "@azure/static-web-apps-cli": "Azure",
}

/** a package whose whole job is putting this repo somewhere */
// prettier-ignore
const SHIPS: Table = {
  vercel: "Vercel", wrangler: "Cloudflare", "netlify-cli": "Netlify",
  "@netlify/functions": "Netlify", "firebase-tools": "Firebase", sst: "AWS", serverless: "AWS",
  "aws-cdk-lib": "AWS", "@aws-amplify/backend": "AWS", "@google-cloud/functions-framework": "Google Cloud",
  "@azure/functions": "Azure", "@railway/cli": "Railway",
}

/** Marker files, matched on the full path or the basename. */
// prettier-ignore
const FILES: [RegExp, keyof Stack | "lock" | "docker" | "compose" | "k8s" | "terraform" | "workspaces", string][] = [
  [/^(.*\/)?pnpm-lock\.yaml$/, "lock", "pnpm"],
  [/^(.*\/)?package-lock\.json$/, "lock", "npm"],
  [/^(.*\/)?yarn\.lock$/, "lock", "yarn"],
  [/^(.*\/)?bun\.lockb?$/, "lock", "bun"],
  [/^(.*\/)?shrinkwrap\.json$/, "lock", "npm shrinkwrap"],
  [/^(.*\/)?[Mm]akefile$/, "build", "Make"],
  [/^(.*\/)?[Jj]ustfile$/, "build", "just"],
  [/^(.*\/)?Taskfile\.ya?ml$/, "build", "Task"],
  [/^(.*\/)?turbo\.json$/, "build", "Turborepo"],
  [/^(.*\/)?nx\.json$/, "build", "Nx"],
  [/^(.*\/)?Rakefile$/, "build", "Rake"],
  [/^\.github\/workflows\/.+\.ya?ml$/, "ci", "GitHub Actions"],
  [/^\.gitlab-ci\.ya?ml$/, "ci", "GitLab CI"],
  [/^(.*\/)?Jenkinsfile$/, "ci", "Jenkins"],
  [/^\.circleci\/config\.ya?ml$/, "ci", "CircleCI"],
  [/^\.travis\.ya?ml$/, "ci", "Travis"],
  [/^(.*\/)?azure-pipelines\.ya?ml$/, "ci", "Azure Pipelines"],
  [/^(.*\/)?\.drone\.ya?ml$/, "ci", "Drone"],
  [/^(.*\/)?vercel\.json$/, "ci", "Vercel"],
  [/^(.*\/)?netlify\.toml$/, "ci", "Netlify"],
  [/^(.*\/)?[Dd]ockerfile(\..+)?$/, "docker", "Dockerfile"],
  [/^(.*\/)?docker-compose(\..+)?\.ya?ml$/, "compose", "compose"],
  [/^(.*\/)?compose\.ya?ml$/, "compose", "compose"],
  [/^(.*\/)?.+\.tf$/, "terraform", "terraform"],
  [/^(.*\/)?(k8s|kubernetes|manifests|helm|charts)\/.+\.ya?ml$/, "k8s", "kubernetes"],
  [/^(.*\/)?Chart\.ya?ml$/, "k8s", "helm"],
  [/^(.*\/)?.+\.bru$/, "apis", "Bruno"],
  [/^(.*\/)?.+\.postman_collection\.json$/, "apis", "Postman"],
  [/^(.*\/)?.+\.insomnia\.json$/, "apis", "Insomnia"],
  [/^(.*\/)?.+\.http$/, "apis", "REST client"],
  [/^(.*\/)?openapi\.(ya?ml|json)$/, "apis", "OpenAPI"],
  [/^(.*\/)?swagger\.(ya?ml|json)$/, "apis", "OpenAPI"],
  [/^(.*\/)?components\.json$/, "ui", "shadcn"],
  [/^(.*\/)?\.gitleaks\.toml$/, "linters", "Gitleaks"],
  [/^(.*\/)?\.pre-commit-config\.ya?ml$/, "linters", "pre-commit"],
  [/^(.*\/)?velite\.config\.[cm]?ts$/, "content", "Velite"],
  [/^pnpm-workspace\.ya?ml$/, "workspaces", "pnpm"],
  [/^(.*\/)?tsconfig(\..+)?\.json$/, "typescript", "tsconfig"],
]

/** Instruction and config files an ai coding tool leaves behind. */
// prettier-ignore
const AGENTS: [RegExp, string][] = [
  [/^(.*\/)?CLAUDE\.(md|local\.md)$|^(.*\/)?\.claude\//, "Claude Code"],
  [/^(.*\/)?AGENTS\.md$/, "AGENTS.md"],
  [/^(.*\/)?\.cursorrules$|^(.*\/)?\.cursor(rules)?\//, "Cursor"],
  [/^\.github\/copilot-instructions\.md$|^\.github\/instructions\//, "Copilot"],
  [/^(.*\/)?\.aider(\..+)?$|^(.*\/)?CONVENTIONS\.md$/, "aider"],
  [/^(.*\/)?\.windsurfrules$|^(.*\/)?\.windsurf\//, "Windsurf"],
  [/^(.*\/)?\.clinerules(\/.*)?$/, "Cline"],
  [/^(.*\/)?\.roo(rules|modes)?(\/.*)?$/, "Roo"],
  [/^(.*\/)?\.continue\//, "Continue"],
  [/^(.*\/)?GEMINI\.md$|^(.*\/)?\.gemini\//, "Gemini CLI"],
  [/^(.*\/)?AGENT\.md$|^(.*\/)?\.amp\//, "Amp"],
  [/^(.*\/)?\.codex\/|^(.*\/)?codex\.md$/i, "Codex"],
  [/^(.*\/)?\.junie\//, "Junie"],
  [/^(.*\/)?\.kiro\//, "Kiro"],
  [/^(.*\/)?\.goosehints$|^(.*\/)?\.goose\//, "Goose"],
  [/^(.*\/)?\.devin\//, "Devin"],
  [/^(.*\/)?\.amazonq\//, "Amazon Q"],
  [/^(.*\/)?\.augment(-guidelines)?(\/.*)?$/, "Augment"],
  [/^(.*\/)?\.sourcegraph\/|^(.*\/)?\.cody\//, "Cody"],
  [/^(.*\/)?\.specstory\//, "SpecStory"],
  [/^(.*\/)?\.?mcp\.json$|^(.*\/)?\.mcp\//, "MCP"],
  [/^(.*\/)?llms(-full)?\.txt$/, "llms.txt"],
  [/^(.*\/)?\.ai-?(rules|instructions)(\..+)?$/, "house rules"],
]

/** What an ai calls itself in a trailer or an author line. */
// prettier-ignore
const SIGNERS: [RegExp, string][] = [
  [/claude/i, "Claude Code"], [/cursor/i, "Cursor"], [/copilot/i, "Copilot"],
  [/devin/i, "Devin"], [/aider/i, "aider"], [/codex|chatgpt|openai/i, "Codex"],
  [/gemini|jules/i, "Gemini CLI"], [/windsurf|codeium/i, "Windsurf"], [/cline/i, "Cline"],
  [/openhands|opendevin/i, "OpenHands"], [/\bamp\b|sourcegraph/i, "Amp"], [/\bcody\b/i, "Cody"],
  [/coderabbit/i, "CodeRabbit"], [/sweep-ai|sweepai/i, "Sweep"], [/tabnine/i, "Tabnine"],
  [/amazon ?q|codewhisperer/i, "Amazon Q"], [/roo ?code/i, "Roo"], [/kiro/i, "Kiro"],
  [/goose/i, "Goose"], [/augment/i, "Augment"], [/factory\.ai|droid/i, "Factory"],
  [/antigravity/i, "Antigravity"], [/continue\.dev/i, "Continue"], [/junie/i, "Junie"],
]

const CONFIGS: [RegExp, "linters" | "formatters"][] = [
  [/^(.*\/)?\.eslintrc(\..+)?$/, "linters"],
  [/^(.*\/)?eslint\.config\.[cm]?[jt]s$/, "linters"],
  [/^(.*\/)?biome\.jsonc?$/, "linters"],
  [/^(.*\/)?oxlint\.config\.[cm]?[jt]s$/, "linters"],
  [/^(.*\/)?\.stylelintrc(\..+)?$/, "linters"],
  [/^(.*\/)?\.prettierrc(\..+)?$/, "formatters"],
  [/^(.*\/)?prettier\.config\.[cm]?[jt]s$/, "formatters"],
  [/^(.*\/)?\.editorconfig$/, "formatters"],
  [/^(.*\/)?oxfmt\.config\.[cm]?[jt]s$/, "formatters"],
  [/^(.*\/)?dprint\.jsonc?$/, "formatters"],
]

// copies of other people's code, and build output. Neither describes this project
const VENDORED =
  /(^|\/)(node_modules|bower_components|jspm_packages|web_modules|vendor|third_party|Godeps|Pods|Carthage|\.yarn|\.pnp|\.gradle|\.tox|\.venv|venv|site-packages|__pycache__|dist|build|out|target|coverage|\.next|\.nuxt|\.output|__fixtures__|fixtures)\/|(^|\/)wwwroot\/lib\//

const read = (repo: string, path: string): string => {
  try {
    return readFileSync(join(repo, path), "utf8")
  } catch {
    return ""
  }
}

const add = (list: string[], value: string) => {
  if (value && !list.includes(value)) list.push(value)
}

/** A range like ^1.2.3 is a promise to accept code nobody has reviewed. */
function pin(range: string): keyof Pinning {
  if (/^(link|file|workspace|portal):/.test(range)) return "linked"
  if (range.startsWith("^")) return "caret"
  if (range.startsWith("~")) return "tilde"
  if (/^\d/.test(range)) return "exact"
  return "range"
}

function manifest(repo: string, path: string): Manifest | null {
  try {
    const raw = JSON.parse(read(repo, path)) as Record<string, any>
    const deps: Record<string, string> = {
      ...raw.dependencies,
      ...raw.devDependencies,
      ...raw.peerDependencies,
    }
    return {
      path,
      name: raw.name,
      version: raw.version,
      license: raw.license,
      private: raw.private,
      manager: raw.packageManager,
      workspaces: !!raw.workspaces,
      bin: !!raw.bin,
      type: raw.type,
      engines: raw.engines,
      deps,
      scripts: raw.scripts ?? {},
    }
  } catch {
    return null
  }
}

const label = (table: Table, name: string): string =>
  table[name] ??
  Object.entries(table).find(([key]) => key.endsWith("/") && name.startsWith(key))?.[1] ??
  ""

/** newest commits only, a signature further back says little about the code now */
const SIGNED_MAX = 20_000

/**
 * Who signed the history. Only the author line and the trailers count, so a commit
 * that merely writes about an assistant is not counted as written by one.
 */
/** the tool a trailer names, without its model suffix, so Copilot:Claude reads as Copilot */
const signer = (line: string): string =>
  line.replace(/^\s*[a-z-]+-by:\s*/i, "").replace(/^([^\s:]+):\S+/, "$1")

function assisted(repo: string): Pick<Ai, "signed" | "scanned" | "capped" | "by"> {
  const by: Record<string, number> = {}
  let log = ""
  try {
    log = git(repo, "log", `-${SIGNED_MAX}`, "--format=%an <%ae>%n%B%x00")
  } catch {
    return { signed: 0, scanned: 0, capped: false, by } // no commits yet
  }

  const commits = log.split("\0").filter((c) => c.trim())
  let signed = 0
  for (const commit of commits) {
    const [author = "", ...body] = commit.split("\n")
    const claims = [
      // a human called Claude is not a tool, a bot address is
      /\[bot\]|noreply|users\.noreply/i.test(author) ? author : "",
      ...body.filter((line) => /^\s*(co-authored-by|assisted-by|generated with)/i.test(line)),
    ].map(signer)
    const hits = new Set(
      SIGNERS.filter(([match]) => claims.some((line) => match.test(line))).map(([, tool]) => tool),
    )
    if (hits.size) signed++
    for (const tool of hits) by[tool] = (by[tool] ?? 0) + 1
  }
  return { signed, scanned: commits.length, capped: commits.length >= SIGNED_MAX, by }
}

/** what the tracked paths alone say: marker files, config, ports, assistants */
function markers(repo: string, paths: string[]) {
  const found: Record<string, string[]> = {}
  const counts = { dockerfiles: 0, compose: 0, kubernetes: 0, terraform: 0 }
  const node: string[] = []
  const env: string[] = []
  const strict = { on: 0, off: 0 }
  const ports: number[] = []
  const agents: string[] = []
  const agentFiles: Record<string, number> = {}
  const hosts: string[] = []

  const port = (value: number) => {
    if (value > 0 && value < 65536 && !ports.includes(value)) ports.push(value)
  }

  for (const path of paths) {
    if (VENDORED.test(path)) continue

    for (const [match, where, name] of FILES) {
      if (!match.test(path)) continue
      if (where === "docker") counts.dockerfiles++
      else if (where === "compose") counts.compose++
      else if (where === "k8s") counts.kubernetes++
      else if (where === "terraform") counts.terraform++
      else add((found[where] ??= []), name)
    }
    for (const [match, where] of CONFIGS) {
      if (match.test(path)) add((found[where] ??= []), path.split("/").pop() ?? path)
    }
    for (const [match, host] of HOSTED) if (match.test(path)) add(hosts, host)
    for (const [named, says, host] of AMBIGUOUS)
      if (named.test(path) && says.test(read(repo, path))) add(hosts, host)

    // a workflow, a terraform file or a compose file can name the target too
    if (
      /^\.github\/workflows\/.+\.ya?ml$|\.tf$|\.tfvars$|^(.*\/)?(docker-)?compose(\..+)?\.ya?ml$|^(.*\/)?[Dd]ockerfile(\..+)?$/.test(
        path,
      )
    ) {
      const text = read(repo, path)
      for (const [match, host] of DEPLOYS) if (match.test(text)) add(hosts, host)
    }

    for (const [match, tool] of AGENTS) {
      if (!match.test(path)) continue
      add(agents, tool)
      // the last matched segment, so a rules folder counts once and nesting collapses
      const hit = path.match(match)?.[0] ?? path
      const marker = hit.endsWith("/") ? `${hit.split("/").at(-2)}/` : (hit.split("/").pop() ?? hit)
      agentFiles[marker] = (agentFiles[marker] ?? 0) + 1
    }

    // strictness is the single most useful thing a tsconfig says about a codebase
    if (/^(.*\/)?tsconfig(\..+)?\.json$/.test(path)) {
      const text = read(repo, path)
      if (/"strict"\s*:\s*true/.test(text)) strict.on++
      else if (/"compilerOptions"/.test(text)) strict.off++
    }
    if (/^(.*\/)?\.nvmrc$|^(.*\/)?\.node-version$/.test(path)) add(node, read(repo, path).trim())
    if (/^(.*\/)?\.env(\..+)?$/.test(path)) add(env, path.split("/").pop() ?? path)
    if (/^(.*\/)?[Dd]ockerfile(\..+)?$/.test(path)) {
      for (const line of read(repo, path).matchAll(/^\s*EXPOSE\s+(\d+)/gim)) port(Number(line[1]))
    }
    if (/^(.*\/)?(docker-)?compose(\..+)?\.ya?ml$/.test(path)) {
      for (const line of read(repo, path).matchAll(/["']?(\d{2,5}):\d{2,5}["']?/g))
        port(Number(line[1]))
    }
  }
  return { found, counts, node, env, strict, ports, agents, agentFiles, hosts, port }
}

/** a licence beside the manifest speaks for the project, the rest come with vendored code */
function licences(repo: string, paths: string[]): { licenses: string[]; vendored: number } {
  const licenses: string[] = []
  let vendored = 0

  for (const path of paths.filter((p) => /^(.*\/)?(LICEN[SC]E|COPYING)(\..+)?$/i.test(p))) {
    if (path.includes("/")) {
      vendored++
      continue
    }
    const text = read(repo, path).slice(0, 400)
    const kind = /MIT License/i.test(text)
      ? "MIT"
      : /Apache License/i.test(text)
        ? "Apache-2.0"
        : /GNU AFFERO/i.test(text)
          ? "AGPL-3.0"
          : /GNU GENERAL PUBLIC/i.test(text)
            ? "GPL"
            : /GNU LESSER/i.test(text)
              ? "LGPL"
              : /BSD/i.test(text)
                ? "BSD"
                : /Mozilla Public License/i.test(text)
                  ? "MPL-2.0"
                  : /UNLICENSE|public domain/i.test(text)
                    ? "Unlicense"
                    : "unknown"
    add(licenses, kind)
  }
  return { licenses, vendored }
}

// prettier-ignore
const SERVER = ["Express", "Fastify", "NestJS", "Koa", "Hono", "hapi", "Next.js", "Nuxt", "SvelteKit"]
// prettier-ignore
const CLIENT = ["React", "Vue", "Svelte", "Angular", "Solid", "Preact", "Astro", "Next.js", "Nuxt"]

/** what the repo holds, judged by what it depends on and what it ships */
function shipped(
  frameworks: string[],
  connected: boolean,
  workspaces: boolean,
  manifests: Manifest[],
  boxes: { dockerfiles: number; compose: number; kubernetes: number; terraform: number },
): string[] {
  const parts: string[] = []
  if (frameworks.some((f) => CLIENT.includes(f))) add(parts, "frontend")
  if (frameworks.some((f) => SERVER.includes(f)) || connected) add(parts, "backend")
  if (manifests.some((m) => Object.keys(m.deps).length === 0 && m.workspaces))
    add(parts, "monorepo root")
  if (manifests.some((m) => m.workspaces) || workspaces) add(parts, "monorepo")
  if (manifests.some((m) => m.bin)) add(parts, "cli")
  if (frameworks.includes("React Native") || frameworks.includes("Expo")) add(parts, "mobile")
  if (frameworks.includes("Electron") || frameworks.includes("Tauri")) add(parts, "desktop")
  if (boxes.dockerfiles || boxes.compose || boxes.kubernetes || boxes.terraform) add(parts, "infra")
  return parts
}

export function stack(repo: string, languages: Node[] = []): Stack {
  const paths = git(repo, "ls-files", "-z").split("\0").filter(Boolean)
  const { found, counts, node, env, strict, ports, agents, agentFiles, hosts, port } = markers(
    repo,
    paths,
  )
  const licenses: string[] = []
  const modules: string[] = []

  // every manifest, wherever it sits, so a monorepo is read whole
  const manifests = paths
    .filter((p) => /^(.*\/)?package\.json$/.test(p) && !VENDORED.test(p))
    .map((p) => manifest(repo, p))
    .filter((m): m is Manifest => !!m)

  // one bucket per table, so adding a category is one line in TABLES and one row in the card
  const dep: Record<string, string[]> = {
    frameworks: [],
    state: [],
    ui: [...(found.ui ?? [])],
    connects: [],
    testing: [],
    runtimes: [],
    styling: [],
    content: [],
    visuals: [],
    observability: [],
    auth: [],
    build: [...(found.build ?? [])],
    linters: [],
    formatters: [],
  }
  const from: Record<string, string> = {}
  const scripts: string[] = []
  const bundlers: string[] = []
  const typescript: string[] = []
  const managers: string[] = [...(found.lock ?? [])]
  const pinning: Pinning = { exact: 0, caret: 0, tilde: 0, range: 0, linked: 0 }
  const names = new Set<string>()

  for (const m of manifests) {
    if (m.license) add(licenses, m.license)
    if (m.manager) add(managers, m.manager.split("@")[0])
    if (m.engines?.node) add(node, m.engines.node)
    if (m.type) add(modules, m.type === "module" ? "esm" : "cjs")
    for (const [name, body] of Object.entries(m.scripts)) {
      add(scripts, name)
      // next --turbopack, vite, and a port given on the command line
      if (/--turbopack|--turbo\b/.test(body)) add(bundlers, "Turbopack")
      if (/\bwebpack\b/.test(body)) add(bundlers, "webpack")
      if (/\bvite\b/.test(body)) add(bundlers, "Vite")
      for (const [match, host] of DEPLOYS) if (match.test(body)) add(hosts, host)
      for (const found of body.matchAll(/(?:--port[= ]|-p[= ])(\d{2,5})/g)) port(Number(found[1]))
    }
    for (const [name, range] of Object.entries(m.deps)) {
      names.add(name)
      pinning[pin(String(range))]++
      if (name === "typescript") add(typescript, String(range))
      add(hosts, label(SHIPS, name))
      const platform = label(PLATFORM, name)
      if (platform) {
        add(hosts, platform)
        from[platform] ??= name
      }
      for (const [bucket, table] of TABLES) {
        const found = label(table, name)
        if (!found) continue
        add(dep[bucket], found)
        // several packages imply one label, the plainest name is the best evidence
        if (!from[found] || name.length < from[found].length) from[found] = name
      }
    }
  }

  const { licenses: filed, vendored } = licences(repo, paths)
  for (const kind of filed) add(licenses, kind)

  // the biggest real language by lines, so 200k lines of generated svg name nothing
  const primary =
    [...languages].filter((l) => CODE.has(l.name)).sort((a, b) => b.code - a.code)[0]?.name ?? ""

  const tally = new Map<string, number>()
  for (const path of paths) {
    const dot = path.lastIndexOf(".")
    const slash = path.lastIndexOf("/")
    if (dot > slash + 1) {
      const ext = path.slice(dot + 1).toLowerCase()
      tally.set(ext, (tally.get(ext) ?? 0) + 1)
    }
  }
  const exts = new Set(tally.keys())
  const hasTs =
    exts.has("ts") || exts.has("tsx") || exts.has("mts") || (found.typescript?.length ?? 0) > 0
  const hasJs = exts.has("js") || exts.has("jsx") || exts.has("mjs") || exts.has("cjs")

  const parts = shipped(
    dep.frameworks,
    dep.connects.length > 0,
    !!found.workspaces,
    manifests,
    counts,
  )
  if (exts.has("mjs")) add(modules, "esm")
  if (exts.has("cjs")) add(modules, "cjs")

  // a stray .js among python does not make a node project, a manifest or a tsconfig does
  const isNode = manifests.length > 0 || (found.typescript?.length ?? 0) > 0
  const kind = !isNode ? "none" : hasTs && hasJs ? "mixed" : hasTs ? "typescript" : "javascript"

  const root = manifests.find((m) => m.path === "package.json")

  // a checked in ruleset and a signed commit are both evidence, one list either way
  const signatures = assisted(repo)
  const tools = [...agents]
  for (const tool of Object.keys(signatures.by)) add(tools, tool)

  return {
    kind,
    primary,
    name: root?.name,
    version: root?.version,
    license: root?.license ?? licenses[0],
    private: !!root?.private,
    vendored,
    manifests,
    typescript,
    managers,
    lockfiles: found.lock ?? [],
    pinning,
    dependencies: names.size,
    build: dep.build,
    frameworks: dep.frameworks,
    state: dep.state,
    ui: dep.ui,
    connects: dep.connects,
    testing: dep.testing,
    runtimes: dep.runtimes,
    styling: dep.styling,
    content: dep.content,
    visuals: dep.visuals,
    observability: dep.observability,
    auth: dep.auth,
    scripts,
    linters: dep.linters,
    formatters: dep.formatters,
    rules: [...(found.linters ?? []), ...(found.formatters ?? [])],
    ci: found.ci ?? [],
    bundlers,
    ports: ports.sort((a, b) => a - b),
    hosts,
    node,
    modules,
    strict,
    env,
    containers: counts,
    apis: found.apis ?? [],
    licenses,
    parts,
    from,
    ai: { ...signatures, tools, files: agentFiles },
  }
}
