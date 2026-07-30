import bipValideUrl from "../assets/sounds/Bip_Valide.wav";

let audioCtx: AudioContext | null = null;
let addProductAudio: HTMLAudioElement | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

function getAddProductAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  addProductAudio ??= new Audio(bipValideUrl);
  addProductAudio.preload = "auto";
  return addProductAudio;
}

function playTone(
  frequencyHz: number,
  durationMs: number,
  opts?: { volume?: number; type?: OscillatorType; delayMs?: number },
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const volume = opts?.volume ?? 0.14;
  const type = opts?.type ?? "sine";
  const delaySec = (opts?.delayMs ?? 0) / 1000;
  const durationSec = durationMs / 1000;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequencyHz;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const start = ctx.currentTime + delaySec;
  const end = start + durationSec;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.start(start);
  osc.stop(end + 0.02);
}

/** Bip succès — produit ajouté au panier (`Bip_Valide.wav`). */
export function playAddProductBeep(): void {
  const audio = getAddProductAudio();
  if (audio) {
    audio.currentTime = 0;
    void audio.play().catch(() => {
      playTone(920, 55, { volume: 0.1 });
    });
    return;
  }
  playTone(920, 55, { volume: 0.1 });
}

/** Bip grave — échec d'ajout (poids manquant, code inconnu, etc.). */
export function playAddProductErrorBeep(): void {
  playTone(280, 90, { volume: 0.12, type: "square" });
  playTone(220, 110, { volume: 0.1, type: "square", delayMs: 120 });
}
