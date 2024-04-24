import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { z } from 'zod'
import { verifyProxiedDownloadSignatire } from '../../utils/proxied_download.ts'
import { s3 } from '../../utils/s3.ts'

const jsonRequestSchema = z.object({
  digest: z.string(),
  expiry: z.number(),
  path: z.string(),
  appId: z.string(),
  bundleId: z.string(),
})

export const app = new Hono()

app.get('/', async (c: Context) => {
  try {
    const detailsEncoded = await c.req.query('details')

    if (!detailsEncoded)
      return c.json({ status: 'Search parms do not include details' }, 500)

    const details = JSON.parse(atob(detailsEncoded))
    console.log(details)

    const parsedDetails = jsonRequestSchema.safeParse(details)
    if (!parsedDetails.success) {
      console.log('ZOD SCHEMA ERROR (proxy)', parsedDetails.error)
      return c.json({ status: 'Details do not match zod schema' }, 500)
    }

    const finalDetail = parsedDetails.data

    // Let's verify the signature
    // const valid = await verifyProxiedDownloadSignatire(c, finalDetail.digest, finalDetail)

    const s3Url = await s3.getSignedUrl(c, finalDetail.path, 100)

    // return c.json({ ok: 'not ok' }, 500)
    return c.redirect(s3Url)
  }
  catch (e) {
    console.log('error', JSON.stringify(e))
    return c.json({ status: 'Cannot get updates', error: JSON.stringify(e) }, 500)
  }
})
