// Variables used by Scriptable.
// icon-color: deep-green; icon-glyph: chart-bar;
// Codex / Claude 用量与订阅日期小组件（本地配置版）。
// 基于 MananaFX/Scritable-Codex-Usage 的界面和用量处理实现。
// https://github.com/MananaFX/Scritable-Codex-Usage
// 上游参考提交：3eaf44939e7a4bf40ce9cd6bae4112a1c993d240
// 直接在 App 内运行可设置 HTTPS 接口和手动订阅日期。
// 自动到期日需接口提供 subscription.expires_at；不会从用量重置时间猜测。
// Replace DEFAULT_SERVER with your own API base URL before using.
// Small widget parameter:  codex | claude
// Medium widget parameter: both  | week   (week = codex + chart)
// Optional server override: append e.g. "both https://usage.example.com/usage"

const DEFAULT_SERVER = "https://example.com/usage"
const REFRESH_MINUTES = 10
const CACHE_FILE = "codex_subscription_usage_cache"
const SETTINGS_KEY = "codex_subscription_widget_settings_v1"
const TOKEN_KEY = "codex_subscription_widget_token_v1"
const CLAUDE_ICON_B64 = "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAq0lEQVR4nO2VwQ3EIAwEt5LrIPWkFJfqCqiDe92JR1BiAbJNdqT9RNGy8wFgEuVz1F+efF/dY4YC3gIjh5Xmf2sosKXACCXj6BYKRKJkHB1aYNaj5ka4Qa8TICQTKmeNFFBAKFApYGFbAQD/TBxX7zopoBQ4KWBiWwF1CiggQQU0wDgdEfMeoBQQ/xFKAckbZLmdsO070CO9QEuvaOSAFZ1dKHABBSxQAOs6v93vUfvjY1dDAAAAAElFTkSuQmCC"

let CLAUDE_ICON = null
let APP_PREVIEW_FAMILY = "medium"

const COLORS = {
  text: new Color("#f7f8fb"),
  muted: new Color("#7f8794"),
  track: new Color("#657061", 0.72),
  codex: new Color("#39f174"),
  claude: new Color("#ff9f43"),
  offline: new Color("#ff9f0a")
}

// 独立入口，方便对日期和布局做离线验证。
main().catch(() => {
  console.error("用量组件运行失败，请在 App 内检查配置。")
  Script.complete()
})

async function main() {
  if (config.runsInApp && !await appMenu()) {
    Script.complete()
    return
  }
  const widget = await createWidget()
  if (config.runsInWidget) {
    Script.setWidget(widget)
  } else {
    if (APP_PREVIEW_FAMILY === "small") await widget.presentSmall()
    else await widget.presentMedium()
  }
  Script.complete()
}

async function createWidget() {
  const settings = widgetSettings()
  const data = await loadUsage(settings)
  const family = config.runsInApp ? APP_PREVIEW_FAMILY : (config.widgetFamily || "medium")
  const layout = widgetLayout(family)

  const w = new ListWidget()
  if (family === "small" && isStandBy()) {
    // StandBy small widget: pure black to blend into the dimmed StandBy screen.
    w.backgroundColor = new Color("#000000")
  } else {
    w.backgroundImage = widgetBackground()
  }
  w.setPadding(
    layout.padTop,
    layout.padLeft || layout.padX,
    layout.padBottom,
    layout.padRight || layout.padX
  )
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000)

  if (family === "small") {
    const serviceId = settings.service === "claude" ? "claude" : "codex"
    addServicePanel(w, serviceUsage(serviceId, data), layout, true)
  } else if (settings.mode === "chart") {
    addCodexChartPanel(w, data, layout)
  } else if (settings.service === "both") {
    addDualPanel(w, data, layout)
  } else {
    addSingleSubscriptionPanel(w, data, settings.service, layout)
  }

  return w
}

function addSingleSubscriptionPanel(parent, data, serviceId, layout) {
  const service = serviceUsage(serviceId, data)
  const row = parent.addStack()
  row.layoutHorizontally()
  row.topAlignContent()
  const left = row.addStack()
  left.layoutVertically()
  left.size = new Size(layout.panelWidth, layout.panelHeight + layout.stampReserve)
  left.addSpacer(layout.stampReserve)
  addServicePanel(left, service, layout, false, false)
  row.addSpacer()
  const right = row.addStack()
  right.layoutVertically()
  right.size = new Size(layout.rightPanelWidth, layout.panelHeight + layout.stampReserve)
  addStampRow(right, data, layout, layout.rightPanelWidth)
  right.addSpacer(9)
  const info = service.subscription
  const label = info && info.kind === "renewal" ? "下次续费" :
    info && info.kind === "period" ? "周期结束" : "订阅到期"
  const title = right.addText(label)
  title.font = Font.boldSystemFont(13)
  title.textColor = COLORS.text
  right.addSpacer(9)
  const df = new DateFormatter()
  df.dateFormat = "yyyy/MM/dd"
  const date = right.addText(info ? (info.manualDate ? info.manualDate.replace(/-/g, "/") : df.string(info.date)) : "暂未提供")
  date.font = Font.boldSystemFont(info ? 20 : 18)
  date.textColor = info && info.expired ? COLORS.offline : service.color
  date.lineLimit = 1
  date.minimumScaleFactor = 0.65
  if (info && !info.manualDate) {
    df.dateFormat = "HH:mm"
    const time = right.addText(`${df.string(info.date)} · 设备本地时间`)
    time.font = Font.systemFont(8)
    time.textColor = COLORS.muted
  }
  right.addSpacer(8)
  const detail = right.addText(subscriptionDetailText(info))
  detail.font = Font.mediumSystemFont(10)
  detail.textColor = info && info.expired ? COLORS.offline : COLORS.muted
  detail.lineLimit = 2
  detail.minimumScaleFactor = 0.7
  right.addSpacer()
}

