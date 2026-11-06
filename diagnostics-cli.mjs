#!/usr/bin/env node
// Read-only support command. --doctor only performs the daemon's info read;
// no configuration, LLM request, MCP probe, installation or restart is issued.
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { realpath } from 'node:fs/promises'
import './ui/i18n.js'
const t = (strings, ...values) => String(globalThis.DucoroI18n.t(strings, ...values))
import { readDiagnostics, defaultStateDir } from './diagnostics.mjs'

const LABELS = { connection: t('连接'), models: t('Bot 模型'), mcp: 'MCP', skills: t('技能'), instructions: t('指令'), subagents: t('子代理') }
const STATUS = { configured: t('配置已对账'), pending: t('待处理'), disabled: t('已关闭'), skipped: t('本轮未配置'), unknown: t('未知') }

export function formatDiagnostics(report) {
  report = globalThis.DucoroI18n.localizeReport(report, 'en')
  const lines = [t`Ducoro 同步诊断 · ${report.pluginVersion}`, t`查看时间：${report.updatedAt}`, t`最近同步：${report.lastSyncedAt || t('尚未完成同步')}${report.stale ? t('（同步结果待更新）') : ''}`, t('报告按需生成，不保存本地文件。'), t`整体：${STATUS[report.status] || t('未知')}`, t('会话加载状态：未知；保存配置不代表运行中的会话已加载。'), '']
  for (const [feature, row] of Object.entries(report.features)) lines.push(`${LABELS[feature]}: ${row.skipReason === 'not-selected' ? t('未选择资源') : STATUS[row.status]}${row.count === undefined ? '' : t` · ${row.count} 项`}${row.targets.length ? ` · ${row.targets.join(', ')}` : ''}`)
  const seen = new Set()
  for (const issue of report.issues) {
    const key = issue.code + issue.message
    if (seen.has(key)) continue
    seen.add(key)
    lines.push('', `[${issue.code}] ${issue.message}`, t`下一步：${issue.nextAction}`)
  }
  if (report.doctor) lines.push('', t`Ducoro 守护进程：${report.doctor.status === 'reachable' ? t('可连接（只读 info 检查）') : t('不可确认')}`, report.doctor.nextAction || '')
  return lines.filter((line, i, all) => line || all[i - 1] !== '').join('\n')
}

export async function checkDaemon({ cli = 'ducoro-cli', timeoutMs = 5000 } = {}) {
  return new Promise(resolve => {
    let settled = false
    let stdout = ''
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value) } }
    let child
    let timer
    try { child = spawn(cli, ['info', '--json'], { stdio: ['ignore', 'pipe', 'ignore'] }) }
    catch { finish({ status: 'unavailable', code: 'cli-unavailable', nextAction: t('确认 Ducoro CLI 已安装且命令路径可用。') }); return }
    timer = setTimeout(() => { child.kill('SIGKILL'); finish({ status: 'unavailable', code: 'daemon-timeout', nextAction: t('确认 Ducoro 正在运行，然后重新检查。') }) }, timeoutMs)
    child.stdout.on('data', chunk => {
      if (stdout.length + chunk.length > 2 * 1024 * 1024) { child.kill('SIGKILL'); finish({ status: 'unavailable', code: 'daemon-invalid', nextAction: t('Ducoro 返回了无法识别的状态，请检查 CLI 版本。') }); return }
      stdout += chunk.toString()
    })
    child.on('error', () => finish({ status: 'unavailable', code: 'cli-unavailable', nextAction: t('确认 Ducoro CLI 已安装且命令路径可用。') }))
    child.on('close', code => {
      let value
      try { value = JSON.parse(stdout) } catch {}
      const okay = code === 0 && value && typeof value === 'object' && !Array.isArray(value) && !value.error && typeof value.serverVersion === 'string' && value.serverVersion.length > 0
      finish(okay ? { status: 'reachable', code: 'daemon-reachable', nextAction: t('此检查只证明 info 请求成功，不证明模型或工具可用。') } : { status: 'unavailable', code: 'daemon-unavailable', nextAction: t('确认 Ducoro 正在运行并检查 CLI 与守护进程版本。') })
    })
  })
}

export async function main(args = process.argv.slice(2), { output = text => process.stdout.write(text), errorOutput = text => process.stderr.write(text) } = {}) {
  let json = false, doctor = false, port = 3487, stateDir = defaultStateDir(), cli = 'ducoro-cli'
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') {
      output('Usage: node diagnostics-cli.mjs [--json] [--state-dir <directory>] [--port <port>] [--doctor] [--cli <path>]\nGenerate a read-only live report from the running plugin. No report files are saved. --doctor additionally reads ducoro-cli info; never runs an LLM or modifies configuration.\n')
      return 0
    }
    if (arg === '--json') json = true
    else if (arg === '--doctor') doctor = true
    else if (arg === '--state-dir' || arg === '--cli' || arg === '--port') {
      const value = args[++i]
      if (!value || value.startsWith('--')) { errorOutput('Missing option value. Use --help.\n'); return 2 }
      if (arg === '--state-dir') stateDir = value
      else if (arg === '--port') {
        port = Number(value)
        if (!Number.isInteger(port) || port < 1024 || port > 65535) { errorOutput('Invalid service port. Use --help.\n'); return 2 }
      }
      else cli = value
    } else { errorOutput('Unknown option. Use --help.\n'); return 2 }
  }
  const report = await readDiagnostics({ stateDir, port })
  if (doctor) report.doctor = await checkDaemon({ cli })
  output(json ? JSON.stringify(report, null, 2) + '\n' : formatDiagnostics(report) + '\n')
  return report.stale || report.status === 'pending' || report.status === 'unknown' || report.doctor?.status === 'unavailable' ? 2 : 0
}

// npm exposes bin entries through symlinks. Compare canonical paths so both
// a package-manager command and a direct node invocation execute the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(process.argv[1]).catch(() => process.argv[1])).href) process.exitCode = await main()
