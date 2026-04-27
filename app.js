const canvas = document.querySelector("#editorCanvas");
const overlay = document.querySelector("#overlayCanvas");
const stage = document.querySelector("#stage");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const octx = overlay.getContext("2d");

const els = {
  imageInput: document.querySelector("#imageInput"),
  emptyState: document.querySelector("#emptyState"),
  statusTitle: document.querySelector("#statusTitle"),
  statusDetail: document.querySelector("#statusDetail"),
  viewButtons: [...document.querySelectorAll(".view-button")],
  toolButtons: [...document.querySelectorAll(".tool-button")],
  brushSize: document.querySelector("#brushSize"),
  tolerance: document.querySelector("#tolerance"),
  feather: document.querySelector("#feather"),
  selectVisibleButton: document.querySelector("#selectVisibleButton"),
  selectBackgroundButton: document.querySelector("#selectBackgroundButton"),
  removeBackgroundButton: document.querySelector("#removeBackgroundButton"),
  invertSelectionButton: document.querySelector("#invertSelectionButton"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
  deleteSelectionButton: document.querySelector("#deleteSelectionButton"),
  keepSelectionButton: document.querySelector("#keepSelectionButton"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  previewBgButton: document.querySelector("#previewBgButton"),
  resetButton: document.querySelector("#resetButton"),
  downloadButton: document.querySelector("#downloadButton"),
  colorMap: document.querySelector("#colorMap"),
  hueSlider: document.querySelector("#hueSlider"),
  colorSwatch: document.querySelector("#colorSwatch"),
  hexColor: document.querySelector("#hexColor"),
  redInput: document.querySelector("#redInput"),
  greenInput: document.querySelector("#greenInput"),
  blueInput: document.querySelector("#blueInput"),
  selectedOnly: document.querySelector("#selectedOnly"),
  keepAlpha: document.querySelector("#keepAlpha"),
  preserveTexture: document.querySelector("#preserveTexture"),
  cleanWhite: document.querySelector("#cleanWhite"),
  textureStrength: document.querySelector("#textureStrength"),
  whiteCutoff: document.querySelector("#whiteCutoff"),
  applyColorButton: document.querySelector("#applyColorButton"),
};

const colorMapCtx = els.colorMap.getContext("2d");

const state = {
  imageLoaded: false,
  tool: "brush",
  imageData: null,
  originalData: null,
  viewMode: "edited",
  hasColorApplied: false,
  selection: null,
  view: { scale: 1, x: 0, y: 0 },
  drawing: false,
  dragStart: null,
  rectPreview: null,
  panStart: null,
  pointers: new Map(),
  pinch: null,
  suppressDraw: false,
  color: { r: 90, g: 47, b: 31, h: 18, s: 66, v: 35 },
  undo: [],
  redo: [],
};

const compareGap = 80;

function canvasSizeForView() {
  if (state.viewMode === "compare" && state.imageData) {
    return {
      width: state.imageData.width * 2 + compareGap,
      height: state.imageData.height,
    };
  }
  return {
    width: state.imageData ? state.imageData.width : 1,
    height: state.imageData ? state.imageData.height : 1,
  };
}

function resizeDisplay() {
  const rect = stage.getBoundingClientRect();
  overlay.width = Math.max(1, Math.floor(rect.width));
  overlay.height = Math.max(1, Math.floor(rect.height));
  draw();
}

function fitImageToStage() {
  if (!state.imageData) return;
  const stageRect = stage.getBoundingClientRect();
  const size = canvasSizeForView();
  const scale = Math.min(
    (stageRect.width * 0.9) / size.width,
    (stageRect.height * 0.9) / size.height,
    1
  );
  state.view.scale = scale || 1;
  state.view.x = (stageRect.width - size.width * state.view.scale) / 2;
  state.view.y = (stageRect.height - size.height * state.view.scale) / 2;
}

function draw() {
  if (!state.imageData) {
    clearOverlay();
    return;
  }

  const size = canvasSizeForView();
  canvas.width = size.width;
  canvas.height = size.height;
  drawMainCanvas();

  canvas.style.width = `${size.width * state.view.scale}px`;
  canvas.style.height = `${size.height * state.view.scale}px`;
  canvas.style.transform = `translate(${state.view.x}px, ${state.view.y}px)`;
  canvas.style.transformOrigin = "0 0";

  drawOverlay();
  updateStatus();
  updateHistoryButtons();
}

function drawMainCanvas() {
  if (state.viewMode === "original" && state.originalData) {
    ctx.putImageData(state.originalData, 0, 0);
    return;
  }

  if (state.viewMode === "compare" && state.originalData) {
    ctx.putImageData(state.originalData, 0, 0);
    ctx.putImageData(state.imageData, state.imageData.width + compareGap, 0);
    return;
  }

  ctx.putImageData(state.imageData, 0, 0);
}

function clearOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
}

function drawOverlay() {
  clearOverlay();
  if (!state.imageData) return;

  octx.save();
  octx.translate(state.view.x, state.view.y);
  octx.scale(state.view.scale, state.view.scale);

  if (state.selection && state.viewMode === "edited") {
    const selectionImage = octx.createImageData(state.selection.width, state.selection.height);
    for (let i = 0; i < state.selection.data.length; i += 1) {
      if (state.selection.data[i]) {
        const p = i * 4;
        selectionImage.data[p] = 14;
        selectionImage.data[p + 1] = 118;
        selectionImage.data[p + 2] = 106;
        selectionImage.data[p + 3] = 72;
      }
    }
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = state.selection.width;
    maskCanvas.height = state.selection.height;
    maskCanvas.getContext("2d").putImageData(selectionImage, 0, 0);
    octx.drawImage(maskCanvas, 0, 0);
  }

  if (state.rectPreview) {
    const { x, y, w, h } = state.rectPreview;
    octx.setLineDash([8 / state.view.scale, 5 / state.view.scale]);
    octx.strokeStyle = "#c85d7a";
    octx.lineWidth = 2 / state.view.scale;
    octx.strokeRect(x, y, w, h);
  }

  octx.restore();

  if (state.viewMode === "compare" && state.originalData) {
    drawCompareLabels();
  }
}

function drawCompareLabels() {
  const x = state.view.x;
  const y = state.view.y;
  const editedX = x + (state.imageData.width + compareGap) * state.view.scale;
  octx.save();
  octx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  octx.textBaseline = "top";
  drawLabel("元画像", x + 12, y + 12);
  drawLabel("加工後", editedX + 12, y + 12);
  octx.restore();
}

function drawLabel(text, x, y) {
  const metrics = octx.measureText(text);
  const paddingX = 9;
  const paddingY = 6;
  octx.fillStyle = "rgba(255, 255, 255, 0.88)";
  octx.strokeStyle = "rgba(37, 34, 31, 0.18)";
  octx.lineWidth = 1;
  octx.beginPath();
  octx.roundRect(x, y, metrics.width + paddingX * 2, 26, 6);
  octx.fill();
  octx.stroke();
  octx.fillStyle = "#25221f";
  octx.fillText(text, x + paddingX, y + paddingY);
}

function imagePoint(evt) {
  const rect = stage.getBoundingClientRect();
  return {
    x: Math.floor((evt.clientX - rect.left - state.view.x) / state.view.scale),
    y: Math.floor((evt.clientY - rect.top - state.view.y) / state.view.scale),
    stageX: evt.clientX - rect.left,
    stageY: evt.clientY - rect.top,
  };
}

function stageToImagePoint(stageX, stageY) {
  return {
    x: Math.floor((stageX - state.view.x) / state.view.scale),
    y: Math.floor((stageY - state.view.y) / state.view.scale),
  };
}

function inBounds(x, y) {
  return state.imageData && x >= 0 && y >= 0 && x < state.imageData.width && y < state.imageData.height;
}

function createMask(fill = 0) {
  return {
    width: state.imageData.width,
    height: state.imageData.height,
    data: new Uint8Array(state.imageData.width * state.imageData.height).fill(fill),
  };
}

function ensureSelection() {
  if (!state.selection) state.selection = createMask(0);
}

function pushHistory() {
  if (!state.imageData) return;
  state.undo.push({
    imageData: new ImageData(new Uint8ClampedArray(state.imageData.data), state.imageData.width, state.imageData.height),
    hasColorApplied: state.hasColorApplied,
    selection: state.selection
      ? { width: state.selection.width, height: state.selection.height, data: new Uint8Array(state.selection.data) }
      : null,
  });
  if (state.undo.length > 30) state.undo.shift();
  state.redo = [];
  updateHistoryButtons();
}

function restoreSnapshot(snapshot) {
  state.imageData = new ImageData(
    new Uint8ClampedArray(snapshot.imageData.data),
    snapshot.imageData.width,
    snapshot.imageData.height
  );
  state.selection = snapshot.selection
    ? { width: snapshot.selection.width, height: snapshot.selection.height, data: new Uint8Array(snapshot.selection.data) }
    : null;
  state.hasColorApplied = Boolean(snapshot.hasColorApplied);
  draw();
}

function snapshotCurrent() {
  return {
    imageData: new ImageData(new Uint8ClampedArray(state.imageData.data), state.imageData.width, state.imageData.height),
    hasColorApplied: state.hasColorApplied,
    selection: state.selection
      ? { width: state.selection.width, height: state.selection.height, data: new Uint8Array(state.selection.data) }
      : null,
  };
}

function updateHistoryButtons() {
  els.undoButton.disabled = !state.undo.length;
  els.redoButton.disabled = !state.redo.length;
}

function updateStatus() {
  if (!state.imageData) return;
  const selected = state.selection ? state.selection.data.reduce((sum, value) => sum + value, 0) : 0;
  els.statusTitle.textContent = `${state.imageData.width} × ${state.imageData.height}px`;
  const viewLabel = state.viewMode === "compare" ? "比較表示" : state.viewMode === "original" ? "元画像表示" : "編集表示";
  els.statusDetail.textContent = selected
    ? `${viewLabel} / 選択中: ${selected.toLocaleString()}px`
    : `${viewLabel} / 選択範囲なし`;
}

function setTool(tool) {
  state.tool = tool;
  els.toolButtons.forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
}

function setViewMode(viewMode) {
  state.viewMode = viewMode;
  els.viewButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === viewMode));
  fitImageToStage();
  draw();
}

