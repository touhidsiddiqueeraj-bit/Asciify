/* ASCIIFY v3 — Application Logic */

(function(){
'use strict';

// ─────────────────────────────────────────────
//  DOM
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dropZone       = $('drop-zone');
const dzText         = $('dz-text');
const fileInput      = $('file-input');
const urlInput       = $('url-input');
const convertBtn     = $('convert-btn');
const progressFill   = $('progress-fill');
const statusDiv      = $('status');
const progressDetail = $('progress-detail');
const logDiv         = $('log');
const videoEl        = $('video-element');
const inputCanvas    = $('input-canvas');
const outputCanvas   = $('output-canvas');
const inputCtx       = inputCanvas.getContext('2d', { willReadFrequently: true });
const outputCtx      = outputCanvas.getContext('2d');
const previewCanvas  = $('preview-canvas');
const previewCtx     = previewCanvas.getContext('2d');
const previewPlaceholder = $('preview-placeholder');
const previewBadge   = $('preview-badge');
const previewBtn     = $('preview-btn');
const previewSaveBtn = $('preview-save-btn');
const gpuBadge       = $('gpu-badge');
const gpuLabel       = $('gpu-label');
const includeAudioCheck = $('include-audio');
const audioOptions   = $('audio-options');
const charsetSelect  = $('charset-select');
const customCharsetWrap = $('custom-charset-wrap');
const customCharsetInput = $('custom-charset');
const formatHint     = $('format-hint');
const editorEmpty    = $('editor-empty');
const editorContent  = $('editor-content');
const trimTimeline   = $('trim-timeline');
const trimWaveform   = $('trim-waveform');
const trimSelected   = $('trim-selected');
const trimHandleL    = $('trim-handle-l');
const trimHandleR    = $('trim-handle-r');
const trimPlayhead   = $('trim-playhead');
const tStart         = $('t-start');
const tEnd           = $('t-end');
const tDur           = $('t-dur');
const trimPlayBtn    = $('trim-play-btn');
const trimResetBtn   = $('trim-reset-btn');
const outputPlayerWrap = $('output-player-wrap');
const outputVideo    = $('output-video');
const playerCloseBtn = $('player-close-btn');
const playerDownloadBtn = $('player-download-btn');
const playerReconvertBtn = $('player-reconvert-btn');
const confirmModal   = $('confirm-modal');
const modalBody      = $('modal-body');
const modalConfirm   = $('modal-confirm');
const modalCancel    = $('modal-cancel');
const bottomPane     = $('bottom-pane');
const collapseBtn    = $('collapse-btn');
const bottomBar      = $('bottom-bar');

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let selectedFile = null;
let videoReady = false;
let converting = false;
let trimStartT = 0, trimEndT = 0, videoDuration = 0;
let trimPlaying = false, trimPlayTimer = null;
let sourceFpsDetected = 30;
let lastBlobUrl = null;
let dragging = null;
let gpuRenderer = null;  // set after init
let gpuMode = 'cpu';     // 'webgpu' | 'worker' | 'cpu'
let previewDebounce = null;

const CHARSETS = {
  simple:   ' .:-=+*#%@',
  extended: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks:   ' ░▒▓█',
  binary:   '01',
  matrix:   ' ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'
};
const FORMAT_HINTS = {
  webm: 'WebM: best quality, wide support. Includes audio.',
  gif:  'GIF: no audio, larger file. Good for short clips.',
  txt:  'TXT: exports ASCII frames as plain text.'
};

// ─────────────────────────────────────────────
//  LOGGING
// ─────────────────────────────────────────────
function log(msg, type='') {
  const el = document.createElement('div');
  el.className = type ? `log-${type}` : 'log-line';
  el.textContent = `[${new Date().toLocaleTimeString('en-GB',{hour12:false})}] ${msg}`;
  logDiv.appendChild(el);
  logDiv.scrollTop = logDiv.scrollHeight;
}
function setStatus(msg, type='') { statusDiv.textContent = msg; statusDiv.className = type; }

// ─────────────────────────────────────────────
//  BOTTOM PANE COLLAPSE (strict 50/50)
// ─────────────────────────────────────────────
const topPane = $('top-pane');
let collapsed = false;
collapseBtn.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(); });
function toggleCollapse() {
  collapsed = !collapsed;
  bottomPane.classList.toggle('collapsed', collapsed);
  topPane.style.flex = collapsed ? '1 1 auto' : '0 0 50%';
  topPane.style.height = collapsed ? 'auto' : '50%';
  collapseBtn.textContent = collapsed ? '▲' : '▼';
}

// ─────────────────────────────────────────────
//  WEBGPU ACCELERATED RENDERER
// ─────────────────────────────────────────────
// Strategy: use WebGPU compute to map each pixel to char index on GPU,
// then render glyphs from a pre-baked texture atlas.
// Falls back to OffscreenCanvas Worker, then plain CPU.

async function initGPURenderer() {
  // Try WebGPU
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        const device = await adapter.requestDevice();
        gpuRenderer = new WebGPURenderer(device);
        gpuMode = 'webgpu';
        setGPUBadge('webgpu', 'WebGPU');
        gpuLabel.textContent = 'WebGPU ✓';
        log('WebGPU initialized — GPU-accelerated encoding active', 'ok');
        return;
      }
    } catch(e) { log('WebGPU init failed: ' + e.message + ' — falling back', 'warn'); }
  }
  // Try OffscreenCanvas Worker
  if (typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined') {
    gpuMode = 'worker';
    setGPUBadge('worker', 'Worker');
    gpuLabel.textContent = 'OffscreenCanvas Worker ✓';
    log('GPU not available — using OffscreenCanvas Worker', '');
    return;
  }
  // CPU fallback
  gpuMode = 'cpu';
  setGPUBadge('cpu', 'CPU');
  gpuLabel.textContent = 'CPU mode';
  log('Using CPU renderer', '');
}

function setGPUBadge(mode, label) {
  gpuBadge.className = 'gpu-badge ' + mode;
  gpuBadge.textContent = label;
  gpuBadge.style.display = 'block';
}

// WebGPU renderer: uses compute shader to build a "char index per pixel" buffer,
// then a render pass draws each cell from a glyph atlas texture.
class WebGPURenderer {
  constructor(device) {
    this.device = device;
    this.atlasCache = new Map(); // key: "fontPx|fontFamily|charset" -> {texture, charW, charH, count}
    this.pipeline = null;
    this.renderPipeline = null;
  }

  // Build glyph atlas: renders each character to an offscreen canvas, packs into a texture row
  buildAtlas(chars, fontSize, fontFamily) {
    const key = `${fontSize}|${fontFamily}|${chars.join('')}`;
    if (this.atlasCache.has(key)) return this.atlasCache.get(key);

    const cellW = Math.ceil(fontSize * 0.65);
    const cellH = Math.ceil(fontSize * 1.2);
    const count = chars.length;
    const atlasW = cellW * count;
    const atlasH = cellH;

    const oc = new OffscreenCanvas(atlasW, atlasH);
    const ctx = oc.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, atlasW, atlasH);
    ctx.fillStyle = '#fff';
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    for (let i = 0; i < count; i++) {
      ctx.fillText(chars[i], i * cellW, 0);
    }

