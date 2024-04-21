const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-512' }, true, ['sign', 'verify'])
const exported = await crypto.subtle.exportKey('raw', key)
// eslint-disable-next-line node/prefer-global/buffer
const exportedBuffer = Buffer.from(exported)

console.log(exportedBuffer.toString('base64'))