function paintCircle(x, y, value) {
  ensureSelection();
  const radius = Number(els.brushSize.value) / 2;
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(state.imageData.width - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(state.imageData.height - 1, Math.ceil(y + radius));
  const r2 = radius * radius;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = px - x;
      const dy = py - y;
      if (dx * dx + dy * dy <= r2) {
        state.selection.data[py * state.imageData.width + px] = value;
      }
    }
  }
}

function eraseCircle(x, y) {
  const radius = Number(els.brushSize.value) / 2;
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(state.imageData.width - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(state.imageData.height - 1, Math.ceil(y + radius));
  const r2 = radius * radius;
  const data = state.imageData.data;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = px - x;
      const dy = py - y;
      if (dx * dx + dy * dy <= r2) {
        data[(py * state.imageData.width + px) * 4 + 3] = 0;
        if (state.selection) state.selection.data[py * state.imageData.width + px] = 0;
      }
    }
  }
}

function restoreCircle(x, y) {
  if (!state.originalData) return;
  const radius = Number(els.brushSize.value) / 2;
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(state.imageData.width - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(state.imageData.height - 1, Math.ceil(y + radius));
  const r2 = radius * radius;
  const data = state.imageData.data;
  const source = state.originalData.data;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = px - x;
      const dy = py - y;
      if (dx * dx + dy * dy > r2) continue;

      const p = (py * state.imageData.width + px) * 4;
      if (state.hasColorApplied) {
        const alpha = els.preserveTexture.checked ? textureAlphaAt(p) : source[p + 3] / 255;
        data[p] = state.color.r;
        data[p + 1] = state.color.g;
        data[p + 2] = state.color.b;
        data[p + 3] = Math.round(alpha * 255);
      } else {
        data[p] = source[p];
        data[p + 1] = source[p + 1];
        data[p + 2] = source[p + 2];
        data[p + 3] = source[p + 3];
      }
    }
  }
}

