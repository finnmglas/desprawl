// owner: julia
// goal: an endpoint is found wherever a framework hides one, and a call site lands on it

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/graph.ts"
import { calls } from "../src/calls.ts"
import { api, filled, normal, pathy, reading } from "../src/routes.ts"
import { joined } from "../src/routes.ts"
import { repo } from "./repo.ts"

/** every endpoint as "VERB path", sorted, so a test says what it means */
const served = (dir: string) => {
  const graph = build(dir)
  return api(dir, graph, calls(dir, graph))
}
const ends = (found: ReturnType<typeof served>) =>
  found.endpoints.map((one) => `${one.method} ${one.path}`).sort()
const sites = (found: ReturnType<typeof served>) =>
  found.clients.map((one) => `${one.method} ${one.path}`).sort()

test("a path is read the way every framework writes a parameter", () => {
  for (const [raw, want] of [
    ["/users/:id", "/users/*"],
    ["/users/{id}", "/users/*"],
    ["users/<int:pk>/", "/users/*"],
    ["^auth/(?P<pk>[0-9]+)/$", "/auth/*"],
    ["/blog/[slug]/edit", "/blog/*/edit"],
    ["/files/{path:path}", "/files/*"],
    ["*/user/login/", "/*/user/login"],
    ["https://api.example.com/v1/things?page=2", "/v1/things"],
    ["/a//b/", "/a/b"],
  ] as [string, string][])
    assert.equal(normal(raw).path, want, raw)
  assert.equal(normal("https://api.example.com/v1").host, "api.example.com")
  assert.equal(normal("wss://host:9000/ws/events").host, "host:9000")
  assert.equal(normal("/local/only").host, "", "a path names no host")
})

test("a string is a route only when it could be one", () => {
  for (const one of ["/api/users", "api/users", "https://x.dev/a", "*/a/b", "/a/{id}"])
    assert.ok(pathy(one), one)
  for (const one of [
    "./relative.ts",
    "../up",
    "text/plain",
    "/logo.svg",
    "a b",
    "C:/windows",
    "",
    "plain",
  ])
    assert.ok(!pathy(one), one)
})

test("a base url held in a name is read back out of the template", () => {
  const consts = new Map([
    ["BASE", "/subscriptions"],
    ["_ROOT", "https://api.stripe.com/v1"],
  ])
  assert.equal(filled("{BASE}/plans", consts), "/subscriptions/plans")
  assert.equal(filled("${BASE}/plans", consts), "/subscriptions/plans")
  assert.equal(filled("$_ROOT/charges", consts), "https://api.stripe.com/v1/charges")
  assert.equal(filled("{unknown}/x", consts), "{unknown}/x", "a name it cannot see stays a hole")
})

test("express, nest and a next route file all say what they serve", () => {
  const found = served(
    repo({
      "package.json": JSON.stringify({ dependencies: { express: "4" } }),
      "server/index.ts":
        "import express from 'express'\nimport { users } from './users.ts'\n" +
        "const app = express()\napp.use('/api/v1', users)\napp.get('/health', (req, res) => res.end())\n",
      "server/users.ts":
        "import { Router } from 'express'\nimport { handler } from './handler.ts'\n" +
        "export const users = Router()\n" +
        "users.get('/users/:id', handler)\nusers.post('/users', handler)\n",
      "server/handler.ts": "export function handler(req, res) { res.end() }\n",
      "src/cats/cats.controller.ts":
        "@Controller('cats')\nexport class CatsController {\n  @Get(':id')\n  one() {}\n  @Post()\n  make() {}\n}\n",
      "app/api/things/[id]/route.ts":
        "export async function GET() {}\nexport async function DELETE() {}\n",
      "app/(marketing)/api/mail/route.ts": "export const POST = async () => {}\n",
    }),
  )
  const said = ends(found)
  assert.deepEqual(said, [
    "DELETE /api/things/*",
    "GET /api/things/*",
    "GET /api/v1/users/*",
    "GET /cats/*",
    "GET /health",
    "POST /api/mail",
    "POST /api/v1/users",
    "POST /cats",
  ])
  // the handler is in another file, and that is the file a request arrives at
  const users = found.endpoints.find((one) => one.path === "/api/v1/users")
  assert.equal(users?.file, "server/users.ts", "the route is written there")
  assert.equal(users?.handler, "server/handler.ts", "and answered somewhere else")
})

