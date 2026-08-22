// owner: finn
// goal: an endpoint is found wherever a framework hides one, and a call site lands on it

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/read/graph.ts"
import { calls } from "../src/read/calls.ts"
import { api, filled, pathy, reading } from "../src/read/routes.ts"
import { normal } from "../src/read/specs.ts"
import { joined } from "../src/read/routes.ts"
import { everyApi } from "../src/facts/many.ts"
import { folder, repo } from "./repo.ts"

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

test("a group, a nesting and an options object all put a route somewhere else", () => {
  const found = served(
    repo({
      "go/api.go":
        'package main\nimport "github.com/gin-gonic/gin"\nfunc routes(r *gin.Engine) {\n' +
        '\tapi := r.Group("/api/v2")\n\tapi.GET("/things", list)\n\tapi.POST("/things", make)\n' +
        '\tr.GET("/health", up)\n}\n',
      "rb/config/routes.rb":
        "Rails.application.routes.draw do\n" +
        "  namespace :api do\n    namespace :v1 do\n      get 'things', to: 'things#index'\n" +
        "    end\n  end\n  get 'health', to: 'up#show'\nend\n",
      "srv/hapi.ts":
        "import Hapi from '@hapi/hapi'\nconst server = Hapi.server({})\n" +
        "server.route({ method: 'GET', path: '/hapi/things', handler: () => [] })\n",
      "srv/call.ts":
        "import axios from 'axios'\n" +
        "export const one = () => axios({ url: '/api/v2/things', method: 'POST', data: {} })\n",
    }),
  )
  const said = ends(found)
  assert.ok(said.includes("GET /api/v2/things"), `a group is a prefix: ${said.join(", ")}`)
  assert.ok(said.includes("GET /health"), "and it stops where the group does")
  assert.ok(said.includes("GET /api/v1/things"), "rails nests by indentation")
  assert.ok(said.includes("GET /health"), "and closes again")
  assert.ok(said.includes("GET /hapi/things"), "an options object holding a handler is a route")
  assert.deepEqual(sites(found), ["POST /api/v2/things"], "and one holding a body is a call")
  assert.equal(found.links.length, 1)
})

