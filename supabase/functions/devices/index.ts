import { Hono } from 'hono'
import { app } from '../_backend/public/bundles.ts'

const functionName = 'devices'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)