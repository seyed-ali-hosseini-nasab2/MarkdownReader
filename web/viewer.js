let currentTheme = 'dark';
let currentMarkdown = '';

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

  const tokens = marked.lexer(markdownText);
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

// Fit diagram so 100% of the entire shape is visible on initial load
function fitDiagramToViewport(diagramId) {
  const viewport = document.getElementById(`viewport-${diagramId}`);
  const canvas = document.getElementById(`canvas-${diagramId}`);
  if (!viewport || !canvas) return;

  const svg = canvas.querySelector('svg');
  if (!svg) return;

  // Unconstrain SVG styling
  svg.style.maxWidth = 'none';
  svg.style.display = 'block';

  // Read true SVG bounding box
  let svgW = 0, svgH = 0;
  if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width > 0) {
    svgW = svg.viewBox.baseVal.width;
    svgH = svg.viewBox.baseVal.height;
  } else {
    const bbox = svg.getBBox();
    svgW = bbox.width || 800;
    svgH = bbox.height || 400;
  }

  // Available viewport space (with padding)
  const pad = 36;
  const vpW = Math.max(viewport.clientWidth - pad, 260);

  // Scale factor to show the entire diagram width
  let fitScale = 1.0;
  if (svgW > vpW) {
    fitScale = vpW / svgW;
  } else if (svgW < 400) {
    // If very small, scale up slightly for comfortable readability
    fitScale = Math.min(vpW / svgW, 1.2);
  }

  // Dynamically size viewport height to fit diagram height without vertical cutoff
  const desiredHeight = Math.min(Math.max(svgH * fitScale + 44, 220), 760);
  viewport.style.height = `${Math.round(desiredHeight)}px`;

  const state = diagramStates.get(diagramId) || {
    scale: fitScale,
    tx: 0,
    ty: 0,
    isDragging: false,
    startX: 0,
    startY: 0
  };
  state.scale = fitScale;
  state.tx = 0;
  state.ty = 0;
  diagramStates.set(diagramId, state);

  canvas.style.transform = `translate(0px, 0px) scale(${fitScale})`;

  const badge = document.getElementById(`badge-${diagramId}`);
  if (badge) {
    badge.textContent = `${Math.round(fitScale * 100)}% (Fit)`;
  }
}

// Diagram interactive state management
function initDiagramInteraction(diagramId) {
  const viewport = document.getElementById(`viewport-${diagramId}`);
  const canvas = document.getElementById(`canvas-${diagramId}`);
  const badge = document.getElementById(`badge-${diagramId}`);
  if (!viewport || !canvas) return;

  // Perform initial auto-fit to show the entire diagram
  fitDiagramToViewport(diagramId);

  const state = diagramStates.get(diagramId);

  function applyTransform() {
    canvas.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    if (badge) {
      badge.textContent = `${Math.round(state.scale * 100)}%`;
    }
  }

  // Wheel to zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    state.scale = Math.min(Math.max(state.scale * factor, 0.2), 15.0);
    applyTransform();
  }, { passive: false });

  // Drag to pan
  viewport.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    state.startX = e.clientX - state.tx;
    state.startY = e.clientY - state.ty;
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    state.tx = e.clientX - state.startX;
    state.ty = e.clientY - state.startY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    state.isDragging = false;
  });

  // Double click to open fullscreen
  viewport.addEventListener('dblclick', () => {
    openModal(diagramId);
  });
}

function zoomDiagram(diagramId, factor) {
  const state = diagramStates.get(diagramId);
  if (!state) return;
  state.scale = Math.min(Math.max(state.scale * factor, 0.2), 15.0);
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
  const canvas = document.getElementById(`canvas-${diagramId}`);
  const badge = document.getElementById(`badge-${diagramId}`);
  if (canvas) {
    canvas.style.transform = `translate(0px, 0px) scale(1.0)`;
  }
  if (badge) {
    badge.textContent = '100%';
  }
}

// Window resize refits diagrams
window.addEventListener('resize', () => {
  for (const diagramId of diagramRegistry.keys()) {
    fitDiagramToViewport(diagramId);
  }
});

// ========================================================
// FULLSCREEN MODAL INSPECTION
// ========================================================

const modalState = {
  scale: 1.5,
  tx: 0,
  ty: 0,
  isDragging: false,
  startX: 0,
  startY: 0
};

function openModal(diagramId) {
  const canvas = document.getElementById(`canvas-${diagramId}`);
  if (!canvas) return;
  const svg = canvas.querySelector('svg');
  if (!svg) return;

  const modalCanvas = document.getElementById('modal-canvas');
  modalCanvas.innerHTML = svg.outerHTML;

  const modal = document.getElementById('diagram-modal');
  modal.classList.add('active');

  resetModalZoom();
}

function closeModal() {
  const modal = document.getElementById('diagram-modal');
  modal.classList.remove('active');
  const modalCanvas = document.getElementById('modal-canvas');
  modalCanvas.innerHTML = '';
}

function applyModalTransform() {
  const canvas = document.getElementById('modal-canvas');
  const badge = document.getElementById('modal-zoom-level');
  if (canvas) {
    canvas.style.transform = `translate(${modalState.tx}px, ${modalState.ty}px) scale(${modalState.scale})`;
  }
  if (badge) {
    badge.textContent = `${Math.round(modalState.scale * 100)}%`;
  }
}

function zoomModal(factor) {
  modalState.scale = Math.min(Math.max(modalState.scale * factor, 0.2), 30.0);
  applyModalTransform();
}

function resetModalZoom() {
  modalState.scale = 1.5;
  modalState.tx = 0;
  modalState.ty = 0;
  applyModalTransform();
}

// Modal Viewport Drag and Wheel events
const modalViewport = document.getElementById('modal-viewport');
modalViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.18 : 0.82;
  modalState.scale = Math.min(Math.max(modalState.scale * factor, 0.2), 30.0);
  applyModalTransform();
}, { passive: false });

modalViewport.addEventListener('mousedown', (e) => {
  modalState.isDragging = true;
  modalState.startX = e.clientX - modalState.tx;
  modalState.startY = e.clientY - modalState.ty;
});

window.addEventListener('mousemove', (e) => {
  if (!modalState.isDragging) return;
  modalState.tx = e.clientX - modalState.startX;
  modalState.ty = e.clientY - modalState.startY;
  applyModalTransform();
});

window.addEventListener('mouseup', () => {
  modalState.isDragging = false;
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
  }
});

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

      // Initialize with bridge properties
      if (window.bridge.theme) {
        setTheme(window.bridge.theme);
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

document.addEventListener('DOMContentLoaded', setupChannel);