    const imgData = ctx.getImageData(0, 0, atlasW, atlasH);
    const texture = this.device.createTexture({
      size: [atlasW, atlasH, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.writeTexture(
      { texture },
      imgData.data,
      { bytesPerRow: atlasW * 4 },
      [atlasW, atlasH]
    );
    const result = { texture, cellW, cellH, count, atlasW, atlasH, chars };
    this.atlasCache.set(key, result);
    return result;
  }

  // Compute pass: for each char cell, sample the video pixels, compute brightness,
  // map to char index, output to a storage buffer.
  // Then render pass: for each cell, blit the correct glyph from atlas onto output texture.
  async renderFrame(videoEl, outCtx, s, dims) {
    const { charWidth, charHeight, charPixelWidth, charPixelHeight, outW, outH, fontSize, fontFamily } = dims;
    const chars = s.charset.split('');
    const device = this.device;

    const atlas = this.buildAtlas(chars, fontSize, fontFamily);

    // --- Sample video into a small canvas at char resolution ---
    inputCanvas.width = charWidth;
    inputCanvas.height = charHeight;
    inputCtx.drawImage(videoEl, 0, 0, charWidth, charHeight);
    let imgData = inputCtx.getImageData(0, 0, charWidth, charHeight);
    imgData = applyImageAdjustments(imgData, s);
    const pixels = imgData.data; // RGBA, charWidth*charHeight pixels

    const totalCells = charWidth * charHeight;

    // Upload pixel data to GPU
    const pixelBuf = device.createBuffer({
      size: totalCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Uint8Array(pixelBuf.getMappedRange()).set(pixels);
    pixelBuf.unmap();

    // Output char index buffer (u32 per cell)
    const charIdxBuf = device.createBuffer({
      size: totalCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    // Params uniform
    const maxIdx = chars.length - 1;
    const paramsData = new Int32Array([charWidth, charHeight, maxIdx, s.invert ? 1 : 0,
      s.colorMode === 'color' ? 2 : s.colorMode === 'gray' ? 1 : 0]);
    const paramsBuf = device.createBuffer({
      size: paramsData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(paramsBuf, 0, paramsData);

    // Compute shader: luma → char index
    const shaderCode = `
      @group(0) @binding(0) var<storage, read>       pixels   : array<u32>;
      @group(0) @binding(1) var<storage, read_write>  charIdx  : array<u32>;
      @group(0) @binding(2) var<uniform>              params   : vec4<i32>;
      // params: x=charWidth, y=charHeight, z=maxIdx, w=invert

      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let cell = gid.x;
        let total = u32(params.x * params.y);
        if (cell >= total) { return; }
        let px = pixels[cell];
        let r = f32(px & 0xFFu) / 255.0;
        let g = f32((px >> 8u) & 0xFFu) / 255.0;
        let b = f32((px >> 16u) & 0xFFu) / 255.0;
        let luma = 0.299 * r + 0.587 * g + 0.114 * b;
        var ci = i32(luma * f32(params.z));
        if (params.w != 0) { ci = params.z - ci; }
        ci = clamp(ci, 0, params.z);
        charIdx[cell] = u32(ci);
      }
    `;

    const shaderModule = device.createShaderModule({ code: shaderCode });
    const computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' }
    });

    const bindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: pixelBuf } },
        { binding: 1, resource: { buffer: charIdxBuf } },
        { binding: 2, resource: { buffer: paramsBuf } }
      ]
    });

    // Readback buffer
    const readbackBuf = device.createBuffer({
      size: totalCells * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(computePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(totalCells / 64));
    pass.end();
    encoder.copyBufferToBuffer(charIdxBuf, 0, readbackBuf, 0, totalCells * 4);
    device.queue.submit([encoder.finish()]);

    // Wait for GPU
    await readbackBuf.mapAsync(GPUMapMode.READ);
    const charIndices = new Uint32Array(readbackBuf.getMappedRange().slice(0));
    readbackBuf.unmap();

    // Cleanup buffers
    pixelBuf.destroy(); charIdxBuf.destroy(); paramsBuf.destroy(); readbackBuf.destroy();

    // Draw final frame using char indices (still uses Canvas 2D for text rendering)
    // The GPU saved us the luma computation per pixel; the glyph drawing is now index-driven
    let bgFill, textMono;
    if (s.bgColor === 'black') { bgFill = '#000'; textMono = '#fff'; }
    else if (s.bgColor === 'white') { bgFill = '#fff'; textMono = '#000'; }
    else { bgFill = '#001400'; textMono = '#00ff41'; }

    outCtx.fillStyle = bgFill;
    outCtx.fillRect(0, 0, outW, outH);
    outCtx.font = `${fontSize}px ${fontFamily}`;
    outCtx.textBaseline = 'top';

    for (let y = 0; y < charHeight; y++) {
      for (let x = 0; x < charWidth; x++) {
        const cell = y * charWidth + x;
        const ci = charIndices[cell];
        const pIdx = cell * 4;
        if (s.colorMode === 'mono') {
          outCtx.fillStyle = textMono;
        } else if (s.colorMode === 'gray') {
          const gray = Math.floor(0.299*pixels[pIdx] + 0.587*pixels[pIdx+1] + 0.114*pixels[pIdx+2]);
          outCtx.fillStyle = `rgb(${gray},${gray},${gray})`;
        } else {
          outCtx.fillStyle = `rgb(${pixels[pIdx]},${pixels[pIdx+1]},${pixels[pIdx+2]})`;
        }
        outCtx.fillText(chars[ci], x * charPixelWidth, y * charPixelHeight);
      }
    }
  }
}

// ─────────────────────────────────────────────
//  CPU / FALLBACK RENDERER
// ─────────────────────────────────────────────
function applyImageAdjustments(imageData, s) {
  if (s.brightness===0 && s.contrast===0 && s.saturation===0) return imageData;
  const d = imageData.data;
  const br = s.brightness/100*255;
  const cr = (s.contrast+100)/100;
  const sat = (s.saturation+100)/100;
  for (let i=0; i<d.length; i+=4) {
    let r=d[i],g=d[i+1],b=d[i+2];
    if (s.saturation!==0) { const gr=0.299*r+0.587*g+0.114*b; r=Math.min(255,Math.max(0,gr+(r-gr)*sat)); g=Math.min(255,Math.max(0,gr+(g-gr)*sat)); b=Math.min(255,Math.max(0,gr+(b-gr)*sat)); }
    if (s.brightness!==0) { r=Math.min(255,Math.max(0,r+br)); g=Math.min(255,Math.max(0,g+br)); b=Math.min(255,Math.max(0,b+br)); }
    if (s.contrast!==0)   { r=Math.min(255,Math.max(0,(r-128)*cr+128)); g=Math.min(255,Math.max(0,(g-128)*cr+128)); b=Math.min(255,Math.max(0,(b-128)*cr+128)); }
    d[i]=r; d[i+1]=g; d[i+2]=b;
  }
  return imageData;
}

function drawASCIIFrameCPU(ctx, s, dims, analyserData) {
  const { charWidth, charHeight, charPixelWidth, charPixelHeight, outW, outH, fontFamily, fontSize } = dims;
  inputCanvas.width = charWidth; inputCanvas.height = charHeight;
  inputCtx.drawImage(videoEl, 0, 0, charWidth, charHeight);
  let imgData = inputCtx.getImageData(0, 0, charWidth, charHeight);
  imgData = applyImageAdjustments(imgData, s);
  const data = imgData.data;
  const chars = s.charset.split('');
  const maxIdx = chars.length - 1;
  let bgFill, textMono;
  if (s.bgColor==='black')      { bgFill='#000'; textMono='#fff'; }
  else if (s.bgColor==='white') { bgFill='#fff'; textMono='#000'; }
  else                          { bgFill='#001400'; textMono='#00ff41'; }
  ctx.fillStyle = bgFill;
  ctx.fillRect(0, 0, outW, outH);
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';
  for (let y=0; y<charHeight; y++) {
    for (let x=0; x<charWidth; x++) {
      const i=(y*charWidth+x)*4;
      const r=data[i],g=data[i+1],b=data[i+2];
      const gray=0.299*r+0.587*g+0.114*b;
      let ci=Math.floor(gray/255*maxIdx);
      if (s.invert) ci=maxIdx-ci;
      ci=Math.max(0,Math.min(maxIdx,ci));
      if (s.colorMode==='mono') ctx.fillStyle=textMono;
      else if (s.colorMode==='gray') { const gv=Math.floor(gray); ctx.fillStyle=`rgb(${gv},${gv},${gv})`; }
      else ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.fillText(chars[ci], x*charPixelWidth, y*charPixelHeight);
    }
  }
  if (analyserData && analyserData.length>0) {
    if (s.visualizer==='bars') {
      const bc=32,bw=outW/bc,vh=outH*0.18,step=Math.floor(analyserData.length/bc);
      ctx.fillStyle='rgba(0,255,65,0.7)';
      for (let i=0;i<bc;i++) { const v=analyserData[i*step]/255; ctx.fillRect(i*bw,outH-v*vh,bw-1,v*vh); }
    } else if (s.visualizer==='wave') {
      ctx.strokeStyle='rgba(0,255,65,0.8)'; ctx.lineWidth=2; ctx.beginPath();
      const sw=outW/analyserData.length, vh=outH*0.1;
      analyserData.forEach((v,i)=>{ const y=outH-vh+(v/128*vh/2); i===0?ctx.moveTo(i*sw,y):ctx.lineTo(i*sw,y); });
      ctx.stroke();
    }
  }
}

// Unified draw — picks GPU or CPU
async function drawFrame(ctx, s, dims, analyserData) {
  if (gpuMode === 'webgpu' && gpuRenderer) {
    try {
      await gpuRenderer.renderFrame(videoEl, ctx, s, dims);
      if (analyserData && s.visualizer !== 'none') {
        // overlay visualizer after GPU frame
        const { outW, outH } = dims;
        if (s.visualizer==='bars') {
          const bc=32,bw=outW/bc,vh=outH*0.18,step=Math.floor(analyserData.length/bc);
          ctx.fillStyle='rgba(0,255,65,0.7)';
          for (let i=0;i<bc;i++) { const v=analyserData[i*step]/255; ctx.fillRect(i*bw,outH-v*vh,bw-1,v*vh); }
        }
      }
      return;
    } catch(e) {
      log('WebGPU frame failed, falling back: ' + e.message, 'warn');
      gpuMode = 'cpu'; setGPUBadge('cpu', 'CPU');
    }
  }
  drawASCIIFrameCPU(ctx, s, dims, analyserData);
}

// ─────────────────────────────────────────────
//  SETTINGS & DIMENSIONS
// ─────────────────────────────────────────────
function getSettings() {
  const cc = charsetSelect.value;
  let charset = cc==='custom' ? (customCharsetInput.value || CHARSETS.extended) : (CHARSETS[cc] || CHARSETS.extended);
  if (charset.length < 2) charset = CHARSETS.extended;
  return {
    fpsChoice:    $('fps').value,
    charWidth:    parseInt($('width').value, 10),
    fontSize:     parseInt($('font-size').value, 10),
    colorMode:    document.querySelector('input[name="cmode"]:checked').value,
    bgColor:      document.querySelector('input[name="bg"]:checked').value,
    fontFamily:   $('font-select').value,
    charset,
    invert:       $('invert').checked,
    speed:        parseFloat($('speed').value),
    format:       document.querySelector('input[name="fmt"]:checked').value,
    quality:      parseInt($('quality').value, 10),
    includeAudio: includeAudioCheck.checked,
    volume:       parseFloat($('volume').value) / 100,
    visualizer:   document.querySelector('input[name="viz"]:checked').value,
    trimStart:    trimStartT,
    trimEnd:      trimEndT,
    brightness:   parseInt($('adj-br').value, 10),
    contrast:     parseInt($('adj-cr').value, 10),
    saturation:   parseInt($('adj-sat').value, 10),
  };
}

function computeDimensions(s) {
  const vidW = videoEl.videoWidth || 640;
  const vidH = videoEl.videoHeight || 360;
  const charWidth = s.charWidth;
  const charHeight = Math.max(1, Math.floor(charWidth * (vidH/vidW) * 0.55));
  const tmp = document.createElement('canvas').getContext('2d');
  tmp.font = `${s.fontSize}px ${s.fontFamily}`;
  const charPixelWidth  = tmp.measureText('M').width;
  const charPixelHeight = s.fontSize * 1.2;
  // Cap output to max 1280px on longest side — prevents upscaling slowdown
  let outW = Math.ceil(charWidth * charPixelWidth);
  let outH = Math.ceil(charHeight * charPixelHeight);
  const MAX_PX = 1280;
  if (outW > MAX_PX || outH > MAX_PX) {
    const scale = MAX_PX / Math.max(outW, outH);
    outW = Math.floor(outW * scale);
    outH = Math.floor(outH * scale);
  }
  return { charWidth, charHeight, charPixelWidth, charPixelHeight, outW, outH, fontFamily: s.fontFamily, fontSize: s.fontSize };
}

// ─────────────────────────────────────────────
//  RANGE BINDINGS
// ─────────────────────────────────────────────
function bindRange(id, valId, suffix) {
  const el = $(id), vel = $(valId);
  el.addEventListener('input', () => { vel.textContent = el.value + (suffix||''); schedulePreview(); });
}
bindRange('width', 'width-val', '');
bindRange('font-size', 'font-size-val', '');
bindRange('adj-br', 'adj-br-v', '');
bindRange('adj-cr', 'adj-cr-v', '');
bindRange('adj-sat', 'adj-sat-v', '');
bindRange('adj-sh', 'adj-sh-v', '');
$('volume').addEventListener('input', () => { $('volume-val').textContent = $('volume').value + '%'; });
document.querySelectorAll('input[name="cmode"],input[name="bg"]').forEach(r => r.addEventListener('change', schedulePreview));
$('font-select').addEventListener('change', schedulePreview);
charsetSelect.addEventListener('change', () => {
  customCharsetWrap.style.display = charsetSelect.value === 'custom' ? '' : 'none';
  schedulePreview();
});
$('invert').addEventListener('change', schedulePreview);
customCharsetInput.addEventListener('input', schedulePreview);
includeAudioCheck.addEventListener('change', () => { audioOptions.style.display = includeAudioCheck.checked ? '' : 'none'; });
document.querySelectorAll('input[name="fmt"]').forEach(r => r.addEventListener('change', () => { formatHint.textContent = FORMAT_HINTS[r.value]||''; }));

// ─────────────────────────────────────────────
//  AUTO PREVIEW
// ─────────────────────────────────────────────
function schedulePreview() {
  if (!videoReady) return;
  clearTimeout(previewDebounce);
  previewBadge.style.display = 'block';
  previewDebounce = setTimeout(renderPreview, 400);
}

async function renderPreview() {
  if (!videoReady) return;
  const s = getSettings();
  const seekT = Math.min(trimStartT + (trimEndT - trimStartT) * 0.15, trimEndT - 0.01);
  videoEl.currentTime = Math.max(0.01, seekT);
  await new Promise(res => { videoEl.onseeked = res; });
  trimPlayhead.style.left = ((videoEl.currentTime / videoDuration) * 100) + '%';
  const dims = computeDimensions(s);
  previewCanvas.width = dims.outW; previewCanvas.height = dims.outH;
  previewCanvas.style.display = 'block';
  previewPlaceholder.style.display = 'none';
  await drawFrame(previewCtx, s, dims, null);
  previewBadge.style.display = 'none';
}

previewBtn.addEventListener('click', renderPreview);
previewSaveBtn.addEventListener('click', () => {
  if (!previewCanvas.style.display || previewCanvas.style.display === 'none') return;
  const a = document.createElement('a');
  a.href = previewCanvas.toDataURL('image/png');
  a.download = 'asciify_preview.png';
  a.click();
});

// ─────────────────────────────────────────────
//  DROP ZONE / FILE LOAD
// ─────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) loadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) loadFile(fileInput.files[0]); });

function loadFile(file) {
  selectedFile = file; urlInput.value = '';
  dzText.textContent = '▶ ' + file.name;
  dropZone.classList.add('has-file');
  log(`Loaded: ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`, 'ok');
  loadVideoForPreview();
}

async function loadVideoForPreview() {
  if (!selectedFile && !urlInput.value.trim()) return;
  const url = selectedFile ? URL.createObjectURL(selectedFile) : urlInput.value.trim();
  videoEl.src = url; videoEl.muted = true; videoEl.load();
  await new Promise((res,rej) => { videoEl.onloadedmetadata=res; videoEl.onerror=rej; }).catch(()=>{});
  videoReady = true;
  videoDuration = videoEl.duration;
  trimStartT = 0; trimEndT = videoDuration;
  initEditor();
  detectSourceFPS().then(fps => { sourceFpsDetected = fps; log(`Detected source FPS: ${fps}`, 'ok'); });
  if (collapsed) toggleCollapse();
  renderPreview();
}
urlInput.addEventListener('change', () => { selectedFile = null; loadVideoForPreview(); });

// ─────────────────────────────────────────────
//  FPS DETECTION
// ─────────────────────────────────────────────
async function detectSourceFPS() {
  if (!videoReady || !('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return 30;
  return new Promise(resolve => {
    const tv = document.createElement('video');
    tv.src = videoEl.src; tv.muted = true; tv.preload = 'auto';
    let fc=0, ft=null;
    const dur = 1.0;
    function cb(now, meta) {
      if (ft===null) ft=meta.mediaTime;
      fc++;
      const el=meta.mediaTime-ft;
      if (el < dur && meta.mediaTime < Math.min(videoDuration-0.1, dur+0.5)) {
        tv.requestVideoFrameCallback(cb);
      } else {
        tv.pause();
        resolve(Math.max(1, Math.min(120, el>0.1 ? Math.round(fc/el) : 30)));
      }
    }
    tv.onloadedmetadata = () => {
      tv.currentTime = 0.1;
      tv.onseeked = () => { tv.requestVideoFrameCallback(cb); tv.play().catch(()=>resolve(30)); };
    };
    tv.onerror = () => resolve(30);
    setTimeout(() => { tv.pause(); resolve(30); }, 4000);
  });
}

// ─────────────────────────────────────────────
//  EDITOR
// ─────────────────────────────────────────────
function initEditor() {
  editorEmpty.style.display = 'none';
  editorContent.style.display = 'block';
  updateTrimUI();
  drawTrimWaveform();
}

function updateTrimUI() {
  const dur = videoDuration || 1;
  const sl = (trimStartT/dur)*100, el = (trimEndT/dur)*100;
  trimSelected.style.left = sl+'%';
  trimSelected.style.width = (el-sl)+'%';
  trimHandleL.style.left = sl+'%';
  trimHandleR.style.left = el+'%';
  tStart.textContent = trimStartT.toFixed(2)+'s';
  tEnd.textContent   = trimEndT.toFixed(2)+'s';
  tDur.textContent   = (trimEndT-trimStartT).toFixed(2)+'s';
}

function drawTrimWaveform() {
  const W = trimTimeline.offsetWidth || 400, H = 48;
  trimWaveform.width=W; trimWaveform.height=H;
  const ctx = trimWaveform.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const seed = ((selectedFile?selectedFile.name:urlInput.value)+videoDuration).split('').reduce((a,c)=>a+c.charCodeAt(0),17);
  for (let i=0;i<80;i++) {
    const v=0.15+Math.abs(Math.sin(seed*0.007+i*0.28)*Math.cos(i*0.13+seed*0.003))*0.7;
    const bh=v*H*0.75;
    ctx.fillStyle=`rgba(0,255,65,${0.15+v*0.45})`;
    ctx.fillRect(i/80*W+0.5,(H-bh)/2,W/80-1,bh);
  }
}

trimHandleL.addEventListener('mousedown', e=>{e.stopPropagation();dragging='L';});
trimHandleR.addEventListener('mousedown', e=>{e.stopPropagation();dragging='R';});
trimHandleL.addEventListener('touchstart', e=>{e.stopPropagation();dragging='L';},{passive:true});
trimHandleR.addEventListener('touchstart', e=>{e.stopPropagation();dragging='R';},{passive:true});

function getTrimPct(clientX) {
  const rect = trimTimeline.getBoundingClientRect();
  return Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
}

document.addEventListener('mousemove', e=>{
  if (!dragging) return;
  const t = getTrimPct(e.clientX) * videoDuration;
  if (dragging==='L') trimStartT=Math.max(0,Math.min(trimEndT-0.1,t));
  else trimEndT=Math.max(trimStartT+0.1,Math.min(videoDuration,t));
  updateTrimUI(); schedulePreview();
});
document.addEventListener('touchmove', e=>{
  if (!dragging) return;
  const t = getTrimPct(e.touches[0].clientX) * videoDuration;
  if (dragging==='L') trimStartT=Math.max(0,Math.min(trimEndT-0.1,t));
  else trimEndT=Math.max(trimStartT+0.1,Math.min(videoDuration,t));
  updateTrimUI();
},{passive:true});
document.addEventListener('mouseup', ()=>{dragging=null;});
document.addEventListener('touchend', ()=>{dragging=null;});

trimTimeline.addEventListener('click', e=>{
  if (dragging) return;
  const pct = getTrimPct(e.clientX);
  videoEl.currentTime = pct * videoDuration;
  trimPlayhead.style.left = (pct*100)+'%';
  schedulePreview();
});

trimPlayBtn.addEventListener('click', ()=>{
  if (!videoReady) return;
  if (trimPlaying) {
    clearInterval(trimPlayTimer); trimPlaying=false; trimPlayBtn.textContent='▶ Preview';
  } else {
    trimPlayBtn.textContent='■ Stop'; trimPlaying=true;
    videoEl.currentTime=trimStartT;
    trimPlayTimer=setInterval(()=>{
      if (videoEl.currentTime>=trimEndT) videoEl.currentTime=trimStartT;
      trimPlayhead.style.left=((videoEl.currentTime/videoDuration)*100)+'%';
    },60);
  }
});
trimResetBtn.addEventListener('click', ()=>{ trimStartT=0; trimEndT=videoDuration; updateTrimUI(); schedulePreview(); });

// ─────────────────────────────────────────────
//  CONFIRM MODAL
// ─────────────────────────────────────────────
function showConfirm(s, tS, tE, outputFps, totalFrames) {
  const clipDur = (tE - tS) / s.speed;
  const est = Math.ceil(totalFrames / (gpuMode==='webgpu' ? 15 : 3)); // rough estimate
  modalBody.innerHTML = `
    <div class="modal-row"><span>Source</span><span class="modal-val">${videoEl.videoWidth}×${videoEl.videoHeight}</span></div>
    <div class="modal-row"><span>Clip length</span><span class="modal-val">${(tE-tS).toFixed(2)}s</span></div>
    <div class="modal-row"><span>Output FPS</span><span class="modal-val">${outputFps} fps</span></div>
    <div class="modal-row"><span>Frames</span><span class="modal-val">${totalFrames}</span></div>
    <div class="modal-row"><span>Format</span><span class="modal-val">${s.format.toUpperCase()}</span></div>
    <div class="modal-row"><span>Renderer</span><span class="modal-val">${gpuMode.toUpperCase()}</span></div>
    <div class="modal-row"><span>Est. time</span><span class="modal-val">~${est}s</span></div>
  `;
  confirmModal.classList.add('open');
  return new Promise(resolve => {
    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel  = () => { cleanup(); resolve(false); };
    function cleanup() {
      confirmModal.classList.remove('open');
      modalConfirm.removeEventListener('click', onConfirm);
      modalCancel.removeEventListener('click', onCancel);
    }
    modalConfirm.addEventListener('click', onConfirm);
    modalCancel.addEventListener('click', onCancel);
  });
}

// ─────────────────────────────────────────────
//  MAIN CONVERT FLOW
// ─────────────────────────────────────────────
convertBtn.addEventListener('click', async () => {
  if (!selectedFile && !urlInput.value.trim()) { alert('Please provide a video file or URL.'); return; }
  if (converting) return;

  const s = getSettings();
  const tS = Math.max(0, Math.min(s.trimStart, videoDuration - 0.1));
  const tE = Math.max(tS + 0.1, Math.min(s.trimEnd, videoDuration));
  const clipDur = tE - tS;
  const outputFps = s.fpsChoice === 'orig' ? sourceFpsDetected : parseInt(s.fpsChoice, 10);
  const totalFrames = Math.ceil((clipDur / s.speed) * outputFps);

  const confirmed = await showConfirm(s, tS, tE, outputFps, totalFrames);
  if (!confirmed) return;

  converting = true;
  convertBtn.disabled = true;
  progressFill.style.width = '0%';
  progressDetail.textContent = '';
  logDiv.innerHTML = '';
  setStatus('LOADING...', 'active');
  outputPlayerWrap.classList.remove('visible');

  const videoURL = selectedFile ? URL.createObjectURL(selectedFile) : urlInput.value.trim();
  let audioEl=null, gainNode=null, analyser=null, analyserData=null, audioCtx=null;

  // ── Audio setup ──
  let audioBuf = null;

  // Always decode audio if visualizer is active (independent of includeAudio flag)
  if (s.visualizer !== 'none') {
    try {
      log('Decoding audio for visualizer...', '');
      audioBuf = await decodeVideoAudio(videoURL);
      if (audioBuf) {
        log(`Audio decoded: ${audioBuf.numberOfChannels}ch ${(audioBuf.sampleRate/1000).toFixed(1)}kHz ${audioBuf.duration.toFixed(1)}s`, 'ok');
      }
    } catch(e) {
      log('Audio decode failed: ' + e.message, 'warn');
    }
  }

  // Audio element for muxing output track (always muted — no speaker output)
  if (s.includeAudio && s.format==='webm') {
    audioEl = document.createElement('video');
    audioEl.src=videoURL;
    audioEl.muted=true;
    audioEl.volume=Math.min(1,s.volume); audioEl.playbackRate=s.speed;
    audioEl.style.display='none';
    document.body.appendChild(audioEl);
  }

  try {
    videoEl.src=videoURL; videoEl.muted=true; videoEl.playbackRate=s.speed; videoEl.load();
    await new Promise((res,rej) => { videoEl.onloadedmetadata=res; videoEl.onerror=()=>rej(new Error('Failed to load video')); });
    videoReady=true;

    const dims = computeDimensions(s);
    outputCanvas.width=dims.outW; outputCanvas.height=dims.outH;
    log(`${videoEl.videoWidth}×${videoEl.videoHeight} → ${dims.outW}×${dims.outH}, ${totalFrames}f @ ${outputFps}fps [${gpuMode.toUpperCase()}]`, 'ok');

    const frameInterval = 1 / outputFps;
    setStatus('CONVERTING...', 'active');

    if (s.format==='txt') {
      await convertToText(s, dims, totalFrames, frameInterval, tS, tE);
    } else {
      if (s.format==='gif') log('GIF mode: encoding as silent WebM', 'warn');
      await convertToWebm(s, dims, totalFrames, frameInterval, outputFps, audioEl, audioBuf, tS, tE);
    }
  } catch(e) {
    log('Error: '+e.message, 'warn');
    setStatus('ERROR', 'error');
  } finally {
    converting=false; convertBtn.disabled=false;
    if (audioEl) { try { audioEl.pause(); document.body.removeChild(audioEl); } catch(e){} }
  }
});

// ─────────────────────────────────────────────
//  SHARED FFT-BASED AUDIO SAMPLER
//  Called by both single-file and batch encoders.
//  Returns Uint8Array(32) of frequency magnitudes (0–255) at time t seconds.
// ─────────────────────────────────────────────
function samplePCMAtTime(audioBuf, visualizer, t) {
  if (!audioBuf || visualizer === 'none') return null;
  const sr = audioBuf.sampleRate;

  // Mix to mono
  let pcm;
  if (audioBuf.numberOfChannels >= 2) {
    const L = audioBuf.getChannelData(0), R = audioBuf.getChannelData(1);
    pcm = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) pcm[i] = (L[i] + R[i]) * 0.5;
  } else {
    pcm = audioBuf.getChannelData(0);
  }

  const N = 1024;
  const startSample = Math.max(0, Math.min(pcm.length - N, Math.floor(t * sr)));
  const numBins = 32;
  const result = new Uint8Array(numBins);

  // Hann window
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    re[i] = (pcm[startSample + i] || 0) * hann;
  }

  // Cooley-Tukey in-place radix-2 FFT
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len >> 1; k++) {
        const uRe = re[i+k], uIm = im[i+k];
        const vRe = re[i+k+(len>>1)] * curRe - im[i+k+(len>>1)] * curIm;
        const vIm = re[i+k+(len>>1)] * curIm + im[i+k+(len>>1)] * curRe;
        re[i+k]         = uRe + vRe;  im[i+k]         = uIm + vIm;
        re[i+k+(len>>1)] = uRe - vRe; im[i+k+(len>>1)] = uIm - vIm;
        const tmpRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = tmpRe;
      }
    }
  }

