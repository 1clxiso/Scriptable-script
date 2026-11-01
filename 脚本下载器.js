// Scriptable 脚本下载器 · 1clxiso
// 首次将本文件导入 Scriptable；以后运行即可通过 GitHub raw 链接安装或更新 .js 脚本。
// 不执行下载内容；覆盖前确认并备份上一版。脚本保存到本下载器所在目录。
const UNICOM_RAW = 'https://raw.githubusercontent.com/1clxiso/Scriptable-script/main/%E8%81%94%E9%80%9A%E4%BD%99%E9%87%8F.js';
function parseRawLink(value) {
  const url = String(value || '').trim();
  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/([^?#]+\.js)(?:\?[^#\r\n]*)?$/i);
  if (!match || /[\r\n]/.test(url)) throw new Error('请填写 HTTPS 的 GitHub raw .js 链接，而不是仓库网页链接。');
  const filename = decodeURIComponent(match[3].split('/').pop());
  return {url, source: match[1] + '/' + match[2], name: filename.replace(/\.js$/i, '')};
}
function cleanName(value) {
  const name = String(value || '').trim().replace(/\.js$/i, '');
  if (!name || name.length > 80 || /^[.]+$/.test(name) || /[\\/:\x00-\x1f]/.test(name)) throw new Error('脚本名称不能为空，也不能包含路径分隔符。');
  return name;
}
async function message(title, detail) {
  const alert = new Alert(); alert.title = title; alert.message = detail; alert.addAction('好'); await alert.presentAlert();
}
async function main() {
  if (config.runsInWidget) return;
  const menu = new Alert(); menu.title = '脚本下载器';
  menu.message = '通过 GitHub raw 链接安装脚本。已安装脚本会在覆盖前确认，下载后不会自动运行。';
  menu.addAction('安装 / 更新联通余量'); menu.addAction('输入其他 raw 链接'); menu.addCancelAction('取消');
  const action = await menu.presentSheet(); if (action < 0) return;
  let url = UNICOM_RAW;
  if (action === 1) {
    const input = new Alert(); input.title = 'GitHub raw 链接';
    input.addTextField('https://raw.githubusercontent.com/…/脚本.js');
    input.addAction('下载'); input.addCancelAction('取消');
    if (await input.presentAlert() < 0) return;
    url = input.textFieldValue(0);
  }
  const link = parseRawLink(url);
  const request = new Request(link.url); request.timeoutInterval = 30; request.onRedirect = () => null;
  let code;
  try { code = await request.loadString(); } catch (_) { throw new Error('下载失败，请检查网络和链接后重试。'); }
  if (request.response?.statusCode !== 200) throw new Error('下载失败：服务器未返回成功响应。');
  if (!code || code.length > 1000000 || /^\s*</.test(code)) throw new Error('返回的内容不是有效脚本文件，未保存。');
  const naming = new Alert(); naming.title = '保存脚本';
  naming.message = '来源：' + link.source + '\n请确认名称。更新时使用原名称，已有 Cookie 和 Keychain 设置不会被清除。';
  naming.addTextField('脚本名称（不含 .js）', link.name);
  naming.addAction('保存'); naming.addCancelAction('取消');
  if (await naming.presentAlert() < 0) return;
  const name = cleanName(naming.textFieldValue(0));
  const local = FileManager.local();
  const current = module.filename;
  if (typeof current !== 'string' || !current.includes('/')) throw new Error('无法确定 Scriptable 脚本目录，未保存。');
  const fm = local.isFileStoredIniCloud(current) ? FileManager.iCloud() : local;
  const directory = current.slice(0, current.lastIndexOf('/'));
  const target = fm.joinPath(directory, name + '.js');
  let previous = null;
  if (fm.fileExists(target)) {
    const confirm = new Alert(); confirm.title = '更新已有脚本？';
    confirm.message = '将覆盖「' + name + '」的代码，并备份上一版。Cookie 和设置不变。';
    confirm.addDestructiveAction('备份并更新'); confirm.addCancelAction('取消');
    if (await confirm.presentAlert() < 0) return;
    await fm.downloadFileFromiCloud(target);
    previous = fm.readString(target);
    const backupDir = local.joinPath(local.libraryDirectory(), 'Scriptable下载器备份');
    if (!local.fileExists(backupDir)) local.createDirectory(backupDir, true);
    local.writeString(local.joinPath(backupDir, name + '.js.bak'), previous);
  }
  try { fm.writeString(target, code); }
  catch (_) {
    if (previous !== null) { try { fm.writeString(target, previous); } catch (_) {} }
    throw new Error('保存失败。若更新已有脚本，上一版已备份到本机 Library/Scriptable下载器备份。');
  }
  await message('已保存「' + name + '」', '返回 Scriptable 脚本列表即可找到。' + (previous !== null ? '本机 Library/Scriptable下载器备份 中保留了上一版代码。' : ''));
}
try { await main(); } catch (error) { await message('未完成安装', error.message || '发生错误，请稍后重试。'); }
Script.complete();
