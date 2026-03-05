const fs = require("fs");
const file = process.env.HOME + "/musicdown/public/index.html";
let code = fs.readFileSync(file, "utf8");

const oldFn = `// ══ DOWNLOAD ══
async function startDownload() {
  if (!currentUrl) return;
  document.getElementById('downloadBtn').disabled = true;
  document.getElementById('downloadBtn').innerHTML = '<span class="spinner"></span>A preparar...';
  document.getElementById('progressCard').classList.add('show');
  document.getElementById('resultCard').classList.remove('show');
  updateProg(0, 'A iniciar...');

  try {
    const res = await fetch(API + '/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentUrl, format: selectedFormat, quality: selectedQuality })
    });
    if (!res.ok) throw new Error('Erro no servidor');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.progress !== undefined) updateProg(d.progress, 'A baixar... ' + d.progress.toFixed(1) + '%');
          if (d.done) { updateProg(100, '✅ Concluído!'); showResult(d.url, d.filename); }
          if (d.error) showError(d.error);
        } catch(e) {}
      }
    }
  } catch(e) { showError('Erro no download: ' + e.message); }
  finally {
    document.getElementById('downloadBtn').disabled = false;
    document.getElementById('downloadBtn').innerHTML = '⬇️ BAIXAR NOVAMENTE';
  }
}`;

const newFn = `// ══ DOWNLOAD ══
async function startDownload() {
  if (!currentUrl) { showError('Seleccione uma música primeiro!'); return; }
  const btn = document.getElementById('downloadBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>A preparar...';
  document.getElementById('progressCard').classList.add('show');
  document.getElementById('resultCard').classList.remove('show');

  // Simular progresso enquanto aguarda
  let fakeProgress = 0;
  const fakeTimer = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 8, 90);
    updateProg(fakeProgress, 'A baixar...');
  }, 800);

  try {
    updateProg(5, 'A iniciar download...');
    const res = await fetch(API + '/download-simple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentUrl, format: selectedFormat, quality: selectedQuality })
    });
    const data = await res.json();
    clearInterval(fakeTimer);
    if (data.error) { showError(data.error); return; }
    updateProg(100, '✅ Concluído!');
    showResult(data.url, data.filename);
  } catch(e) {
    clearInterval(fakeTimer);
    showError('Erro no download: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⬇️ BAIXAR NOVAMENTE';
  }
}`;

code = code.replace(oldFn, newFn);
fs.writeFileSync(file, code);
console.log("✅ Download corrigido!");