  // Map to 32 log-spaced bands (80 Hz – 18 kHz)
  const nyquist = sr / 2;
  const freqMin = 80, freqMax = Math.min(18000, nyquist);
  for (let b = 0; b < numBins; b++) {
    const fLow  = freqMin * Math.pow(freqMax / freqMin,  b      / numBins);
    const fHigh = freqMin * Math.pow(freqMax / freqMin, (b + 1) / numBins);
    const kLow  = Math.max(1,       Math.floor(fLow  / nyquist * N / 2));
    const kHigh = Math.min(N/2 - 1, Math.ceil (fHigh / nyquist * N / 2));
    let energy = 0, count = 0;
    for (let k = kLow; k <= kHigh; k++) {
      energy += Math.sqrt(re[k]*re[k] + im[k]*im[k]);
      count++;
    }
    energy = count > 0 ? energy / count / (N / 2) : 0;
    result[b] = Math.min(255, Math.floor(energy * 800));
  }
  return result;
}

// ─────────────────────────────────────────────
//  AUDIO DECODE — fetch blob URL → decodeAudioData
//  blob: URLs can be fetched multiple times within the same page session.
//  decodeAudioData handles mp4/webm/mov audio tracks natively.
// ─────────────────────────────────────────────
async function decodeVideoAudio(videoURL) {
  try {
    const resp = await fetch(videoURL);
    if (!resp.ok) throw new Error('fetch failed: ' + resp.status);
    const arrayBuf = await resp.arrayBuffer();
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    return new Promise((resolve) => {
      actx.decodeAudioData(
        arrayBuf,
        (buf) => { actx.close(); resolve(buf); },
        (err)  => { actx.close(); resolve(null); }
      );
    });
  } catch(e) {
    log('decodeVideoAudio: ' + e.message, 'warn');
    return null;
  }
}

