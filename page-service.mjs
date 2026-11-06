// Loopback page service. Inventory is projected explicitly: no raw credentials,
// account records, endpoint URLs, server arguments or skill bodies reach HTML.
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { validateOptions } from './options.mjs'

export const list = (value, keys = ['items', 'entries', 'agents', 'bots', 'connections', 'connectors', 'toolkits', 'tools']) => {
  if (Array.isArray(value)) return value
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key]
  throw Error('返回的列表格式无法识别')
}
const text = value => typeof value === 'string' ? value.slice(0, 500) : ''
export const selected = items => (items ?? []).filter(x => x && x.offHere !== true && x.disabled !== true && x.enabled !== false && x.agents?.includes('ducoro'))
export const policyRows = value => list(value, ['connectors', 'equipment', 'items']).map(x => ({
  slug: text(x.toolkit ?? x.toolkitSlug ?? x.slug),
  allow: x.allow ?? x.toolPolicy?.allow ?? [], deny: x.deny ?? x.toolPolicy?.deny ?? [],
}))
export const toolRows = value => list(value, ['tools', 'items']).map(x => ({
  slug: text(x.slug ?? x.name ?? x.function?.name), name: text(x.displayName ?? x.title ?? x.name ?? x.slug),
  description: text(x.description ?? x.function?.description),
})).filter(x => x.slug)
const jsonFile = async path => JSON.parse(await readFile(path, 'utf8'))

export async function inventory({ options, paths, run }) {
  const warnings = []
  const read = async (args, label, project) => {
    try {
      const result = await run(args, { timeoutMs: 15000 })
      if (!result.ok) throw Error()
      return project(result.json)
    } catch { warnings.push(`${label}读取失败，请确认 Ducoro 已启动并刷新。`); return null }
  }
  const [bots, routes, catalog, library] = await Promise.all([
    read(['agent','list'], 'Bot 列表', value => list(value, ['agents','bots']).map(x => ({
      id: text(x.id), name: text(x.name) || text(x.id), runtime: text(x.modelPreference?.runtime),
      connectionSlug: text(x.modelPreference?.connectionSlug), model: text(x.modelPreference?.model),
    }))),
    read(['connections','list','--with-status'], '模型列表', value => list(value, ['connections'])),
    read(['mcp','catalog'], 'Ducoro 连接器目录', value => ({
      sourceStatus: text(value?.connectorSource ?? 'ok'),
      items: list(value, ['entries','items','connectors','catalog','toolkits']).filter(x => x.source !== 'local').map(x => ({
        slug: text(x.slug ?? x.toolkit ?? x.id), name: text(x.name ?? x.displayName ?? x.slug),
        status: text(x.status ?? x.connectionStatus ?? (x.connected === true ? 'connected' : 'disconnected')), source: text(x.source),
      })).filter(x => x.slug && !['__proto__','constructor','prototype'].includes(x.slug)),
    })),
    jsonFile(paths.library).then(value => {
      if (!Array.isArray(value.mcp ?? []) || !Array.isArray(value.skills ?? [])) throw Error()
      return { mcp: selected(value.mcp).map(x => ({name: text(x.name)})), skills: selected(value.skills).map(x => ({name: text(x.name)})) }
    }).catch(() => { warnings.push('Magpie 资源库读取失败，现有分配会保留。'); return null }),
  ])
  const route = routes?.find(x => x.slug === options.connectionSlug)
  const models = route ? (route.availableModelInfos ?? []).filter(x => !route.models?.length || route.models.includes(x.id)).map(x => ({id: text(x.id), name: text(x.name ?? x.id)})) : []
  if (!route && routes) warnings.push('尚未找到 Magpie 模型连接，请先在 Magpie 中连接 Ducoro。')
  if (catalog && catalog.sourceStatus !== 'ok') warnings.push('Ducoro 账户连接器目录暂不可用，请检查账户配对状态。')
  return { bots, models, defaultModel: text(route?.defaultModel), library, catalog, warnings, updatedAt: new Date().toISOString() }
}

