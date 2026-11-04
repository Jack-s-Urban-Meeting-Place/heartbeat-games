// ============================================================================
// sensor.js: connects to a Polar Verity Sense and streams its accelerometer.
// This is the proven connection code. Change it rarely and carefully.
// Nothing in here touches the page; it reports through the handlers it's given.
// ============================================================================

// ============================================================================
// Polar Measurement Data (PMD) protocol, from Polar's SDK documentation
// ============================================================================
const PMD_SERVICE = "fb005c80-02e7-f387-1cad-8acd2d8df0c8";
const PMD_CONTROL = "fb005c81-02e7-f387-1cad-8acd2d8df0c8";
const PMD_DATA    = "fb005c82-02e7-f387-1cad-8acd2d8df0c8";
const ACC = 2, SDK_MODE = 9;
const CMD_GET_SETTINGS = 1, CMD_START = 2, CMD_STOP = 3, CMD_GET_FULL_SETTINGS = 4;
const SETTING_SIZES = { 0: 2, 1: 2, 2: 2, 3: 4, 4: 1, 5: 4, 6: 16, 7: 1, 8: 1, 9: 2, 10: 4, 11: 4, 12: 1 };
const SETTING_NAMES = { 0: "sample rate", 1: "resolution", 2: "range", 4: "channels", 5: "factor" };
const STATUS_NAMES = ["success", "invalid op code", "invalid measurement type", "not supported", "invalid length",
  "invalid parameter", "already running", "invalid resolution", "invalid sample rate", "invalid range",
  "invalid MTU", "invalid number of channels", "invalid state", "device in charger"];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bytesOf = (dataView) => new Uint8Array(dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength));
const unsignedLE = (b) => b.reduce((value, byte, i) => value + byte * 2 ** (8 * i), 0);
const normalise = (v) => { const m = Math.hypot(...v) || 1; return v.map((x) => x / m); };
const multiply = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const transpose = (A) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));

// Proven helpers, shared with the single-sensor pages
function readSignedLE(bytes, offset, size) {
  let value = 0;
  for (let i = 0; i < size; i++) value |= bytes[offset + i] << (8 * i);
  const bits = size * 8;
  if (bits < 32 && (value & (1 << (bits - 1)))) value -= 2 ** bits;
  return value;
}

function parseDeltaFrames(bytes, channels, resolution) {
  const refSize = Math.ceil(resolution / 8);
  let offset = 0, last = [];
  for (let c = 0; c < channels; c++) { last.push(readSignedLE(bytes, offset, refSize)); offset += refSize; }
  const samples = [last];
  while (offset + 1 < bytes.length) {
    const width = bytes[offset++], count = bytes[offset++];
    let bit = 0;
    for (let s = 0; s < count; s++) {
      const next = [];
      for (let c = 0; c < channels; c++) {
        let delta = 0;
        for (let i = 0; i < width; i++, bit++) delta |= ((bytes[offset + (bit >> 3)] >> (bit & 7)) & 1) << i;
        if (width > 0 && (delta & (1 << (width - 1)))) delta -= 2 ** width;
        next.push(last[c] + delta);
      }
      samples.push(next);
      last = next;
    }
    offset += Math.ceil((width * count * channels) / 8);
  }
  return samples;
}

function parseSettings(bytes) {
  const out = {};
  let offset = 0;
  while (offset + 1 < bytes.length) {
    const type = bytes[offset++], count = bytes[offset++], size = SETTING_SIZES[type];
    if (size === undefined) break;
    out[type] = [];
    for (let i = 0; i < count; i++) { out[type].push(bytes.slice(offset, offset + size)); offset += size; }
  }
  return out;
}

function describeSettings(settings) {
  return Object.keys(settings).filter((t) => t !== "5")
    .map((t) => (SETTING_NAMES[t] || "type " + t) + " " + settings[t].map(unsignedLE).join("/"))
    .join(", ");
}

function chooseSettings(available, preferredRate = 52) {
  const pick = (type, preferred, fallback) => {
    const values = (available[type] || []).map(unsignedLE);
    if (!values.length) return null;
    return values.includes(preferred) ? preferred : fallback(values);
  };
  const chosen = [
    [0, pick(0, preferredRate, (v) => v.reduce((a, b) => Math.abs(b - preferredRate) < Math.abs(a - preferredRate) ? b : a))],
    [1, pick(1, 16, (v) => Math.max(...v))],     // resolution (bits)
    [2, pick(2, 8, (v) => Math.max(...v))],      // range (G)
    [4, pick(4, 3, (v) => Math.max(...v))]       // channels
  ].filter(([, value]) => value !== null);
  const bytes = [];
  for (const [type, value] of chosen) {
    bytes.push(type, 1);
    for (let i = 0; i < SETTING_SIZES[type]; i++) bytes.push((value >> (8 * i)) & 0xFF);
  }
  const rateEntry = chosen.find(([t]) => t === 0);
  return { bytes, summary: chosen.map(([t, v]) => SETTING_NAMES[t] + " " + v).join(", "), rate: rateEntry ? rateEntry[1] : 52 };
}

