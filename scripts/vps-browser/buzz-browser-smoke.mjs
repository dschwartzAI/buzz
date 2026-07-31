#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const runtimeRoot = '/opt/buzz-playwright'
process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/buzz-playwright-browsers'
const mcpPackage = `${runtimeRoot}/node_modules/@playwright/mcp/package.json`
const runtimeRequire = createRequire(mcpPackage)
const { chromium } = runtimeRequire('playwright')

const target = new URL(process.argv[2] || 'https://staging.toolchat.ai')
if (!['http:', 'https:'].includes(target.protocol)) {
  throw new Error('Browser smoke target must use http or https')
}

const stateRoot = process.env.XDG_STATE_HOME || `${process.env.HOME}/.local/state`
const output = resolve(
  process.argv[3] || `${stateRoot}/buzz-playwright/browser-smoke.png`,
)
await mkdir(dirname(output), { recursive: true, mode: 0o700 })

let browser
try {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const response = await page.goto(target.href, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  })
  await page.screenshot({ path: output, fullPage: true })

  const screenshot = await readFile(output)
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: response?.status() ?? null,
    title: await page.title(),
    url: page.url(),
    screenshot: output,
    screenshot_sha256: createHash('sha256').update(screenshot).digest('hex'),
  })}\n`)
} finally {
  await browser?.close()
}