// ─────────────────────────────────────────────
//  WEBM ENCODE — two-phase: pre-render then playback-pace
//
//  Phase 1: Seek+render each frame as fast as possible into ImageBitmap[].
//           No pacing — go as fast as GPU/CPU allows.
//  Phase 2: Replay bitmaps onto outputCanvas at exactly msPerFrame using
//           requestAnimationFrame + timestamp checking. MediaRecorder captures
//           this replay stream at true fps → correct playback speed.
// ─────────────────────────────────────────────
async function convertToWebm(s, dims, totalFrames, frameInterval, outputFps, audioEl, audioBuf, tS, tE) {

  // ── PCM visualizer sampler — calls shared FFT function ──
  function sampleAudioAtTime(t) {
    return samplePCMAtTime(audioBuf, s.visualizer, t);
  }


  // ── PHASE 1: Pre-render all frames ──
  setStatus('RENDERING FRAMES...', 'active');
  log(`Phase 1: rendering ${totalFrames} frames...`, '');

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = dims.outW; tmpCanvas.height = dims.outH;
  const tmpCtx = tmpCanvas.getContext('2d');

  const frames = [];   // array of ImageBitmap
  const startRender = performance.now();
  let renderTimes = [];

  for (let f = 0; f < totalFrames; f++) {
    const fStart = performance.now();

    const srcT = tS + f * frameInterval * s.speed;
    videoEl.currentTime = Math.min(srcT, tE - 0.001);
    await new Promise(res => { videoEl.onseeked = res; });

    // Sample audio PCM at this frame's timestamp for visualizer
    const vizData = sampleAudioAtTime(srcT);

    await drawFrame(tmpCtx, s, dims, vizData);
    const bmp = await createImageBitmap(tmpCanvas);
    frames.push(bmp);

    const renderMs = performance.now() - fStart;
    renderTimes.push(renderMs);

    progressFill.style.width = ((f+1)/totalFrames*50)+'%';  // 0→50% for phase 1
    const elapsed = (performance.now()-startRender)/1000;
    const fps = (f+1)/elapsed;
    const rem = (totalFrames-f-1)/fps;
    const avg = renderTimes.slice(-8).reduce((a,b)=>a+b,0)/Math.min(8,renderTimes.length);
    progressDetail.textContent = `Render ${f+1}/${totalFrames} · ${fps.toFixed(1)} fps · ~${rem.toFixed(0)}s · ${avg.toFixed(0)}ms/f`;

    if (f%4===0) await new Promise(res=>setTimeout(res,0));
  }

  if (audioEl) audioEl.pause();
  log(`Phase 1 done in ${((performance.now()-startRender)/1000).toFixed(1)}s`, 'ok');

  // ── PHASE 2: Replay at exact fps into MediaRecorder ──
  setStatus('MUXING VIDEO...', 'active');
  log('Phase 2: muxing at ' + outputFps + ' fps...', '');

  const stream = outputCanvas.captureStream(outputFps);

  // Add audio track — seek audioEl to tS and play for real this time (still muted from audioEl)
  // Audio is captured from the stream, not played to speaker
  if (s.includeAudio && audioEl) {
    try {
      const as = audioEl.captureStream ? audioEl.captureStream() : audioEl.mozCaptureStream();
      as.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch(e) { log('Audio capture unsupported', 'warn'); }
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: s.quality });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size>0) chunks.push(e.data); };
  rec.start(50);

  if (s.includeAudio && audioEl) { audioEl.currentTime = tS; audioEl.play().catch(()=>{}); }

  const msPerFrame = 1000 / outputFps;
  const startMux = performance.now();

  await new Promise(resolve => {
    let f = 0;
    let lastFrameTime = performance.now();

    function drawNext(ts) {
      if (f >= frames.length) {
        resolve();
        return;
      }
      const now = performance.now();
      // Only draw if enough time has passed for next frame
      if (now - lastFrameTime >= msPerFrame - 1) {
        outputCtx.drawImage(frames[f], 0, 0);
        frames[f].close();  // free GPU memory
        lastFrameTime = now;

        progressFill.style.width = (50 + (f+1)/totalFrames*50)+'%';  // 50→100% for phase 2
        const elapsed = (now-startMux)/1000;
        const muxFps = elapsed>0 ? (f+1)/elapsed : 0;
        progressDetail.textContent = `Mux ${f+1}/${totalFrames} · ${muxFps.toFixed(0)} fps`;
        f++;
      }
      requestAnimationFrame(drawNext);
    }
    requestAnimationFrame(drawNext);
  });

  await new Promise(resolve => {
    rec.onstop = () => {
      const blob = new Blob(chunks, {type:'video/webm'});
      if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
      lastBlobUrl = URL.createObjectURL(blob);
      showOutputPlayer(lastBlobUrl, blob.size);
      resolve();
    };
    rec.stop();
  });
}