function selectRect(a, b) {
  ensureSelection();
  const minX = Math.max(0, Math.min(a.x, b.x));
  const minY = Math.max(0, Math.min(a.y, b.y));
  const maxX = Math.min(state.imageData.width - 1, Math.max(a.x, b.x));
  const maxY = Math.min(state.imageData.height - 1, Math.max(a.y, b.y));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      state.selection.data[y * state.imageData.width + x] = 1;
    }
  }
}

function colorDistance(data, index, color) {
  const dr = data[index] - color.r;
  const dg = data[index + 1] - color.g;
  const db = data[index + 2] - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function selectSimilarAt(x, y, record = true) {
  if (!state.imageData || !inBounds(x, y)) return;
  if (record) pushHistory();

  const { width, height, data } = state.imageData;
  const start = y * width + x;
  const wasSelected = state.selection ? Boolean(state.selection.data[start]) : false;
  const startIndex = start * 4;
  const target = {
    r: data[startIndex],
    g: data[startIndex + 1],
    b: data[startIndex + 2],
    a: data[startIndex + 3],
  };
  const tolerance = Number(els.tolerance.value);
  const mask = createMask(0);
  const visited = new Uint8Array(width * height);
  const queue = [[x, y]];
  let cursor = 0;

  function shouldSelect(pixelIndex) {
    const p = pixelIndex * 4;
    const alphaDiff = Math.abs(data[p + 3] - target.a);
    return colorDistance(data, p, target) <= tolerance && alphaDiff <= tolerance * 1.5;
  }

  while (cursor < queue.length) {
    const [cx, cy] = queue[cursor];
    cursor += 1;
    if (!inBounds(cx, cy)) continue;
    const pixel = cy * width + cx;
    if (visited[pixel]) continue;
    visited[pixel] = 1;
    if (!shouldSelect(pixel)) continue;
    mask.data[pixel] = 1;
    queue.push([cx + 1, cy]);
    queue.push([cx - 1, cy]);
    queue.push([cx, cy + 1]);
    queue.push([cx, cy - 1]);
  }

  if (!state.selection) {
    state.selection = mask;
  } else {
    for (let i = 0; i < mask.data.length; i += 1) {
      if (!mask.data[i]) continue;
      state.selection.data[i] = wasSelected ? 0 : 1;
    }
  }
  draw();
}

function averageEdgeColor() {
  const { width, height, data } = state.imageData;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let x = 0; x < width; x += 1) {
    for (const y of [0, height - 1]) {
      const p = (y * width + x) * 4;
      if (data[p + 3] > 0) {
        r += data[p];
        g += data[p + 1];
        b += data[p + 2];
        count += 1;
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (const x of [0, width - 1]) {
      const p = (y * width + x) * 4;
      if (data[p + 3] > 0) {
        r += data[p];
        g += data[p + 1];
        b += data[p + 2];
        count += 1;
      }
    }
  }

  return count ? { r: r / count, g: g / count, b: b / count } : { r: 255, g: 255, b: 255 };
}

function selectBackground(record = true) {
  if (!state.imageData) return;
  if (record) pushHistory();
  const tolerance = Number(els.tolerance.value);
  const edge = averageEdgeColor();
  const mask = createMask(0);
  const { width, height, data } = state.imageData;
  const queue = [];
  let cursor = 0;
  const visited = new Uint8Array(width * height);

  function add(x, y) {
    if (!inBounds(x, y)) return;
    const i = y * width + x;
    if (visited[i]) return;
    visited[i] = 1;
    const p = i * 4;
    if (data[p + 3] === 0 || colorDistance(data, p, edge) <= tolerance) {
      mask.data[i] = 1;
      queue.push([x, y]);
    }
  }

  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    add(0, y);
    add(width - 1, y);
  }

  while (cursor < queue.length) {
    const [x, y] = queue[cursor];
    cursor += 1;
    add(x + 1, y);
    add(x - 1, y);
    add(x, y + 1);
    add(x, y - 1);
  }

  state.selection = mask;
  draw();
}

function featherSelection(mask, radius) {
  if (!radius) return mask;
  const out = createMask(0);
  const { width, height } = mask;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (mask.data[i]) {
        out.data[i] = 1;
        continue;
      }
      let near = false;
      for (let dy = -radius; dy <= radius && !near; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (dx * dx + dy * dy <= radius * radius && mask.data[ny * width + nx]) {
            near = true;
            break;
          }
        }
      }
      out.data[i] = near ? 1 : 0;
    }
  }
  return out;
}