function addCodexChartPanel(parent, data, layout) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.topAlignContent()

  // Left column: Codex. Top spacer matches the stamp height above the chart
  // so the Codex header aligns with the chart header.
  const left = row.addStack()
  left.layoutVertically()
  left.size = new Size(layout.panelWidth, layout.panelHeight + layout.stampReserve)
  left.addSpacer(layout.stampReserve)
  addServicePanel(left, serviceUsage("codex", data), layout, false)

  row.addSpacer()

  // Right column: time stamp + daily-token chart grouped together.
  const right = row.addStack()
  right.layoutVertically()
  right.size = new Size(layout.chartPanelWidth, layout.panelHeight + layout.stampReserve)
  addStampRow(right, data, layout, layout.chartPanelWidth)
  right.addSpacer(layout.globalStampGap)
  addHistoryPanel(right, codexHistory(data), layout)

  row.addSpacer()
}

function addDualPanel(parent, data, layout) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.topAlignContent()

  // Left column: Codex. A top spacer reserves the same height as the time
  // stamp above Claude so both service headers stay vertically aligned.
  const left = row.addStack()
  left.layoutVertically()
  left.size = new Size(layout.panelWidth, layout.panelHeight + layout.stampReserve)
  left.addSpacer(layout.stampReserve)
  addServicePanel(left, serviceUsage("codex", data), layout, false)

  row.addSpacer()

  // Right column: time stamp + Claude grouped together so they move as one.
  const right = row.addStack()
  right.layoutVertically()
  right.size = new Size(layout.rightPanelWidth, layout.panelHeight + layout.stampReserve)
  addStampRow(right, data, layout, layout.rightPanelWidth)
  right.addSpacer(layout.globalStampGap)
  addServicePanel(right, serviceUsage("claude", data), layout, false)

  row.addSpacer()
}

function addStampRow(parent, data, layout, width) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.size = new Size(width, layout.stampReserve)
  row.addSpacer()

  const stamp = row.addText(globalStamp(data))
  stamp.font = Font.boldSystemFont(layout.globalStampFont)
  stamp.textColor = data && data.ok !== false && !data.stale ? COLORS.muted : COLORS.offline
  stamp.lineLimit = 1
  stamp.minimumScaleFactor = 0.55
}

function addServicePanel(parent, service, layout, showStamp, showSubscription = true) {
  addServiceHeader(parent, service, layout, showStamp)
  parent.addSpacer(layout.headerGap)

  addLimitRow(parent, service.primaryLabel, service.primary, layout, service)
  parent.addSpacer(layout.rowGap)
  addLimitRow(parent, service.secondaryLabel, service.secondary, layout, service)
  if (showSubscription) {
    parent.addSpacer(5)
    addSubscriptionRow(parent, service.subscription, layout)
  }
  parent.addSpacer()
}

function addSubscriptionRow(parent, subscription, layout) {
  const row = parent.addText(subscriptionDateText(subscription))
  row.font = Font.mediumSystemFont(9)
  row.textColor = subscription && subscription.expired ? COLORS.offline : COLORS.text
  row.lineLimit = 1
  row.minimumScaleFactor = 0.65
  const detail = parent.addText(subscriptionDetailText(subscription))
  detail.font = Font.systemFont(layout.metaFont)
  detail.textColor = subscription && subscription.expired ? COLORS.offline : COLORS.muted
  detail.lineLimit = 1
  detail.minimumScaleFactor = 0.6
}

function addHistoryPanel(parent, history, layout) {
  const header = parent.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const title = header.addText("Daily Tokens")
  title.font = Font.heavySystemFont(layout.chartTitleFont)
  title.textColor = COLORS.text
  title.lineLimit = 1
  title.minimumScaleFactor = 0.75

  header.addSpacer()

  const unit = header.addText("M")
  unit.font = Font.boldSystemFont(layout.chartUnitFont)
  unit.textColor = COLORS.muted
  unit.lineLimit = 1

  parent.addSpacer(layout.chartHeaderGap)

  const image = parent.addImage(historyChart(history, layout.chartWidth, layout.chartHeight))
  image.imageSize = new Size(layout.chartWidth, layout.chartHeight)

  parent.addSpacer()
}

