// Initialize Mermaid with high-visibility dark settings
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
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
  themeVariables: {
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
  }
});

// Configure Marked to use Highlight.js for all languages
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

// Store diagrams data for modal inspection
const diagramRegistry = new Map();

// Main Markdown rendering pipeline
async function renderMarkdown(markdownText) {
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
              <span class="inline-zoom-badge" id="badge-${diagramId}">100%</span>
            </div>
            <div class="mermaid-toolbar-actions">
              <button type="button" class="btn-diagram" onclick="zoomDiagram('${diagramId}', 1.2)" title="Zoom In">➕</button>
              <button type="button" class="btn-diagram" onclick="zoomDiagram('${diagramId}', 0.8)" title="Zoom Out">➖</button>
              <button type="button" class="btn-diagram" onclick="resetDiagramZoom('${diagramId}')" title="Reset Zoom">↺ 1:1</button>
              <button type="button" class="btn-diagram btn-primary" onclick="openModal('${diagramId}')" title="Inspect Detailed Diagram">🔍 Fullscreen Zoom</button>
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
          <div style="padding: 16px; color: #f85149; background: #220a0a; border-radius: 6px;">
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

// Diagram interactive state management
const diagramStates = new Map();

function initDiagramInteraction(diagramId) {
  const viewport = document.getElementById(`viewport-${diagramId}`);
  const canvas = document.getElementById(`canvas-${diagramId}`);
  const badge = document.getElementById(`badge-${diagramId}`);
  if (!viewport || !canvas) return;

  const state = {
    scale: 1.0,
    tx: 0,
    ty: 0,
    isDragging: false,
    startX: 0,
    startY: 0
  };
  diagramStates.set(diagramId, state);

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
    state.scale = Math.min(Math.max(state.scale * factor, 0.25), 10.0);
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
  state.scale = Math.min(Math.max(state.scale * factor, 0.25), 10.0);
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
    canvas.style.transform = `translate(0px, 0px) scale(1)`;
  }
  if (badge) {
    badge.textContent = '100%';
  }
}

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
  modalState.scale = Math.min(Math.max(modalState.scale * factor, 0.2), 25.0);
  applyModalTransform();
}

function resetModalZoom() {
  modalState.scale = 1.5; // Start nicely enlarged
  modalState.tx = 0;
  modalState.ty = 0;
  applyModalTransform();
}

// Modal Viewport Drag and Wheel events
const modalViewport = document.getElementById('modal-viewport');
modalViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.18 : 0.82;
  modalState.scale = Math.min(Math.max(modalState.scale * factor, 0.2), 25.0);
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
      window.bridge.markdownContentChanged.connect(function(newMarkdown) {
        renderMarkdown(newMarkdown);
      });
      if (window.bridge.markdownContent) {
        renderMarkdown(window.bridge.markdownContent);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', setupChannel);
