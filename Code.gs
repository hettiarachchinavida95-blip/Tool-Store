// Hanger Tools - Issue & Return backend (Google Apps Script)
const PIN = '1234';            // <-- CHANGE THIS to your staff PIN
const TOOLS = 'Tools', LOG = 'Log';

function setup() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(TOOLS)) throw new Error('Rename the imported tab to "Tools" first.');
  let log = ss.getSheetByName(LOG);
  if (!log) {
    log = ss.insertSheet(LOG);
    log.appendRow(['Log ID','Date out','Name','Badge','Class','Tool ID','Tool','Qty out','Qty returned','Date returned','Status']);
    log.setFrozenRows(1);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const b = JSON.parse(e.postData.contents);
    if (String(b.pin) !== PIN) return out({ ok: false, error: 'Wrong PIN' });
    if (b.action === 'issue') issue(b);
    else if (b.action === 'return') giveBack(b);
    else if (b.action !== 'list') return out({ ok: false, error: 'Unknown action' });
    return out({ ok: true, data: list() });
  } catch (err) {
    return out({ ok: false, error: String(err.message || err) });
  } finally { lock.releaseLock(); }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function logRows() { const s = SpreadsheetApp.getActive().getSheetByName(LOG); return { s, v: s.getLastRow() > 1 ? s.getRange(2, 1, s.getLastRow() - 1, 11).getValues() : [] }; }
function fmt(d) { return d instanceof Date ? Utilities.formatDate(d, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') : String(d || ''); }

function list() {
  const t = SpreadsheetApp.getActive().getSheetByName(TOOLS);
  const rows = t.getLastRow() > 1 ? t.getRange(2, 1, t.getLastRow() - 1, 4).getValues() : [];
  const lr = logRows().v, outBy = {}, open = [], seen = {}, people = [];
  lr.forEach(r => {
    const remaining = Number(r[7]) - Number(r[8]);
    if (r[10] !== 'Returned' && remaining > 0) {
      outBy[r[5]] = (outBy[r[5]] || 0) + remaining;
      open.push({ id: r[0], date: fmt(r[1]), name: r[2], badge: String(r[3]), cls: r[4], toolId: r[5], tool: r[6], qty: r[7], returned: r[8] });
    }
  });
  lr.slice(-300).reverse().forEach(r => { const k = r[2] + '|' + r[3]; if (!seen[k]) { seen[k] = 1; people.push({ name: r[2], badge: String(r[3]), cls: r[4] }); } });
  const tools = rows.filter(r => r[0]).map(r => ({ id: String(r[0]), name: r[1], cat: r[2], total: Number(r[3]) || 0, out: outBy[r[0]] || 0, avail: (Number(r[3]) || 0) - (outBy[r[0]] || 0) }));
  return { tools, open: open.reverse(), people };
}

function issue(b) {
  const qty = Number(b.qty);
  if (!b.name || !b.badge || !b.cls || !b.toolId || !(qty > 0) || qty % 1) throw new Error('Please fill in every field with a whole quantity.');
  const tool = list().tools.find(t => t.id === b.toolId);
  if (!tool) throw new Error('Tool not found.');
  if (qty > tool.avail) throw new Error('Only ' + tool.avail + ' available.');
  const l = logRows().s;
  l.appendRow([Utilities.getUuid().slice(0, 8), new Date(), String(b.name).trim(), String(b.badge).trim(), String(b.cls).trim(), tool.id, tool.name, qty, 0, '', 'Out']);
  l.getRange(l.getLastRow(), 2).setNumberFormat('yyyy-mm-dd hh:mm');
}

function giveBack(b) {
  const { s, v } = logRows(), i = v.findIndex(r => r[0] === b.logId);
  if (i < 0) throw new Error('Entry not found.');
  const qty = Number(b.qty), left = Number(v[i][7]) - Number(v[i][8]);
  if (!(qty > 0) || qty % 1 || qty > left) throw new Error('Return between 1 and ' + left + '.');
  const row = i + 2, done = Number(v[i][8]) + qty === Number(v[i][7]);
  s.getRange(row, 9).setValue(Number(v[i][8]) + qty);
  if (done) { s.getRange(row, 10).setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm'); s.getRange(row, 11).setValue('Returned'); }
}
