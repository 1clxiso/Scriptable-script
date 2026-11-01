// Scriptable 联通余量 · clxiso
// 文件导入 Scriptable 后请命名为「联通余量」。支持小号、中号桌面组件。
// Loon：开启中国联通去广告自用版中的「获取余量组件 Cookie」，刷新联通首页，点击获取通知。
// 凭据只存 Keychain；直接请求联通官方接口。单账号，重新导入会替换当前账号。
// Cookie 失效后需重新捕获，不自动登录。系统决定实际组件刷新时间。
const SCRIPT_VERSION = '202611011546';
const UPDATE_URL = 'https://raw.githubusercontent.com/1clxiso/Scriptable-script/main/%E8%81%94%E9%80%9A%E4%BD%99%E9%87%8F.js';
const CREDENTIAL_KEY = 'clxiso.unicom.widget.credentials.v1';
const SETTINGS_KEY = 'clxiso.unicom.widget.settings.v1';
const REFRESH_OPTIONS = [15, 30, 60, 120];
const CACHE_KEY = 'clxiso.unicom.widget.cache.v1';
const ENDPOINT = 'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';
const TYPES = ['fee', 'flow', 'voice'];

function normalizeRows(rows) {
  if (!Array.isArray(rows)) throw new Error('format');
  return TYPES.map(type => {
    const row = rows.find(item => item && item.type === type);
    const value = row?.value ?? row?.number;
    if (value == null || !String(value).trim() || String(value).length > 32) throw new Error('format');
    return {type, title: String(row.title || row.remainTitle || '').slice(0, 18), value: String(value), unit: String(row.unit || '').slice(0, 8)};
  });
}
function validateBundle(raw) {
  if (typeof raw !== 'string' || raw.length > 24000) throw new Error('import');
  const b = JSON.parse(raw);
  if (b.schema !== 'clxiso.unicom.widget.v1' || typeof b.cookie !== 'string' || !b.cookie.includes('=') || /[\r\n]/.test(b.cookie)) throw new Error('import');
  if (typeof b.userAgent !== 'string' || /[\r\n]/.test(b.userAgent)) throw new Error('import');
  const params = {};
  for (const key of ['version', 'desmobiel', 'showType']) {
    const value = b.params?.[key];
    if (typeof value !== 'string' || !value || value.length > 1024 || /[\r\n]/.test(value)) throw new Error('import');
    params[key] = value;
  }
  // 不接受外部传入的接口 URL 或任意请求头。
  return {schema: b.schema, cookie: b.cookie, userAgent: b.userAgent, params};
}
function readJSON(key) {
  try { return Keychain.contains(key) ? JSON.parse(Keychain.get(key)) : null; } catch (_) { return null; }
}
function makeURL(bundle) {
  return ENDPOINT + '?' + ['version', 'desmobiel', 'showType'].map(key => key + '=' + encodeURIComponent(bundle.params[key])).join('&');
}
async function loadUsage(bundle) {
  const request = new Request(makeURL(bundle));
  request.method = 'GET';
  request.headers = {Cookie: bundle.cookie, 'User-Agent': bundle.userAgent, Accept: 'application/json'};
  request.timeoutInterval = 20;
  request.onRedirect = () => null;
  let data;
  try { data = await request.loadJSON(); } catch (_) {
    const status = request.response?.statusCode;
    throw new Error(status === 401 || status === 403 || (status >= 300 && status < 400) ? 'auth' : 'network');
  }
  const status = request.response?.statusCode;
  if (status === 401 || status === 403 || (status >= 300 && status < 400)) throw new Error('auth');
  if (status !== 200) throw new Error('network');
  if (String(data?.code) !== 'Y') throw new Error('auth');
  let rows;
  try { rows = normalizeRows(data.data?.dataList); } catch (_) { throw new Error('format'); }
  return {rows, updatedAt: Date.now()};
}
function addText(parent, text, size, color, bold = false) {
  const label = parent.addText(text);
  label.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  label.textColor = color;
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.6;
  label.leftAlignText();
  return label;
}
function readSettings() {
  const saved = readJSON(SETTINGS_KEY) || {};
  return {previewSize: saved.previewSize === 'small' ? 'small' : 'medium', refreshMinutes: REFRESH_OPTIONS.includes(saved.refreshMinutes) ? saved.refreshMinutes : 30};
}
function renderWidget(cache, state, settings, family) {
  const small = family === 'small';
  const widget = new ListWidget();
  widget.setPadding(small ? 12 : 16, 14, 12, 14);
  widget.backgroundColor = Color.dynamic(new Color('#fbfaf8'), new Color('#181b22'));
  widget.url = 'scriptable:///run/' + encodeURIComponent(Script.name()) + '?refresh=1';
  const interval = settings.refreshMinutes * 60000;
  const due = cache ? cache.updatedAt + interval : 0;
  widget.refreshAfterDate = new Date(due > Date.now() ? due : Date.now() + interval);
  const ink = Color.dynamic(new Color('#253047'), new Color('#f2f4f8'));
  const muted = Color.dynamic(new Color('#8b909b'), new Color('#8993a4'));
  const accent = Color.dynamic(new Color('#df3049'), new Color('#ff6c81'));
  const line = Color.dynamic(new Color('#e6e7eb'), new Color('#313744'));
  const header = widget.addStack(); header.layoutHorizontally(); header.centerAlignContent();
  addText(header, '●', 7, accent); header.addSpacer(5);
  addText(header, '中国联通', 12, ink, true); header.addSpacer();
  const badge = header.addStack(); badge.setPadding(3, 6, 3, 6); badge.cornerRadius = 5;
  badge.backgroundColor = Color.dynamic(new Color(state ? '#fff0df' : '#f7e9ed'), new Color(state ? '#382b21' : '#32242e'));
  addText(badge, state && cache ? '缓存' : '余量', 8, state ? new Color('#c18437') : accent, true);
  widget.addSpacer(small ? 8 : 20);
  if (!cache) {
    addText(widget, state || '等待导入凭据', 13, ink, true);
    widget.addSpacer(7);
    const hint = widget.addText('在 Loon 获取后，点击通知导入。');
    hint.font = Font.systemFont(11); hint.textColor = muted; hint.leftAlignText();
    widget.addSpacer();
    return widget;
  }
  const names = {fee: '话费余额', flow: '通用流量', voice: '语音余量'};
  function metric(parent, row, size, valueColor) {
    const amount = parent.addStack(); amount.layoutHorizontally(); amount.bottomAlignContent();
    // 数值紧跟行首，单位仅使用固定间距；不以弹性留白把数值推向右边。
    addText(amount, row.value, size, valueColor, true);
    amount.addSpacer(3);
    addText(amount, row.unit, size >= 26 ? 10 : 8, muted);
    return amount;
  }
  if (small) {
    const fee = cache.rows.find(row => row.type === 'fee');
    addText(widget, names.fee, 9, muted);
    widget.addSpacer(2);
    metric(widget, fee, 30, accent);
    widget.addSpacer(8);
    const details = widget.addStack(); details.layoutHorizontally();
    ['flow', 'voice'].forEach((type, index) => {
      if (index) details.addSpacer(10);
      const column = details.addStack(); column.layoutVertically(); column.size = new Size(58, 0);
      addText(column, names[type], 9, muted); column.addSpacer(3);
      metric(column, cache.rows.find(row => row.type === type), 15, ink);
    });
  } else {
    const metrics = widget.addStack(); metrics.layoutHorizontally(); metrics.centerAlignContent();
    cache.rows.forEach((row, index) => {
      if (index) {
        metrics.addSpacer();
        const separator = metrics.addStack(); separator.size = new Size(1, 35); separator.backgroundColor = line;
        metrics.addSpacer();
      }
      const column = metrics.addStack(); column.layoutVertically(); column.size = new Size(84, 0);
      addText(column, names[row.type], 10, muted); column.addSpacer(7);
      metric(column, row, 27, row.type === 'fee' ? accent : ink);
    });
  }
  widget.addSpacer();
  const date = new Date(cache.updatedAt);
  const stamp = date.getMonth() + 1 + '/' + date.getDate() + ' ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  const footer = widget.addStack(); footer.layoutHorizontally();
  addText(footer, state ? state + ' · 缓存 ' + stamp : '更新于 ' + stamp, small ? 7 : 9, muted);
  return widget;
}
async function showMessage(title, message) {
  const alert = new Alert(); alert.title = title; alert.message = message; alert.addAction('好'); await alert.presentAlert();
}
async function checkForUpdate() {
  try {
    const request = new Request(UPDATE_URL + '?t=' + Date.now());
    request.timeoutInterval = 30; request.onRedirect = () => null;
    const code = await request.loadString();
    if (request.response?.statusCode !== 200 || typeof code !== 'string' || code.length > 1000000 || /^\s*</.test(code)) throw new Error('download');
    const match = code.match(/const SCRIPT_VERSION = '([0-9]{12})';/);
    if (!match || !code.includes("const CREDENTIAL_KEY = 'clxiso.unicom.widget.credentials.v1';")) throw new Error('format');
    const remoteVersion = match[1];
    if (remoteVersion <= SCRIPT_VERSION) {
      await showMessage('已是最新版本', '当前版本：' + SCRIPT_VERSION + '\n仓库中暂未发现更新的版本。'); return;
    }
    const confirm = new Alert(); confirm.title = '发现新版本';
    confirm.message = '当前：' + SCRIPT_VERSION + '\n新版：' + remoteVersion + '\n更新脚本代码，保留 Cookie 和组件设置，并备份上一版。';
    confirm.addAction('备份并更新'); confirm.addCancelAction('取消');
    if (await confirm.presentAlert() < 0) return;
    const target = module.filename;
    if (typeof target !== 'string' || !target.endsWith('.js')) throw new Error('path');
    const local = FileManager.local();
    const fm = local.isFileStoredIniCloud(target) ? FileManager.iCloud() : local;
    await fm.downloadFileFromiCloud(target);
    const previous = fm.readString(target);
    const backupDir = local.joinPath(local.libraryDirectory(), '联通余量更新备份');
    if (!local.fileExists(backupDir)) local.createDirectory(backupDir, true);
    local.writeString(local.joinPath(backupDir, fm.fileName(target, true) + '.bak'), previous);
    try { fm.writeString(target, code); }
    catch (_) { try { fm.writeString(target, previous); } catch (_) {} throw new Error('write'); }
    await showMessage('更新完成', '请重新运行脚本查看新版。桌面组件会在下次系统刷新时加载新版。');
  } catch (error) {
    await showMessage('检查或更新未完成', error.message === 'write' ? '保存失败，已尝试恢复原代码并保留上一版备份。Cookie 和设置不会被清除。' : '请检查网络后重试。Cookie 和组件设置不会受影响。');
  }
}
async function main() {
  let importError = false;
  const settings = readSettings();
  const incoming = args.queryParameters?.import;
  if (!config.runsInWidget && incoming) {
    let importedBundle;
    try { importedBundle = validateBundle(incoming); }
    catch (_) { importError = true; await showMessage('导入失败', '请使用联通插件重新获取。原有凭据未替换。'); }
    if (importedBundle) {
      try {
        Keychain.set(CREDENTIAL_KEY, JSON.stringify(importedBundle));
        // 不沿用旧账号的余量；新账号首次成功后才写入缓存。
        if (Keychain.contains(CACHE_KEY)) Keychain.remove(CACHE_KEY);
      } catch (_) {
        importError = true;
        await showMessage('保存失败', '无法写入本机 Keychain，请解锁设备后重新导入。');
      }
      if (!importError) await showMessage('导入成功', '凭据已保存到 Keychain。可关闭 Loon 的获取开关，并添加 Scriptable 桌面组件。');
    }
  }
  if (!config.runsInWidget && !incoming && !args.queryParameters?.refresh) {
    const menu = new Alert(); menu.title = '联通余量';
    menu.message = '版本 ' + SCRIPT_VERSION + '\n首次使用：在 Loon 开启获取开关，刷新联通首页，点击通知导入。重新导入会切换账号。';
    menu.addAction('预览小号组件'); menu.addAction('预览中号组件'); menu.addAction('设置刷新频率'); menu.addAction('检查更新'); menu.addDestructiveAction('清除本机凭据与缓存'); menu.addCancelAction('取消');
    const choice = await menu.presentSheet();
    if (choice === -1) { Script.complete(); return; }
    if (choice === 0 || choice === 1) settings.previewSize = choice === 0 ? 'small' : 'medium';
    if (choice === 2) {
      const picker = new Alert(); picker.title = '刷新频率';
      picker.message = '当前：' + settings.refreshMinutes + ' 分钟。此为期望间隔，桌面组件的实际刷新由 iOS 安排。';
      for (const minutes of REFRESH_OPTIONS) picker.addAction(minutes + ' 分钟');
      picker.addCancelAction('取消');
      const selected = await picker.presentSheet();
      if (selected >= 0 && selected < REFRESH_OPTIONS.length) settings.refreshMinutes = REFRESH_OPTIONS[selected];
    }
    if (choice === 3) { await checkForUpdate(); Script.complete(); return; }
    Keychain.set(SETTINGS_KEY, JSON.stringify(settings));
    if (choice === 4) {
      for (const key of [CREDENTIAL_KEY, CACHE_KEY]) if (Keychain.contains(key)) Keychain.remove(key);
      await showMessage('已清除', '桌面组件下次刷新时将提示重新导入。'); Script.complete(); return;
    }
  }
  let bundle = readJSON(CREDENTIAL_KEY);
  // 本地已存数据也经过相同的白名单校验。
  try { if (bundle) bundle = validateBundle(JSON.stringify(bundle)); } catch (_) { bundle = null; }
  let cache = readJSON(CACHE_KEY), state = importError ? '导入失败' : bundle ? '' : '请先导入查询凭据';
  try { if (cache) { cache.rows = normalizeRows(cache.rows); if (!Number.isFinite(cache.updatedAt)) cache = null; } } catch (_) { cache = null; }
  const freshCache = cache && Date.now() - cache.updatedAt >= 0 && Date.now() - cache.updatedAt < settings.refreshMinutes * 60000;
  if (bundle && !importError && (!config.runsInWidget || !freshCache)) {
    try { cache = await loadUsage(bundle); Keychain.set(CACHE_KEY, JSON.stringify(cache)); }
    catch (error) {
      state = error.message === 'auth' ? '登录失效，请重新获取' : error.message === 'format' ? '接口数据格式已变化' : '网络异常';
    }
  }
  const family = config.runsInWidget ? config.widgetFamily : settings.previewSize;
  const widget = renderWidget(cache, state, settings, family);
  Script.setWidget(widget);
  if (!config.runsInWidget) {
    if (family === 'small') await widget.presentSmall(); else await widget.presentMedium();
  }
  Script.complete();
}
await main();