function addServiceHeader(parent, service, layout, showStamp) {
  const header = parent.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const iconBox = header.addStack()
  iconBox.layoutHorizontally()
  iconBox.centerAlignContent()
  iconBox.size = new Size(layout.logoBoxSize, layout.logoBoxSize)

  const icon = iconBox.addImage(serviceMark(service.id, layout.logoSize))
  icon.imageSize = new Size(layout.logoSize, layout.logoSize)

  header.addSpacer(layout.logoGap)

  const title = header.addText(service.name)
  title.font = Font.heavySystemFont(layout.titleFont)
  title.textColor = COLORS.text
  title.lineLimit = 1
  title.minimumScaleFactor = 0.72

  if (showStamp) {
    header.addSpacer()

    const stamp = header.addText(serviceStamp(service))
    stamp.font = Font.boldSystemFont(layout.stampFont)
    stamp.textColor = service.ok && !service.stale ? COLORS.muted : COLORS.offline
    stamp.lineLimit = 1
    stamp.minimumScaleFactor = 0.65
  }
}

function addLimitRow(parent, label, limit, layout, service) {
  const pct = percentValue(limit)
  const fillWidth = Math.round(layout.barWidth * Math.min(100, pct) / 100)

  const block = parent.addStack()
  block.layoutVertically()

  const line = block.addStack()
  line.layoutHorizontally()
  line.centerAlignContent()

  const name = line.addText(label)
  name.font = Font.heavySystemFont(layout.labelFont)
  name.textColor = COLORS.text
  name.lineLimit = 1
  name.minimumScaleFactor = 0.8

  line.addSpacer()

  const value = line.addText(percentText(limit))
  value.font = Font.heavySystemFont(layout.percentFont)
  value.textColor = COLORS.text
  value.lineLimit = 1
  value.minimumScaleFactor = 0.62

  block.addSpacer(layout.lineGap)

  const track = block.addStack()
  track.backgroundColor = COLORS.track
  track.cornerRadius = layout.barHeight / 2
  track.size = new Size(layout.barWidth, layout.barHeight)

  if (fillWidth > 0) {
    const fill = track.addStack()
    fill.backgroundColor = service.color
    fill.cornerRadius = layout.barHeight / 2
    fill.size = new Size(Math.max(3, fillWidth), layout.barHeight)
  }
  track.addSpacer()

  block.addSpacer(layout.metaGap)

  const reset = block.addText(resetDateText(limit))
  reset.font = Font.systemFont(layout.metaFont)
  reset.textColor = COLORS.muted
  reset.lineLimit = 1
  reset.minimumScaleFactor = 0.62
}

async function loadUsage(settings) {
  const fm = FileManager.local()
  const apiUrl = settings.apiUrl
  const cachePath = fm.joinPath(fm.documentsDirectory(), `${CACHE_FILE}_${settings.cacheId}.json`)

  try {
    if (!apiUrl || /\/\/example\.com(?:\/|$)/i.test(apiUrl)) throw new Error("Missing API URL")
    const req = new Request(refreshUrl(apiUrl))
    req.headers = { "Cache-Control": "no-cache" }
    // 仅向设置中保存的接口发送 Token，参数覆盖到其他接口时不携带。
    if (settings.useSavedToken && Keychain.contains(TOKEN_KEY)) {
      req.headers.Authorization = `Bearer ${Keychain.get(TOKEN_KEY)}`
    }
    req.timeoutInterval = 12
    const json = await req.loadJSON()
    if (req.response && (req.response.statusCode < 200 || req.response.statusCode >= 300)) {
      throw new Error("API request failed")
    }
    if (!validUsageResponse(json)) throw new Error("Invalid usage response")
    json._widgetFetchedAt = new Date().toISOString()
    try { fm.writeString(cachePath, JSON.stringify(json)) } catch (_) {}
    return json
  } catch (e) {
    try {
      if (fm.fileExists(cachePath)) {
        const cached = JSON.parse(fm.readString(cachePath))
        if (validUsageResponse(cached)) {
          cached.stale = true
          return cached
        }
      }
    } catch (_) {}

    return {
      ok: false,
      stale: true,
      plan_type: "offline",
      five_hour: null,
      weekly: null
    }
  }
}

function widgetSettings() {
  const raw = String(args.widgetParameter || "").trim()
  const tokens = raw ? raw.split(/[,\s|]+/).filter(Boolean) : []
  let service = null
  let mode = null
  const source = []

  for (const token of tokens) {
    const key = token.toLowerCase()
    if (key === "codex") {
      service = "codex"
    } else if (key === "claude" || key === "anthropic") {
      service = "claude"
    } else if (key === "both" || key === "dual" || key === "all") {
      service = "both"
    } else if (key === "chart" || key === "daily" || key === "stats" || key === "history" || key === "week" || key === "weekly") {
      mode = "chart"
    } else {
      source.push(token)
    }
  }

  const saved = savedSettings()
  const server = source.join(" ").trim() || saved.apiUrl || DEFAULT_SERVER
  const apiUrl = usageUrl(server)
  const savedApi = usageUrl(saved.apiUrl || DEFAULT_SERVER)

  return {
    service: service || "codex",
    mode,
    apiUrl,
    useSavedToken: apiUrl === savedApi,
    // 配置变更后独立缓存；参数覆盖地址也独立，避免跨账号误用旧数据。
    cacheId: cacheKey(`${saved.cacheId || "initial"}|${apiUrl}`)
  }
}

