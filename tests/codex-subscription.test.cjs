const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Codex用量与订阅.js'), 'utf8');
new (Object.getPrototypeOf(async function() {}).constructor)(source);
const isolated = source.replace(/main\(\)\.catch\([\s\S]*?\n\}\)\n/, '');
assert.notEqual(isolated, source, 'Remove auto-run entry for offline tests');
const sample = JSON.parse(fs.readFileSync(path.join(root, 'examples/codex-subscription-usage.example.json'), 'utf8'));

class Color { constructor(hex) { this.hex = hex; } static white() { return new Color('#fff'); } }
class Stack {
  constructor() { this.children = []; }
  addStack() { const item = new Stack(); this.children.push(item); return item; }
  addText(text) { assert.equal(typeof text, 'string'); const item = { text }; this.children.push(item); return item; }
  addImage(image) { assert.ok(image); const item = { image }; this.children.push(item); return item; }
  addSpacer() {}
  layoutHorizontally() {}
  layoutVertically() {}
  topAlignContent() {}
  centerAlignContent() {}
  setPadding() {}
}
class DrawContext {
  setFillColor() {} fillRect() {} fillEllipse() {} setFont() {} setTextColor() {}
  drawTextInRect() {} getImage() { return { mockImage: true }; }
}
class DateFormatter {
  string(date) {
    const pad = number => String(number).padStart(2, '0');
    const day = `${date.getFullYear()}/${pad(date.getMonth()+1)}/${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return this.dateFormat === 'yyyy/MM/dd' ? day : this.dateFormat === 'HH:mm' ? time : `${day} ${time}`;
  }
}

function environment() {
  const keychain = new Map();
  const files = new Map();
  const requests = [];
  const network = { payload: sample, fail: false, status: 200 };
  class Request {
    constructor(url) { this.url = url; requests.push(this); this.response = { statusCode: network.status }; }
    async loadJSON() { if (network.fail) throw new Error('Offline'); return JSON.parse(JSON.stringify(network.payload)); }
  }
  const ctx = vm.createContext({
    console, Date, Math, JSON, Set, Map, Color, Stack, DrawContext, DateFormatter, Request,
    Size: class { constructor(width, height) { this.width=width; this.height=height; } },
    Rect: class {}, ListWidget: Stack,
    Font: new Proxy({}, { get: (_, name) => size => ({name, size}) }),
    Keychain: { contains: key => keychain.has(key), get: key => keychain.get(key),
      set: (key, value) => keychain.set(key, value), remove: key => keychain.delete(key) },
    FileManager: { local: () => ({ documentsDirectory: () => '/mock', joinPath: (a,b) => a+'/'+b,
      fileExists: p => files.has(p), readString: p => files.get(p), writeString: (p,s) => files.set(p,s) }) },
    Data: { fromBase64String: value => Buffer.from(value, 'base64') },
    Image: { fromData: () => ({ mockImage: true }) }, Device: { isCharging: () => false },
    config: { runsInApp: false, runsInWidget: true, widgetFamily: 'medium' }, args: { widgetParameter: '' }
  });
  vm.runInContext(isolated, ctx);
  const configure = (extra={}) => keychain.set('codex_subscription_widget_settings_v1', JSON.stringify({apiUrl:'https://usage.test/usage', cacheId:'test', ...extra}));
  configure();
  return { ctx, configure, files, keychain, network, requests };
}

let checks = 0;
function check(name, fn) { fn(); checks++; }
const env = environment(), c = env.ctx;
const now = new Date('2026-11-01T00:00:00Z');
check('ISO, Unix seconds and milliseconds agree', () => {
  const instant = Date.parse('2026-12-01T16:00:00Z');
  for (const value of ['2026-12-01T16:00:00Z', '2026-12-02T00:00:00+08:00', instant, instant/1000]) {
    assert.equal(c.parseSubscriptionDate(value).getTime(), instant);
  }
});
check('Reject ambiguous or malformed dates', () => {
  for (const value of [null, '', false, 0, -1, 'tomorrow', '2026-12-01', '2026-12-01T00:00:00', '2026-02-30T00:00:00Z']) {
    assert.equal(c.parseSubscriptionDate(value), null);
  }
});
check('Manual date validation and local end-of-day', () => {
  assert.equal(c.manualEndDate('2026-02-29'), null);
  assert.ok(c.manualEndDate('2028-02-29'));
  const date = c.manualEndDate('2026-11-01');
  assert.equal(date.getDate(), 2);
  assert.equal(date.getHours(), 0);
});
check('Explicit expiry wins over renewal and manual', () => {
  env.configure({codexExpiry:'2026-12-31'});
  const info = c.subscriptionInfo('codex', { subscription:{ expires_at:'2026-12-01T00:00:00Z', renews_at:'2026-12-15T00:00:00Z'} }, {}, now);
  assert.equal(info.kind, 'expiry'); assert.equal(info.source, 'api');
  assert.equal(info.date.toISOString(), '2026-12-01T00:00:00.000Z');
});
check('Billing-cycle end does not automatically mean expiry', () => {
  for(const [cancel, kind] of [[undefined,'period'], [false,'renewal'], [true,'expiry']]) {
    const info = c.subscriptionInfo('codex', { subscription:{ current_period_end:'2026-12-01T00:00:00Z',cancel_at_period_end:cancel } }, {}, now);
    assert.equal(info.kind, kind);
  }
});
check('Usage reset and JWT expiration never become subscription dates', () => {
  env.configure();
  assert.equal(c.subscriptionInfo('codex', { exp:1999999999, five_hour:{resets_at:1999999999}, weekly:{resets_at:1999999999} }, {}, now), null);
});
check('Manual fallback and passed-date notice', () => {
  env.configure({codexExpiry:'2026-10-31'});
  const info = c.subscriptionInfo('codex', {}, {}, new Date('2026-11-02T00:00:00Z'));
  assert.equal(info.source, 'manual'); assert.equal(info.expired, true);
  assert.match(c.subscriptionDetailText(info), /日期已过/);
});
check('Exact expiry boundary', () => {
  const info = c.subscriptionInfo('codex', { subscription:{expires_at:now.toISOString()} }, {}, now);
  assert.equal(info.expired, true); assert.equal(info.remainingDays, 0);
});
check('Manual dates isolated from parameter endpoint override', () => {
  env.configure({codexExpiry:'2026-12-31'});
  c.args.widgetParameter = 'https://other.test/usage';
  assert.equal(c.subscriptionInfo('codex', {}, {}, now), null);
  assert.equal(c.widgetSettings().useSavedToken, false);
  c.args.widgetParameter = '';
});
check('URL validation and custom paths', () => {
  assert.equal(c.usageUrl('https://usage.test'), 'https://usage.test/usage');
  assert.equal(c.usageUrl('https://usage.test/custom?q=1'), 'https://usage.test/custom?q=1');
  for(const value of ['http://usage.test', 'https://a:b@usage.test/usage', '', 'file:///tmp']) assert.equal(c.usageUrl(value), null);
});
check('Inspector identifies a supported subscription expiry', () => {
  const report = c.subscriptionFieldReport(sample);
  assert.match(report, /可直接使用/);
  assert.match(report, /services.codex.subscription.expires_at/);
  assert.ok(!report.includes('2026-12-01'));
});
check('Inspector does not mistake quota resets or credential expiration for subscription', () => {
  const report = c.subscriptionFieldReport({ok:true,plan_type:'plus',email:'private@example.test',token:'secret-token',exp:1999999999,five_hour:{resets_at:1999999999}});
  assert.match(report, /未发现订阅日期字段/);
  for(const sensitive of ['private@example.test','secret-token','1999999999']) assert.ok(!report.includes(sensitive));
});
check('Inspector locates alternative metadata without claiming it is usable expiry', () => {
  const report = c.subscriptionFieldReport({data:{billing:{subscription_end_date:'2026-12-01T00:00:00Z'}}});
  assert.match(report, /需要核对和适配/);
  assert.match(report, /data.billing.subscription_end_date/);
  const renewal = c.subscriptionFieldReport({services:{codex:{subscription:{renews_at:'2026-12-01T00:00:00Z'}}}});
  assert.match(renewal, /不一定是订阅到期时间/);
});

function texts(node) {
  return (node.children || []).flatMap(child => child.text ? [child.text] : texts(child));
}

(async () => {
  const e = environment();
  e.keychain.set('codex_subscription_widget_token_v1', 'test-token');
  const settings = e.ctx.widgetSettings();
  const live = await e.ctx.loadUsage(settings);
  assert.equal(live.ok, true);
  assert.equal(e.requests[0].headers.Authorization, 'Bearer test-token');
  e.network.fail = true;
  const cached = await e.ctx.loadUsage(settings);
  assert.equal(cached.stale, true);
  assert.equal(e.ctx.serviceUsage('codex', cached).stale, true);
  assert.equal(e.ctx.serviceUsage('codex', cached).subscription.cached, true);
  checks++;

  e.ctx.args.widgetParameter = 'https://other.test/usage';
  const isolatedSettings = e.ctx.widgetSettings();
  const offline = await e.ctx.loadUsage(isolatedSettings);
  assert.equal(offline.ok, false);
  assert.equal(e.requests.at(-1).headers.Authorization, undefined);
  checks++;

  e.ctx.args.widgetParameter = '';
  e.network.fail = false;
  e.network.status = 401;
  const previousCache = [...e.files.values()][0];
  await e.ctx.loadUsage(settings);
  assert.equal(e.files.size, 1, 'An unauthorized response must not overwrite good cache');
  assert.equal([...e.files.values()][0], previousCache);
  e.network.status = 200;
  for(const [family, parameter] of [['small','codex'], ['small','claude'], ['medium','codex'], ['medium','claude'], ['medium','both'], ['medium','week']]) {
    e.ctx.config.widgetFamily = family;
    e.ctx.args.widgetParameter = parameter;
    const widget = await e.ctx.createWidget();
    const content = texts(widget).join(' ');
    assert.match(content, parameter === 'claude' ? /下次续费/ : /订阅到期/);
    assert.ok(widget.refreshAfterDate instanceof Date);
    checks++;
  }
  e.network.payload = {...sample, services:{codex:{...sample.services.codex,subscription:null}}};
  e.ctx.config.widgetFamily = 'medium'; e.ctx.args.widgetParameter = 'codex';
  assert.match(texts(await e.ctx.createWidget()).join(' '), /暂未提供/);
  checks++;
  console.log(`PASS: syntax and ${checks} date, metadata, credential/cache isolation and widget-build checks`);
})().catch(error => {console.error(error); process.exitCode = 1;});
