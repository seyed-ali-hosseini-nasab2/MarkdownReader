let currentTheme = 'dark';
let currentMarkdown = '';
let currentBaseDir = '';

function resolveImageUrl(src) {
  if (!src) return '';
  src = src.trim();

  // Strip angle brackets if present: <path with spaces>
  if (src.startsWith('<') && src.endsWith('>')) {
    src = src.slice(1, -1).trim();
  }

  // Absolute web URLs or data URIs or blob or qrc
  if (/^(https?:|data:|blob:|qrc:)/i.test(src)) {
    return src;
  }

  // Already an app-local URL
  if (/^app-local:/i.test(src)) {
    return src;
  }

  // Convert file:/// to app-local
  if (/^file:\/\/\//i.test(src)) {
    return 'app-local://local/' + src.slice(8);
  }

  // Windows absolute path with drive letter (e.g. C:\... or C:/...)
  if (/^[a-zA-Z]:[\\/]/.test(src)) {
    return 'app-local://local/' + src.replace(/\\/g, '/');
  }

  // Unix absolute path
  if (src.startsWith('/')) {
    return 'app-local://local' + src;
  }

  // If no base directory is known, return as-is
  if (!currentBaseDir) {
    return src;
  }

  try {
    const normalized = src.replace(/\\/g, '/');
    return new URL(normalized, currentBaseDir).href;
  } catch (err) {
    console.warn('Failed to resolve image URL:', src, err);
    return src;
  }
}

// Configure Mermaid settings based on theme
function configureMermaid(theme) {
  const isDark = theme !== 'light';
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'loose',
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
      curve: 'basis'
    },
    sequence: {
      useMaxWidth: false,
      showSequenceNumbers: true
    },
    themeVariables: isDark ? {
      fontSize: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      darkMode: true,
      background: '#0d1117',
      primaryColor: '#1f6feb',
      primaryTextColor: '#f0f6fc',
      primaryBorderColor: '#388bfd',
      lineColor: '#58a6ff',
      secondaryColor: '#238636',
      tertiaryColor: '#161b22'
    } : {
      fontSize: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      darkMode: false,
      background: '#ffffff',
      primaryColor: '#0969da',
      primaryTextColor: '#1f2328',
      primaryBorderColor: '#0969da',
      lineColor: '#0969da',
      secondaryColor: '#2da44e',
      tertiaryColor: '#f6f8fa'
    }
  });
}

// Initial Mermaid configuration
configureMermaid(currentTheme);

// Configure Marked to use Highlight.js and assign slug IDs to headings
marked.setOptions({
  gfm: true,
  breaks: true,
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch (err) {
        console.error('Highlight error:', err);
      }
    }
    try {
      return hljs.highlightAuto(code).value;
    } catch (err) {
      return code;
    }
  }
});

marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      const inlineContent = this.parser.parseInline(tokens);
      // Clean HTML tags and produce anchor slug
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      const slug = cleanText
        .toLowerCase()
        .replace(/[^\w\u0600-\u06FF\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      return `<h${depth} id="${slug}">${inlineContent}</h${depth}>\n`;
    },
    image({ href, title, text }) {
      const resolved = resolveImageUrl(href);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      const altAttr = text ? ` alt="${escapeHtml(text)}"` : '';
      return `<img src="${escapeHtml(resolved)}"${altAttr}${titleAttr} loading="lazy">`;
    }
  }
});

// Store diagrams data for re-rendering and modal
const diagramRegistry = new Map();
const diagramStates = new Map();

// Theme switching
function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') theme = 'dark';
  currentTheme = theme;

  document.body.className = `theme-${theme}`;
  const hlLink = document.getElementById('hljs-theme');
  if (hlLink) {
    hlLink.href = theme === 'light' ? 'github-light.min.css' : 'github-dark.min.css';
  }

  configureMermaid(theme);

  // If content is already rendered, re-render to update Mermaid diagram colors
  if (diagramRegistry.size > 0 && currentMarkdown) {
    renderMarkdown(currentMarkdown);
  }
}