test("django's routing table is read through its includes and its routers", () => {
  const found = served(
    repo({
      "app/urls.py":
        "from django.urls import include, path\n" +
        "urlpatterns = [\n" +
        "    path('user/', include('users.urls')),\n" +
        "    path('health/', HealthView.as_view()),\n" +
        "]\n",
      "users/urls.py":
        "from django.urls import path\nfrom rest_framework.routers import DefaultRouter\n" +
        "from users.views import ProfileViewSet, LoginView\n" +
        "router = DefaultRouter()\nrouter.register(r'profiles', ProfileViewSet)\n" +
        "urlpatterns = [\n" +
        "    path('auth/login/', LoginView.as_view(), name='login'),\n" +
        "    re_path(r'^auth/token/(?P<pk>[0-9]+)/$', LoginView.as_view()),\n" +
        "] + router.urls\n",
      "users/views.py":
        "from rest_framework.decorators import action\n" +
        "class ProfileViewSet:\n" +
        "    @action(detail=True, methods=['post'], url_path='set-name')\n" +
        "    def set_name(self, request, pk=None):\n        return None\n" +
        "class LoginView:\n    def post(self, request):\n        return None\n",
    }),
  )
  const said = ends(found)
  assert.ok(said.includes("ANY /user/auth/login"), `login missing from ${said.join(", ")}`)
  assert.ok(said.includes("ANY /user/auth/token/*"), "a regex route is a route")
  assert.ok(said.includes("GET /user/profiles"), "a viewset lists")
  assert.ok(said.includes("DELETE /user/profiles/*"), "and it has a detail route")
  assert.ok(said.includes("POST /user/profiles/*/set-name"), "and whatever it adds itself")
  assert.ok(!said.includes("ANY /user"), "an include is a mount, not a route of its own")
  // the class behind the route is where the request arrives
  assert.equal(
    found.endpoints.find((one) => one.path === "/user/profiles")?.handler,
    "users/views.py",
  )
})

test("fastapi and flask hang their routers under a prefix", () => {
  const found = served(
    repo({
      "main.py":
        "from fastapi import FastAPI\nfrom api import things\n" +
        "app = FastAPI()\napp.include_router(things.router, prefix='/api/v2')\n",
      "api/things.py":
        "from fastapi import APIRouter\nrouter = APIRouter()\n" +
        "@router.get('/things/{id}')\nasync def one(id: str):\n    return id\n" +
        "@router.post('/things')\nasync def make():\n    return None\n",
      "serve.py":
        "from flask import Flask\napp = Flask(__name__)\n" +
        "@app.route('/ping', methods=['GET', 'POST'])\ndef ping():\n    return 'ok'\n",
    }),
  )
  const said = ends(found)
  assert.ok(said.includes("GET /api/v2/things/*"), said.join(", "))
  assert.ok(said.includes("POST /api/v2/things"))
  assert.ok(said.includes("GET /ping") && said.includes("POST /ping"), "both verbs it lists")
})

test("a call site is a call site whatever library makes it, and never a link", () => {
  const found = served(
    repo({
      "package.json": JSON.stringify({ dependencies: { axios: "1" } }),
      "src/api.ts":
        "import axios from 'axios'\nconst BASE = '/subscriptions'\n" +
        "export const plans = () => axios.get(`${BASE}/plans`, { headers: {} })\n" +
        "export const load = () => fetch('/api/things', { method: 'POST' })\n" +
        "export const live = () => new WebSocket('wss://example.dev/ws/events')\n" +
        "export const away = () => axios.get('https://api.stripe.com/v1/charges')\n",
      "src/pages.tsx":
        "export const links = [{ url: 'https://example.dev/pricing', lastModified: '2026-01-01' }]\n",
    }),
  )
  const said = sites(found)
  assert.deepEqual(said, [
    "GET /subscriptions/plans",
    "GET /v1/charges",
    "POST /api/things",
    "WS /ws/events",
  ])
  const stripe = found.clients.find((one) => one.path === "/v1/charges")
  assert.equal(stripe?.host, "api.stripe.com", "a named host is worth keeping")
  assert.equal(found.links.length, 0, "nothing here serves any of those")
})