test("a document that lists endpoints is read as endpoints", () => {
  const found = served(
    repo({
      "docs/openapi.yaml":
        "openapi: 3.0.0\ninfo:\n  title: things\nservers:\n  - url: https://api.example.com/v3\n" +
        "paths:\n  /things:\n    get:\n      summary: list\n    post:\n      summary: make\n" +
        "  /things/{id}:\n    delete:\n      summary: drop\n" +
        "components:\n  schemas:\n    Thing:\n      type: object\n",
      "docs/other.json": JSON.stringify({
        openapi: "3.1.0",
        paths: { "/v2/orders": { get: {}, put: {} } },
      }),
      "serverless.yml":
        "service: things\nprovider:\n  name: aws\nfunctions:\n  list:\n    handler: h.list\n" +
        "    events:\n      - http:\n          path: /lambda/things\n          method: get\n" +
        "  make:\n    handler: h.make\n    events:\n      - http:\n          path: /lambda/things\n" +
        "          method: post\n",
      "proto/orders.proto":
        'syntax = "proto3";\npackage shop.v1;\n\nservice Orders {\n' +
        "  rpc List (ListRequest) returns (ListReply);\n  rpc Drop (DropRequest) returns (Empty);\n}\n",
      "collection/list.bru": "meta {\n  name: list\n}\n\nget {\n  url: {{host}}/v3/things\n}\n",
      "collection/api.http":
        "### list them\nGET https://api.example.com/v3/things\n\nPOST /v2/orders\n",
      "collection/x.postman_collection.json": JSON.stringify({
        item: [
          { name: "drop", request: { method: "DELETE", url: { raw: "{{base}}/v3/things/7" } } },
          { item: [{ name: "put", request: { method: "PUT", url: "{{base}}/v2/orders" } }] },
        ],
      }),
    }),
  )
  const said = ends(found)
  assert.ok(said.includes("GET /v3/things"), `servers: is a prefix: ${said.join(", ")}`)
  assert.ok(said.includes("POST /v3/things"))
  assert.ok(said.includes("DELETE /v3/things/*"), "a parameter is a parameter in yaml too")
  assert.ok(said.includes("GET /v2/orders") && said.includes("PUT /v2/orders"), "json as well")
  assert.ok(said.includes("POST /shop.v1.Orders/List"), "a proto service is a path on the wire")
  assert.ok(said.includes("GET /lambda/things"), "an http event is a route the cloud serves")
  assert.ok(said.includes("POST /lambda/things"))
  assert.ok(said.includes("POST /shop.v1.Orders/Drop"))
  assert.ok(!said.includes("GET /components"), "nothing below the paths block is a path")
  // every collection entry lands on the endpoint the spec described
  const asked = sites(found)
  // a leading {{host}} names which service answers, so it is a host and not a first segment
  assert.ok(asked.includes("GET /v3/things"), asked.join(", "))
  assert.ok(asked.includes("DELETE /v3/things/7"))
  assert.ok(asked.includes("PUT /v2/orders"))
  assert.deepEqual(
    [...new Set(found.clients.filter((one) => one.host).map((one) => one.host))].sort(),
    ["*base", "*host", "api.example.com"],
  )
  // the spec says which host it answers on, so a request naming that host lands here
  assert.ok(
    found.links.some((one) => one.call.includes("api.http") && one.path === "/v3/things"),
    "a host the spec declares is this fleet's own",
  )
  // and POST /v2/orders is nobody's: the document lists a get and a put on that path
  assert.equal(found.links.length, 4, `every request but one: ${found.links.length}`)
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
      // ---- a runtime with a table, and the frameworks that decorate bare ----
      "srv/bun.ts":
        "const server = Bun.serve({\n  routes: {\n    '/bun/things': { GET: () => new Response('') },\n" +
        "    '/bun/things/:id': (req) => new Response(''),\n  },\n})\n",
      "py/tornado_app.py":
        "import tornado.web\napp = tornado.web.Application([\n" +
        "    (r'/tornado/things', ThingsHandler),\n])\n",
      "py/bottle_app.py":
        "from bottle import route, get\n@route('/bottle/things')\ndef things():\n    return {}\n" +
        "@patch('py.thing.helper')\ndef test_it():\n    pass\n",
      "py/restful.py":
        "from flask_restful import Api\napi = Api(app)\napi.add_resource(Todo, '/restful/things/<id>')\n",
      // ---- clients that declare rather than call ----
      "cs/Client.cs":
        'public interface IThings {\n  [Get("/refit/things")]\n  Task<string> List();\n}\n',
      "swift/Net.swift": 'func load() {\n  AF.request("https://api.swift.dev/v1/things")\n}\n',
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
    "GET /jax/things",
    "GET /ktor/things",
    "GET /gin/things",
    "ANY /plain/things",
    "GET /actix/things",
    "POST /axum/things",
    "GET /api/cs/things",
    "GET /laravel/things",
    "GET /rails/things",
    "ANY /board/status",
    "GET /bun/things",
    "ANY /bun/things/*",
    "ANY /tornado/things",
    "ANY /bottle/things",
    "ANY /restful/things/*",
  ])
    assert.ok(said.includes(one), `${one} missing from ${said.join(", ")}`)
  const asked = sites(found)
  for (const one of ["POST /v1/things", "ANY /v1/telemetry", "GET /refit/things", "ANY /v1/things"])
    assert.ok(asked.includes(one), `${one} missing from ${asked.join(", ")}`)
})

test("a flutter app's calls are read, and a dart server's routes are not one of them", () => {
  const found = served(
    repo({
      "pubspec.yaml": "name: app\ndependencies:\n  http: ^1.2.0\n  dio: ^5.4.0\n  shelf: ^1.4.0\n",
      "lib/api.dart": [
        "import 'package:http/http.dart' as http;",
        "import 'package:dio/dio.dart';",
        "",
        "class Api {",
        "  final Dio dio = Dio();",
        "",
        "  Future<void> one(String id) async {",
        "    await http.get(Uri.parse('/api/v1/users/\$id'));",
        "  }",
        "",
        "  Future<void> two() async {",
        "    await dio.post('/api/v1/notes', data: 1);",
        "  }",
        "}",
      ].join("\n"),
      "lib/serve.dart": [
        "import 'package:shelf_router/shelf_router.dart';",
        "",
        "void wire(Router router) {",
        "  router.get('/api/v1/health', (request) {",
        "    return 'ok';",
        "  });",
        "}",
      ].join("\n"),
    }),
  )
  assert.deepEqual(sites(found), ["GET /api/v1/users/*", "POST /api/v1/notes"].sort())
  assert.deepEqual(ends(found), ["GET /api/v1/health"])
})

