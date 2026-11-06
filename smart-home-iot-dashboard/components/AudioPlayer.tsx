"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Music2, Pause, Play, Square, Volume2, Wifi } from "lucide-react";

const API = process.env.NEXT_PUBLIC_HAVEN_API_URL || "http://127.0.0.1:8000";
const WS_URL = API.replace(/^http/, "ws") + "/audio/stream";
const SAMPLE_RATE = 44100;
const PACKET_BYTES = 1200; // 300 stereo frames; divisible by 4.

type Mode = "file" | "microphone";

export default function AudioPlayer() {
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [connected, setConnected] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("Checking speaker configuration...");
  const [volume, setVolume] = useState(80);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const pendingRef = useRef<Uint8Array>(new Uint8Array(0));
  const stoppedRef = useRef(false);

  useEffect(() => {
    fetch(`${API}/audio/status`, { cache: "no-store" })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error("Could not read audio status.");
        if (data.configured) {
          setTarget(`${data.target_ip}:${data.target_port}`);
          setStatus("Speaker target configured");
        } else {
          setStatus("ESP32 IP not configured");
          setError("Set ESP32_AUDIO_IP in backend/.env using the IP printed in the ESP32 Serial Monitor.");
        }
      })
      .catch(() => setStatus("Backend unavailable"));
    return () => { void stopPlayback(false); };
  }, []);

  function floatToPCM(left: Float32Array, right: Float32Array) {
    const output = new Int16Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      const gain = volume / 100;
      const l = Math.max(-1, Math.min(1, left[i] * gain));
      const r = Math.max(-1, Math.min(1, right[i] * gain));
      output[i * 2] = l < 0 ? l * 32768 : l * 32767;
      output[i * 2 + 1] = r < 0 ? r * 32768 : r * 32767;
    }
    return new Uint8Array(output.buffer);
  }

  function sendPCM(bytes: Uint8Array) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const merged = new Uint8Array(pendingRef.current.length + bytes.length);
    merged.set(pendingRef.current);
    merged.set(bytes, pendingRef.current.length);

    let offset = 0;
    while (offset + PACKET_BYTES <= merged.length) {
      // Avoid unbounded browser memory growth on a slow network.
      if (ws.bufferedAmount > 256 * 1024) {
        setError("Network is congested. Audio transmission paused to avoid buffering.");
        break;
      }
      ws.send(merged.slice(offset, offset + PACKET_BYTES));
      offset += PACKET_BYTES;
    }
    pendingRef.current = merged.slice(offset);
  }

  async function connectSocket() {
    setError("");
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Audio connection timed out.")), 8000);
      ws.onmessage = event => {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          if (message.type === "ready") {
            window.clearTimeout(timeout);
            setConnected(true);
            setStatus(`Connected to ${message.target}`);
            resolve();
          } else if (message.type === "error") {
            setError(message.message);
          }
        }
      };
      ws.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Could not connect to the Haven audio backend."));
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stoppedRef.current) setStatus("Audio connection closed");
      };
    });
  }

  async function ensureAudioContext() {
    let context = contextRef.current;
    if (!context) {
      context = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = context;
    }
    if (context.state === "suspended") await context.resume();
    if (context.sampleRate !== SAMPLE_RATE) {
      throw new Error(`Browser audio context is ${context.sampleRate} Hz; 44100 Hz is required.`);
    }
    return context;
  }

  async function startFile() {
    if (!file) {
      setError("Choose an audio file first.");
      return;
    }
    try {
      stoppedRef.current = false;
      pendingRef.current = new Uint8Array(0);
      await connectSocket();
      const context = await ensureAudioContext();
      const data = await file.arrayBuffer();
      const buffer = await context.decodeAudioData(data);
      const source = context.createBufferSource();
      const processor = context.createScriptProcessor(1024, 2, 2);
      const silent = context.createGain();
      silent.gain.value = 0;

      source.buffer = buffer;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);

      processor.onaudioprocess = event => {
        if (stoppedRef.current) return;
        const input = event.inputBuffer;
        const left = input.getChannelData(0);
        const right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;
        sendPCM(floatToPCM(left, right));
      };
      source.onended = () => {
        if (!stoppedRef.current) {
          setPlaying(false);
          setStatus("File playback finished");
          wsRef.current?.send("stop");
          wsRef.current?.close();
          setConnected(false);
        }
      };

      sourceRef.current = source;
      processorRef.current = processor;
      source.start();
      setPlaying(true);
      setStatus(`Streaming ${file.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not play this file.");
      await stopPlayback();
    }
  }

  async function startMicrophone() {
    try {
      stoppedRef.current = false;
      pendingRef.current = new Uint8Array(0);
      await connectSocket();
      const context = await ensureAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 2, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      micRef.current = stream;
      const input = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(1024, 2, 2);
      const silent = context.createGain();
      silent.gain.value = 0;
      input.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);

      processor.onaudioprocess = event => {
        if (stoppedRef.current) return;
        const left = event.inputBuffer.getChannelData(0);
        const right = event.inputBuffer.numberOfChannels > 1
          ? event.inputBuffer.getChannelData(1) : left;
        sendPCM(floatToPCM(left, right));
      };
      processorRef.current = processor;
      setPlaying(true);
      setStatus("Live microphone streaming");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone could not start.");
      await stopPlayback();
    }
  }

  async function stopPlayback(showStatus = true) {
    stoppedRef.current = true;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    micRef.current?.getTracks().forEach(track => track.stop());
    micRef.current = null;
    wsRef.current?.send("stop");
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setPlaying(false);
    pendingRef.current = new Uint8Array(0);
    if (showStatus) setStatus("Playback stopped");
  }

  const start = () => mode === "file" ? void startFile() : void startMicrophone();

  return (
    <div className="page-body">
      <div className="hero-row">
        <div>
          <p className="eyebrow">AUDIO SYSTEM</p>
          <h2>Wi-Fi speaker</h2>
          <p className="muted">Stream audio from this browser to your ESP32 and MAX98357A speaker.</p>
        </div>
        <span className="armed-badge"><i />{connected ? "Streaming" : "Standby"}</span>
      </div>

      <section className="panel p-6 max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="entry-icon"><SpeakerIcon /></span>
            <div><h3 className="font-semibold">Haven Speaker</h3><p className="text-sm text-gray-500">{target || "ESP32 target not configured"}</p></div>
          </div>
          <span className={`text-xs font-medium ${connected ? "text-green-600" : "text-gray-500"}`}><Wifi size={15} className="inline mr-1" />{connected ? "Connected" : "Not streaming"}</span>
        </div>

        <div className="mt-6 flex gap-2">
          <button className={`secondary-button ${mode === "file" ? "ring-2 ring-orange-300" : ""}`} onClick={() => { void stopPlayback(false); setMode("file"); }}> <Music2 size={16} /> Audio file</button>
          <button className={`secondary-button ${mode === "microphone" ? "ring-2 ring-orange-300" : ""}`} onClick={() => { void stopPlayback(false); setMode("microphone"); }}> <Mic size={16} /> Microphone</button>
        </div>

        {mode === "file" ? (
          <div className="mt-5">
            <label className="block text-sm font-medium mb-2">Choose audio file</label>
            <input type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg" onChange={e => { setFile(e.target.files?.[0] || null); setError(""); }} />
            {file && <p className="mt-2 text-sm text-gray-500">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            Microphone access is requested only after you press Start. Use headphones or keep the speaker volume low to prevent acoustic feedback.
          </div>
        )}

        <div className="mt-6">
          <label className="flex items-center gap-3 text-sm"><Volume2 size={17} /> Output level <strong>{volume}%</strong></label>
          <input className="w-full mt-2" type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))} />
          <p className="text-xs text-gray-500 mt-1">Volume control is currently a browser-side control; hardware volume scaling can be added in the ESP32 firmware.</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {!playing ? (
            <button className="primary-button" onClick={start}><Play size={16} /> Start streaming</button>
          ) : (
            <button className="secondary-button" onClick={() => void stopPlayback()}><Square size={16} /> Stop</button>
          )}
        </div>
        <p className="mt-4 text-sm text-gray-600">{status}</p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </section>
      <p className="privacy-note">Audio is processed in the browser and forwarded through your local Haven backend. No audio recording is saved by this component.</p>
    </div>
  );
}

function SpeakerIcon() {
  return <Music2 size={22} />;
}
