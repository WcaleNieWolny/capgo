import { Hono } from 'hono/tiny'
import { app } from '../_backend/private/plugins/proxied_download.ts'

// TODO: deprecated remove when everyone use the new CLI
const functionName = 'proxied_download'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