// Safe KaTeX formula rendering
function renderFormula(formula, isBlock) {
  if (typeof katex === 'undefined') {
    return isBlock ? `<div class="katex-display">${formula}</div>` : `<span class="katex">${formula}</span>`;
  }
  try {
    return katex.renderToString(formula, {
      displayMode: isBlock,
      throwOnError: false,
      output: 'html'
    });
  } catch (err) {
    console.warn('KaTeX render error:', err);
    return isBlock ? `<pre class="katex-error">${formula}</pre>` : `<code class="katex-error">${formula}</code>`;
  }
}

// Main Markdown rendering pipeline
async function renderMarkdown(markdownText) {
  currentMarkdown = markdownText || '';
  const container = document.getElementById('content');
  if (!markdownText || !markdownText.trim()) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📄</div>
        <h2>No Markdown File Loaded</h2>
        <p>Drag and drop any <code>.md</code> file here, or use <b>File &gt; Open</b>.</p>
      </div>`;
    return;
  }

  diagramRegistry.clear();
  diagramStates.clear();

  // Extract LaTeX math before Markdown parsing to prevent _ * \ escaping conflicts
  const mathBlocks = [];
  const mathInlines = [];

  let processed = markdownText;

  // 1. Fenced math code blocks: ```math ... ```
  processed = processed.replace(/```math\r?\n([\s\S]*?)\r?\n```/g, (match, code) => {
    const idx = mathBlocks.length;
    mathBlocks.push(code.trim());
    return `\n\nKATEXBLOCK_${idx}_TOKEN\n\n`;
  });

  // 2. Display math: $$ ... $$
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, code) => {
    const idx = mathBlocks.length;
    mathBlocks.push(code.trim());
    return `\n\nKATEXBLOCK_${idx}_TOKEN\n\n`;
  });

  // 3. Inline math: $...$ (not preceded by backslash, not empty, no leading/trailing space)
  processed = processed.replace(/(?<!\\)\$([^\$\s](?:[^\$\r\n]*?[^\$\s])?)\$/g, (match, code) => {
    const idx = mathInlines.length;
    mathInlines.push(code.trim());
    return `KATEXINLINE_${idx}_TOKEN`;
  });

  // Unescape any escaped dollars: \$ -> $
  processed = processed.replace(/\\\$/g, '$');

  const tokens = marked.lexer(processed);
  let html = '';
  let mermaidCounter = 0;

  tokens.forEach((token) => {
    if (token.type === 'code' && token.lang && token.lang.trim().toLowerCase() === 'mermaid') {
      const diagramId = `mermaid-node-${mermaidCounter++}`;
      diagramRegistry.set(diagramId, token.text);

      html += `
        <div class="mermaid-wrapper" id="wrapper-${diagramId}">
          <div class="mermaid-toolbar">
            <div class="mermaid-toolbar-title">
              <span>📊 Mermaid Diagram</span>
              <span class="inline-zoom-badge" id="badge-${diagramId}">100% (Fit)</span>
            </div>
            <div class="mermaid-toolbar-actions">
              <button type="button" class="btn-diagram" onclick="fitDiagramToViewport('${diagramId}')" title="Fit Entire Diagram in View">⤢ Fit</button>
              <button type="button" class="btn-diagram" onclick="zoomDiagram('${diagramId}', 1.25)" title="Zoom In">➕</button>
              <button type="button" class="btn-diagram" onclick="zoomDiagram('${diagramId}', 0.8)" title="Zoom Out">➖</button>
              <button type="button" class="btn-diagram" onclick="resetDiagramZoom('${diagramId}')" title="1:1 Native Size">↺ 1:1</button>
              <button type="button" class="btn-diagram btn-primary" onclick="openModal('${diagramId}')" title="Inspect Fullscreen">🔍 Fullscreen</button>
            </div>
          </div>
          <div class="mermaid-viewport" id="viewport-${diagramId}">
            <div class="mermaid-canvas" id="canvas-${diagramId}">
              <div class="mermaid-loading" style="padding: 20px; color: #8b949e;">Rendering diagram...</div>
            </div>
          </div>
        </div>
      `;
    } else {
      html += marked.parser([token]);
    }
  });

  // Remove wrapping <p> around block formulas if present
  html = html.replace(/<p>\s*(KATEXBLOCK_\d+_TOKEN)\s*<\/p>/g, '$1');

  // Replace block math tokens with rendered KaTeX display HTML
  html = html.replace(/KATEXBLOCK_(\d+)_TOKEN/g, (match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return renderFormula(mathBlocks[idx] || '', true);
  });

  // Replace inline math tokens with rendered KaTeX inline HTML
  html = html.replace(/KATEXINLINE_(\d+)_TOKEN/g, (match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return renderFormula(mathInlines[idx] || '', false);
  });

  // Resolve raw HTML <img src="..."> tags
  html = html.replace(/<img\b([^>]*?)\bsrc=(["'])(.*?)\2([^>]*?)>/gi, (match, prefix, quote, src, suffix) => {
    const resolved = resolveImageUrl(src);
    return `<img${prefix}src="${escapeHtml(resolved)}"${suffix} loading="lazy">`;
  });

  container.innerHTML = html;

  // Render each mermaid diagram asynchronously
  for (const [diagramId, code] of diagramRegistry.entries()) {
    const canvas = document.getElementById(`canvas-${diagramId}`);
    try {
      const uniqueSvgId = `svg-${diagramId}-${Date.now()}`;
      const { svg } = await mermaid.render(uniqueSvgId, code);
      if (canvas) {
        canvas.innerHTML = svg;
        initDiagramInteraction(diagramId);
      }
    } catch (err) {
      console.error('Mermaid render error for ' + diagramId, err);
      if (canvas) {
        canvas.innerHTML = `
          <div style="padding: 16px; color: #f85149; background: rgba(218, 54, 51, 0.15); border-radius: 6px;">
            <b>Mermaid Syntax Error:</b><br>
            <pre style="margin-top: 8px; color: #ff7b72;">${escapeHtml(err.message || String(err))}</pre>
          </div>`;
      }
    }
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Robust SVG dimension retrieval from viewBox, getBBox, or rect
function getSvgDimensions(svg) {
  let w = 0, h = 0;
  if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width > 0) {
    w = svg.viewBox.baseVal.width;
    h = svg.viewBox.baseVal.height;
  } else if (svg.getAttribute('viewBox')) {
    const parts = svg.getAttribute('viewBox').trim().split(/[\s,]+/);
    if (parts.length === 4) {
      w = parseFloat(parts[2]);
      h = parseFloat(parts[3]);
    }
  }
  if (!w || !h) {
    try {
      const bbox = svg.getBBox();
      if (bbox.width > 0 && bbox.height > 0) {
        w = bbox.width;
        h = bbox.height;
      }
    } catch (_) {}
  }
  if (!w || !h) {
    const rect = svg.getBoundingClientRect();
    w = rect.width || 800;
    h = rect.height || 450;
  }
  return { width: Math.max(w, 50), height: Math.max(h, 50) };
}

// Fit diagram so 100% of the entire shape is visible without layout shifting
function fitDiagramToViewport(diagramId, adjustHeight = true) {
  const viewport = document.getElementById(`viewport-${diagramId}`);
  const canvas = document.getElementById(`canvas-${diagramId}`);
  if (!viewport || !canvas) return;

  const svg = canvas.querySelector('svg');
  if (!svg) return;

  svg.style.maxWidth = 'none';
  svg.style.maxHeight = 'none';
  svg.style.display = 'block';

  const { width: svgW, height: svgH } = getSvgDimensions(svg);
  svg.setAttribute('width', `${svgW}`);
  svg.setAttribute('height', `${svgH}`);

  const pad = 36;
  const vpW = Math.max(viewport.clientWidth - pad, 200);

  let fitScale = 1.0;
  if (svgW > vpW) {
    fitScale = vpW / svgW;
  } else if (svgW < 360) {
    fitScale = Math.min(vpW / svgW, 1.25);
  }

  // Only adjust viewport height on initial render to prevent layout jump loops during resize
  if (adjustHeight) {
    const desiredHeight = Math.min(Math.max(svgH * fitScale + 44, 240), 720);
    viewport.style.height = `${Math.round(desiredHeight)}px`;
  }

  // Ensure diagram is not vertically clipped if viewport height was clamped
  const vpH = Math.max(viewport.clientHeight - 40, 160);
  if (svgH * fitScale > vpH) {
    fitScale = Math.min(fitScale, vpH / svgH);
  }

  const state = diagramStates.get(diagramId) || {
    scale: fitScale,
    fitScale: fitScale,
    tx: 0,
    ty: 0,
    isDragging: false,
    isFit: true
  };

  state.scale = fitScale;
  state.fitScale = fitScale;
  state.tx = 0;
  state.ty = 0;
  state.isFit = true;
  diagramStates.set(diagramId, state);

  canvas.style.transform = `translate(0px, 0px) scale(${fitScale})`;

  const badge = document.getElementById(`badge-${diagramId}`);
  if (badge) {
    badge.textContent = `${Math.round(fitScale * 100)}% (Fit)`;
  }
}

// Diagram interactive state management with focal zoom and PointerCapture
function initDiagramInteraction(diagramId) {
  const viewport = document.getElementById(`viewport-${diagramId}`);
  const canvas = document.getElementById(`canvas-${diagramId}`);
  const badge = document.getElementById(`badge-${diagramId}`);
  if (!viewport || !canvas) return;

  fitDiagramToViewport(diagramId, true);

  const state = diagramStates.get(diagramId);

  function applyTransform() {
    canvas.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    if (badge) {
      if (state.isFit && Math.abs(state.scale - state.fitScale) < 0.01 && state.tx === 0 && state.ty === 0) {
        badge.textContent = `${Math.round(state.scale * 100)}% (Fit)`;
      } else {
        badge.textContent = `${Math.round(state.scale * 100)}%`;
      }
    }
  }

  // Wheel to focal zoom towards mouse cursor
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    const oldScale = state.scale;
    const newScale = Math.min(Math.max(oldScale * factor, 0.15), 20.0);
    if (newScale === oldScale) return;

    const rect = viewport.getBoundingClientRect();
    const cx = e.clientX - (rect.left + rect.width / 2);
    const cy = e.clientY - (rect.top + rect.height / 2);

    state.tx = cx - (cx - state.tx) * (newScale / oldScale);
    state.ty = cy - (cy - state.ty) * (newScale / oldScale);
    state.scale = newScale;
    state.isFit = false;

    applyTransform();
  }, { passive: false });

  // Pointer drag with PointerCapture for smooth, jitter-free panning
  let startX = 0;
  let startY = 0;
  let initTx = 0;
  let initTy = 0;
  let activePointerId = null;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.mermaid-toolbar') || e.target.closest('button')) return;
    e.preventDefault();

    state.isDragging = true;
    activePointerId = e.pointerId;
    viewport.setPointerCapture(e.pointerId);
    viewport.style.cursor = 'grabbing';

    startX = e.clientX;
    startY = e.clientY;
    initTx = state.tx;
    initTy = state.ty;
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!state.isDragging || e.pointerId !== activePointerId) return;
    state.tx = initTx + (e.clientX - startX);
    state.ty = initTy + (e.clientY - startY);
    state.isFit = false;
    applyTransform();
  });

  const stopDrag = (e) => {
    if (state.isDragging && e.pointerId === activePointerId) {
      state.isDragging = false;
      viewport.style.cursor = 'grab';
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch (_) {}
      activePointerId = null;
    }
  };

  viewport.addEventListener('pointerup', stopDrag);
  viewport.addEventListener('pointercancel', stopDrag);

  // Double click to open fullscreen inspection modal
  viewport.addEventListener('dblclick', (e) => {
    if (e.target.closest('.mermaid-toolbar') || e.target.closest('button')) return;
    openModal(diagramId);
  });
}

function zoomDiagram(diagramId, factor) {
  const state = diagramStates.get(diagramId);
  if (!state) return;
  const oldScale = state.scale;
  const newScale = Math.min(Math.max(oldScale * factor, 0.15), 20.0);
  state.scale = newScale;
  state.isFit = false;

  const canvas = document.getElementById(`canvas-${diagramId}`);
  const badge = document.getElementById(`badge-${diagramId}`);
  if (canvas) {
    canvas.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
  }
  if (badge) {
    badge.textContent = `${Math.round(state.scale * 100)}%`;
  }
}

function resetDiagramZoom(diagramId) {
  const state = diagramStates.get(diagramId);
  if (!state) return;
  state.scale = 1.0;
  state.tx = 0;
  state.ty = 0;
  state.isFit = false;

  const canvas = document.getElementById(`canvas-${diagramId}`);
  const badge = document.getElementById(`badge-${diagramId}`);
  if (canvas) {
    canvas.style.transform = `translate(0px, 0px) scale(1.0)`;
  }
  if (badge) {
    badge.textContent = '100%';
  }
}

// Window resize refits diagrams smoothly without layout jumping
let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    const modal = document.getElementById('diagram-modal');
    if (modal && modal.classList.contains('active') && modalState.isFit) {
      fitModalDiagram();
    }

    for (const diagramId of diagramRegistry.keys()) {
      const state = diagramStates.get(diagramId);
      if (state && state.isFit) {
        fitDiagramToViewport(diagramId, false);
      }
    }
  });
});

// ========================================================
// FULLSCREEN MODAL INSPECTION
// ========================================================

const modalState = {
  scale: 1.0,
  fitScale: 1.0,
  tx: 0,
  ty: 0,
  isDragging: false,
  isFit: true
};

function openModal(diagramId) {
  const canvas = document.getElementById(`canvas-${diagramId}`);
  if (!canvas) return;
  const svg = canvas.querySelector('svg');
  if (!svg) return;

  const modal = document.getElementById('diagram-modal');
  const modalCanvas = document.getElementById('modal-canvas');
  if (!modal || !modalCanvas) return;

  const { width: svgW, height: svgH } = getSvgDimensions(svg);

  const clone = svg.cloneNode(true);
  clone.setAttribute('width', `${svgW}`);
  clone.setAttribute('height', `${svgH}`);
  clone.style.maxWidth = 'none';
  clone.style.maxHeight = 'none';
  clone.style.display = 'block';

  modalCanvas.innerHTML = '';
  modalCanvas.appendChild(clone);

  document.body.style.overflow = 'hidden';
  modal.classList.add('active');

  requestAnimationFrame(() => {
    fitModalDiagram();
  });
}

function closeModal() {
  const modal = document.getElementById('diagram-modal');
  if (modal) {
    modal.classList.remove('active');
  }
  const modalCanvas = document.getElementById('modal-canvas');
  if (modalCanvas) {
    modalCanvas.innerHTML = '';
  }
  document.body.style.overflow = '';
}

function fitModalDiagram() {
  const modalViewport = document.getElementById('modal-viewport');
  const modalCanvas = document.getElementById('modal-canvas');
  if (!modalViewport || !modalCanvas) return;

  const svg = modalCanvas.querySelector('svg');
  if (!svg) return;

  const { width: svgW, height: svgH } = getSvgDimensions(svg);
  const vw = Math.max(modalViewport.clientWidth - 80, 200);
  const vh = Math.max(modalViewport.clientHeight - 80, 200);

  const scaleX = vw / svgW;
  const scaleY = vh / svgH;
  let fitScale = Math.min(scaleX, scaleY);
  fitScale = Math.min(Math.max(fitScale, 0.15), 2.5);

  modalState.scale = fitScale;
  modalState.fitScale = fitScale;
  modalState.tx = 0;
  modalState.ty = 0;
  modalState.isFit = true;

  applyModalTransform();
}

function applyModalTransform() {
  const canvas = document.getElementById('modal-canvas');
  const badge = document.getElementById('modal-zoom-level');
  if (canvas) {
    canvas.style.transform = `translate(${modalState.tx}px, ${modalState.ty}px) scale(${modalState.scale})`;
  }
  if (badge) {
    if (modalState.isFit && Math.abs(modalState.scale - modalState.fitScale) < 0.01 && modalState.tx === 0 && modalState.ty === 0) {
      badge.textContent = `${Math.round(modalState.scale * 100)}% (Fit)`;
    } else {
      badge.textContent = `${Math.round(modalState.scale * 100)}%`;
    }
  }
}

function zoomModal(factor) {
  const oldScale = modalState.scale;
  const newScale = Math.min(Math.max(oldScale * factor, 0.15), 30.0);
  modalState.scale = newScale;
  modalState.isFit = false;
  applyModalTransform();
}

function resetModalZoom() {
  modalState.scale = 1.0;
  modalState.tx = 0;
  modalState.ty = 0;
  modalState.isFit = false;
  applyModalTransform();
}

function setupModalEvents() {
  const modalViewport = document.getElementById('modal-viewport');
  const modal = document.getElementById('diagram-modal');
  if (!modalViewport || !modal) return;

  modalViewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    const oldScale = modalState.scale;
    const newScale = Math.min(Math.max(oldScale * factor, 0.15), 30.0);
    if (newScale === oldScale) return;

    const rect = modalViewport.getBoundingClientRect();
    const cx = e.clientX - (rect.left + rect.width / 2);
    const cy = e.clientY - (rect.top + rect.height / 2);

    modalState.tx = cx - (cx - modalState.tx) * (newScale / oldScale);
    modalState.ty = cy - (cy - modalState.ty) * (newScale / oldScale);
    modalState.scale = newScale;
    modalState.isFit = false;

    applyModalTransform();
  }, { passive: false });

  let startX = 0;
  let startY = 0;
  let initTx = 0;
  let initTy = 0;
  let activePointerId = null;

  modalViewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.modal-header') || e.target.closest('button')) return;
    e.preventDefault();

    modalState.isDragging = true;
    activePointerId = e.pointerId;
    modalViewport.setPointerCapture(e.pointerId);
    modalViewport.style.cursor = 'grabbing';

    startX = e.clientX;
    startY = e.clientY;
    initTx = modalState.tx;
    initTy = modalState.ty;
  });

  modalViewport.addEventListener('pointermove', (e) => {
    if (!modalState.isDragging || e.pointerId !== activePointerId) return;
    modalState.tx = initTx + (e.clientX - startX);
    modalState.ty = initTy + (e.clientY - startY);
    modalState.isFit = false;
    applyModalTransform();
  });

  const stopModalDrag = (e) => {
    if (modalState.isDragging && e.pointerId === activePointerId) {
      modalState.isDragging = false;
      modalViewport.style.cursor = 'grab';
      try {
        modalViewport.releasePointerCapture(e.pointerId);
      } catch (_) {}
      activePointerId = null;
    }
  };

  modalViewport.addEventListener('pointerup', stopModalDrag);
  modalViewport.addEventListener('pointercancel', stopModalDrag);

  modalViewport.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    fitModalDiagram();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });
}

// ========================================================
// QWebChannel Integration
// ========================================================

function setupChannel() {
  if (typeof qt === 'undefined' || !qt.webChannelTransport) {
    console.warn('Qt WebChannel transport not found. Running in standalone web preview.');
    return;
  }

  new QWebChannel(qt.webChannelTransport, function(channel) {
    window.bridge = channel.objects.bridge;
    if (window.bridge) {
      // Connect markdown content signal
      window.bridge.markdownContentChanged.connect(function(newMarkdown) {
        renderMarkdown(newMarkdown);
      });
      // Connect theme changed signal
      window.bridge.themeChanged.connect(function(newTheme) {
        setTheme(newTheme);
      });

      // Connect baseDir changed signal
      window.bridge.baseDirChanged.connect(function(newBaseDir) {
        currentBaseDir = newBaseDir || '';
        if (currentMarkdown) {
          renderMarkdown(currentMarkdown);
        }
      });

      // Initialize with bridge properties
      if (window.bridge.theme) {
        setTheme(window.bridge.theme);
      }
      if (window.bridge.baseDir) {
        currentBaseDir = window.bridge.baseDir;
      }
      if (window.bridge.markdownContent) {
        renderMarkdown(window.bridge.markdownContent);
      }
    }
  });
}

// Intercept all link clicks in capture phase to prevent Chromium navigation
document.addEventListener('click', function(e) {
  const anchor = e.target.closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href || href === '#' || href.startsWith('javascript:')) return;

  // 1. In-page anchor links (e.g. #features, #releases--downloads)
  if (href.startsWith('#')) {
    e.preventDefault();
    const id = href.slice(1);
    let target = document.getElementById(id) ||
                 document.getElementById(decodeURIComponent(id)) ||
                 document.querySelector(`[name="${CSS.escape(id)}"]`);
    if (!target) {
      const decoded = decodeURIComponent(id).toLowerCase();
      target = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).find(h => {
        return h.id === decoded || h.textContent.trim().toLowerCase().includes(decoded);
      });
    }
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  // 2. All other links (relative markdown/document files, local files, external websites)
  e.preventDefault();
  if (window.bridge && typeof window.bridge.openLink === 'function') {
    window.bridge.openLink(href);
  }
}, true);

document.addEventListener('DOMContentLoaded', () => {
  setupModalEvents();
  setupChannel();
});
