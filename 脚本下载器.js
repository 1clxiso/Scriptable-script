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
function scriptLocation() {
  const local = FileManager.local(), current = module.filename;
  if (typeof current !== 'string' || !current.includes('/')) throw new Error('无法确定 Scriptable 脚本目录。');
  return {fm: local.isFileStoredIniCloud(current) ? FileManager.iCloud() : local,
    directory: current.slice(0, current.lastIndexOf('/'))};
}
function backupDirectory() {
  const fm = FileManager.local();
  return fm.joinPath(fm.libraryDirectory(), 'Scriptable下载器备份');
}
function backups() {
  const fm = FileManager.local(), dir = backupDirectory();
  if (!fm.fileExists(dir)) return [];
  return fm.listContents(dir).filter(file => file.endsWith('.js.bak')).map(file => {
    const path = fm.joinPath(dir, file);
    const match = file.match(/^(.*)__(\d{17})(?:-\d+)?\.js\.bak$/);
    return {file, path, name: match ? match[1] : file.slice(0, -7),
      date: fm.modificationDate(path), size: fm.fileSize(path)};
  }).sort((a, b) => b.date.getTime() - a.date.getTime() || b.file.localeCompare(a.file));
}
function saveBackup(name, code) {
  const fm = FileManager.local(), dir = backupDirectory();
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
  let file = name + '__' + stamp + '.js.bak', serial = 0;
  while (fm.fileExists(fm.joinPath(dir, file))) file = name + '__' + stamp + '-' + (++serial) + '.js.bak';
  fm.writeString(fm.joinPath(dir, file), code);
}
function pruneBackups(name) {
  const fm = FileManager.local();
  backups().filter(item => item.name === name).slice(5).forEach(item => fm.remove(item.path));
}
async function confirmAction(title, detail, action) {
  const alert = new Alert(); alert.title = title; alert.message = detail;
  alert.addDestructiveAction(action); alert.addCancelAction('取消');
  return await alert.presentAlert() === 0;
}
async function manageBackups() {
  while (true) {
    const items = backups();
    if (!items.length) { await message('暂无备份', '覆盖更新已有脚本后会生成备份；每个脚本保留最近 5 份。'); return; }
    const list = new Alert(); list.title = '备份管理';
    list.message = '备份仅保存在本机。旧版备份也可查看和恢复。';
    items.forEach(item => list.addAction(item.name + ' · ' + item.date.toLocaleString('zh-CN') + ' · ' + (item.size / 1024).toFixed(1) + ' KB'));
    list.addDestructiveAction('清空全部备份'); list.addCancelAction('返回');
    const index = await list.presentSheet(); if (index < 0) return;
    const fm = FileManager.local();
    if (index === items.length) {
      if (await confirmAction('清空全部备份？', '将删除全部 ' + items.length + ' 份备份，无法撤销。已安装脚本不受影响。', '清空备份')) items.forEach(item => fm.remove(item.path));
      continue;
    }
    const item = items[index];
    const menu = new Alert(); menu.title = item.name;
    menu.message = item.date.toLocaleString('zh-CN') + ' · ' + (item.size / 1024).toFixed(1) + ' KB';
    ['预览代码', '导出备份', '恢复此版本'].forEach(label => menu.addAction(label));
    menu.addDestructiveAction('删除此备份'); menu.addCancelAction('返回');
    const action = await menu.presentSheet(); if (action < 0) continue;
    if (action === 0) await QuickLook.present(fm.readString(item.path));
    if (action === 1) {
      const target = fm.joinPath(fm.temporaryDirectory(), item.file.replace(/\.bak$/, ''));
      fm.writeString(target, fm.readString(item.path));
      await ShareSheet.present([target]);
    }
    if (action === 2) {
      const name = cleanName(item.name), location = scriptLocation();
      const target = location.fm.joinPath(location.directory, name + '.js');
      if (!await confirmAction('恢复「' + name + '」？', '将恢复到下载器所在目录；若已有同名脚本，会先备份当前版本。Cookie 和设置不变。', '备份并恢复')) continue;
      const code = fm.readString(item.path); let previous = null;
      if (location.fm.fileExists(target)) {
        await location.fm.downloadFileFromiCloud(target);
        previous = location.fm.readString(target); saveBackup(name, previous);
      }
      try { location.fm.writeString(target, code); }
      catch (error) {
        if (previous !== null) { try { location.fm.writeString(target, previous); } catch (_) {} }
        throw new Error('恢复失败，原代码的备份已保留，请检查存储状态后重试。');
      }
      pruneBackups(name);
      await message('已恢复', '重新运行「' + name + '」即可使用恢复后的版本。');
    }
    if (action === 3 && await confirmAction('删除此备份？', '仅删除这份备份，无法撤销。已安装脚本不受影响。', '删除备份')) fm.remove(item.path);
  }
}
async function main() {
  if (config.runsInWidget) return;
  const menu = new Alert(); menu.title = '脚本下载器';
  menu.message = '通过 GitHub raw 链接安装脚本。已安装脚本会在覆盖前确认，下载后不会自动运行。';
  menu.addAction('安装 / 更新联通余量'); menu.addAction('输入其他 raw 链接'); menu.addAction('备份管理'); menu.addCancelAction('取消');
  const action = await menu.presentSheet(); if (action < 0) return;
  if (action === 2) { await manageBackups(); return; }
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
  const {fm, directory} = scriptLocation();
  const target = fm.joinPath(directory, name + '.js');
  let previous = null;
  if (fm.fileExists(target)) {
    const confirm = new Alert(); confirm.title = '更新已有脚本？';
    confirm.message = '将覆盖「' + name + '」的代码，并备份上一版。Cookie 和设置不变。';
    confirm.addDestructiveAction('备份并更新'); confirm.addCancelAction('取消');
    if (await confirm.presentAlert() < 0) return;
    await fm.downloadFileFromiCloud(target);
    previous = fm.readString(target);
    saveBackup(name, previous);
  }
  try { fm.writeString(target, code); }
  catch (_) {
    if (previous !== null) { try { fm.writeString(target, previous); } catch (_) {} }
    throw new Error('保存失败。若更新已有脚本，上一版已备份到本机 Library/Scriptable下载器备份。');
  }
  pruneBackups(name);
  await message('已保存「' + name + '」', '返回 Scriptable 脚本列表即可找到。' + (previous !== null ? '本机 Library/Scriptable下载器备份 中按时间保留最近 5 份备份。' : ''));
}
try { await main(); } catch (error) { await message('操作未完成', error.message || '发生错误，请稍后重试。'); }
Script.complete();