function applyAlphaToSelection(makeSelectedTransparent, record = true) {
  if (!state.imageData || !state.selection) return;
  if (record) pushHistory();
  const radius = Number(els.feather.value);
  const mask = featherSelection(state.selection, radius);
  const data = state.imageData.data;
  for (let i = 0; i < mask.data.length; i += 1) {
    if (Boolean(mask.data[i]) === makeSelectedTransparent) {
      data[i * 4 + 3] = 0;
    }
  }
  draw();
}

function selectVisible() {
  if (!state.imageData) return;
  pushHistory();
  const mask = createMask(0);
  for (let i = 0; i < mask.data.length; i += 1) {
    mask.data[i] = state.imageData.data[i * 4 + 3] > 0 ? 1 : 0;
  }
  state.selection = mask;
  draw();
}

function invertSelection() {
  if (!state.imageData) return;
  pushHistory();
  ensureSelection();
  for (let i = 0; i < state.selection.data.length; i += 1) {
    state.selection.data[i] = state.selection.data[i] ? 0 : 1;
  }
  draw();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function luminance(data, index) {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function colorSourceData() {
  return state.originalData && state.originalData.data.length === state.imageData.data.length
    ? state.originalData.data
    : state.imageData.data;
}

function sourceAlphaAt(index) {
  return colorSourceData()[index + 3] / 255;
}

function textureAlphaAt(index) {
  const source = colorSourceData();
  const sourceAlpha = source[index + 3] / 255;
  const inkDensity = 1 - luminance(source, index) / 255;
  const whiteCutoff = els.cleanWhite.checked ? Number(els.whiteCutoff.value) / 100 : 0.055;
  if (els.cleanWhite.checked && inkDensity <= whiteCutoff) return 0;
  const paperRemoved = clamp((inkDensity - whiteCutoff) / Math.max(0.1, 0.82 - whiteCutoff), 0, 1);
  return Math.pow(paperRemoved, 0.72) * sourceAlpha;
}

function applyColor() {
  if (!state.imageData) return;
  pushHistory();
  const data = state.imageData.data;
  const selectedOnly = els.selectedOnly.checked && state.selection;
  const preserveTexture = els.preserveTexture.checked;
  const textureStrength = Number(els.textureStrength.value) / 100;
  for (let i = 0; i < data.length; i += 4) {
    const px = i / 4;
    if (data[i + 3] === 0) continue;
    if (selectedOnly && !state.selection.data[px]) continue;
    data[i] = state.color.r;
    data[i + 1] = state.color.g;
    data[i + 2] = state.color.b;
    if (preserveTexture) {
      const baseAlpha = els.keepAlpha.checked ? sourceAlphaAt(i) : 1;
      const texturedAlpha = textureAlphaAt(i);
      const alpha = els.cleanWhite.checked && texturedAlpha === 0
        ? 0
        : baseAlpha * (1 - textureStrength) + texturedAlpha * textureStrength;
      data[i + 3] = Math.round(alpha * 255);
    } else if (!els.keepAlpha.checked) {
      data[i + 3] = 255;
    }
  }
  state.hasColorApplied = true;
  draw();
}

function hsvToRgb(h, s, v) {
  s /= 100;
  v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  let h = 0;
  if (diff && max === r) h = 60 * (((g - b) / diff) % 6);
  if (diff && max === g) h = 60 * ((b - r) / diff + 2);
  if (diff && max === b) h = 60 * ((r - g) / diff + 4);
  if (h < 0) h += 360;
  return {
    h: Math.round(h),
    s: max ? Math.round((diff / max) * 100) : 0,
    v: Math.round(max * 100),
  };
}

function componentToHex(value) {
  return value.toString(16).padStart(2, "0");
}

function updateColorUi(fromRgb = false) {
  if (fromRgb) {
    Object.assign(state.color, rgbToHsv(state.color.r, state.color.g, state.color.b));
  } else {
    Object.assign(state.color, hsvToRgb(state.color.h, state.color.s, state.color.v));
  }

  const hex = `#${componentToHex(state.color.r)}${componentToHex(state.color.g)}${componentToHex(state.color.b)}`;
  els.colorSwatch.style.background = hex;
  els.hexColor.value = hex;
  els.redInput.value = state.color.r;
  els.greenInput.value = state.color.g;
  els.blueInput.value = state.color.b;
  els.hueSlider.value = state.color.h;
  drawColorMap();
}

function drawColorMap() {
  const { width, height } = els.colorMap;
  const image = colorMapCtx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (x / (width - 1)) * 100;
      const v = 100 - (y / (height - 1)) * 100;
      const rgb = hsvToRgb(state.color.h, s, v);
      const p = (y * width + x) * 4;
      image.data[p] = rgb.r;
      image.data[p + 1] = rgb.g;
      image.data[p + 2] = rgb.b;
      image.data[p + 3] = 255;
    }
  }
  colorMapCtx.putImageData(image, 0, 0);
  const knobX = (state.color.s / 100) * width;
  const knobY = ((100 - state.color.v) / 100) * height;
  colorMapCtx.beginPath();
  colorMapCtx.arc(knobX, knobY, 7, 0, Math.PI * 2);
  colorMapCtx.strokeStyle = "#fff";
  colorMapCtx.lineWidth = 3;
  colorMapCtx.stroke();
  colorMapCtx.strokeStyle = "#25221f";
  colorMapCtx.lineWidth = 1;
  colorMapCtx.stroke();
}

