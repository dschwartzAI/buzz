#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const target = new URL(process.argv[2] || 'https://staging.toolchat.ai')
if (!['http:', 'https:'].includes(target.protocol)) {
  throw new Error('MCP probe target must use http or https')
}

const server = spawn('/usr/local/libexec/buzz-playwright-mcp', [], {
  stdio: ['pipe', 'pipe', 'pipe'],
})
let nextId = 1
let stderr = ''
const pending = new Map()

server.stderr.on('data', chunk => {
  stderr = `${stderr}${chunk}`.slice(-8_192)
})

const lines = createInterface({ input: server.stdout })
lines.on('line', line => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.id === undefined || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(JSON.stringify(message.error)))
  else resolve(message.result)
})

function send(method, params = {}) {
  const id = nextId++
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

function notify(method, params = {}) {
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
}

const timeout = setTimeout(() => {
  server.kill('SIGTERM')
  for (const { reject } of pending.values()) reject(new Error('MCP probe timed out'))
}, 120_000)

try {
  const initialized = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'buzz-playwright-probe', version: '1.0.0' },
  })
  notify('notifications/initialized')

  const listed = await send('tools/list')
  const names = new Set(listed.tools.map(tool => tool.name))
  const required = [
    'browser_close',
    'browser_click',
    'browser_navigate',
    'browser_snapshot',
    'browser_take_screenshot',
    'browser_type',
  ]
  const missing = required.filter(name => !names.has(name))
  if (missing.length) throw new Error(`Missing MCP tools: ${missing.join(', ')}`)

  await send('tools/call', {
    name: 'browser_navigate',
    arguments: { url: target.href },
  })
  const screenshot = await send('tools/call', {
    name: 'browser_take_screenshot',
    arguments: { type: 'png', filename: 'mcp-smoke.png' },
  })
  await send('tools/call', { name: 'browser_close', arguments: {} })

  process.stdout.write(`${JSON.stringify({
    ok: true,
    protocol_version: initialized.protocolVersion,
    tool_count: listed.tools.length,
    required_tools: required,
    screenshot_content_types: screenshot.content.map(item => item.type),
  })}\n`)
} catch (error) {
  if (stderr) process.stderr.write(stderr)
  throw error
} finally {
  clearTimeout(timeout)
  server.stdin.end()
}
