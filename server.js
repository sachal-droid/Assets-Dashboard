const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 250 * 1024 * 1024, files: 1 },
});

app.use('/uploads', express.static(UPLOADS_DIR));

// Helper: recursively find all image files under a directory
function findImages(dir, base) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = path.join(base, entry.name);
          if (entry.isDirectory()) {
                  results.push(...findImages(full, rel));
          } else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(entry.name)) {
                  results.push({ file: entry.name, relPath: rel, absPath: full });
          }
    }
    return results;
}

// GET / — dashboard
app.get('/', (req, res) => {
    const runs = fs.existsSync(UPLOADS_DIR)
      ? fs.readdirSync(UPLOADS_DIR).filter(f => fs.statSync(path.join(UPLOADS_DIR, f)).isDirectory())
          : [];

          let cards = '';
    let total = 0;

          runs.forEach(run => {
                const runDir = path.join(UPLOADS_DIR, run);
                const images = findImages(runDir, '');
                images.forEach(({ file, relPath }) => {
                        total++;
                        const label = relPath.replace(/\//g, ' › ').replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
                        cards += `<div class="card">
                                <img src="/uploads/${run}/${relPath.replace(/\\/g, '/')}" alt="${label}" loading="lazy"/>
                                        <div class="label"><strong>${label}</strong><br/><small>${run}</small></div>
                                              </div>`;
                });
          });

          res.send(`<!DOCTYPE html>
          <html lang="en">
          <head>
          <meta charset="UTF-8"/>
          <meta name="viewport" content="width=device-width,initial-scale=1"/>
          <title>Assets Dashboard</title>
          <style>
            *{box-sizing:border-box;margin:0;padding:0}
              body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:24px}
                h1{font-size:1.8rem;margin-bottom:4px}
                  .meta{color:#666;margin-bottom:20px;font-size:.9rem}
                    .toolbar{margin-bottom:24px}
                      .toolbar a{background:#1a1a6c;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:.9rem}
                        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
                          .card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)}
                            .card img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:#eee}
                              .label{padding:10px 12px;font-size:.8rem;color:#333;border-top:1px solid #f0f0f0}
                                .empty{text-align:center;color:#999;padding:80px 20px;font-size:1rem}
                                </style>
                                </head>
                                <body>
                                <h1>Assets Dashboard</h1>
                                <p class="meta">${runs.length} run${runs.length!==1?'s':''} · ${total} creative${total!==1?'s':''}</p>
                                <div class="toolbar"><a href="/upload">+ Upload Batch</a></div>
                                <div class="grid">
                                ${cards || '<div class="empty">No creatives yet. <a href="/upload">Upload your first batch →</a></div>'}
                                </div>
                                </body>
                                </html>`);
});

// GET /upload — form
app.get('/upload', (req, res) => {
    res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8"/>
    <title>Upload — Assets Dashboard</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:40px 24px}
          h1{font-size:1.5rem;margin-bottom:8px}
            a{color:#1a1a6c}
              .back{display:inline-block;margin-bottom:24px;font-size:.9rem}
                form{background:#fff;padding:28px;border-radius:10px;max-width:580px;box-shadow:0 1px 4px rgba(0,0,0,.1)}
                  label{display:block;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#555;margin-top:20px;margin-bottom:6px}
                    label:first-child{margin-top:0}
                      input[type=text],input[type=file]{width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:6px;font-size:.95rem}
                        .hint{font-size:.8rem;color:#888;margin-top:6px}
                          button{margin-top:24px;background:#1a1a6c;color:#fff;border:none;padding:11px 28px;border-radius:6px;font-size:1rem;cursor:pointer;width:100%}
                            button:hover{background:#2a2a8c}
                            </style>
                            </head>
                            <body>
                            <a class="back" href="/">← back to dashboard</a>
                            <h1>Upload to Assets Dashboard</h1>
                            <form method="POST" enctype="multipart/form-data">
                              <label>Run ID</label>
                                <input type="text" name="run_id" value="${new Date().toISOString().slice(0,10)}-001-batch" required/>
                                  <p class="hint">Groups this upload together on the dashboard</p>
                                    <label>Zip File</label>
                                      <input type="file" name="zip" accept=".zip" required/>
                                        <p class="hint">Works with any zip — flat images, subfolders, or nested folders all supported</p>
                                          <button type="submit">Upload zip</button>
                                          </form>
                                          </body>
                                          </html>`);
});

// POST /upload
app.post('/upload', upload.single('zip'), async (req, res) => {
    const runId = (req.body.run_id || 'unnamed-run').replace(/[^a-zA-Z0-9_\-]/g, '-');
    const runDir = path.join(UPLOADS_DIR, runId);
    fs.mkdirSync(runDir, { recursive: true });

           try {
                 const { Readable } = require('stream');
                 const stream = Readable.from(req.file.buffer);

      await new Promise((resolve, reject) => {
              stream.pipe(unzipper.Parse())
                .on('entry', entry => {
                            // Skip macOS junk
                              if (entry.path.includes('__MACOSX') || entry.path.includes('.DS_Store')) {
                                            entry.autodrain(); return;
                              }
                            const fullPath = path.join(runDir, entry.path);
                            const dir = path.dirname(fullPath);
                            fs.mkdirSync(dir, { recursive: true });
                            if (entry.type === 'File') {
                                          entry.pipe(fs.createWriteStream(fullPath));
                            } else {
                                          entry.autodrain();
                            }
                })
                .on('finish', resolve)
                .on('error', reject);
      });

      res.redirect('/');
           } catch (err) {
                 res.status(500).send('Upload failed: ' + err.message);
           }
});

// GET /api/uploads
app.get('/api/uploads', (req, res) => {
    const runs = fs.existsSync(UPLOADS_DIR)
      ? fs.readdirSync(UPLOADS_DIR).filter(f => fs.statSync(path.join(UPLOADS_DIR, f)).isDirectory())
          : [];
    res.json({ runs });
});

// GET /healthz
app.get('/healthz', (req, res) => res.send('ok'));

app.listen(PORT, () => console.log(`Assets Dashboard on port ${PORT}`));