test("a graphql request is named by its operation, since its url names nothing", () => {
  const found = served(
    repo({
      "bruno/schema.bru": [
        "meta {",
        "  name: 00 List Schema Types",
        "  type: graphql",
        "  seq: 1",
        "}",
        "",
        "post {",
        "  url: {{baseUrl}}",
        "  body: graphql",
        "  auth: inherit",
        "}",
        "",
        "body:graphql {",
        "  query ListAllTypes {",
        "    __schema { types { name } }",
        "  }",
        "}",
      ].join("\n"),
      "bruno/orders.bru": [
        "meta {",
        "  name: orders",
        "  type: graphql",
        "}",
        "",
        "post {",
        "  url: {{baseUrl}}",
        "}",
        "",
        "body:graphql {",
        "  mutation PlaceOrder { place(id: 1) { ok } }",
        "}",
      ].join("\n"),
      // and a rest call in the same collection still reads as a path
      "bruno/native.bru":
        "meta {\n  name: native\n}\n\nget {\n  url: {{ServiceUrl}}/api/things/one\n}\n",
    }),
  )
  assert.deepEqual(
    found.clients.map((one) => one.name ?? one.path).sort(),
    ["/api/things/one", "mutation PlaceOrder", "query ListAllTypes"],
    "two operations and one path, not three copies of POST /*",
  )
  assert.equal(
    found.clients.find((one) => one.path === "/api/things/one")?.host,
    "*ServiceUrl",
    "the variable says which service answers, so it is a host",
  )
})

test("a route decorator is a route, and never also a request", () => {
  const found = served(
    repo({
      "pyproject.toml": '[project]\nname = "api"\ndependencies = ["fastapi"]\n',
      "app/routes.py": [
        "from fastapi import APIRouter",
        "from starlette.status import HTTP_200_OK",
        "",
        "router = APIRouter(prefix='/admin')",
        "",
        "",
        "@router.post('/account/{uuid}/refresh', status_code=HTTP_200_OK)",
        "def refresh(uuid: str):",
        "    return 1",
        "",
      ].join("\n"),
    }),
  )
  assert.deepEqual(ends(found), ["POST /admin/account/*/refresh"])
  assert.deepEqual(sites(found), [], "the same line is not also an outbound request")
})

test("a document describing another repo's api serves nothing", () => {
  const serves = {
    "pyproject.toml": '[project]\nname = "back"\ndependencies = ["fastapi"]\n',
    "app/main.py": [
      "from fastapi import APIRouter",
      "",
      "router = APIRouter(prefix='/api/v1')",
      "",
      "",
      "@router.get('/users')",
      "def users():",
      "    return []",
      "",
    ].join("\n"),
  }
  const holds = {
    "package.json": '{"name":"portal"}',
    // the codegen snapshot a frontend keeps of the backend it calls
    "spec/openapi.json": JSON.stringify({
      openapi: "3.0.0",
      paths: { "/api/v1/users": { get: {} }, "/api/v1/gone": { get: {} } },
    }),
    "src/a.ts": "export const go = () => 1\n",
  }
  const together = everyApi(folder({ service: [serves], portal: [holds] }))
  assert.deepEqual(
    together.endpoints.map((one) => `${one.file} ${one.path}`).sort(),
    ["portal/spec/openapi.json /api/v1/gone", "service/app/main.py /api/v1/users"],
    "the described one folds into the code, the one nobody answers stands",
  )
  assert.equal(together.stats.described, 1)

  // and alone, a spec is the only thing that can say what a repo serves
  const alone = api(repo(holds))
  assert.equal(alone.endpoints.length, 2)
  assert.equal(alone.stats.described, 0)
})

test("a request whose path lives in a constants file is counted, not silently dropped", () => {
  const found = served(
    repo({
      "package.json": '{"name":"held","dependencies":{"ky":"1.0.0"}}',
      "src/constants.ts": "export const ENDPOINT = { GET: (id: string) => `x/${id}` }\n",
      "src/data.ts": [
        "import { ENDPOINT } from './constants'",
        "const apiClient = { get: (u: string) => u, post: (u: string, b: string) => u }",
        "",
        "export const one = (id: string) => apiClient.get(ENDPOINT.GET(id))",
        "export const two = (b: string) => apiClient.post(ENDPOINT.GET('a'), b)",
        "export const three = () => apiClient.get('/health')",
        "",
      ].join("\n"),
    }),
  )
  assert.deepEqual(sites(found), ["GET /health"])
  assert.equal(found.stats.unread, 2, "two calls were made, and neither path was written here")
})
