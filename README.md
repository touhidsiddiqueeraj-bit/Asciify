ASCIIFY
Video → ASCII Art Converter
Pure client-side, GPU-accelerated, no uploads.

Convert any video file or URL into a fully animated ASCII representation, rendered in real‑time and exportable as WebM (with audio), GIF (silent), or plain TXT (ASCII frame sequences).

🚀 Live preview • Trim editor • Audio visualizer (bars/wave) • Batch queue • WebGPU acceleration

✨ Features
Real‑time ASCII preview – Adjust settings while the video plays.

Full video editor – Trim, brightness/contrast/saturation, sharpen, invert, speed control.

Multiple output formats

WebM – best quality, includes audio (volume control + visualizer).

GIF – silent, larger file size, good for short clips.

TXT – export all frames as plain text characters.

Audio handling

Keep or discard original audio.

Volume control.

Real‑time spectrum bars or waveform visualizer overlaid on the ASCII output.

Batch queue – Add multiple videos, process them one after another with the same settings, download all results.

GPU acceleration

WebGPU compute shaders (fastest, if available).

Falls back to OffscreenCanvas Worker → CPU.

No server – Everything runs locally in your browser. Your videos never leave your device.

Export previews – Save a single PNG from the live preview.

🖥️ How to Use
Open the file – Just double‑click asciify_v3-3.html in any modern browser. No web server needed.

Load a video

Drag & drop a file onto the Input Source zone, or

Click the zone to browse your device, or

Paste a direct video URL (supports CORS‑enabled URLs).

Edit (optional)

Trim the clip using the timeline sliders.

Adjust brightness, contrast, saturation, sharpen.

Change character set, font, colour mode (mono/gray/RGB), background, inversion.

Configure output

Select FPS (match source or fixed).

Set character width (affects resolution).

Choose format (WebM / GIF / TXT) and quality.

Enable/disable audio, set volume, pick visualizer.

Convert – Click the CONVERT & DOWNLOAD button.

A modal shows estimated size and frame count.

After encoding, the result appears in the bottom pane (expand if collapsed).

Play, download, or re‑convert directly.

Batch processing

Add multiple files using the Batch Queue panel.

Click BATCH CONVERT ALL – each file is processed sequentially with the current settings.

Download each finished file individually, or use Download All once all are done.

💡 Tip: The live preview (bottom half) updates automatically when you change settings. Use the Refresh button to force a preview frame, or Save PNG to capture the current preview.

⚙️ Technical Details
Component	Implementation
Rendering	WebGPU compute shader (index mapping) → Canvas 2D text rendering. Fallback: OffscreenCanvas Worker → CPU.
Encoding	Two‑phase: (1) Pre‑render all frames as fast as possible, (2) replay at exact FPS using MediaRecorder.
Audio	AudioContext decode → PCM data for visualizer. Original audio track is captured via captureStream() and muxed into WebM.
Trim & Preview	HTMLVideoElement seeking + waveform canvas for visual feedback.
Batch	Sequential processing with individual progress bars, one video per iteration.
File support	Any format supported by <video> – MP4, WebM, MOV, AVI, MKV, etc.
🌐 Browser Support
WebGPU – Chrome 113+, Edge 113+, Opera 99+ (requires flags on some systems, but usually enabled by default).

Worker fallback – All modern browsers (Chrome, Firefox, Safari, Edge).

CPU fallback – Any browser with HTMLVideoElement and Canvas 2D.

📌 For best performance: Use Chrome/Edge with WebGPU enabled. The batch queue can process dozens of videos without server round‑trips.

⚠️ Limitations
GIF export does not include audio (spec limitation).

TXT export is limited to the first 300 frames to avoid huge files (configurable in the code).

WebGPU may be blocked on some systems due to driver or security policies – the tool falls back gracefully.

Audio capture for output videos requires the captureStream() API, which is supported in all modern browsers.

Trim is frame‑accurate only to the nearest video frame (depends on the source keyframes).

📁 File Structure
The entire application is a single HTML file – no external dependencies (except the Google Fonts stylesheet for UI). All logic, styles, and shaders are self‑contained.

🧪 Running Locally
bash
# Just open the file in a browser
open asciify_v3-3.html
No build step, no npm install, no server. Works offline after the first load (fonts are cached).

📜 License
Free to use, modify, and distribute.
Made for creative tinkerers, terminal lovers, and demoscene enthusiasts.

🙏 Credits
ASCII character sets inspired by classic artpacks and FIGlet fonts.

WebGPU compute shader architecture adapted from GPU‑accelerated image processing samples.

Audio visualizer uses real‑time RMS analysis of decoded PCM data.

ASCIIFY – turn pixels into culture.
Version 3.3 – The GPU‑charged encoding update.