function usageUrl(value) {
  const server = String(value || "").trim()
  if (!/^https:\/\/[^/?#\s]+(?:[/?][^#\s]*)?$/i.test(server)) return null
  // 完整路径原样使用；仅对纯域名补 /usage，保留自定义路由和查询参数。
  const match = server.match(/^(https:\/\/[^/?]+)([^?]*)(\?.*)?$/i)
  if (!match || /@/.test(match[1])) return null
  const pathname = match[2] && match[2] !== "/" ? match[2] : "/usage"
  return match[1] + pathname + (match[3] || "")
}

function refreshUrl(value) {
  const step = Date.now()
  const sep = String(value).indexOf("?") >= 0 ? "&" : "?"
  return `${value}${sep}_=${step}`
}

function serviceUsage(id, data) {
  const services = data && data.services ? data.services : {}
  const source = services[id] || singleServiceSource(id, data)

  if (id === "codex") {
    const limits = classifyCodexDisplayLimits(source, data)
    return {
      id,
      name: "Codex",
      color: COLORS.codex,
      ok: Boolean(source && source.ok),
      stale: Boolean(data && data.stale || source && source.stale),
      latestAt: source ? source.latest_at || source.generated_at || data._widgetFetchedAt : null,
      primaryLabel: "5h",
      secondaryLabel: "Week",
      primary: limits.fiveHour,
      secondary: limits.weekly,
      subscription: subscriptionInfo(id, source, data)
    }
  }

  const primary = serviceLimit(source, ["five_hour", "primary", "total"])
  const secondary = serviceLimit(source, ["weekly", "secondary", "auto"])
  return {
    id,
    name: "Claude",
    color: COLORS.claude,
    ok: Boolean(source && source.ok),
    stale: Boolean(data && data.stale || source && source.stale),
    latestAt: source ? source.latest_at || source.generated_at : (data ? data.latest_at || data.generated_at : null),
    primaryLabel: serviceLabel(source, "primary", "5h"),
    secondaryLabel: serviceLabel(source, "secondary", "Week"),
    primary,
    secondary,
    subscription: subscriptionInfo(id, source, data)
  }
}

function codexHistory(data) {
  const codex = data && data.services ? data.services.codex : singleServiceSource("codex", data)
  return codex && codex.history_7d ? codex.history_7d : []
}

function singleServiceSource(id, data) {
  if (!data || data.services) return null

  if (id === "claude") {
    const sourceMode = String(data.source_mode || "")
    if (sourceMode.indexOf("statusline") >= 0 || data.model) return data
    return null
  }

  if (id === "codex") {
    const source = String(data.source || "")
    if (source.toLowerCase().indexOf("codex") >= 0 || data.limit_id || data.plan_type) return data
  }

  return null
}

function serviceLimit(source, names) {
  if (!source) return null
  for (const name of names) {
    if (source[name] && typeof source[name] === "object") return source[name]
  }
  return null
}

function limitWindowMinutes(limit) {
  if (!limit) return 0
  return Number(limit.window_minutes || limit.windowDurationMins || limit.windowMinutes || 0)
}

function isWindowAround(actual, expected) {
  if (!Number.isFinite(actual) || actual <= 0) return false
  return Math.abs(actual - expected) <= Math.max(5, expected * 0.05)
}

function limitWindowKind(limit) {
  const minutes = limitWindowMinutes(limit)
  if (isWindowAround(minutes, 300)) return "fiveHour"
  if (isWindowAround(minutes, 10080)) return "weekly"

  const label = String(limit && (limit.label || limit.name || limit.limitName) || "").toLowerCase()
  if (/week|weekly|seven|7d|周/.test(label)) return "weekly"
  if (/5\s*h|five|5-hour/.test(label)) return "fiveHour"
  return null
}

function classifyCodexDisplayLimits(source, data) {
  const fiveHourNamed = [source && source.five_hour, data && data.five_hour]
  const weeklyNamed = [source && source.weekly, data && data.weekly]
  const candidates = [
    ...fiveHourNamed,
    ...weeklyNamed,
    source && source.primary,
    source && source.secondary
  ]
  const seen = new Set()
  let fiveHour = null
  let weekly = null

  for (const limit of candidates) {
    if (!limit || typeof limit !== "object" || seen.has(limit)) continue
    seen.add(limit)
    const kind = limitWindowKind(limit)
    if (!fiveHour && kind === "fiveHour") fiveHour = limit
    if (!weekly && kind === "weekly") weekly = limit
  }

  for (const limit of fiveHourNamed) {
    if (fiveHour || !limit || typeof limit !== "object") continue
    const kind = limitWindowKind(limit)
    if (!kind || kind === "fiveHour") fiveHour = limit
  }

  for (const limit of weeklyNamed) {
    if (weekly || !limit || typeof limit !== "object") continue
    const kind = limitWindowKind(limit)
    if (!kind || kind === "weekly") weekly = limit
  }

  return { fiveHour, weekly }
}

function serviceLabel(source, key, fallback) {
  if (!source) return fallback
  const direct = source[`${key}_label`]
  if (direct) return String(direct)
  const labels = source.labels || {}
  return labels[key] ? String(labels[key]) : fallback
}

function savedSettings() {
  try {
    return Keychain.contains(SETTINGS_KEY) ? JSON.parse(Keychain.get(SETTINGS_KEY)) : {}
  } catch (_) { return {} }
}

function cacheKey(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16)
}

function validUsageResponse(data) {
  return Boolean(data && typeof data === "object" && !Array.isArray(data) && data.ok === true &&
    ((data.services && (data.services.codex || data.services.claude)) ||
      data.five_hour || data.weekly || data.primary || data.secondary))
}

// 只有明确的订阅字段才参与显示；resets_at、JWT exp、Token 到期均不参与。
function subscriptionInfo(id, service, data, now = new Date(), settings = savedSettings()) {
  const sub = service && service.subscription
  let date = null
  let kind = "expiry"
  if (sub && typeof sub === "object") {
    date = parseSubscriptionDate(sub.expires_at)
    if (!date) {
      date = parseSubscriptionDate(sub.renews_at)
      kind = "renewal"
    }
    if (!date) {
      date = parseSubscriptionDate(sub.current_period_end)
      kind = sub.cancel_at_period_end === true ? "expiry" :
        (sub.cancel_at_period_end === false ? "renewal" : "period")
    }
  }
  let manualDate = null
  if (!date) {
    const configured = settings.apiUrl || DEFAULT_SERVER
    const active = widgetSettings().apiUrl
    // 参数切换到其他接口时，不套用原账号的手动订阅日期。
    if (active === usageUrl(configured)) {
      manualDate = settings[`${id}Expiry`] || null
      date = manualEndDate(manualDate)
      kind = "expiry"
    }
  }
  if (!date) return null
  const remaining = date.getTime() - now.getTime()
  return {
    date,
    kind,
    manualDate,
    source: manualDate ? "manual" : "api",
    cached: Boolean(!manualDate && (data && data.stale || service && service.stale)),
    expired: remaining <= 0,
    remainingDays: Math.ceil(Math.max(0, remaining) / 86400000)
  }
}

function parseSubscriptionDate(value) {
  if (value === null || value === undefined || value === "") return null
  let millis
  if (typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) return null
    millis = number < 1e12 ? number * 1000 : number
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    if (!validCalendarDay(value.slice(0, 10))) return null
    millis = Date.parse(value)
  } else { return null }
  const date = new Date(millis)
  return Number.isFinite(date.getTime()) ? date : null
}

function validCalendarDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return year >= 2000 && date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function manualEndDate(value) {
  if (!validCalendarDay(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  // 手动只填写日期时，按设备本地时区的该日结束计算。
  return new Date(year, month - 1, day + 1)
}

function subscriptionDateText(info) {
  if (!info) return "订阅到期：未提供"
  const label = info.kind === "renewal" ? "下次续费" : info.kind === "period" ? "周期结束" : "订阅到期"
  const df = new DateFormatter()
  df.dateFormat = "yyyy/MM/dd HH:mm"
  const dateText = info.manualDate ? info.manualDate.replace(/-/g, "/") : df.string(info.date)
  return `${label}：${dateText}`
}

function subscriptionDetailText(info) {
  if (!info) return "需接口提供，或在 App 中填写"
  const state = info.expired ? (info.kind === "expiry" ? "日期已过，请核对" : "周期已过，请刷新") : `剩余 ${info.remainingDays} 天`
  const origin = info.source === "manual" ? "手动" : (info.cached ? "缓存" : "接口")
  return `${state} · ${origin}`
}

async function appMenu() {
  const menu = new Alert()
  menu.title = "Codex 用量与订阅"
  menu.message = "连接你自己的 HTTPS 用量接口。到期日由接口提供，也可手动填写。"
  menu.addAction("中号预览")
  menu.addAction("小号预览")
  menu.addAction("配置接口与订阅日期")
  menu.addAction("检查接口字段")
  menu.addCancelAction("取消")
  const choice = await menu.presentAlert()
  if (choice < 0) return false
  if (choice === 2) return await configureWidget()
  if (choice === 3) {
    await inspectUsageAPI()
    return false
  }
  APP_PREVIEW_FAMILY = choice === 1 ? "small" : "medium"
  return true
}

function subscriptionFieldReport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "接口返回内容不是 JSON 对象，无法检查。"
  }
  const fields = ["expires_at", "expiresAt", "subscription_expires_at", "subscriptionExpiresAt",
    "subscription_end_date", "subscription_end", "renews_at", "current_period_end", "cancel_at_period_end"]
  const containers = ["data", "services", "codex", "claude", "subscription", "billing", "account", "entitlements"]
  const found = []
  function visit(node, path, depth) {
    if (!node || typeof node !== "object" || Array.isArray(node) || depth > 6) return
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(node, field)) continue
      const value = node[field]
      const state = value === null || value === "" || value === undefined ? "空值" :
        field === "cancel_at_period_end" ? "状态字段" : parseSubscriptionDate(value) ? "有效时间" : "格式需确认"
      found.push(`${path}${field}（${state}）`)
    }
    for (const name of containers) {
      if (node[name] && typeof node[name] === "object") visit(node[name], `${path}${name}.`, depth + 1)
    }
  }
  visit(data, "", 0)
  const services = data.services || {}
  const codex = services.codex || singleServiceSource("codex", data)
  const sub = codex && codex.subscription
  let result = "当前响应未发现订阅日期字段，暂时不能自动显示到期日。"
  if (sub && (parseSubscriptionDate(sub.expires_at) ||
      sub.cancel_at_period_end === true && parseSubscriptionDate(sub.current_period_end))) {
    result = "Codex：接口包含可直接使用的订阅到期时间。"
  } else if (sub && (parseSubscriptionDate(sub.renews_at) || parseSubscriptionDate(sub.current_period_end))) {
    result = "Codex：有续费或账期时间；它不一定是订阅到期时间。"
  } else if (found.length) {
    result = "发现候选字段，但尚不能确认是 Codex 订阅到期日，需要核对和适配。"
  }
  return `${result}\n\n${found.length ? "检测到的字段：\n" + found.slice(0, 24).join("\n") : "未检测到已知订阅日期字段。"}\n\n本结果只列出已知字段名和格式状态，不包含字段具体值。`
}

