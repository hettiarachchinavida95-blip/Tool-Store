/* Hanger Tools inventory manager — no dependencies, no server required. */
(() => {
  'use strict';
  const DB_NAME = 'hanger-tools-inventory-v1';
  const STORE_NAME = 'tools';
  const STATUSES = ['Available', 'In use', 'Maintenance', 'Retired'];
  const FIELDS = ['sku','name','category','brand','model','serial','quantity','minStock','status','location','assignedTo','purchaseDate','unitCost','notes'];
  const SAMPLE_CATEGORIES = ['Power Tools','Hand Tools','Measuring','Safety Equipment','Electrical','Workshop','Pneumatic','Other'];
  const ALIASES = {
    toolid:'sku', id:'id', sku:'sku', code:'sku', assetid:'sku', toolcode:'sku',
    toolname:'name', name:'name', description:'name',
    category:'category', type:'category', brand:'brand', manufacturer:'brand',
    model:'model', modelnumber:'model', serial:'serial', serialnumber:'serial',
    qty:'quantity', quantity:'quantity', stock:'quantity',
    minimumstock:'minStock', minstock:'minStock', minimumquantity:'minStock', reorderlevel:'minStock',
    status:'status', condition:'status', location:'location', storagelocation:'location',
    assignedto:'assignedTo', custodian:'assignedTo', owner:'assignedTo',
    purchasedate:'purchaseDate', datepurchased:'purchaseDate',
    unitcost:'unitCost', price:'unitCost', unitvalue:'unitCost', cost:'unitCost',
    notes:'notes', remarks:'notes',
    createdat:'createdAt', updatedat:'updatedAt', deletedat:'deletedAt'
  };
  const $ = id => document.getElementById(id);
  let db = null, records = [], view = 'inventory', page = 1, editingId = null, confirmCallback = null;
  let currentFiltered = [];
  const state = { query: '', category: 'all', status: 'all', sort: 'updated-desc', pageSize: 25 };

  function newId() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])); }
  function compactNumber(value) { return new Intl.NumberFormat('en-US').format(value); }
  function displayDate(iso) { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(d); }
  function strip(value, max = 2000) { return String(value ?? '').trim().slice(0, max); }
  function isLowStock(r) { return r.quantity <= r.minStock; }
  function activeRecords() { return records.filter(r => !r.deletedAt); }
  function deletedRecords() { return records.filter(r => !!r.deletedAt); }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is unavailable in this browser.')); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open the local database.'));
      request.onblocked = () => reject(new Error('Database is blocked by another open tab. Close the other tab and reload.'));
    });
  }
  function readDatabase() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  function bulkWrite(items, action = 'put') {
    return new Promise((resolve, reject) => {
      if (!items.length) { resolve(); return; }
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      try { for (const item of items) action === 'delete' ? store.delete(item) : store.put(item); }
      catch (error) { try { transaction.abort(); } catch (_) {} reject(error); return; }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the changes.'));
      transaction.onabort = () => reject(transaction.error || new Error('The changes were not saved.'));
    });
  }
  async function refresh() { records = await readDatabase(); render(); }
  function toast(message, error = false) {
    const item = document.createElement('div'); item.className = `toast${error ? ' error' : ''}`; item.textContent = message;
    $('toastStack').appendChild(item);
    setTimeout(() => item.remove(), 4600);
  }
  function handleError(error) { console.error(error); toast(error?.message || 'Something went wrong. Please try again.', true); }
  function sortedFiltered() {
    const q = state.query.trim().toLocaleLowerCase();
    const items = (view === 'trash' ? deletedRecords() : activeRecords()).filter(r => {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.status !== 'all' && r.status !== state.status) return false;
      if (!q) return true;
      return [r.sku,r.name,r.category,r.brand,r.model,r.serial,r.location,r.assignedTo,r.notes].some(s => String(s || '').toLocaleLowerCase().includes(q));
    });
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    items.sort((a,b) => {
      switch (state.sort) {
        case 'name-asc': return collator.compare(a.name,b.name);
        case 'name-desc': return collator.compare(b.name,a.name);
        case 'qty-asc': return a.quantity - b.quantity || collator.compare(a.name,b.name);
        case 'qty-desc': return b.quantity - a.quantity || collator.compare(a.name,b.name);
        case 'sku-asc': return collator.compare(a.sku,b.sku);
        default: return (b.updatedAt || '').localeCompare(a.updatedAt || '') || collator.compare(a.sku,b.sku);
      }
    });
    return items;
  }
  function renderCategoryOptions() {
    const categories = [...new Set(activeRecords().map(r => r.category || 'Uncategorised'))].sort();
    const select = $('categoryFilter'), old = state.category;
    select.replaceChildren(new Option('All categories','all'));
    for (const cat of categories) select.add(new Option(cat,cat));
    if (categories.includes(old)) select.value = old;
    else { state.category = 'all'; select.value = 'all'; }
    const datalist = $('categorySuggestions'); datalist.replaceChildren();
    [...new Set([...SAMPLE_CATEGORIES,...categories])].sort().forEach(cat => datalist.appendChild(new Option(cat)));
  }
  function renderStatistics() {
    const active = activeRecords();
    $('totalCount').textContent = compactNumber(active.length);
    $('totalUnits').textContent = compactNumber(active.reduce((sum,r) => sum + r.quantity,0));
    $('inUseCount').textContent = compactNumber(active.filter(r => r.status === 'In use').length);
    $('lowStockCount').textContent = compactNumber(active.filter(isLowStock).length);
    $('navInventoryCount').textContent = compactNumber(active.length);
    $('navTrashCount').textContent = compactNumber(deletedRecords().length);
  }
  function renderRow(r) {
    const avatar = (r.name.match(/[A-Za-z0-9]/g) || ['T']).slice(0,2).join('').toUpperCase();
    const low = isLowStock(r);
    const statusKey = r.status.toLowerCase().replace(/\s+/g,'-');
    const actions = view === 'trash'
      ? `<button class="row-action" data-action="restore" data-id="${escapeHtml(r.id)}" title="Restore" aria-label="Restore ${escapeHtml(r.name)}"><svg viewBox="0 0 24 24"><path d="M3 11a9 9 0 1 1 2.5 6.2M3 4v7h7"/><path d="M12 7v5l3 2"/></svg></button><button class="row-action remove" data-action="permanent" data-id="${escapeHtml(r.id)}" title="Delete permanently" aria-label="Permanently delete ${escapeHtml(r.name)}"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg></button>`
      : `<button class="row-action" data-action="edit" data-id="${escapeHtml(r.id)}" title="Edit tool" aria-label="Edit ${escapeHtml(r.name)}"><svg viewBox="0 0 24 24"><path d="m15 5 4 4M4 20l5-.9L20 7a2.1 2.1 0 0 0-3-3L5 16Z"/></svg></button><button class="row-action remove" data-action="delete" data-id="${escapeHtml(r.id)}" title="Move to trash" aria-label="Move ${escapeHtml(r.name)} to trash"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg></button>`;
    return `<tr><td><div class="tool-cell"><span class="tool-avatar">${escapeHtml(avatar)}</span><div><div class="tool-name">${escapeHtml(r.name)}</div><div class="tool-sku">${escapeHtml(r.sku)}${r.brand ? ' · '+escapeHtml(r.brand) : ''}</div></div></div></td><td><span class="category-tag">${escapeHtml(r.category || 'Uncategorised')}</span></td><td><span class="quantity-main${low ? ' quantity-low':''}">${compactNumber(r.quantity)}</span>${low ? '<span class="qty-hint">Low stock</span>' : ''}</td><td><span class="status-pill status-${escapeHtml(statusKey)}">${escapeHtml(r.status)}</span></td><td>${r.location ? escapeHtml(r.location) : '<span class="table-muted">Not specified</span>'}</td><td><span class="table-muted">${escapeHtml(displayDate(view === 'trash' ? r.deletedAt : r.updatedAt))}</span></td><td><div class="row-actions">${actions}</div></td></tr>`;
  }
  function render() {
    renderStatistics(); renderCategoryOptions();
    const inTrash = view === 'trash';
    $('breadcrumbCurrent').textContent = inTrash ? 'Recently deleted' : 'Inventory';
    $('pageEyebrow').innerHTML = `${inTrash ? 'YOUR WORKSPACE' : 'YOUR WORKSPACE'} <span class="eyebrow-line"></span> ${inTrash ? 'RECOVERY' : 'TOOL TRACKING'}`;
    $('pageTitle').textContent = inTrash ? 'Recently deleted' : 'Tool inventory';
    $('pageSubtitle').textContent = inTrash ? 'Restore removed tools or permanently delete them.' : 'Manage your entire equipment register in one place.';
    $('tableHeading').innerHTML = `${inTrash ? 'Deleted tools' : 'All tools'} <span class="count-pill" id="tableCount">0</span>`;
    $('tableDescription').textContent = inTrash ? 'Deleted records stay here until you remove them permanently.' : 'Search, organise and update your inventory.';
    $('introActions').hidden = inTrash; $('topAdd').hidden = inTrash; $('importButton').hidden = inTrash;
    document.querySelectorAll('[data-view]').forEach(el => {const active = el.dataset.view === view; el.classList.toggle('active',active); if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');});
    $('categoryFilter').disabled = inTrash;
    $('statusFilter').disabled = inTrash;
    $('statsGrid').hidden = inTrash;
    currentFiltered = sortedFiltered();
    $('tableCount').textContent = compactNumber(currentFiltered.length);
    const totalPages = Math.max(1,Math.ceil(currentFiltered.length/state.pageSize));
    page = Math.min(page,totalPages);
    const start = (page-1)*state.pageSize;
    const items = currentFiltered.slice(start,start+state.pageSize);
    $('toolRows').innerHTML = items.map(renderRow).join('');
    const noResults = currentFiltered.length === 0;
    $('emptyState').hidden = !noResults;
    $('tableFooter').hidden = noResults;
    if (noResults) {
      const any = inTrash ? deletedRecords().length : activeRecords().length;
      $('emptyTitle').textContent = any ? 'No matching tools found' : (inTrash ? 'Trash is empty' : 'Your tool library starts here');
      $('emptyText').textContent = any ? 'Try clearing your search or changing the filters.' : inTrash ? 'Tools you delete will appear here, ready to restore.' : 'Add your first tool or import a CSV file to build your inventory.';
      $('emptyActions').hidden = !!any || inTrash;
    }
    $('resultSummary').textContent = currentFiltered.length ? `Showing ${compactNumber(start+1)}–${compactNumber(Math.min(start+state.pageSize,currentFiltered.length))} of ${compactNumber(currentFiltered.length)} tools` : 'Showing 0 tools';
    $('pageSummary').textContent = `Page ${page} of ${totalPages}`;
    $('prevPage').disabled = page <= 1; $('nextPage').disabled = page >= totalPages;
  }
  function setView(next) { view = next; page = 1; state.query = ''; state.category = 'all'; state.status = 'all'; $('searchInput').value = ''; $('statusFilter').value = 'all'; closeMenu(); render(); }
  function openMenu() { $('sidebar').classList.add('open'); $('mobileScrim').hidden = false; $('menuToggle').setAttribute('aria-expanded','true'); }
  function closeMenu() { $('sidebar').classList.remove('open'); $('mobileScrim').hidden = true; $('menuToggle').setAttribute('aria-expanded','false'); }
  function show(dialogId) { $(dialogId).showModal(); }
  function close(dialogId) { $(dialogId).close(); }
  function showToolDialog(record = null) {
    editingId = record?.id || null;
    $('toolForm').reset(); $('formError').hidden = true;
    $('dialogTitle').textContent = record ? 'Edit tool' : 'Add new tool';
    $('saveTool').textContent = record ? 'Save changes' : 'Save tool';
    const form = $('toolForm');
    for (const field of FIELDS) {
      if (form.elements.namedItem(field)) form.elements.namedItem(field).value = record ? (record[field] ?? '') : (field === 'quantity' ? '1' : field === 'minStock' ? '0' : field === 'status' ? 'Available' : '');
    }
    show('toolDialog');
    form.elements.namedItem('name').focus();
  }
  function getInteger(value, fallback = 0) {
    if (value === '' || value == null) return fallback;
    const num = Number(value);
    if (!Number.isSafeInteger(num) || num < 0 || num > 100000000) throw new Error('Quantity and minimum stock must be whole numbers from 0 to 100,000,000.');
    return num;
  }
  function getCost(value) {
    if (value === '' || value == null) return '';
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 100000000000) throw new Error('Unit value must be a valid nonnegative number.');
    return Math.round(num*100)/100;
  }
  function normalise(input, existing = null, backup = false) {
    const take = (key, fallback = '') => Object.prototype.hasOwnProperty.call(input,key) ? input[key] : (existing ? existing[key] : fallback);
    const sku = strip(take('sku'),70), name = strip(take('name'),150);
    if (!sku || !name) throw new Error('Tool name and Tool ID / SKU are required.');
    const statusRaw = strip(take('status','Available'),40);
    const status = STATUSES.find(s => s.toLowerCase() === statusRaw.toLowerCase());
    if (!status) throw new Error(`Invalid status for ${sku}: ${statusRaw}.`);
    const quantity = getInteger(take('quantity',1),1), minStock = getInteger(take('minStock',0),0);
    const date = strip(take('purchaseDate'),20);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid purchase date for ${sku}; use YYYY-MM-DD.`);
    const now = new Date().toISOString();
    const record = {
      id: existing?.id || (backup && input.id && /^[a-zA-Z0-9_-]{6,100}$/.test(String(input.id)) ? input.id : newId()),
      sku,name, category:strip(take('category'),80),brand:strip(take('brand'),80),model:strip(take('model'),100),
      serial:strip(take('serial'),100),quantity,minStock,status,location:strip(take('location'),120),
      assignedTo:strip(take('assignedTo'),120),purchaseDate:date,unitCost:getCost(take('unitCost')),
      notes:strip(take('notes'),2000),createdAt: existing?.createdAt || (backup && input.createdAt ? strip(input.createdAt,40) : now),
      updatedAt:now,deletedAt:existing?.deletedAt || (backup && input.deletedAt ? strip(input.deletedAt,40) : null)
    };
    return record;
  }
  async function saveTool(event) {
    event.preventDefault(); $('formError').hidden = true;
    try {
      const raw = Object.fromEntries(new FormData($('toolForm')).entries());
      const existing = records.find(r => r.id === editingId) || null;
      const record = normalise(raw, existing);
      if (records.some(r => r.id !== record.id && r.sku.toLowerCase() === record.sku.toLowerCase())) throw new Error('This Tool ID / SKU is already in use. Choose a unique ID.');
      await bulkWrite([record]);
      close('toolDialog'); await refresh();
      toast(existing ? `${record.name} updated successfully.` : `${record.name} added successfully.`);
    } catch (error) { $('formError').textContent = error.message; $('formError').hidden = false; }
  }
  function askConfirmation(title, message, cta, callback) {
    confirmCallback = callback;
    $('confirmTitle').textContent = title; $('confirmText').textContent = message; $('confirmAccept').textContent = cta;
    show('confirmDialog');
  }
  async function performAction(action,id) {
    const record = records.find(r => r.id === id);
    if (!record) { toast('This tool could not be found.',true); return; }
    try {
      if (action === 'edit') { showToolDialog(record); return; }
      if (action === 'restore') {
        await bulkWrite([{...record,deletedAt:null,updatedAt:new Date().toISOString()}]); await refresh(); toast(`${record.name} restored.`); return;
      }
      if (action === 'delete') {
        askConfirmation('Move tool to trash?', `“${record.name}” will be removed from inventory. You can restore it later.`, 'Move to trash', async () => {
          await bulkWrite([{...record,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]); await refresh(); toast(`${record.name} moved to trash.`);
        });
      }
      if (action === 'permanent') {
        askConfirmation('Permanently delete tool?', `“${record.name}” will be deleted permanently. This cannot be undone unless you have a backup.`, 'Delete permanently', async () => {
          await bulkWrite([record.id],'delete'); await refresh(); toast(`${record.name} permanently deleted.`);
        });
      }
    } catch (error) { handleError(error); }
  }
  function parseCSV(text) {
    const rows = []; let row = [], value = '', inQuotes = false;
    text = text.replace(/^\uFEFF/,'');
    for (let i=0;i<text.length;i++) {
      const c=text[i];
      if (inQuotes) { if(c==='"' && text[i+1]==='"'){value+='"';i++;} else if(c==='"')inQuotes=false; else value+=c; }
      else if(c==='"')inQuotes=true;
      else if(c===','){row.push(value);value='';}
      else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value); if(row.some(x=>x.trim()))rows.push(row);row=[];value='';}
      else value+=c;
    }
    if(inQuotes)throw new Error('CSV file contains an unclosed quoted field.');
    row.push(value);if(row.some(x=>x.trim()))rows.push(row);
    if(!rows.length)throw new Error('The CSV file is empty.');
    const headers=rows.shift().map(s=>ALIASES[s.replace(/^\uFEFF/,'').toLowerCase().replace(/[^a-z0-9]/g,'')]||null);
    if(!headers.includes('sku')||!headers.includes('name'))throw new Error('CSV must contain Tool ID / SKU and Tool Name / Name columns.');
    return rows.map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]??'']).filter(([key])=>key)));
  }
  function csvCell(input) {
    let value=String(input??'');
    // Prevent CSV formula execution when a cell is opened in a spreadsheet.
    if (/^[\s]*[=+\-@\t\r]/.test(value)) value="'"+value;
    return `"${value.replace(/"/g,'""')}"`;
  }
  function download(filename,content,type) {
    const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportData(kind) {
    const filename = `hanger-tools-${new Date().toISOString().slice(0,10)}`;
    if (kind === 'csv') {
      const active = activeRecords();
      const lines = [FIELDS.map(csvCell).join(','),...active.map(r=>FIELDS.map(f=>csvCell(r[f])).join(','))];
      download(`${filename}.csv`,'\uFEFF'+lines.join('\r\n'),'text/csv;charset=utf-8');
      toast(`${compactNumber(active.length)} tool records exported as CSV.`);
    } else {
      const backup={application:'Hanger Tools',schemaVersion:1,exportedAt:new Date().toISOString(),tools:records};
      download(`${filename}-backup.json`,JSON.stringify(backup,null,2),'application/json;charset=utf-8');
      toast(`${compactNumber(records.length)} records included in backup.`);
    }
    close('exportDialog');
  }
  async function importData() {
    const file=$('importFile').files[0]; $('importError').hidden=true;
    if(!file)return;
    $('runImport').disabled=true;$('runImport').textContent='Importing...';
    try {
      if(file.size>15*1024*1024)throw new Error('File is too large. Please use a file smaller than 15 MB.');
      const content=await file.text();const isJSON=file.name.toLowerCase().endsWith('.json');
      const parsed=isJSON ? JSON.parse(content.replace(/^\uFEFF/,'')) : parseCSV(content);
      const list=isJSON ? (Array.isArray(parsed)?parsed:(parsed.tools||parsed.records)) : parsed;
      if(!Array.isArray(list))throw new Error('JSON must contain an array of tools, or a “tools” array in the backup.');
      if(list.length>100000)throw new Error('Import is too large. Split the file into smaller batches.');
      const existingBySku=new Map(records.map(r=>[r.sku.toLowerCase(),r]));
      const pending=new Map();let added=0,updated=0,skipped=0;const problems=[];
      for(let i=0;i<list.length;i++) {
        try {
          if(!list[i]||typeof list[i]!=='object'||Array.isArray(list[i]))throw new Error('Not a tool record.');
          const input = Object.fromEntries(Object.entries(list[i]).map(([key,val])=>[ALIASES[key.toLowerCase().replace(/[^a-z0-9]/g,'')]||key,val]));
          const sku=strip(input.sku,70).toLowerCase();const existing=existingBySku.get(sku)||null;
          if (!sku) throw new Error('Missing Tool ID / SKU.');
          const item=normalise(input,existing,isJSON);
          if(existing)updated++;else added++;
          pending.set(item.id,item);existingBySku.set(sku,item);
        } catch (error) { skipped++;if(problems.length<3)problems.push(`Row ${i+2}: ${error.message}`); }
      }
      if(!pending.size)throw new Error(`No valid records to import. ${problems.join(' ')}`);
      await bulkWrite([...pending.values()]);
      close('importDialog');resetImport();page=1;await refresh();
      toast(`Import complete: ${added} added, ${updated} updated, ${skipped} skipped.${skipped ? ' Review file formatting.' : ''}`);
      if(skipped) setTimeout(()=>toast(problems.join(' | '),true),250);
    } catch (error) {$('importError').textContent=error.message;$('importError').hidden=false;}
    finally {$('runImport').disabled=!$('importFile').files.length;$('runImport').textContent='Import tools';}
  }
  function resetImport() { $('importFile').value='';$('selectedFilename').textContent='or click to browse your files';$('runImport').disabled=true;$('importError').hidden=true; }
  function addDemo() {
    const names=[['Cordless drill','Power Tools','Makita',7,'Rack A1'],['Digital vernier caliper','Measuring','Mitutoyo',4,'Cabinet 2'],['Combination spanner set','Hand Tools','Stanley',12,'Rack B3'],['Safety harness','Safety Equipment','3M',3,'PPE Locker'],['Angle grinder','Power Tools','Bosch',5,'Rack A2'],['Torque wrench','Hand Tools','Norbar',2,'Cabinet 3'],['Multimeter','Electrical','Fluke',6,'Electrical Bay'],['Air compressor','Pneumatic','Atlas Copco',1,'Workshop Floor'],['Soldering iron','Electrical','Weller',4,'Electrical Bay'],['Socket wrench set','Hand Tools','Bahco',8,'Rack B2'],['Laser distance meter','Measuring','Bosch',2,'Cabinet 2'],['Bench vise','Workshop','Irwin',0,'Workbench 4']];
    const now=new Date().toISOString();
    const demo=names.filter((_,i)=>!records.some(r=>r.sku===`DEMO-${String(i+1).padStart(3,'0')}`)).map(([name,category,brand,quantity,location],i)=>({id:newId(),sku:`DEMO-${String(names.findIndex(x=>x[0]===name)+1).padStart(3,'0')}`,name,category,brand,model:'',serial:'',quantity,minStock:quantity<3?2:1,status:quantity===0?'Maintenance':name==='Torque wrench'?'In use':'Available',location,assignedTo:'',purchaseDate:'',unitCost:'',notes:'Demo record — replace or delete when ready.',createdAt:now,updatedAt:now,deletedAt:null}));
    return demo;
  }
  function connectEvents() {
    $('menuToggle').addEventListener('click',()=>$('sidebar').classList.contains('open')?closeMenu():openMenu());
    $('mobileScrim').addEventListener('click',closeMenu);
    document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
    [$('topAdd'),$('addButton'),$('emptyAdd')].forEach(btn=>btn.addEventListener('click',()=>showToolDialog()));
    [$('importButton'),$('importNav')].forEach(btn=>btn.addEventListener('click',()=>{closeMenu();resetImport();show('importDialog');}));
    [$('exportButton'),$('exportNav')].forEach(btn=>btn.addEventListener('click',()=>{closeMenu();show('exportDialog');}));
    $('closeDialog').addEventListener('click',()=>close('toolDialog'));
    $('cancelDialog').addEventListener('click',()=>close('toolDialog'));
    document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>close(btn.dataset.close)));
    $('toolForm').addEventListener('submit',saveTool);
    $('toolRows').addEventListener('click',event=>{
      const btn=event.target.closest('button[data-action]');if(btn)performAction(btn.dataset.action,btn.dataset.id);
    });
    $('searchInput').addEventListener('input',event=>{state.query=event.target.value;page=1;render();});
    $('categoryFilter').addEventListener('change',event=>{state.category=event.target.value;page=1;render();});
    $('statusFilter').addEventListener('change',event=>{state.status=event.target.value;page=1;render();});
    $('sortSelect').addEventListener('change',event=>{state.sort=event.target.value;page=1;render();});
    $('pageSize').addEventListener('change',event=>{state.pageSize=Number(event.target.value);page=1;render();});
    $('prevPage').addEventListener('click',()=>{page=Math.max(1,page-1);render();});
    $('nextPage').addEventListener('click',()=>{page++;render();});
    $('importFile').addEventListener('change',()=>{
      const file=$('importFile').files[0];$('selectedFilename').textContent=file?file.name:'or click to browse your files';$('runImport').disabled=!file;$('importError').hidden=true;
    });
    $('runImport').addEventListener('click',importData);
    $('exportCSV').addEventListener('click',()=>exportData('csv'));
    $('exportJSON').addEventListener('click',()=>exportData('json'));
    $('confirmCancel').addEventListener('click',()=>{confirmCallback=null;close('confirmDialog');});
    $('confirmAccept').addEventListener('click',async()=>{const callback=confirmCallback;confirmCallback=null;close('confirmDialog');if(callback)try{await callback();}catch(error){handleError(error);}});
    $('confirmDialog').addEventListener('close',()=>{confirmCallback=null;});
    $('emptyDemo').addEventListener('click',async()=>{
      try{const demos=addDemo();await bulkWrite(demos);await refresh();toast(`${demos.length} sample tools loaded. They are marked DEMO and can be edited or deleted.`);}catch(error){handleError(error);}
    });
    document.addEventListener('keydown',event=>{
      const element=document.activeElement;
      if(event.key==='/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT','TEXTAREA','SELECT'].includes(element?.tagName) && !document.querySelector('dialog[open]')){event.preventDefault();$('searchInput').focus();}
    });
  }
  async function init() {
    connectEvents();
    try { db=await openDatabase();await refresh(); }
    catch (error) {
      handleError(error);
      $('emptyTitle').textContent='Browser storage is unavailable';
      $('emptyText').textContent='Enable browser storage and reload the page to add tools. If you are in private browsing mode, try a regular browser window.';
      $('emptyState').hidden=false;$('emptyActions').hidden=true;
      document.querySelectorAll('button').forEach(b=>{if(b.id!=='menuToggle')b.disabled=true;});
    }
  }
  init();
})();