function rotationBetween(a, b) {               // rotation matrix taking unit vector a onto unit vector b
  const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c < -0.9999) return [[1, 0, 0], [0, -1, 0], [0, 0, -1]];   // upside down: flip about X
  const k = 1 / (1 + c);
  return [
    [v[0] * v[0] * k + c,    v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1]],
    [v[1] * v[0] * k + v[2], v[1] * v[1] * k + c,    v[1] * v[2] * k - v[0]],
    [v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c]
  ];
}

// Every Bluetooth step gets a time limit, so a step that never answers counts
// as a failed attempt (and is retried) instead of waiting forever.
function withTimeout(promise, seconds, what) {
  let timer;
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(what + " didn't answer within " + seconds + " seconds.")), seconds * 1000);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

// Turns one motion packet into [x, y, z] samples in milli-G (or null if it isn't motion).
function decodeAccFrame(b, factor) {
  if (b.length < 10 || (b[0] & 0x3F) !== ACC) return null;
  const frameType = b[9] & 0x7F, compressed = (b[9] & 0x80) !== 0, content = b.subarray(10);
  if (compressed) {
    const scale = frameType === 0 ? factor * 1000 : factor;
    return parseDeltaFrames(content, 3, 16).map((s) => s.map((v) => v * scale));
  }
  const size = frameType === 0 ? 1 : frameType === 1 ? 2 : 3, samples = [];
  for (let o = 0; o + 3 * size <= content.length; o += 3 * size) {
    samples.push([readSignedLE(content, o, size), readSignedLE(content, o + size, size), readSignedLE(content, o + 2 * size, size)]);
  }
  return samples;
}

// ============================================================================
// PolarSensor: one connection to one sensor. Each player gets their own.
// The page supplies handlers: log, status, waitForSettle, samples, started, disconnected.
// ============================================================================
class PolarSensor {
  constructor(id, handlers) {
    this.id = id; this.h = handlers;
    this.device = null; this.controlPoint = null; this.pending = null; this.hrWaiter = null;
    this.connecting = false; this.sdkMode = false; this.factor = 1; this.rate = 52;
  }

