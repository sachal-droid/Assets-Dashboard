const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
    limits: { fileSize: 250 * 1024 * 1024, files: 1 },
    });

    // Serve uploaded files statically
    app.use('/uploads', express.static(UPLOADS_DIR));

    // GET / — dashboard homepage
    app.get('/', (req, res) => {
      const runs = fs.existsSync(UPLOADS_DIR)
          ? fs.readdirSync(UPLOADS_DIR).filter(f => fs.statSync(path.join(UPLOADS_DIR, f)).isDirectory())
              : [];

                let cards = '';
                  runs.forEach(run => {
                      const runDir = path.join(UPLOADS_DIR, run);
                          const concepts = fs.readdirSync(runDir).filter(f => fs.statSync(path.join(runDir, f)).isDirectory());
                              concepts.forEach(concept => {
                                    const conceptDir = path.join(runDir, concept);
                                          const files = fs.readdirSync(conceptDir);
                                                const img = files.find(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
                                                      if (img) {
                                                              cards += `<div class="card">
                                                                        <img src="/uploads/${run}/${concept}/${img}" alt="${concept}" loading="lazy"/>
                                                                                  <div class="label"><strong>${concept.replace(/-/g, ' ')}</strong><br/><small>${run}</small></div>
                                                                                          </div>`;
                                                                                                }
                                                                                                    });
                                                                                                      });
                                                                                                      
                                                                                                        res.send(`<!DOCTYPE html>
                                                                                                        <html lang="en">
                                                                                                        <head>
                                                                                                        <meta charset="UTF-8"/>
                                                                                                        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                                                                                                        <title>Assets Dashboard</title>
                                                                                                        <style>
                                                                                                          body { font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                                                                                                            h1 { font-size: 1.8rem; margin-bottom: 4px; }
                                                                                                              .meta { color: #666; margin-bottom: 20px; font-size: 0.9rem; }
                                                                                                                .toolbar { margin-bottom: 20px; }
                                                                                                                  .toolbar a { background: #1a1a6c; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; }
                                                                                                                    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
                                                                                                                      .card { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
                                                                                                                        .card img { width: 100%; aspect-ratio: 4/5; object-fit: cover; display: block; }
                                                                                                                          .label { padding: 10px 12px; font-size: 0.85rem; }
                                                                                                                            .empty { text-align: center; color: #999; padding: 60px; font-size: 1rem; }
                                                                                                                            </style>
                                                                                                                            </head>
                                                                                                                            <body>
                                                                                                                            <h1>Assets Dashboard</h1>
                                                                                                                            <p class="meta">${runs.length} runs uploaded</p>
                                                                                                                            <div class="toolbar"><a href="/upload">+ Upload Batch</a></div>
                                                                                                                            <div class="grid">
                                                                                                                            ${cards || '<div class="empty">No creatives yet. <a href="/upload">Upload your first batch</a>.</div>'}
                                                                                                                            </div>
                                                                                                                            </body>
                                                                                                                            </html>`);
                                                                                                                            });
                                                                                                                            
                                                                                                                            // GET /upload — upload form
                                                                                                                            app.get('/upload', (req, res) => {
                                                                                                                              res.send(`<!DOCTYPE html>
                                                                                                                              <html lang="en">
                                                                                                                              <head>
                                                                                                                              <meta charset="UTF-8"/>
                                                                                                                              <title>Upload — Assets Dashboard</title>
                                                                                                                              <style>
                                                                                                                                body { font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 40px; }
                                                                                                                                  h1 { font-size: 1.5rem; }
                                                                                                                                    a { color: #1a1a6c; }
                                                                                                                                      form { background: white; padding: 24px; border-radius: 10px; max-width: 600px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
                                                                                                                                        label { display: block; font-weight: 600; margin-bottom: 6px; margin-top: 16px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
                                                                                                                                          input[type=text], input[type=file] { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95rem; box-sizing: border-box; }
                                                                                                                                            button { margin-top: 20px; background: #1a1a6c; color: white; border: none; padding: 10px 24px; border-radius: 6px; font-size: 1rem; cursor: pointer; }
                                                                                                                                              pre { background: #f0f0f0; padding: 12px; border-radius: 6px; font-size: 0.8rem; margin-top: 20px; }
                                                                                                                                              </style>
                                                                                                                                              </head>
                                                                                                                                              <body>
                                                                                                                                              <h1>Upload to Assets Dashboard</h1>
                                                                                                                                              <p><a href="/">← back to dashboard</a></p>
                                                                                                                                              <form method="POST" enctype="multipart/form-data">
                                                                                                                                                <label>Run ID (groups uploads on the dashboard)</label>
                                                                                                                                                  <input type="text" name="run_id" value="2026-06-17-001-batch" required/>
                                                                                                                                                    <label>Zip File</label>
                                                                                                                                                      <input type="file" name="zip" accept=".zip" required/>
                                                                                                                                                        <pre>Expected zip layout:
                                                                                                                                                        my-batch.zip
                                                                                                                                                        ├── 0001-concept-name/
                                                                                                                                                        │   └── img.png   ← required
                                                                                                                                                        │   └── prompt.md ← optional
                                                                                                                                                        └── 0002-another/
                                                                                                                                                            └── img.jpg</pre>
                                                                                                                                                              <button type="submit">Upload zip</button>
                                                                                                                                                              </form>
                                                                                                                                                              </body>
                                                                                                                                                              </html>`);
                                                                                                                                                              });
                                                                                                                                                              
                                                                                                                                                              // POST /upload — receive and extract zip
                                                                                                                                                              app.post('/upload', upload.single('zip'), async (req, res) => {
                                                                                                                                                                const runId = (req.body.run_id || 'unnamed-run').replace(/[^a-zA-Z0-9_\-]/g, '-');
                                                                                                                                                                  const runDir = path.join(UPLOADS_DIR, runId);
                                                                                                                                                                    fs.mkdirSync(runDir, { recursive: true });
                                                                                                                                                                    
                                                                                                                                                                      try {
                                                                                                                                                                          const zip = unzipper.Parse();
                                                                                                                                                                              const buffer = req.file.buffer;
                                                                                                                                                                                  const { Readable } = require('stream');
                                                                                                                                                                                      const stream = Readable.from(buffer);
                                                                                                                                                                                      
                                                                                                                                                                                          await new Promise((resolve, reject) => {
                                                                                                                                                                                                stream.pipe(zip)
                                                                                                                                                                                                        .on('entry', entry => {
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
                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                                    // GET /api/uploads — JSON listing
                                                                                                                                                                                                                                                                                                                                    app.get('/api/uploads', (req, res) => {
                                                                                                                                                                                                                                                                                                                                      const runs = fs.existsSync(UPLOADS_DIR)
                                                                                                                                                                                                                                                                                                                                          ? fs.readdirSync(UPLOADS_DIR).filter(f => fs.statSync(path.join(UPLOADS_DIR, f)).isDirectory())
                                                                                                                                                                                                                                                                                                                                              : [];
                                                                                                                                                                                                                                                                                                                                                res.json({ runs });
                                                                                                                                                                                                                                                                                                                                                });
                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                // GET /healthz
                                                                                                                                                                                                                                                                                                                                                app.get('/healthz', (req, res) => res.send('ok'));
                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                app.listen(PORT, () => console.log(`Assets Dashboard running on port ${PORT}`));