function setColorMapFromEvent(evt) {
  const rect = els.colorMap.getBoundingClientRect();
  const x = Math.min(Math.max(0, evt.clientX - rect.left), rect.width);
  const y = Math.min(Math.max(0, evt.clientY - rect.top), rect.height);
  state.color.s = Math.round((x / rect.width) * 100);
  state.color.v = Math.round(100 - (y / rect.height) * 100);
  updateColorUi(false);
}

function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const loadCanvas = document.createElement("canvas");
    loadCanvas.width = img.naturalWidth;
    loadCanvas.height = img.naturalHeight;
    const loadCtx = loadCanvas.getContext("2d", { willReadFrequently: true });
    loadCtx.drawImage(img, 0, 0);
    state.imageData = loadCtx.getImageData(0, 0, loadCanvas.width, loadCanvas.height);
    state.originalData = new ImageData(
      new Uint8ClampedArray(state.imageData.data),
      state.imageData.width,
      state.imageData.height
    );
    state.selection = null;
    state.undo = [];
    state.redo = [];
    state.hasColorApplied = false;
    state.imageLoaded = true;
    els.emptyState.style.display = "none";
    fitImageToStage();
    draw();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

els.imageInput.addEventListener("change", (evt) => {
  const [file] = evt.target.files;
  if (file) loadImage(file);
});