  // Must be called straight from a click: Chrome only opens its picker for a user action.
  async connect(rate) {
    if (!navigator.bluetooth) throw new Error("This browser can't use Bluetooth. Open the page in Chrome or Edge.");
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ name: "Polar Sense " + this.id }],
      optionalServices: ["heart_rate", PMD_SERVICE]
    });
    this.h.log("Selected " + this.device.name + ".");
    this.h.stage("pairing");
    this.device.ongattserverdisconnected = () => this.onDisconnected();
    this.connecting = true;
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          await this.setUp(rate);
          return;
        } catch (err) {
          this.h.log("Attempt " + attempt + " failed: " + err.name + ": " + err.message, true);
          if (this.device.gatt.connected) this.device.gatt.disconnect();
          // After pairing has happened, starting over would restart the popups, so stop.
          if (err.afterHeartRate || attempt >= 3) throw err;
          await wait(1000 * attempt);
        }
      }
    } finally {
      this.connecting = false;
    }
  }

  async setUp(rate) {
    this.h.log("Connecting…");
    this.h.status("Connecting. If Windows asks to pair, select Allow.");
    if (this.h.detail) this.h.detail("bluetooth");
    const server = await withTimeout(this.device.gatt.connect(), 30, "Connecting");
    // A heart rate reading only arrives once Windows pairing has gone through.
    if (this.h.detail) this.h.detail("heartrate");
    const hrService = await withTimeout(server.getPrimaryService("heart_rate"), 20, "Finding the heart rate service");
    const hrChar = await withTimeout(hrService.getCharacteristic("heart_rate_measurement"), 20, "Finding the heart rate data");
    // If the sensor was left in fast mode it sends no heart rate, so don't wait forever.
    const firstReading = new Promise((resolve) => {
      this.hrWaiter = resolve;
      setTimeout(() => { if (this.hrWaiter === resolve) { this.hrWaiter = null; resolve(false); } }, 25000);
    });
    hrChar.oncharacteristicvaluechanged = () => {
      if (this.hrWaiter) { const resolve = this.hrWaiter; this.hrWaiter = null; resolve(true); }
    };
    // This is the step that makes Windows pair, so allow as long as pairing takes.
    if (this.h.detail) this.h.detail("pairing");
    await withTimeout(hrChar.startNotifications(), 120, "Starting heart rate (pairing)");
    if (this.h.detail) this.h.detail("firstreading");
    if (await firstReading) this.h.log("Paired. Giving Windows time to finish before starting fast motion…");
    else this.h.log("No heart rate arrived (the sensor may still be in fast mode from last time). Trying motion anyway…", true);
    if (this.h.detail) this.h.detail("settling");
    await this.h.waitForSettle(150);
    this.h.stage("starting");
    try {
      await this.startMotion(server, rate);
    } catch (err) {
      err.afterHeartRate = true;
      throw err;
    }
  }

  async startMotion(server, rate) {
    if (!this.device.gatt.connected) throw new Error("The sensor disconnected while waiting for pairing.");
    this.h.log("Opening Polar's measurement service…");
    if (this.h.detail) this.h.detail("motionservice");
    const pmd = await withTimeout(server.getPrimaryService(PMD_SERVICE), 20, "Opening the motion service");
    this.controlPoint = await withTimeout(pmd.getCharacteristic(PMD_CONTROL), 20, "Finding the motion controls");
    const dataChar = await withTimeout(pmd.getCharacteristic(PMD_DATA), 20, "Finding the motion data");
    this.controlPoint.oncharacteristicvaluechanged = (e) => this.onControlPoint(e);
    await withTimeout(this.controlPoint.startNotifications(), 20, "Starting the motion controls");
    dataChar.oncharacteristicvaluechanged = (e) => {
      const samples = decodeAccFrame(bytesOf(e.target.value), this.factor);
      if (samples && samples.length) this.h.samples(samples);
    };
    await withTimeout(dataChar.startNotifications(), 20, "Starting the motion data");
    if (this.h.detail) this.h.detail("fastmode");

    try { await this.sendCommand([CMD_STOP, ACC]); } catch (err) { /* nothing was running */ }
    this.h.log("Switching to fast motion mode (SDK mode)…");
    try { await this.sendCommand([CMD_START, SDK_MODE]); }
    catch (err) { if (err.status !== 6) throw err; this.h.log("It was already in fast motion mode."); }
    this.sdkMode = true;
    if (this.h.detail) this.h.detail("streaming");
    await this.startAcc(rate);
  }

  async startAcc(rate) {
    let response;
    try { response = await this.sendCommand([CMD_GET_FULL_SETTINGS, ACC]); }
    catch (err) { response = await this.sendCommand([CMD_GET_SETTINGS, ACC]); }
    const { bytes, summary, rate: chosen } = chooseSettings(parseSettings(response.params), rate);
    let started;
    try { started = await this.sendCommand([CMD_START, ACC, ...bytes]); }
    catch (err) {
      if (err.status !== 6) throw err;
      await this.sendCommand([CMD_STOP, ACC]);
      started = await this.sendCommand([CMD_START, ACC, ...bytes]);
    }
    const settings = parseSettings(started.params);
    this.factor = settings[5] ? new DataView(settings[5][0].buffer).getFloat32(0, true) : 1;
    this.rate = chosen;
    this.h.log("Streaming motion (" + summary + ").");
    this.h.started(chosen);
  }

  // Reconnects to the same sensor after a drop, without Chrome's picker, so it
  // needs no click. Windows will usually ask to pair again (the launcher handles it).
  async reconnect(rate) {
    if (!this.device) throw new Error("No sensor to reconnect to.");
    this.connecting = true;
    this.sdkMode = false;
    try {
      await this.setUp(rate);
    } catch (err) {
      if (this.device.gatt.connected) this.device.gatt.disconnect();
      throw err;
    } finally {
      this.connecting = false;
    }
  }

  async changeRate(rate) {
    if (!this.sdkMode || !this.device || !this.device.gatt.connected) return;
    this.h.log("Changing to " + rate + " Hz…");
    await this.sendCommand([CMD_STOP, ACC]);
    await this.startAcc(rate);
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected && this.controlPoint && this.sdkMode) {
      this.h.log("Switching back to normal mode…");
      try { await this.sendCommand([CMD_STOP, ACC]); } catch (err) {}
      try { await this.sendCommand([CMD_STOP, SDK_MODE]); this.sdkMode = false; this.h.log("Back in normal mode; heart rate is on again."); }
      catch (err) { this.h.log("Couldn't switch back: " + err.message + " Turn the sensor off and on to reset it.", true); }
    }
    if (this.device && this.device.gatt.connected) this.device.gatt.disconnect();
  }

  onDisconnected() {
    this.h.log("Connection closed.", !this.connecting);
    if (this.connecting) return;
    this.sdkMode = false;
    this.h.disconnected();
  }

  onControlPoint(event) {
    const d = bytesOf(event.target.value);
    if (d[0] !== 0xF0) return;
    const response = { status: d[3], params: d.length > 5 ? d.slice(5) : new Uint8Array() };
    if (this.pending) { const resolve = this.pending; this.pending = null; resolve(response); }
  }

  async sendCommand(bytes) {
    const answer = new Promise((resolve, reject) => {
      this.pending = resolve;
      setTimeout(() => { if (this.pending === resolve) { this.pending = null; reject(new Error("The sensor didn't answer in time.")); } }, 6000);
    });
    const data = new Uint8Array(bytes);
    const write = this.controlPoint.writeValueWithResponse ? this.controlPoint.writeValueWithResponse(data) : this.controlPoint.writeValue(data);
    await withTimeout(write, 10, "Sending a command to the sensor");
    const response = await answer;
    if (response.status !== 0) {
      const err = new Error("The sensor refused the request (" + (STATUS_NAMES[response.status] || "error " + response.status) + ").");
      err.status = response.status;
      throw err;
    }
    return response;
  }
}