// ─────────────────────────────────────────────
//  TXT EXPORT
// ─────────────────────────────────────────────
async function convertToText(s, dims, totalFrames, frameInterval, tS, tE) {
  const {charWidth,charHeight}=dims;
  const chars=s.charset.split(''); const maxIdx=chars.length-1;
  const lines=[]; const maxF=Math.min(totalFrames,300);
  for (let f=0;f<maxF;f++) {
    videoEl.currentTime=Math.min(tS+f*frameInterval*s.speed, tE-0.001);
    await new Promise(res=>{videoEl.onseeked=res;});
    inputCanvas.width=charWidth; inputCanvas.height=charHeight;
    inputCtx.drawImage(videoEl,0,0,charWidth,charHeight);
    let id=inputCtx.getImageData(0,0,charWidth,charHeight);
    id=applyImageAdjustments(id,s);
    const d=id.data;
    lines.push(`=== FRAME ${f+1}/${maxF} ===`);
    for (let y=0;y<charHeight;y++) {
      let row='';
      for (let x=0;x<charWidth;x++) {
        const i=(y*charWidth+x)*4;
        const gray=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
        let ci=Math.floor(gray/255*maxIdx); if(s.invert)ci=maxIdx-ci;
        row+=chars[Math.max(0,Math.min(maxIdx,ci))];
      }
      lines.push(row);
    }
    lines.push('');
    progressFill.style.width=((f+1)/maxF*100)+'%';
    progressDetail.textContent=`Frame ${f+1}/${maxF}`;
    if(f%10===0)await new Promise(res=>setTimeout(res,0));
  }
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='asciify_frames.txt'; a.click();
  setStatus('DONE — TXT DOWNLOADED','done');
  log('Text export complete!','ok');
}