els.toolButtons.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

els.viewButtons.forEach((button) => {
  button.addEventListener("click", () => setViewMode(button.dataset.view));
});

function pointerStagePosition(evt) {
  const rect = stage.getBoundingClientRect();
  return {
    stageX: evt.clientX - rect.left,
    stageY: evt.clientY - rect.top,
  };
}

function pinchInfo() {
  const points = [...state.pointers.values()];
  if (points.length < 2) return null;
  const [a, b] = points;
  const center = {
    stageX: (a.stageX + b.stageX) / 2,
    stageY: (a.stageY + b.stageY) / 2,
  };
  return {
    ...center,
    distance: Math.hypot(a.stageX - b.stageX, a.stageY - b.stageY),
    imagePoint: stageToImagePoint(center.stageX, center.stageY),
  };
}

function updatePointer(evt) {
  state.pointers.set(evt.pointerId, pointerStagePosition(evt));
}

function endPointer(evt) {
  state.pointers.delete(evt.pointerId);
  if (state.pointers.size < 2) state.pinch = null;
}

stage.addEventListener("pointerdown", (evt) => {
  if (!state.imageData) return;
  stage.setPointerCapture(evt.pointerId);
  updatePointer(evt);

  if (state.pointers.size === 2) {
    state.pinch = {
      ...pinchInfo(),
      scale: state.view.scale,
      x: state.view.x,
      y: state.view.y,
    };
    state.drawing = false;
    state.suppressDraw = true;
    return;
  }

  const point = imagePoint(evt);
  state.drawing = true;
  state.suppressDraw = false;

  if (state.tool === "pan") {
    state.panStart = { stageX: point.stageX, stageY: point.stageY, x: state.view.x, y: state.view.y };
    return;
  }

  if (state.viewMode !== "edited") {
    state.drawing = false;
    return;
  }

  pushHistory();
  if (state.tool === "magic" && inBounds(point.x, point.y)) {
    selectSimilarAt(point.x, point.y, false);
    state.drawing = false;
    return;
  }
  if (state.tool === "brush" && inBounds(point.x, point.y)) paintCircle(point.x, point.y, 1);
  if (state.tool === "eraser" && inBounds(point.x, point.y)) eraseCircle(point.x, point.y);
  if (state.tool === "restore" && inBounds(point.x, point.y)) restoreCircle(point.x, point.y);
  if (state.tool === "rect") {
    state.dragStart = point;
    state.rectPreview = { x: point.x, y: point.y, w: 0, h: 0 };
  }
  draw();
});

