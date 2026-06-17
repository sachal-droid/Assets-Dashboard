const express = require('express');
const multer  = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs   = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const META_FILE   = path.join(DATA_DIR, 'meta.json');

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json());

// --- Meta helpers ---
function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch { return {}; }
}
function writeMeta(m) {
  fs.writeFileSync(META_FILE, JSON.stringify(m, null, 2));
}

// --- Image finder ---
function findImages(dir) {
  const exts = ['.jpg','.jpeg','.png','.gif','.webp','.svg'];
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(findImages(full));
    } else if (exts.includes(path.extname(entry).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

// --- Upload (multer -> disk -> unzip) ---
const upload = multer({ dest: path.join(DATA_DIR, 'tmp') });

app.post('/upload', upload.single('zip'), async (req, res) => {
  const runId = req.body.run_id || ('run-' + Date.now());
  const runDir = path.join(UPLOADS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  try {
    await fs.createReadStream(req.file.path)
      .pipe(unzipper.Extract({ path: runDir }))
      .promise();
    fs.unlinkSync(req.file.path);

    // Remove __MACOSX and .DS_Store
    const cleanup = (d) => {
      for (const e of fs.readdirSync(d)) {
        const f = path.join(d, e);
        if (e === '__MACOSX' || e === '.DS_Store') { fs.rmSync(f, { recursive: true, force: true }); continue; }
        if (fs.statSync(f).isDirectory()) cleanup(f);
      }
    };
    cleanup(runDir);

    const images = findImages(runDir);
    res.json({ ok: true, run_id: runId, count: images.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- API: list uploads ---
app.get('/api/uploads', (req, res) => {
  const meta = readMeta();
  if (!fs.existsSync(UPLOADS_DIR)) return res.json({ runs: [], items: [] });

  const runs = fs.readdirSync(UPLOADS_DIR).filter(r => {
    const p = path.join(UPLOADS_DIR, r);
    return fs.statSync(p).isDirectory();
  });

  const items = [];
  for (const run of runs) {
    const imgs = findImages(path.join(UPLOADS_DIR, run));
    for (const img of imgs) {
      const rel = path.relative(UPLOADS_DIR, img);
      const key = rel.replace(/\\/g, '/');
      const m = meta[key] || {};
      items.push({
        key,
        run,
        file: path.basename(img),
        url: '/uploads/' + key,
        name: m.name || '',
        status: m.status || 'draft',
        notes: m.notes || ''
      });
    }
  }
  res.json({ runs, items });
});

// --- API: save single meta ---
app.post('/api/meta', (req, res) => {
  const { key, name, status, notes } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: 'key required' });
  const meta = readMeta();
  meta[key] = { ...(meta[key] || {}), name, status, notes };
  writeMeta(meta);
  res.json({ ok: true });
});

// --- API: bulk meta ---
app.post('/api/meta/bulk', (req, res) => {
  const { updates } = req.body; // [{key, name, status, notes}]
  if (!Array.isArray(updates)) return res.status(400).json({ ok: false, error: 'updates must be array' });
  const meta = readMeta();
  for (const u of updates) {
    if (!u.key) continue;
    meta[u.key] = { ...(meta[u.key] || {}), ...u };
  }
  writeMeta(meta);
  res.json({ ok: true, count: updates.length });
});

// --- API: delete run ---
app.delete('/api/run/:runId', (req, res) => {
  const runDir = path.join(UPLOADS_DIR, req.params.runId);
  if (!fs.existsSync(runDir)) return res.status(404).json({ ok: false, error: 'run not found' });
  fs.rmSync(runDir, { recursive: true, force: true });
  res.json({ ok: true });
});

// Serve uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// --- Dashboard HTML ---
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Assets Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f13;color:#e0e0e0;min-height:100vh}
  header{background:#1a1a24;border-bottom:1px solid #2a2a3a;padding:16px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  header h1{font-size:1.4rem;font-weight:700;color:#fff;flex:1}
  header input{background:#0f0f18;border:1px solid #333;color:#e0e0e0;padding:8px 12px;border-radius:8px;font-size:.9rem;width:220px}
  header input:focus{outline:none;border-color:#6c63ff}
  .filters{display:flex;gap:8px;flex-wrap:wrap}
  .filter-btn{background:#1e1e2e;border:1px solid #333;color:#aaa;padding:6px 14px;border-radius:20px;cursor:pointer;font-size:.82rem;transition:all .2s}
  .filter-btn.active,.filter-btn:hover{background:#6c63ff;border-color:#6c63ff;color:#fff}
  .upload-btn{background:#6c63ff;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600;text-decoration:none;white-space:nowrap}
  .upload-btn:hover{background:#5a52e0}
  main{padding:24px}
  .stats{margin-bottom:16px;color:#888;font-size:.85rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
  .card{background:#1a1a24;border:1px solid #2a2a3a;border-radius:12px;overflow:hidden;transition:transform .2s,box-shadow .2s}
  .card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.4)}
  .card img{width:100%;height:180px;object-fit:cover;display:block;background:#111}
  .card-body{padding:12px}
  .card-name{font-size:.88rem;font-weight:600;color:#fff;outline:none;border:1px solid transparent;border-radius:4px;padding:2px 4px;width:100%;background:transparent;cursor:text;word-break:break-word;min-height:20px}
  .card-name:hover{border-color:#444}
  .card-name:focus{border-color:#6c63ff;background:#0f0f18}
  .card-meta{display:flex;align-items:center;gap:8px;margin-top:8px}
  .status-badge{font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:12px;cursor:pointer;text-transform:uppercase;letter-spacing:.5px;border:none;transition:all .2s}
  .status-draft{background:#2a2a3a;color:#888}
  .status-approved{background:#1a3a2a;color:#4ade80}
  .status-winner{background:#3a2a00;color:#fbbf24}
  .status-rejected{background:#3a1a1a;color:#f87171}
  .card-notes{width:100%;background:#0f0f18;border:1px solid #2a2a3a;color:#aaa;border-radius:6px;padding:6px 8px;font-size:.78rem;margin-top:8px;resize:none;height:50px}
  .card-notes:focus{outline:none;border-color:#6c63ff}
  .card-run{font-size:.7rem;color:#555;margin-top:6px}
  .delete-btn{background:none;border:none;color:#555;cursor:pointer;font-size:.75rem;margin-left:auto;padding:2px 6px;border-radius:4px}
  .delete-btn:hover{color:#f87171;background:#2a1a1a}
  .empty{text-align:center;padding:80px 20px;color:#555}
  .empty h2{font-size:1.2rem;margin-bottom:8px}
  .toast{position:fixed;bottom:24px;right:24px;background:#6c63ff;color:#fff;padding:10px 20px;border-radius:8px;font-size:.88rem;opacity:0;transition:opacity .3s;pointer-events:none;z-index:999}
  .toast.show{opacity:1}
  .upload-page{max-width:500px;margin:60px auto;background:#1a1a24;border:1px solid #2a2a3a;border-radius:16px;padding:32px}
  .upload-page h2{margin-bottom:24px;font-size:1.3rem}
  .upload-page input,.upload-page input[type=text]{width:100%;padding:10px 14px;background:#0f0f18;border:1px solid #333;border-radius:8px;color:#e0e0e0;font-size:.9rem;margin-bottom:16px}
  .upload-page button{background:#6c63ff;color:#fff;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600;width:100%}
  .upload-page button:hover{background:#5a52e0}
  .upload-page .msg{margin-top:16px;padding:12px;border-radius:8px;font-size:.88rem}
  .upload-page .msg.ok{background:#1a3a2a;color:#4ade80}
  .upload-page .msg.err{background:#3a1a1a;color:#f87171}
</style>
</head>
<body>
<div id="app"></div>
<div class="toast" id="toast"></div>
<script>
const PAGE = location.pathname;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

async function saveMeta(key, name, status, notes) {
  await fetch('/api/meta', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({key, name, status, notes})
  });
  showToast('Saved');
}

const STATUS_CYCLE = ['draft','approved','winner','rejected'];
const STATUS_LABELS = {draft:'Draft',approved:'Approved',winner:'Winner',rejected:'Rejected'};

function nextStatus(s) {
  const i = STATUS_CYCLE.indexOf(s);
  return STATUS_CYCLE[(i+1) % STATUS_CYCLE.length];
}

async function renderDashboard() {
  const app = document.getElementById('app');
  const res = await fetch('/api/uploads');
  const data = await res.json();
  const items = data.items || [];

  let filter = 'all', search = '';

  function render() {
    const filtered = items.filter(item => {
      const matchFilter = filter === 'all' || item.status === filter;
      const q = search.toLowerCase();
      const matchSearch = !q || item.name.toLowerCase().includes(q) || item.file.toLowerCase().includes(q) || item.run.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });

    app.innerHTML = \`
    <header>
      <h1>Assets Dashboard</h1>
      <input type="search" id="searchBox" placeholder="Search..." value="\${search}">
      <div class="filters">
        <button class="filter-btn \${filter==='all'?'active':''}" data-f="all">All (\${items.length})</button>
        <button class="filter-btn \${filter==='draft'?'active':''}" data-f="draft">Draft</button>
        <button class="filter-btn \${filter==='approved'?'active':''}" data-f="approved">Approved</button>
        <button class="filter-btn \${filter==='winner'?'active':''}" data-f="winner">Winner</button>
        <button class="filter-btn \${filter==='rejected'?'active':''}" data-f="rejected">Rejected</button>
      </div>
      <a class="upload-btn" href="/upload">+ Upload</a>
    </header>
    <main>
      <div class="stats">\${filtered.length} of \${items.length} creatives | \${data.runs?.length||0} runs</div>
      \${filtered.length === 0 ? '<div class="empty"><h2>No creatives yet</h2><p>Upload a zip to get started</p></div>' : ''}
      <div class="grid">
        \${filtered.map(item => \`
        <div class="card" data-key="\${item.key}">
          <img src="\${item.url}" loading="lazy" alt="\${item.file}">
          <div class="card-body">
            <div class="card-name" contenteditable="true" data-key="\${item.key}" title="Click to rename">\${item.name || item.file}</div>
            <div class="card-meta">
              <button class="status-badge status-\${item.status}" data-key="\${item.key}" data-status="\${item.status}">\${STATUS_LABELS[item.status]||item.status}</button>
              <button class="delete-btn" data-run="\${item.run}" title="Delete run">x</button>
            </div>
            <textarea class="card-notes" data-key="\${item.key}" placeholder="Notes...">\${item.notes||''}</textarea>
            <div class="card-run">\${item.run}</div>
          </div>
        </div>\`).join('')}
      </div>
    </main>\`;

    document.getElementById('searchBox').addEventListener('input', e => { search = e.target.value; render(); });
    document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => { filter = btn.dataset.f; render(); }));

    document.querySelectorAll('.card-name').forEach(el => {
      el.addEventListener('blur', () => {
        const key = el.dataset.key;
        const item = items.find(i => i.key === key);
        if (!item) return;
        item.name = el.textContent.trim();
        saveMeta(key, item.name, item.status, item.notes);
      });
    });

    document.querySelectorAll('.status-badge').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const item = items.find(i => i.key === key);
        if (!item) return;
        item.status = nextStatus(item.status);
        saveMeta(key, item.name, item.status, item.notes);
        render();
      });
    });

    document.querySelectorAll('.card-notes').forEach(ta => {
      ta.addEventListener('change', () => {
        const key = ta.dataset.key;
        const item = items.find(i => i.key === key);
        if (!item) return;
        item.notes = ta.value;
        saveMeta(key, item.name, item.status, item.notes);
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete run "' + btn.dataset.run + '" and all its images?')) return;
        await fetch('/api/run/' + btn.dataset.run, { method: 'DELETE' });
        items.splice(0);
        const r2 = await fetch('/api/uploads');
        const d2 = await r2.json();
        items.push(...(d2.items||[]));
        showToast('Run deleted');
        render();
      });
    });
  }

  render();
}

async function renderUpload() {
  document.getElementById('app').innerHTML = \`
    <header><h1>Assets Dashboard</h1><a class="upload-btn" href="/">Back</a></header>
    <div class="upload-page">
      <h2>Upload Images</h2>
      <input type="text" id="runId" placeholder="Run ID (e.g. 2026-06-18-001-batch)" />
      <input type="file" id="zipFile" accept=".zip" />
      <button id="uploadBtn">Upload ZIP</button>
      <div id="uploadMsg"></div>
    </div>\`;

  document.getElementById('uploadBtn').addEventListener('click', async () => {
    const runId = document.getElementById('runId').value.trim();
    const file = document.getElementById('zipFile').files[0];
    const msg = document.getElementById('uploadMsg');
    if (!file) { msg.className='msg err'; msg.textContent='Select a zip file'; return; }
    msg.className=''; msg.textContent='Uploading...';
    const fd = new FormData();
    if (runId) fd.append('run_id', runId);
    fd.append('zip', file);
    try {
      const r = await fetch('/upload', { method:'POST', body: fd });
      const d = await r.json();
      if (d.ok) { msg.className='msg ok'; msg.textContent = d.count + ' images uploaded to run: ' + d.run_id; }
      else { msg.className='msg err'; msg.textContent = d.error; }
    } catch(e) { msg.className='msg err'; msg.textContent = e.message; }
  });
}

if (PAGE === '/upload') renderUpload();
else renderDashboard();
</script>
</body>
</html>`);
});

app.get('/upload', (req, res) => res.redirect('/'));

app.listen(PORT, () => console.log('Assets Dashboard on port', PORT));