async function inspectUsageAPI() {
  const settings = widgetSettings()
  let report
  if (!settings.apiUrl || /\/\/example\.com(?:\/|$)/i.test(settings.apiUrl)) {
    report = "请先选择“配置接口与订阅日期”，填写你已有的 HTTPS 用量接口。手动日期可以留空。"
  } else {
    try {
      const req = new Request(refreshUrl(settings.apiUrl))
      req.headers = { "Cache-Control": "no-cache" }
      if (settings.useSavedToken && Keychain.contains(TOKEN_KEY)) {
        req.headers.Authorization = `Bearer ${Keychain.get(TOKEN_KEY)}`
      }
      req.timeoutInterval = 12
      const json = await req.loadJSON()
      const status = req.response && req.response.statusCode
      if (status === 401 || status === 403) {
        report = `接口返回 HTTP ${status}，请在配置中核对地址与 Token。`
      } else if (status && (status < 200 || status >= 300)) {
        report = `接口返回 HTTP ${status}，暂时无法检查字段。`
      } else {
        report = subscriptionFieldReport(json)
      }
    } catch (_) {
      report = "接口未能返回可读取的 JSON。请检查网络、接口地址和认证设置；若浏览器打开的是网页而非接口，也会出现此提示。"
    }
  }
  const alert = new Alert()
  alert.title = "订阅字段检查结果"
  alert.message = report
  alert.addAction("复制检查结果")
  alert.addCancelAction("关闭")
  if (await alert.presentAlert() === 0) Pasteboard.copyString(report)
}

async function configureWidget() {
  const saved = savedSettings()
  const form = new Alert()
  form.title = "接口设置"
  form.message = "填写完整 HTTPS 接口地址。Bearer Token 仅保存到本机 Keychain，不写入脚本。"
  form.addTextField("https://你的域名/usage", saved.apiUrl || "")
  form.addSecureTextField("Bearer Token（留空保留原值；填 - 清除）", "")
  form.addAction("下一步")
  form.addCancelAction("取消")
  if (await form.presentAlert() < 0) return false
  const apiUrl = usageUrl(form.textFieldValue(0))
  if (!apiUrl) return await settingsError("请输入有效的 HTTPS 接口地址。")
  const tokenInput = form.textFieldValue(1).trim().replace(/^Bearer\s+/i, "")
  const sameEndpoint = apiUrl === usageUrl(saved.apiUrl || "")

  const dates = new Alert()
  dates.title = "手动订阅日期（可选）"
  dates.message = "格式 YYYY-MM-DD，按设备本地时区当天结束计算。接口有明确订阅日期时优先使用接口；留空表示不设置。"
  dates.addTextField("Codex 到期日期", sameEndpoint ? saved.codexExpiry || "" : "")
  dates.addTextField("Claude 到期日期", sameEndpoint ? saved.claudeExpiry || "" : "")
  dates.addAction("保存并预览")
  dates.addCancelAction("取消")
  if (await dates.presentAlert() < 0) return false
  const codexExpiry = dates.textFieldValue(0).trim()
  const claudeExpiry = dates.textFieldValue(1).trim()
  if ([codexExpiry, claudeExpiry].some(value => value && !validCalendarDay(value))) {
    return await settingsError("日期无效，请按 YYYY-MM-DD 填写真实日期，例如 2026-12-01。")
  }
  if (tokenInput === "-" || (!sameEndpoint && !tokenInput)) {
    if (Keychain.contains(TOKEN_KEY)) Keychain.remove(TOKEN_KEY)
  } else if (tokenInput) Keychain.set(TOKEN_KEY, tokenInput)
  Keychain.set(SETTINGS_KEY, JSON.stringify({
    apiUrl, codexExpiry, claudeExpiry, cacheId: UUID.string()
  }))
  return true
}

async function settingsError(message) {
  const alert = new Alert()
  alert.title = "设置未保存"
  alert.message = message
  alert.addAction("好")
  await alert.presentAlert()
  return false
}

