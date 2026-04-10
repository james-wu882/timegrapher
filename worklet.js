// Retomb — AudioWorklet processor
// Runs in its own thread. Collects microphone samples and streams
// them to the main thread in chunks for beat detection.

class TGProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._held = [];
    this._total = 0;
    this._CHUNK = 2048; // send to main thread every 2048 samples (~46ms)
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch || ch.length === 0) return true;

    for (let i = 0; i < ch.length; i++) {
      this._held.push(ch[i]);
    }
    this._total += ch.length;

    while (this._held.length >= this._CHUNK) {
      const chunk = new Float32Array(this._CHUNK);
      for (let i = 0; i < this._CHUNK; i++) chunk[i] = this._held[i];
      this._held.splice(0, this._CHUNK);
      this.port.postMessage({ chunk, total: this._total });
    }

    return true;
  }
}

registerProcessor('tg-processor', TGProcessor);