stage.addEventListener("pointermove", (evt) => {
  if (state.pointers.has(evt.pointerId)) updatePointer(evt);
  if (state.pinch && state.pointers.size >= 2) {
    const current = pinchInfo();
    if (!current || !state.pinch.distance) return;
    const nextScale = Math.min(6, Math.max(0.06, state.pinch.scale * (current.distance / state.pinch.distance)));
    state.view.scale = nextScale;
    state.view.x = current.stageX - state.pinch.imagePoint.x * nextScale;
    state.view.y = current.stageY - state.pinch.imagePoint.y * nextScale;
    draw();
    return;
  }

  if (!state.drawing || !state.imageData) return;
  const point = imagePoint(evt);

  if (state.tool === "pan" && state.panStart) {
    state.view.x = state.panStart.x + point.stageX - state.panStart.stageX;
    state.view.y = state.panStart.y + point.stageY - state.panStart.stageY;
    draw();
    return;
  }

  if (state.tool === "brush" && inBounds(point.x, point.y)) paintCircle(point.x, point.y, 1);
  if (state.tool === "eraser" && inBounds(point.x, point.y)) eraseCircle(point.x, point.y);
  if (state.tool === "restore" && inBounds(point.x, point.y)) restoreCircle(point.x, point.y);
  if (state.tool === "rect" && state.dragStart) {
    state.rectPreview = {
      x: state.dragStart.x,
      y: state.dragStart.y,
      w: point.x - state.dragStart.x,
      h: point.y - state.dragStart.y,
    };
  }
  draw();
});

stage.addEventListener("pointerup", (evt) => {
  endPointer(evt);
  if (state.suppressDraw) {
    state.suppressDraw = false;
    state.drawing = false;
    state.panStart = null;
    return;
  }
  if (!state.drawing || !state.imageData) return;
  const point = imagePoint(evt);
  if (state.tool === "rect" && state.dragStart) {
    selectRect(state.dragStart, point);
    state.rectPreview = null;
    state.dragStart = null;
  }
  state.drawing = false;
  state.panStart = null;
  draw();
});

