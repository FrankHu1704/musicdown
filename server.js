const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3001;
const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/downloads", express.static(DOWNLOAD_DIR));

// Limpar ficheiros antigos (>1 hora)
setInterval(() => {
  fs.readdirSync(DOWNLOAD_DIR).forEach(f => {
    const fp = path.join(DOWNLOAD_DIR, f);
    try { if (Date.now() - fs.statSync(fp).mtimeMs > 3600000) fs.unlinkSync(fp); } catch(e) {}
  });
}, 600000);

// ── PESQUISA ──
app.post("/api/search", (req, res) => {
  const { q } = req.body;
  if (!q) return res.status(400).json({ error: "Pesquisa vazia" });
  exec(`yt-dlp "ytsearch8:${q}" --dump-json --no-playlist --flat-playlist 2>/dev/null`, { timeout: 30000 }, (err, stdout) => {
    try {
      const results = stdout.trim().split("\n").filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch(e) { return null; }
      }).filter(Boolean).map(v => ({
        id: v.id, title: v.title, url: v.url || "https://www.youtube.com/watch?v=" + v.id,
        duration: v.duration, thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        uploader: v.uploader || v.channel || "", viewCount: v.view_count
      }));
      res.json(results);
    } catch(e) { res.status(500).json({ error: "Erro na pesquisa" }); }
  });
});

// ── INFO ──
app.post("/api/info", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL obrigatória" });
  exec(`yt-dlp --dump-json --no-playlist "${url}" 2>&1`, { timeout: 30000 }, (err, stdout) => {
    try {
      const lines = stdout.trim().split("\n");
      const json = JSON.parse(lines[lines.length - 1]);
      res.json({
        title: json.title, duration: json.duration,
        thumbnail: json.thumbnail, uploader: json.uploader || json.channel,
        platform: json.extractor_key, url: json.webpage_url,
        audioUrl: null
      });
    } catch(e) { res.status(400).json({ error: "URL inválida ou não suportada." }); }
  });
});

// ── DOWNLOAD COM PROGRESSO (SSE) ──
app.post("/api/download", (req, res) => {
  const { url, format, quality } = req.body;
  if (!url) return res.status(400).json({ error: "URL obrigatória" });
  const id = uuidv4();
  const isAudio = format === "mp3";
  let cmd;
  if (isAudio) {
    cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 --no-playlist --newline -o "${path.join(DOWNLOAD_DIR, id + ".%(ext)s")}" "${url}"`;
  } else {
    const q = quality === "1080" ? "bestvideo[height<=1080]+bestaudio/best[height<=1080]" : quality === "720" ? "bestvideo[height<=720]+bestaudio/best[height<=720]" : quality === "480" ? "bestvideo[height<=480]+bestaudio/best[height<=480]" : quality === "360" ? "bestvideo[height<=360]+bestaudio/best[height<=360]" : "bestvideo+bestaudio/best";
    cmd = `yt-dlp -f "${q}" --merge-output-format mp4 --no-playlist --newline -o "${path.join(DOWNLOAD_DIR, id + ".%(ext)s")}" "${url}"`;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const proc = exec(cmd, { timeout: 300000 });
  proc.stdout.on("data", (data) => {
    const match = data.match(/(\d+\.?\d*)%/);
    if (match) res.write(`data: ${JSON.stringify({ progress: parseFloat(match[1]) })}\n\n`);
  });
  proc.stderr.on("data", (data) => {
    const match = data.match(/(\d+\.?\d*)%/);
    if (match) res.write(`data: ${JSON.stringify({ progress: parseFloat(match[1]) })}\n\n`);
  });
  proc.on("close", () => {
    const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(id));
    if (files.length) {
      res.write(`data: ${JSON.stringify({ done: true, url: "/downloads/" + files[0], filename: files[0] })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: "Falha no download. Tente novamente." })}\n\n`);
    }
    res.end();
  });
  req.on("close", () => { try { proc.kill(); } catch(e) {} });
});

app.listen(PORT, () => {
  console.log("\n🎵 MusicDown");
  console.log("📡 Porta: " + PORT);
  console.log("🌐 http://localhost:" + PORT + "\n");
});

// ── DOWNLOAD SIMPLES ──
app.post("/api/download-simple", (req, res) => {
  const { url, format, quality } = req.body;
  if (!url) return res.status(400).json({ error: "URL obrigatória" });
  const id = uuidv4();
  const isAudio = format === "mp3";
  let cmd;
  if (isAudio) {
    cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 --no-playlist -o "${path.join(DOWNLOAD_DIR, id + ".%(ext)s")}" "${url}"`;
  } else {
    const q = quality === "1080" ? "bestvideo[height<=1080]+bestaudio/best" : quality === "720" ? "bestvideo[height<=720]+bestaudio/best" : quality === "480" ? "bestvideo[height<=480]+bestaudio/best" : quality === "360" ? "bestvideo[height<=360]+bestaudio/best" : "bestvideo+bestaudio/best";
    cmd = `yt-dlp -f "${q}" --merge-output-format mp4 --no-playlist -o "${path.join(DOWNLOAD_DIR, id + ".%(ext)s")}" "${url}"`;
  }
  exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
    const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(id));
    if (!files.length) return res.status(500).json({ error: "Falha no download. Tente novamente." });
    res.json({ url: "/downloads/" + files[0], filename: files[0] });
  });
});