test("a call site lands on the endpoint it names, in this repo or the next one", () => {
  const back = reading(
    repo({
      "urls.py":
        "from django.urls import path\nfrom views import LoginView\n" +
        "urlpatterns = [path('user/auth/login/', LoginView.as_view())]\n",
      "views.py": "class LoginView:\n    def post(self, request):\n        return None\n",
    }),
  )
  const front = reading(
    repo({
      "package.json": JSON.stringify({ dependencies: { axios: "1" } }),
      "lib/auth.ts":
        "import axios from 'axios'\nconst base = process.env.API\n" +
        "export const login = () => axios.post(`${base}/user/auth/login/`, {})\n" +
        "export const other = () => axios.get('https://api.trello.com/1/members/me')\n",
    }),
  )
  // the fleet reads as one wire, each repo under its own name
  const at = (name: string, held: { file: string; id: string }[]) =>
    held.map((one) => ({ ...one, file: `${name}/${one.file}`, id: `${name}/${one.id}` }))
  const found = joined(
    [
      ...at("back", back.endpoints).map((one) => ({
        ...one,
        handler: one.handler ? `back/${one.handler}` : undefined,
      })),
      ...at("front", front.endpoints),
    ] as never,
    [...at("back", back.clients), ...at("front", front.clients)] as never,
  )
  assert.equal(found.links.length, 1, "one call lands, the other belongs to trello")
  const [link] = found.links
  assert.equal(link.from, "front/lib/auth.ts")
  assert.equal(link.to, "back/views.py", "the file behind the route, not the routing table")
  assert.equal(link.method, "POST")
  assert.equal(link.how, "tail", "the base url was leading segments this repo never wrote")
})

test("what serves and what calls are told apart where the shape is the same", () => {
  const found = served(
    repo({
      "package.json": JSON.stringify({ dependencies: { fastify: "4" } }),
      "server.ts":
        "import Fastify from 'fastify'\nconst app = Fastify()\n" +
        "app.get('/orders/:id', async (req) => req.params)\n" +
        "app.post('/orders', async () => ({}))\n",
      "client.ts":
        "const api = { get: (u: string) => u }\nexport const one = () => api.get('/orders/7')\n",
    }),
  )
  assert.deepEqual(ends(found), ["GET /orders/*", "POST /orders"])
  assert.deepEqual(sites(found), ["GET /orders/7"])
  assert.equal(found.links.length, 1, "the call reaches the route it names")
  assert.equal(found.links[0].to, "server.ts")
})

test("a retrofit annotation is a call and a spring one is a route", () => {
  const found = served(
    repo({
      "app/src/main/kotlin/com/x/Api.kt":
        "package com.x\nimport retrofit2.http.GET\ninterface Api {\n" +
        '  @GET("v1/flows")\n  suspend fun flows(): List<String>\n}\n',
      "app/src/main/kotlin/com/x/Controller.kt":
        "package com.x\nimport org.springframework.web.bind.annotation.GetMapping\n" +
        '@RequestMapping("/v1")\nclass Controller {\n' +
        '  @GetMapping("/flows")\n  fun flows(): String { return "" }\n}\n',
    }),
  )
  assert.deepEqual(ends(found), ["GET /v1/flows"])
  assert.deepEqual(sites(found), ["GET /v1/flows"])
  assert.equal(found.links.length, 1, "the android call reaches the controller")
})

test("a server with no framework at all is still a server, and a nav check is not", () => {
  const found = served(
    repo({
      "serve.ts":
        "import { createServer } from 'node:http'\n" +
        "createServer((req, res) => {\n" +
        "  const url = new URL(req.url ?? '/', 'http://host')\n" +
        "  if (url.pathname === '/api/stats') return res.end('{}')\n" +
        "  if (url.pathname === '/api/prefs') return res.end('{}')\n" +
        "}).listen(7423)\n",
      "nav.tsx":
        "import { usePathname } from 'next/navigation'\n" +
        "export function Nav() {\n  const pathname = usePathname()\n" +
        "  return pathname === '/signin' ? null : null\n}\n",
      "read.ts": "export const stats = () => fetch('/api/stats')\n",
    }),
  )
  assert.deepEqual(
    ends(found),
    ["ANY /api/prefs", "ANY /api/stats"],
    "the nav check is not a route",
  )
  assert.equal(found.links.length, 1)
  assert.equal(found.links[0].to, "serve.ts")
})