stage.addEventListener("pointercancel", (evt) => {
  endPointer(evt);
  state.drawing = false;
  state.panStart = null;
  state.rectPreview = null;
  state.suppressDraw = false;
  draw();
});

stage.addEventListener("wheel", (evt) => {
  if (!state.imageData) return;
  evt.preventDefault();
  const point = imagePoint(evt);
  const oldScale = state.view.scale;
  const next = Math.min(4, Math.max(0.08, oldScale * (evt.deltaY < 0 ? 1.08 : 0.92)));
  state.view.scale = next;
  const rect = stage.getBoundingClientRect();
  state.view.x = evt.clientX - rect.left - point.x * next;
  state.view.y = evt.clientY - rect.top - point.y * next;
  draw();
}, { passive: false });

els.selectVisibleButton.addEventListener("click", selectVisible);
els.selectBackgroundButton.addEventListener("click", selectBackground);
els.removeBackgroundButton.addEventListener("click", () => {
  if (!state.imageData) return;
  pushHistory();
  selectBackground(false);
  applyAlphaToSelection(true, false);
});
els.invertSelectionButton.addEventListener("click", invertSelection);
els.clearSelectionButton.addEventListener("click", () => {
  if (!state.imageData) return;
  pushHistory();
  state.selection = null;
  draw();
});
els.deleteSelectionButton.addEventListener("click", () => applyAlphaToSelection(true));
els.keepSelectionButton.addEventListener("click", () => applyAlphaToSelection(false));
els.applyColorButton.addEventListener("click", applyColor);

els.undoButton.addEventListener("click", () => {
  if (!state.undo.length) return;
  state.redo.push(snapshotCurrent());
  restoreSnapshot(state.undo.pop());
});

els.redoButton.addEventListener("click", () => {
  if (!state.redo.length) return;
  state.undo.push(snapshotCurrent());
  restoreSnapshot(state.redo.pop());
});

els.previewBgButton.addEventListener("click", () => {
  const white = stage.classList.toggle("white-preview");
  els.previewBgButton.textContent = white ? "透明表示" : "白背景表示";
});

els.resetButton.addEventListener("click", () => {
  if (!state.originalData) return;
  pushHistory();
  state.imageData = new ImageData(
    new Uint8ClampedArray(state.originalData.data),
    state.originalData.width,
    state.originalData.height
  );
  state.selection = null;
  state.hasColorApplied = false;
  fitImageToStage();
  draw();
});

els.downloadButton.addEventListener("click", () => {
  if (!state.imageData) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = state.imageData.width;
  exportCanvas.height = state.imageData.height;
  exportCanvas.getContext("2d").putImageData(state.imageData, 0, 0);
  const link = document.createElement("a");
  link.download = "ashigata-transparent.png";
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
});

els.hueSlider.addEventListener("input", () => {
  state.color.h = Number(els.hueSlider.value);
  updateColorUi(false);
});

[els.redInput, els.greenInput, els.blueInput].forEach((input, index) => {
  input.addEventListener("input", () => {
    const keys = ["r", "g", "b"];
    state.color[keys[index]] = Math.min(255, Math.max(0, Number(input.value) || 0));
    updateColorUi(true);
  });
});

els.hexColor.addEventListener("change", () => {
  const match = els.hexColor.value.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) {
    updateColorUi(true);
    return;
  }
  const hex = match[1];
  state.color.r = parseInt(hex.slice(0, 2), 16);
  state.color.g = parseInt(hex.slice(2, 4), 16);
  state.color.b = parseInt(hex.slice(4, 6), 16);
  updateColorUi(true);
});

els.colorMap.addEventListener("pointerdown", (evt) => {
  els.colorMap.setPointerCapture(evt.pointerId);
  setColorMapFromEvent(evt);
});

els.colorMap.addEventListener("pointermove", (evt) => {
  if (evt.buttons) setColorMapFromEvent(evt);
});

window.addEventListener("resize", resizeDisplay);
resizeDisplay();
updateColorUi(true);
updateHistoryButtons();

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