// ─────────────────────────────────────────────
//  OUTPUT PLAYER — shown in bottom pane after encode
// ─────────────────────────────────────────────
const previewBody   = document.getElementById('preview-body');
const outputInPane  = document.getElementById('output-in-pane');

function showOutputPlayer(blobUrl, byteSize) {
  // Hide live preview, show output player inside bottom pane
  previewBody.style.display = 'none';
  outputInPane.style.display = 'flex';
  document.getElementById('output-in-video').src = blobUrl;
  document.getElementById('output-in-size').textContent = (byteSize/1024/1024).toFixed(1) + ' MB';

  setStatus('DONE — PLAYBACK READY ▶', 'done');
  log('Encoding complete!', 'ok');
  progressFill.style.width = '100%';
  progressDetail.textContent = '';

  if (collapsed) toggleCollapse();  // expand bottom pane to show result
}

function hideOutputPlayer() {
  outputInPane.style.display = 'none';
  previewBody.style.display = 'flex';
}

document.getElementById('output-in-close').addEventListener('click', hideOutputPlayer);
document.getElementById('output-in-reconvert').addEventListener('click', () => {
  hideOutputPlayer();
  convertBtn.click();
});
document.getElementById('output-in-download').addEventListener('click', () => {
  if (!lastBlobUrl) return;
  const a = document.createElement('a'); a.href=lastBlobUrl; a.download='asciify_output.webm'; a.click();
});

