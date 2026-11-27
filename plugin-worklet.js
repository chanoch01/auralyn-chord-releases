/*
 * The sound of your own plugin, on the page's audio thread.
 *
 * The plugin runs in the plugin host, a program beside the app. This asks it
 * for sound a little ahead of what is being played and plays what comes back.
 * It is handed a channel that goes straight to the desktop side, so the sound
 * does not wait on the page.
 *
 * Messages on the node's own port: { port } (the channel), { reset: true }
 * (a plugin was loaded or let go: drop what is waiting).
 */
const RING = 32768; // frames kept at most (a power of two)
const AHEAD = 1280; // frames to have in hand: about 27 ms at 48 kHz
const ASK = 256; // frames asked for at a time (the host's block)

class PluginSound extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = new Float32Array(RING);
    this.right = new Float32Array(RING);
    this.read = 0;
    this.write = 0;
    this.asked = 0; // frames asked for and not yet here
    this.line = null;
    this.starved = 0;
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.reset) {
        this.read = this.write = 0;
        this.asked = 0;
      }
      if (m.port) {
        this.line = m.port;
        this.asked = 0;
        this.line.onmessage = (ev) => this.take(ev.data);
      }
    };
  }

  take(buffer) {
    if (!(buffer instanceof ArrayBuffer)) return;
    const f = new Float32Array(buffer);
    const frames = f.length >> 1;
    this.asked = Math.max(0, this.asked - frames);
    for (let i = 0; i < frames; i++) {
      // Full: the oldest sound is dropped rather than the newest.
      if (this.write - this.read >= RING) this.read++;
      const at = this.write & (RING - 1);
      this.left[at] = f[2 * i];
      this.right[at] = f[2 * i + 1];
      this.write++;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] || out[0];
    const n = l.length;
    const have = this.write - this.read;
    const give = Math.min(n, have);
    for (let i = 0; i < give; i++) {
      const at = (this.read + i) & (RING - 1);
      l[i] = this.left[at];
      r[i] = this.right[at];
    }
    this.read += give;
    if (give < n && this.line && have > 0) this.starved++;
    if (this.line) {
      // Requests that were never answered (the host was busy or replaced) are forgotten after a while.
      if (this.asked > AHEAD * 4) this.asked = 0;
      let short = AHEAD - (this.write - this.read) - this.asked;
      while (short > 0) {
        this.line.postMessage(ASK);
        this.asked += ASK;
        short -= ASK;
      }
    }
    return true;
  }
}

registerProcessor('auralyn-plugin-sound', PluginSound);