function widgetLayout(family) {
  if (family === "small") {
    return {
      padTop: 11,
      padBottom: 8,
      padX: 13,
      logoSize: 25,
      logoBoxSize: 25,
      logoGap: 8,
      titleFont: 18,
      stampFont: 8,
      headerGap: 4,
      rowGap: 4,
      labelFont: 12,
      percentFont: 21,
      lineGap: 2,
      barWidth: 124,
      barHeight: 5,
      metaGap: 2,
      metaFont: 7
    }
  }

  return {
    padTop: 8,
    padBottom: 9,
    padX: 16,
    padRight: 6,
    panelWidth: 132,
    rightPanelWidth: 141,
    stampReserve: 11,
    panelHeight: 132,
    panelGap: 26,
    chartGap: 31,
    chartPanelWidth: 143,
    chartWidth: 143,
    chartHeight: 95,
    chartTitleFont: 13,
    chartUnitFont: 10,
    chartHeaderGap: 7,
    globalStampFont: 7,
    globalStampWidth: 24,
    globalStampHeight: 7,
    globalStampGap: 0,
    logoSize: 25,
    logoBoxSize: 25,
    logoGap: 7,
    titleFont: 19,
    stampFont: 8,
    headerGap: 4,
    rowGap: 4,
    labelFont: 12,
    percentFont: 22,
    lineGap: 2,
    barWidth: 128,
    barHeight: 5,
    metaGap: 2,
    metaFont: 7
  }
}

function percentValue(limit) {
  if (!limit || limit.used_percent === null || limit.used_percent === undefined) return 0
  const value = Number(limit.used_percent)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function percentText(limit) {
  if (!limit || limit.used_percent === null || limit.used_percent === undefined) return "--%"
  return `${Math.round(percentValue(limit))}%`
}

function serviceStamp(service) {
  const time = service.latestAt ? new Date(service.latestAt) : null
  const stamp = time && Number.isFinite(time.getTime()) ? shortTime(time) : "--:--"
  return `${service.stale ? "缓存 " : service.ok ? "" : "离线 "}${stamp}`
}

function globalStamp(data) {
  const raw = data && (data.latest_at || data.generated_at || data._widgetFetchedAt)
  const time = raw ? new Date(raw) : null
  const stamp = time && Number.isFinite(time.getTime()) ? shortTime(time) : "--:--"
  return `${data && data.stale ? "缓存 " : ""}${stamp}`
}

function resetDateText(limit) {
  if (!limit) return "no data"

  const date = resetDate(limit)
  if (date) {
    const df = new DateFormatter()
    df.dateFormat = "MM/dd HH:mm"
    return df.string(date)
  }

  return resetText(limit.remaining_seconds)
}

function resetDate(limit) {
  if (limit.resets_at_iso) {
    const date = new Date(limit.resets_at_iso)
    if (!isNaN(date.getTime())) return date
  }

  if (limit.resets_at) {
    const date = new Date(Number(limit.resets_at) * 1000)
    if (!isNaN(date.getTime())) return date
  }

  return null
}

function resetText(seconds) {
  if (seconds === null || seconds === undefined) return "--"
  const s = Math.max(0, Number(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h <= 0) return `${m}m reset`
  return `${h}h ${m}m`
}

function shortTime(date) {
  const df = new DateFormatter()
  df.dateFormat = "HH:mm"
  return df.string(date)
}

function serviceMark(id, size) {
  return id === "claude" ? claudeMark(size) : codexMark(size)
}

function codexMark(size) {
  const ctx = markContext(size)
  ctx.setFillColor(Color.white())
  ctx.fillEllipse(new Rect(size * 0.08, size * 0.29, size * 0.43, size * 0.45))
  ctx.fillEllipse(new Rect(size * 0.25, size * 0.10, size * 0.44, size * 0.48))
  ctx.fillEllipse(new Rect(size * 0.48, size * 0.27, size * 0.42, size * 0.45))
  ctx.fillEllipse(new Rect(size * 0.26, size * 0.48, size * 0.47, size * 0.38))
  ctx.fillRect(new Rect(size * 0.22, size * 0.34, size * 0.58, size * 0.35))

  ctx.setFont(Font.heavySystemFont(size * 0.36))
  ctx.setTextColor(new Color("#111217"))
  ctx.drawTextInRect(">_", new Rect(size * 0.29, size * 0.31, size * 0.52, size * 0.36))
  return ctx.getImage()
}

function claudeMark(size) {
  try {
    if (!CLAUDE_ICON) {
      CLAUDE_ICON = Image.fromData(Data.fromBase64String(CLAUDE_ICON_B64))
    }
    return CLAUDE_ICON
  } catch (_) {
    return claudeFallbackMark(size)
  }
}

function claudeFallbackMark(size) {
  const ctx = markContext(size)
  ctx.setFillColor(new Color("#fff3e4"))
  ctx.fillEllipse(new Rect(size * 0.03, size * 0.03, size * 0.94, size * 0.94))
  ctx.setFillColor(new Color("#d9772a", 0.32))
  ctx.fillEllipse(new Rect(size * 0.16, size * 0.16, size * 0.68, size * 0.68))
  ctx.setFillColor(new Color("#14161d"))
  ctx.setFont(Font.heavySystemFont(size * 0.62))
  ctx.setTextColor(new Color("#14161d"))
  ctx.drawTextInRect("C", new Rect(size * 0.23, size * 0.15, size * 0.58, size * 0.70))
  return ctx.getImage()
}

function historyChart(history, width, height) {
  const items = normalizeHistory(history)
  const values = items.map(item => Number(item.val || item.tokens || 0))
  const maxTokens = Math.max(0, ...values)
  const maxM = niceChartMax(maxTokens / 1000000)

  const ctx = new DrawContext()
  ctx.size = new Size(width, height)
  ctx.opaque = false
  ctx.respectScreenScale = true

  const left = 24
  const right = 3
  const top = 6
  const bottom = 16
  const plotW = width - left - right
  const plotH = height - top - bottom

  ctx.setFont(Font.systemFont(7))
  ctx.setTextColor(new Color("#6f7885"))
  drawAxisLabel(ctx, formatAxis(maxM), 0, top - 2, left - 4)
  drawAxisLabel(ctx, formatAxis(maxM / 2), 0, top + plotH / 2 - 4, left - 4)
  drawAxisLabel(ctx, "0", 0, top + plotH - 6, left - 4)

  ctx.setFillColor(new Color("#2e3845", 0.62))
  for (let i = 0; i <= 2; i++) {
    const y = top + plotH * i / 2
    ctx.fillRect(new Rect(left, y, plotW, 1))
  }

  const count = Math.max(1, items.length)
  const step = plotW / count
  const barW = Math.max(6, Math.min(14, step * 0.48))

  for (let i = 0; i < items.length; i++) {
    const tokens = Number(items[i].val || items[i].tokens || 0)
    const m = tokens / 1000000
    const ratio = maxM <= 0 ? 0 : Math.min(1, m / maxM)
    const barH = Math.max(tokens > 0 ? 3 : 0, plotH * ratio)
    const x = left + step * i + (step - barW) / 2
    const y = top + plotH - barH

    ctx.setFillColor(new Color("#1d4f91", 0.42))
    ctx.fillRect(new Rect(x, y - 1, barW, barH + 1))
    ctx.setFillColor(new Color("#2f7fe9"))
    ctx.fillRect(new Rect(x, y, barW, barH))

    ctx.setFont(Font.systemFont(7))
    ctx.setTextColor(new Color("#788291"))
    ctx.drawTextInRect(dayLabel(items[i].date), new Rect(x - 3, top + plotH + 4, barW + 6, 10))
  }

  return ctx.getImage()
}

function normalizeHistory(history) {
  const items = Array.isArray(history) ? history.slice(-7) : []
  while (items.length < 7) {
    items.unshift({ date: "", val: 0 })
  }
  return items
}

function niceChartMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(value)))
  const scaled = value / pow
  let nice = 10
  if (scaled <= 1) nice = 1
  else if (scaled <= 2) nice = 2
  else if (scaled <= 5) nice = 5
  return nice * pow
}