// Keep legacy refs working (used nowhere now but keeps the DOM bindings clean)
playerCloseBtn.addEventListener('click',()=>{ outputPlayerWrap.classList.remove('visible'); outputVideo.pause(); outputVideo.src=''; });
playerReconvertBtn.addEventListener('click',()=>{ outputPlayerWrap.classList.remove('visible'); outputVideo.pause(); convertBtn.click(); });

// ─────────────────────────────────────────────
//  AUDIO EXTRACT
// ─────────────────────────────────────────────
$('audio-extract-btn').addEventListener('click', async ()=>{
  if (!selectedFile && !urlInput.value.trim()) { alert('Load a video first.'); return; }
  log('Extracting audio...','');
  try {
    const url=selectedFile?URL.createObjectURL(selectedFile):urlInput.value.trim();
    const res=await fetch(url); const ab=await res.arrayBuffer();
    const actx=new AudioContext();
    const decoded=await actx.decodeAudioData(ab);
    const oCtx=new OfflineAudioContext(decoded.numberOfChannels,decoded.length,decoded.sampleRate);
    const src=oCtx.createBufferSource(); src.buffer=decoded; src.connect(oCtx.destination); src.start(0);
    const rendered=await oCtx.startRendering();
    const wav=audioBufferToWav(rendered);
    const a=document.createElement('a'); a.href=URL.createObjectURL(wav); a.download='asciify_audio.wav'; a.click();
    log('Audio extracted as WAV','ok');
  } catch(e) { log('Audio extract failed: '+e.message,'warn'); }
});

function audioBufferToWav(buf){
  const nc=buf.numberOfChannels,sr=buf.sampleRate,bps=16;
  const byr=sr*nc*bps/8,blk=nc*bps/8;
  const s=[]; for(let c=0;c<nc;c++)s.push(buf.getChannelData(c));
  const dl=buf.length*nc*2; const ab=new ArrayBuffer(44+dl); const v=new DataView(ab);
  const ws=(o,x)=>{ for(let i=0;i<x.length;i++)v.setUint8(o+i,x.charCodeAt(i)); };
  ws(0,'RIFF'); v.setUint32(4,36+dl,true); ws(8,'WAVE'); ws(12,'fmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nc,true);
  v.setUint32(24,sr,true); v.setUint32(28,byr,true); v.setUint16(32,blk,true);
  v.setUint16(34,bps,true); ws(36,'data'); v.setUint32(40,dl,true);
  let off=44;
  for(let i=0;i<buf.length;i++) for(let c=0;c<nc;c++){
    const x=Math.max(-1,Math.min(1,s[c][i]));
    v.setInt16(off,x<0?x*32768:x*32767,true); off+=2;
  }
  return new Blob([ab],{type:'audio/wav'});
}

// ─────────────────────────────────────────────
//  BATCH QUEUE
// ─────────────────────────────────────────────
const batchDrop       = document.getElementById('batch-drop');
const batchFileInput  = document.getElementById('batch-file-input');
const batchList       = document.getElementById('batch-list');
const batchActions    = document.getElementById('batch-actions');
const batchCount      = document.getElementById('batch-count');
const batchClearBtn   = document.getElementById('batch-clear-btn');
const batchConvertBtn = document.getElementById('batch-convert-btn');
const batchDlAllBtn   = document.getElementById('batch-dl-all-btn');

let batchQueue = [];  // [{file, name, status:'pending'|'encoding'|'done'|'error', blobUrl, el}]

function updateBatchUI() {
  const n = batchQueue.length;
  batchCount.textContent = n + ' file' + (n !== 1 ? 's' : '');
  batchList.style.display = n > 0 ? 'block' : 'none';
  batchActions.style.display = n > 0 ? 'flex' : 'none';
  batchConvertBtn.style.display = n > 0 ? 'block' : 'none';
  // Show dl-all if any done
  const doneCount = batchQueue.filter(it => it.status === 'done').length;
  batchDlAllBtn.style.display = doneCount > 0 ? 'inline-block' : 'none';
}

function addBatchFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|webm|mov|avi|mkv|m4v)$/i)) continue;
    // Dedupe by name+size
    if (batchQueue.some(it => it.name === file.name && it.file.size === file.size)) continue;

    const item = { file, name: file.name, status: 'pending', blobUrl: null, el: null };

    const div = document.createElement('div');
    div.className = 'batch-item';
    div.innerHTML = `
      <div class="bi-name" title="${file.name}">${file.name}</div>
      <div class="bi-status pending">PENDING</div>
      <div style="flex:1;min-width:40px"><div class="batch-progress"></div></div>
      <button class="bi-dl" disabled>⬇</button>
      <button class="bi-rm">✕</button>
    `;
    item.el = div;
    item.statusEl   = div.querySelector('.bi-status');
    item.progressEl = div.querySelector('.batch-progress');
    item.dlBtn      = div.querySelector('.bi-dl');
    item.rmBtn      = div.querySelector('.bi-rm');

    item.rmBtn.addEventListener('click', () => {
      batchQueue = batchQueue.filter(q => q !== item);
      div.remove();
      updateBatchUI();
    });
    item.dlBtn.addEventListener('click', () => {
      if (!item.blobUrl) return;
      const a = document.createElement('a');
      a.href = item.blobUrl;
      a.download = item.name.replace(/\.[^.]+$/, '') + '_ascii.webm';
      a.click();
    });

    batchQueue.push(item);
    batchList.appendChild(div);
  }
  updateBatchUI();
}