export async function createPageService({ options, paths, stateDir, run, trigger, getReport, log = () => {}, retryDelayMs = 500 }) {
  await mkdir(stateDir,{recursive:true})
  const tokenFile=join(stateDir,'page-token')
  try { await writeFile(tokenFile,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600}) }
  catch(error) { if(error.code!=='EEXIST')throw error }
  const token=(await readFile(tokenFile,'utf8')).trim()
  if(!/^[a-f0-9]{64}$/.test(token))throw Error('页面令牌文件无效')
  const root = fileURLToPath(new URL('./ui/', import.meta.url))
  const port = options.servicePort ?? 3487
  const call = async args => {
    const result = await run(args, { timeoutMs: 20000 })
    if (!result.ok) throw Error('Ducoro 暂不可用，或不支持此操作。请检查后台及账户状态。')
    return result.json
  }
  const server = createServer(async (req, res) => {
    const reply = (code, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(code, {'Content-Type': type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'})
      res.end(type.startsWith('application/json') ? JSON.stringify(body) : body)
    }
    try {
      // Explicit Host checks stop DNS rebinding. Magpie's proxy rewrites Host.
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return reply(403, {error:'访问地址无效'})
      const url = new URL(req.url, `http://127.0.0.1:${port}`)
      const path = url.pathname.replace(/^\//,'')
      if (path.startsWith('api/')) {
        const origin = req.headers.origin
        if (origin && origin !== 'null' && origin !== `http://${req.headers.host}`) return reply(403,{error:'请求来源无效'})
        if (origin === 'null') {
          res.setHeader('Access-Control-Allow-Origin','null')
          res.setHeader('Vary','Origin')
        }
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods','GET, POST')
          res.setHeader('Access-Control-Allow-Headers','X-Ducoro-Token, Content-Type')
          return reply(204,'','text/plain')
        }
        if (req.headers['x-ducoro-token'] !== token) return reply(403, {error:'页面连接已更新，请重新读取页面'})
        if (req.method === 'GET' && path === 'api/inventory') return reply(200, await inventory({options,paths,run}))
        if (req.method === 'GET' && path === 'api/report') return reply(200, await getReport())
        if (req.method === 'GET' && path === 'api/tools') {
          const slug = url.searchParams.get('slug')
          if (!/^[a-zA-Z0-9_-]+$/.test(slug ?? '')) return reply(400,{error:'连接器标识无效'})
          return reply(200, toolRows(await call(['mcp','catalog','tools',slug])))
        }
        if (req.method === 'GET' && path === 'api/equipment') {
          const id = url.searchParams.get('id')
          if (!/^agt-[A-Za-z0-9-]+$/.test(id ?? '')) return reply(400,{error:'Bot 标识无效'})
          return reply(200, policyRows(await call(['agent','connector','list',id])))
        }
        if (req.method === 'POST' && path === 'api/retry') { trigger('page-retry',0); return reply(200,{queued:true}) }
        if (req.method === 'POST' && path === 'api/validate') {
          let size = 0, chunks = []
          for await (const chunk of req) { size += chunk.length; if (size > 512 * 1024) return reply(413,{error:'设置内容过大'}); chunks.push(chunk) }
          const value = JSON.parse(Buffer.concat(chunks).toString())
          if (validateOptions(value).length) return reply(400,{error:'设置格式无效，请检查分配和工具权限。'})
          return reply(200,{valid:true})
        }
        return reply(404,{error:'操作不存在'})
      }
      if (req.method !== 'GET') return reply(405,{error:'不支持此操作'})
      const file = path || 'index.html'
      if (!['index.html','style.css','app.js','model.js','service-bridge.js','resources.js','ducoro.svg'].includes(file)) return reply(404,{error:'文件不存在'})
      let body = await readFile(join(root,file))
      const types = {html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml'}
      if (file === 'index.html') {
        body = Buffer.from(body.toString().replace('<!--SERVICE_TOKEN-->', `<meta name="ducoro-token" content="${token}">`))
        // Explicit loopback sources work inside WebKit's opaque sandbox.
        res.setHeader('Content-Security-Policy', `sandbox allow-scripts; default-src 'none'; script-src 'self' http://127.0.0.1:${port}; style-src 'self' 'unsafe-inline' http://127.0.0.1:${port}; img-src 'self' data: http://127.0.0.1:${port}; connect-src 'self' http://127.0.0.1:${port}; frame-ancestors 'self' wails://localhost http://127.0.0.1:* http://localhost:*`)
      }
      reply(200, body, types[file.split('.').pop()])
    } catch { reply(503,{error:'读取失败，请检查 Ducoro 是否运行，然后重试。'}) }
  })
  // Hosts overlap during reload. Keep trying after the old listener exits,
  // without closing or replacing a listener owned by another process.
  let closed = false, retryTimer = null, listening = false, warned = false
  const listen = () => new Promise((resolve, reject) => {
    const onError = error => {
      server.removeListener('listening', onListening)
      if (error.code !== 'EADDRINUSE') return reject(error)
      if (!warned) { log('Ducoro page service port is busy; waiting to reconnect'); warned = true }
      if (!closed) {
        retryTimer = setTimeout(() => { retryTimer = null; void listen().catch(() => log('Ducoro page service could not restart')) }, retryDelayMs)
        retryTimer.unref?.()
      }
      resolve()
    }
    const onListening = () => {
      server.removeListener('error', onError)
      listening = true
      if (warned) log('Ducoro page service reconnected')
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
  await listen()
  server.unref()
  return { get listening() { return listening }, close: () => new Promise(resolve => {
    closed = true
    clearTimeout(retryTimer)
    listening = false
    server.closeAllConnections?.()
    server.close(() => resolve())
  }) }
}