function formatAxis(value) {
  if (value >= 10) return String(Math.round(value))
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, "")
  return value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "")
}

function drawAxisLabel(ctx, text, x, y, width) {
  ctx.drawTextInRect(String(text), new Rect(x, y, width, 10))
}

function dayLabel(date) {
  if (!date) return ""
  const raw = String(date)
  const part = raw.includes("-") ? raw.split("-").pop() : raw.slice(-2)
  return part.replace(/^0/, "")
}

function markContext(size) {
  const ctx = new DrawContext()
  ctx.size = new Size(size, size)
  ctx.opaque = false
  ctx.respectScreenScale = true
  return ctx
}

function isStandBy() {
  // No dedicated StandBy API in Scriptable; charging is the reliable proxy
  // since StandBy only activates while the device is docked and charging.
  try {
    return Device.isCharging()
  } catch (_) {
    return false
  }
}

function widgetBackground() {
  const width = 600
  const height = 360
  const ctx = new DrawContext()
  ctx.size = new Size(width, height)
  ctx.opaque = true
  ctx.respectScreenScale = true

  for (let y = 0; y < height; y += 2) {
    const t = y / height
    const r = Math.round(21 - 13 * t)
    const g = Math.round(24 - 16 * t)
    const b = Math.round(34 - 25 * t)
    ctx.setFillColor(new Color(rgbHex(r, g, b)))
    ctx.fillRect(new Rect(0, y, width, 2))
  }

  ctx.setFillColor(new Color("#253047", 0.16))
  ctx.fillRect(new Rect(0, 0, width, 86))

  ctx.setFillColor(new Color("#ffffff", 0.025))
  for (let y = 70; y < height; y += 18) {
    ctx.fillRect(new Rect(0, y, width, 1))
  }

  ctx.setFillColor(new Color("#000000", 0.16))
  ctx.fillRect(new Rect(0, height - 80, width, 80))

  return ctx.getImage()
}

function rgbHex(r, g, b) {
  return "#" + hexByte(r) + hexByte(g) + hexByte(b)
}

function hexByte(n) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")
}