test("a niche framework is still a framework: every family, one file each", () => {
  const found = served(
    repo({
      // ---- javascript, past express ----
      "srv/koa.ts":
        "import Router from '@koa/router'\nconst router = new Router()\n" +
        "router.get('/koa/things', ctx => ctx.body)\n",
      "srv/hono.ts":
        "import { Hono } from 'hono'\nconst app = new Hono()\napp.post('/hono/things', c => c.json({}))\n",
      "srv/fastify.ts":
        "import Fastify from 'fastify'\nconst server = Fastify()\n" +
        "server.route('/fastify/things').get(handler)\n",
      "web/routes/api/kit/+server.ts": "export const GET = async () => new Response()\n",
      "server/api/nuxt/things.post.ts": "export default defineEventHandler(() => ({}))\n",
      // ---- python, past django and flask ----
      "py/aio.py":
        "from aiohttp import web\napp = web.Application()\n" +
        "app.router.add_get('/aio/things', handler)\n",
      "py/star.py":
        "from starlette.routing import Route\nroutes = [Route('/star/things', endpoint=home, methods=['GET'])]\n",
      // ---- the jvm ----
      "jvm/src/main/kotlin/Res.kt":
        'import jakarta.ws.rs.Path\n@Path("/jax")\nclass Res {\n  @GET\n  @Path("/things")\n  fun list(): String { return "" }\n}\n',
      "jvm/src/main/kotlin/Server.kt":
        "import io.ktor.server.routing.get\nfun Application.routes() {\n" +
        '  routing {\n    get("/ktor/things") {\n      call.respond("")\n    }\n  }\n}\n',
      // ---- go ----
      "go/gin.go":
        'package main\nimport "github.com/gin-gonic/gin"\nfunc main() {\n' +
        '\tr := gin.Default()\n\tr.GET("/gin/things", listThings)\n' +
        '\thttp.HandleFunc("/plain/things", handle)\n}\n',
      "go/call.go":
        'package main\nimport "net/http"\nfunc fetchIt() {\n' +
        '\treq, _ := http.NewRequest("POST", "https://api.go.dev/v1/things", body)\n}\n',
      // ---- rust ----
      "rs/src/main.rs":
        '#[get("/actix/things")]\nasync fn things() -> impl Responder { "" }\n' +
        'fn app() -> Router { Router::new().route("/axum/things", post(make)) }\n',
      // ---- c# ----
      "cs/Controller.cs":
        '[Route("api/cs")]\npublic class ThingsController {\n' +
        '  [HttpGet("things")]\n  public string List() { return ""; }\n}\n',
      // ---- php ----
      "php/routes.php":
        "<?php\nRoute::get('/laravel/things', [ThingController::class, 'index']);\n",
      // ---- ruby ----
      "rb/config/routes.rb":
        "Rails.application.routes.draw do\n  get 'rails/things', to: 'things#index'\nend\n",
      // ---- the boards ----
      "ino/sketch.ino":
        '#include <HTTPClient.h>\nvoid setup() {\n  server.on("/board/status", handleStatus);\n' +
        '  http.begin(client, "https://api.board.dev/v1/telemetry");\n}\n',
    }),
  )
  const said = ends(found)
  for (const one of [
    "GET /koa/things",
    "POST /hono/things",
    "GET /fastify/things",
    "GET /api/kit",
    "POST /api/nuxt/things",
    "GET /aio/things",
    "GET /star/things",
    "ANY /jax/things",
    "GET /ktor/things",
    "GET /gin/things",
    "ANY /plain/things",
    "GET /actix/things",
    "POST /axum/things",
    "GET /api/cs/things",
    "GET /laravel/things",
    "GET /rails/things",
    "ANY /board/status",
  ])
    assert.ok(said.includes(one), `${one} missing from ${said.join(", ")}`)
  const asked = sites(found)
  for (const one of ["POST /v1/things", "ANY /v1/telemetry"])
    assert.ok(asked.includes(one), `${one} missing from ${asked.join(", ")}`)
})