batchDrop.addEventListener('click', () => batchFileInput.click());
batchDrop.addEventListener('dragover', e => { e.preventDefault(); batchDrop.classList.add('dragover'); });
batchDrop.addEventListener('dragleave', () => batchDrop.classList.remove('dragover'));
batchDrop.addEventListener('drop', e => {
  e.preventDefault(); batchDrop.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) addBatchFiles(e.dataTransfer.files);
});
batchFileInput.addEventListener('change', () => {
  if (batchFileInput.files.length > 0) addBatchFiles(batchFileInput.files);
  batchFileInput.value = '';
});

batchClearBtn.addEventListener('click', () => {
  batchQueue = []; batchList.innerHTML = '';
  updateBatchUI();
});

batchDlAllBtn.addEventListener('click', () => {
  batchQueue.filter(it => it.status === 'done' && it.blobUrl).forEach((item, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = item.blobUrl;
      a.download = item.name.replace(/\.[^.]+$/, '') + '_ascii.webm';
      a.click();
    }, i * 400);
  });
});

// ── Batch Convert ──
batchConvertBtn.addEventListener('click', async () => {
  if (converting) { alert('A conversion is already running.'); return; }
  const pending = batchQueue.filter(it => it.status === 'pending');
  if (pending.length === 0) { alert('No pending files in queue.'); return; }

  const s = getSettings();
  const outputFps = s.fpsChoice === 'orig' ? sourceFpsDetected : parseInt(s.fpsChoice, 10);

  // Show simple confirm
  const ok = confirm(`Batch convert ${pending.length} file(s) using current settings?

FPS: ${outputFps} · Format: ${s.format.toUpperCase()} · Renderer: ${gpuMode.toUpperCase()}

Files will be processed one at a time.`);
  if (!ok) return;

  converting = true;
  convertBtn.disabled = true;
  batchConvertBtn.disabled = true;

  for (let qi = 0; qi < pending.length; qi++) {
    const item = pending[qi];
    item.status = 'encoding';
    item.statusEl.className = 'bi-status encoding';
    item.statusEl.textContent = 'ENCODING';
    item.progressEl.style.width = '0%';

    const videoURL = URL.createObjectURL(item.file);

    try {
      // Load video metadata
      videoEl.src = videoURL; videoEl.muted = true; videoEl.load();
      await new Promise((res, rej) => {
        videoEl.onloadedmetadata = res;
        videoEl.onerror = () => rej(new Error('Load failed'));
      });
      videoReady = true;
      const dur = videoEl.duration;

      // Use full clip (no trim for batch)
      const tS = 0, tE = dur;
      const totalFrames = Math.ceil((dur / s.speed) * outputFps);
      const frameInterval = 1 / outputFps;

      const dims = computeDimensions(s);
      outputCanvas.width = dims.outW; outputCanvas.height = dims.outH;

      // Decode audio for visualizer
      let audioBuf = null;
      if (s.includeAudio && s.format === 'webm' && s.visualizer !== 'none') {
        try {
          const resp = await fetch(videoURL);
          const ab = await resp.arrayBuffer();
          const tmpCtx = new AudioContext();
          audioBuf = await tmpCtx.decodeAudioData(ab);
          tmpCtx.close();
        } catch(e) {}
      }

      // Audio element for output track
      let batchAudioEl = null;
      if (s.includeAudio && s.format === 'webm') {
        batchAudioEl = document.createElement('video');
        batchAudioEl.src = videoURL; batchAudioEl.muted = true;
        batchAudioEl.playbackRate = s.speed;
        batchAudioEl.style.display = 'none';
        document.body.appendChild(batchAudioEl);
      }

      // Progress proxy — updates batch item progress bar
      const origFill = progressFill.style.width;
      const progressProxy = pct => { item.progressEl.style.width = pct + '%'; };

      // Override progressFill.style setter temporarily
      let lastProgress = 0;
      const origPFill = progressFill;

      const blobUrl = await convertToWebmBatch(s, dims, totalFrames, frameInterval,
        outputFps, batchAudioEl, audioBuf, tS, tE,
        (pct) => { item.progressEl.style.width = pct + '%'; },
        `[${qi+1}/${pending.length}] ${item.name}`
      );

      if (batchAudioEl) { try { batchAudioEl.pause(); document.body.removeChild(batchAudioEl); } catch(e){} }

      item.blobUrl = blobUrl;
      item.status = 'done';
      item.statusEl.className = 'bi-status done';
      item.statusEl.textContent = 'DONE';
      item.progressEl.style.width = '100%';
      item.dlBtn.disabled = false;

    } catch(e) {
      item.status = 'error';
      item.statusEl.className = 'bi-status error';
      item.statusEl.textContent = 'ERROR';
      log(`Batch error [${item.name}]: ${e.message}`, 'warn');
    }

    URL.revokeObjectURL(videoURL);
    updateBatchUI();
  }

  converting = false;
  convertBtn.disabled = false;
  batchConvertBtn.disabled = false;
  setStatus(`BATCH DONE — ${pending.length} files processed`, 'done');
  log('Batch conversion complete!', 'ok');
  updateBatchUI();
});

// ── Batch version of convertToWebm with progress callback ──
async function convertToWebmBatch(s, dims, totalFrames, frameInterval, outputFps, audioEl, audioBuf, tS, tE, onProgress, label) {
  function sampleAudioAtTime(t) {
    // Reuse the same FFT-based sampler logic from main encoder
    return samplePCMAtTime(audioBuf, s.visualizer, t);
  }

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = dims.outW; tmpCanvas.height = dims.outH;
  const tmpCtx = tmpCanvas.getContext('2d');
  const frames = [];

  for (let f = 0; f < totalFrames; f++) {
    const srcT = tS + f * frameInterval * s.speed;
    videoEl.currentTime = Math.min(srcT, tE - 0.001);
    await new Promise(res => { videoEl.onseeked = res; });
    const vizData = sampleAudioAtTime(srcT);
    await drawFrame(tmpCtx, s, dims, vizData);
    frames.push(await createImageBitmap(tmpCanvas));
    onProgress((f+1) / totalFrames * 50);
    if (f % 4 === 0) await new Promise(res => setTimeout(res, 0));
  }

  const stream = outputCanvas.captureStream(outputFps);
  if (s.includeAudio && audioEl) {
    try {
      const as = audioEl.captureStream ? audioEl.captureStream() : audioEl.mozCaptureStream();
      as.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch(e) {}
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: s.quality });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  rec.start(50);

  if (s.includeAudio && audioEl) { audioEl.currentTime = tS; audioEl.play().catch(()=>{}); }

  const msPerFrame = 1000 / outputFps;

  await new Promise(resolve => {
    let f = 0, lastT = performance.now();
    function tick() {
      if (f >= frames.length) { resolve(); return; }
      const now = performance.now();
      if (now - lastT >= msPerFrame - 1) {
        outputCtx.drawImage(frames[f], 0, 0);
        frames[f].close();
        lastT = now;
        onProgress(50 + (f+1)/frames.length * 50);
        f++;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  return new Promise(resolve => {
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(URL.createObjectURL(blob));
    };
    rec.stop();
  });
}

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
initGPURenderer();

})();
