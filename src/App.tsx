import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Heart,
  Info,
  LockKeyhole,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Wind,
  X,
} from "lucide-react";
import {
  Brand,
  DownloadButton,
  Modal,
  PrompterControls,
  ScriptView,
  SimulationPanel,
  Sparkline,
  Telemetry,
} from "./components";
import { CameraConnection } from "./camera";
import {
  clamp,
  decidePace,
  DEMO_SCRIPT,
  markedScript,
  median,
  PAUSE_HOLD_MS,
  planBreathMarkers,
  scriptWords,
  smoothPace,
  trustedTalking,
  validBreathing,
  validPulse,
} from "../shared/engine";
import {
  emptySignal,
  type Baseline,
  type PauseEvent,
  type SessionPoint,
  type SignalSnapshot,
  type SignalSource,
  type TransportStats,
} from "../shared/types";

type Phase =
  | "idle"
  | "connecting"
  | "calibrating"
  | "ready"
  | "rehearsing"
  | "paused"
  | "review";
type Dialog = "connect" | "settings" | "privacy" | null;

function download(name: string, content: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function duration(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export default function App() {
  const [script, setScript] = useState(DEMO_SCRIPT);
  const [title, setTitle] = useState("The idea that matters");
  const [baseWpm, setBaseWpm] = useState(130);
  const [fontSize, setFontSize] = useState(() =>
    window.matchMedia("(max-width: 700px)").matches ? 34 : 38,
  );
  const [mirror, setMirror] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [source, setSource] = useState<SignalSource | null>(null);
  const [signal, setSignal] = useState<SignalSnapshot>(emptySignal());
  const signalRef = useRef(signal);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const baselineRef = useRef<Baseline | null>(null);
  const [connected, setConnected] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [transport, setTransport] = useState<TransportStats>({
    frames: 0,
    fps: 0,
    width: 0,
    height: 0,
  });
  const [status, setStatus] = useState("Camera off");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [apiKey, setApiKey] = useState("");
  const [roomToken] = useState(() => {
    const parameters = new URLSearchParams(location.hash.slice(1));
    const token = parameters.get("room") ?? "";
    return /^[A-Za-z0-9_-]{24,64}$/u.test(token) ? token : "";
  });
  const [consent, setConsent] = useState(false);
  const [wantPulse, setWantPulse] = useState(true);
  const [wantTalking, setWantTalking] = useState(true);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simPulse, setSimPulse] = useState(72);
  const [simBreathing, setSimBreathing] = useState(14);
  const [simTalking, setSimTalking] = useState(true);
  const [view, setView] = useState<"studio" | "review">("studio");
  const [focusMode, setFocusMode] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [activeWord, setActiveWord] = useState(0);
  const activeWordRef = useRef(0);
  const [pace, setPace] = useState(baseWpm);
  const paceRef = useRef(baseWpm);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<SessionPoint[]>([]);
  const historyRef = useRef<SessionPoint[]>([]);
  const [pauses, setPauses] = useState<PauseEvent[]>([]);
  const pausesRef = useRef<PauseEvent[]>([]);
  const [finalDuration, setFinalDuration] = useState(0);
  const sessionStart = useRef(0);
  const silentSince = useRef<number | null>(null);
  const hasSpoken = useRef(false);
  const camera = useRef<CameraConnection | null>(null);
  const cameraPreview = useRef<HTMLVideoElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const calibrationStarted = useRef(0);
  const calibration = useRef({
    pulse: [] as number[],
    breathing: [] as number[],
    pulseTs: 0,
    breathingTs: 0,
  });

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const updateSignal = useCallback((next: SignalSnapshot) => {
    signalRef.current = next;
    setSignal(next);
    setNow(Date.now());
  }, []);
  const updateBaseline = useCallback((next: Baseline | null) => {
    baselineRef.current = next;
    setBaseline(next);
  }, []);
  const words = useMemo(() => scriptWords(script), [script]);
  const markers = useMemo(
    () => planBreathMarkers(script, baseWpm, baseline, pauses),
    [script, baseWpm, baseline, pauses],
  );
  const decision = decidePace({
    baseWpm,
    baseline,
    signal,
    now: Date.now(),
    silentSince: silentSince.current,
    hasSpoken: hasSpoken.current,
  });
  const running = phase === "rehearsing" || phase === "paused";
  const cameraEnabled =
    source === "live" && (connected || phase === "connecting");
  const calibrationSeconds =
    phase === "calibrating"
      ? Math.max(0, (now - calibrationStarted.current) / 1000)
      : 0;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (roomToken) {
      window.history.replaceState(
        null,
        "",
        location.pathname + location.search,
      );
      setDialog("connect");
    }
  }, [roomToken]);
  useEffect(() => () => camera.current?.stop(), []);
  useEffect(() => {
    const node = cameraPreview.current;
    if (node) {
      node.srcObject = stream;
      if (stream) void node.play().catch(() => {});
    }
  }, [stream, phase]);
  useEffect(() => {
    if (source !== "simulation" || !connected) return;
    const emit = () => {
      const at = Date.now();
      updateSignal({
        source: "simulation",
        pulse: {
          value: simPulse,
          confidence: 100,
          stable: true,
          receivedAt: at,
          timestampUs: at * 1000,
        },
        breathing: {
          value: simBreathing,
          confidence: 100,
          stable: true,
          receivedAt: at,
          timestampUs: at * 1000,
        },
        talking: simTalking,
        talkingStable: true,
        talkingReceivedAt: at,
        validation: 0,
        hint: "",
        trace: null,
        receivedAt: at,
      });
    };
    emit();
    const interval = setInterval(emit, 250);
    return () => clearInterval(interval);
  }, [source, connected, simPulse, simBreathing, simTalking, updateSignal]);

  useEffect(() => {
    if (phase !== "calibrating" || source !== "live") return;
    if (signal.validation !== 0 || signal.talking === true) {
      calibrationStarted.current = now;
      calibration.current = {
        pulse: [],
        breathing: [],
        pulseTs: 0,
        breathingTs: 0,
      };
      return;
    }
    const samples = calibration.current;
    if (
      validPulse(signal.pulse, now) &&
      signal.pulse!.timestampUs > samples.pulseTs
    ) {
      samples.pulse.push(signal.pulse!.value);
      samples.pulse = samples.pulse.slice(-12);
      samples.pulseTs = signal.pulse!.timestampUs;
    }
    if (
      now - calibrationStarted.current >= 30_000 &&
      validBreathing(signal.breathing, now) &&
      signal.breathing!.timestampUs > samples.breathingTs
    ) {
      samples.breathing.push(signal.breathing!.value);
      samples.breathing = samples.breathing.slice(-8);
      samples.breathingTs = signal.breathing!.timestampUs;
    }
    if (
      now - calibrationStarted.current >= 35_000 &&
      samples.breathing.length > 0 &&
      (!wantPulse || samples.pulse.length >= 3)
    ) {
      updateBaseline({
        pulse: median(samples.pulse),
        breathing: median(samples.breathing),
        source: "live",
      });
      updatePhase("ready");
      setStatus("Baseline ready");
    }
  }, [phase, source, signal, now, wantPulse, updateBaseline, updatePhase]);

  useEffect(() => {
    if (phase !== "rehearsing") return;
    if (!trustedTalking(signal, now) || signal.validation !== 0) {
      silentSince.current = null;
      return;
    }
    if (signal.talking) {
      if (
        hasSpoken.current &&
        silentSince.current !== null &&
        now - silentSince.current >= PAUSE_HOLD_MS
      ) {
        const next = {
          at: (silentSince.current - sessionStart.current) / 1000,
          word: activeWordRef.current,
          duration: now - silentSince.current,
        };
        pausesRef.current = [...pausesRef.current, next];
        setPauses(pausesRef.current);
      }
      silentSince.current = null;
      hasSpoken.current = true;
    } else if (silentSince.current === null) silentSince.current = now;
  }, [signal, now, phase]);

  const stopCamera = useCallback(() => {
    camera.current?.stop();
    camera.current = null;
    setConnected(false);
    setStream(null);
    setApiKey("");
    setConsent(false);
    setStatus("Camera off");
  }, []);

  const finish = useCallback(() => {
    if (!["rehearsing", "paused"].includes(phaseRef.current)) return;
    const at = Date.now();
    if (
      silentSince.current !== null &&
      at - silentSince.current >= PAUSE_HOLD_MS
    ) {
      pausesRef.current = [
        ...pausesRef.current,
        {
          at: (silentSince.current - sessionStart.current) / 1000,
          word: activeWordRef.current,
          duration: at - silentSince.current,
        },
      ];
      setPauses(pausesRef.current);
    }
    silentSince.current = null;
    setFinalDuration((at - sessionStart.current) / 1000);
    stopCamera();
    updatePhase("review");
    setView("review");
    setFocusMode(false);
    setSimulationOpen(false);
    setTelemetryOpen(false);
  }, [stopCamera, updatePhase]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const disconnectSignals = () => {
    if (["rehearsing", "paused"].includes(phaseRef.current)) {
      finish();
      return;
    }
    stopCamera();
    updateSignal(emptySignal());
    updateBaseline(null);
    setSource(null);
    silentSince.current = null;
    hasSpoken.current = false;
    updatePhase("idle");
  };

  const openCameraConsent = () => {
    if (phaseRef.current === "connecting") disconnectSignals();
    setConsent(false);
    setDialog("connect");
  };

  useEffect(() => {
    if (phase !== "rehearsing") return;
    let previous = performance.now();
    let lastUi = 0;
    let lastSample = 0;
    let frame = 0;
    const tick = (timestamp: number) => {
      if (phaseRef.current !== "rehearsing") return;
      const dt = Math.min((timestamp - previous) / 1000, 0.1);
      previous = timestamp;
      const at = Date.now();
      const next = decidePace({
        baseWpm,
        baseline: baselineRef.current,
        signal: signalRef.current,
        now: at,
        silentSince: silentSince.current,
        hasSpoken: hasSpoken.current,
      });
      paceRef.current = smoothPace(paceRef.current, next.target, dt);
      const node = viewport.current;
      if (node && content.current && words.length) {
        const maxScroll = Math.max(1, node.scrollHeight - node.clientHeight);
        node.scrollTop +=
          (((maxScroll / words.length) * paceRef.current) / 60) * dt;
        if (timestamp - lastUi > 180) {
          const readingLine =
            node.getBoundingClientRect().top + node.clientHeight * 0.5;
          const spans = [
            ...content.current.querySelectorAll<HTMLElement>("[data-word]"),
          ];
          const current = spans.find(
            (span) => span.getBoundingClientRect().bottom >= readingLine,
          );
          activeWordRef.current = current
            ? Number(current.dataset.word)
            : words.length - 1;
          setActiveWord(activeWordRef.current);
          setProgress(Math.min(100, (node.scrollTop / maxScroll) * 100));
          setPace(paceRef.current);
          lastUi = timestamp;
          if (
            node.scrollTop >= maxScroll - 2 &&
            at - sessionStart.current > 4000
          ) {
            finishRef.current();
            return;
          }
        }
      }
      if (timestamp - lastSample > 500) {
        const live = signalRef.current;
        const breathUsable =
          validBreathing(live.breathing, at) && live.talking === false;
        const point: SessionPoint = {
          seconds: (at - sessionStart.current) / 1000,
          pulse:
            live.validation === 0 &&
            validPulse(live.pulse, at, live.source === "simulation")
              ? live.pulse!.value
              : null,
          breathing:
            live.validation === 0 && breathUsable
              ? live.breathing!.value
              : null,
          pace: paceRef.current,
          word: activeWordRef.current,
          paused: next.held,
        };
        historyRef.current = [...historyRef.current.slice(-1799), point];
        setHistory(historyRef.current);
        lastSample = timestamp;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, baseWpm, words.length]);

  useEffect(() => {
    if (!running && phase !== "review") {
      paceRef.current = baseWpm;
      setPace(baseWpm);
    }
  }, [baseWpm, running, phase]);

  const start = () => {
    if (!script.trim()) {
      setError("Add a few words to your script before rehearsing.");
      return;
    }
    if (phase === "idle" || phase === "review") {
      openCameraConsent();
      return;
    }
    if (phase !== "ready") return;
    sessionStart.current = Date.now();
    historyRef.current = [];
    pausesRef.current = [];
    setHistory([]);
    setPauses([]);
    setFinalDuration(0);
    silentSince.current = null;
    hasSpoken.current = false;
    activeWordRef.current = 0;
    setActiveWord(0);
    setProgress(0);
    if (viewport.current) viewport.current.scrollTop = 0;
    paceRef.current = baseWpm;
    setPace(baseWpm);
    setSimulationOpen(false);
    updatePhase("rehearsing");
  };
  const pause = () =>
    updatePhase(phase === "rehearsing" ? "paused" : "rehearsing");

  const useSimulation = () => {
    stopCamera();
    setSource("simulation");
    setConnected(true);
    setSimPulse(72);
    setSimBreathing(14);
    setSimTalking(true);
    historyRef.current = [];
    setHistory([]);
    updateBaseline({ pulse: 72, breathing: 14, source: "simulation" });
    updatePhase("ready");
    setStatus("Simulation ready");
    setError("");
    setDialog(null);
    setSimulationOpen(true);
    setTelemetryOpen(true);
    setView("studio");
    requestAnimationFrame(() =>
      document
        .querySelector(".prompter-card")
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  };

  const connect = async () => {
    if (
      !consent ||
      (!roomToken && apiKey.trim().length < 8) ||
      phase === "connecting"
    )
      return;
    camera.current?.stop();
    setError("");
    setView("studio");
    updatePhase("connecting");
    setSource("live");
    updateSignal(emptySignal());
    updateBaseline(null);
    setStatus("Connecting camera");
    setTransport({ frames: 0, fps: 0, width: 0, height: 0 });
    historyRef.current = [];
    setHistory([]);
    calibration.current = {
      pulse: [],
      breathing: [],
      pulseTs: 0,
      breathingTs: 0,
    };
    const connection = new CameraConnection({
      onStream: (next) => {
        if (camera.current === connection) setStream(next);
      },
      onSignal: (next, stats) => {
        if (camera.current !== connection) return;
        updateSignal(next);
        setTransport(stats);
      },
      onStatus: (next) => {
        if (camera.current === connection)
          setStatus(next === "Running" ? "Quiet calibration" : next);
      },
      onError: (message) => {
        if (camera.current !== connection) return;
        setError(message);
        setConnected(false);
        setApiKey("");
        setConsent(false);
        updatePhase("idle");
        setStatus("Camera off");
        silentSince.current = null;
        hasSpoken.current = false;
      },
    });
    camera.current = connection;
    try {
      await connection.connect(
        apiKey.trim(),
        wantPulse,
        wantTalking,
        roomToken,
      );
      if (camera.current !== connection || phaseRef.current !== "connecting")
        return;
      calibrationStarted.current = Date.now();
      setConnected(true);
      updatePhase("calibrating");
      setDialog(null);
      setTelemetryOpen(true);
      requestAnimationFrame(() =>
        document
          .querySelector(".prompter-card")
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
    } catch (error) {
      if (camera.current !== connection) return;
      setError(
        error instanceof Error
          ? error.message
          : "The camera could not connect.",
      );
      updatePhase("idle");
      setStatus("Camera off");
      setConnected(false);
      setApiKey("");
      setConsent(false);
    }
  };

  const newTake = () => {
    stopCamera();
    setView("studio");
    setSource(null);
    updateSignal(emptySignal());
    updateBaseline(null);
    updatePhase("idle");
    activeWordRef.current = 0;
    setActiveWord(0);
    setProgress(0);
    setPace(baseWpm);
    paceRef.current = baseWpm;
    setError("");
    setFocusMode(false);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName) || dialog) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        if (source === "simulation") setSimulationOpen((value) => !value);
      }
      if (event.key === "Escape") setFocusMode(false);
      if (
        event.code === "Space" &&
        ["ready", "rehearsing", "paused"].includes(phaseRef.current)
      ) {
        event.preventDefault();
        if (phaseRef.current === "ready") start();
        else
          updatePhase(
            phaseRef.current === "rehearsing" ? "paused" : "rehearsing",
          );
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });

  const averagePulse = median(
    history
      .map((point) => point.pulse)
      .filter((value): value is number => value !== null),
  );
  const movingPaces = history
    .filter((point) => point.pace > 0)
    .map((point) => point.pace);
  const averagePace = movingPaces.length
    ? movingPaces.reduce((sum, value) => sum + value, 0) / movingPaces.length
    : baseWpm;
  const observedMarkers = markers.filter(
    (marker) => marker.reason === "pause",
  ).length;
  const scriptText = markedScript(script, markers);

  return (
    <div className={`app-shell ${focusMode ? "is-focused" : ""}`}>
      <header className="site-header">
        <Brand />
        <nav aria-label="Workspace">
          <button
            className={view === "studio" ? "active" : ""}
            onClick={() => setView("studio")}
          >
            Studio
          </button>
          <button
            className={view === "review" ? "active" : ""}
            disabled={phase !== "review"}
            onClick={() => setView("review")}
          >
            Rehearsal notes{phase === "review" && <span className="nav-dot" />}
          </button>
        </nav>
        <div className="header-actions">
          <button
            className={`camera-status ${connected ? "on" : ""}`}
            onClick={() =>
              connected ? disconnectSignals() : openCameraConsent()
            }
          >
            {connected ? <Camera size={15} /> : <CameraOff size={15} />}
            <span>
              {connected
                ? source === "simulation"
                  ? "Simulation on"
                  : "Camera on"
                : "Connect camera"}
            </span>
          </button>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setDialog("settings")}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>

      {!focusMode && (
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span /> YOUR REHEARSAL SPACE
            </p>
            <h1>
              {view === "review" ? (
                <>
                  Let your idea <em>land.</em>
                </>
              ) : (
                <>
                  Find your <em>rhythm.</em>
                </>
              )}
            </h1>
            <p className="intro-copy">
              {view === "review"
                ? "A few notes from your rehearsal. A little more room for the next one."
                : "A thoughtful teleprompter that makes room for your pauses, your pace, and the person behind the pitch."}
            </p>
          </div>
          <div className="intro-aside">
            <div className="mini-wave" aria-hidden="true">
              <svg viewBox="0 0 200 44">
                <path
                  d="M0 24H28c12 0 12-14 22-14s12 26 23 26S85 5 96 5s11 32 24 32 11-18 24-18h56"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <p>
              Good ideas need space.
              <br />
              <strong>Let’s give yours some.</strong>
            </p>
          </div>
        </section>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <Info size={18} />
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {view === "studio" ? (
        <main className="studio-grid">
          <section className="script-desk card">
            <div className="card-heading">
              <span className="eyebrow">01 / YOUR WORDS</span>
              <span className="small-tag">
                <FileText size={12} /> SCRIPT DESK
              </span>
            </div>
            <input
              className="script-title"
              aria-label="Script title"
              value={title}
              disabled={running}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
            />
            <p className="desk-helper">
              Paste your pitch. Make it sound like you.
            </p>
            <textarea
              aria-label="Your script"
              spellCheck
              value={script}
              disabled={running}
              maxLength={30000}
              onChange={(event) => {
                setScript(event.target.value);
                setActiveWord(0);
                activeWordRef.current = 0;
                setProgress(0);
                if (viewport.current) viewport.current.scrollTop = 0;
              }}
              placeholder="Start with the idea you want someone to remember…"
            />
            <div className="script-meta">
              <span>{words.length} words</span>
              <span>
                <Clock3 size={12} /> ~
                {Math.max(1, Math.ceil(words.length / baseWpm))} min at your
                pace
              </span>
            </div>
            <div className="script-tools">
              <button
                className="text-button"
                disabled={running}
                onClick={() => upload.current?.click()}
              >
                <Upload size={14} /> Import .txt
              </button>
              <button
                className="text-button"
                disabled={running}
                onClick={() => {
                  setScript(DEMO_SCRIPT);
                  setTitle("The idea that matters");
                }}
              >
                <RotateCcw size={13} /> Sample script
              </button>
              <input
                ref={upload}
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 120000) {
                    setError("Choose a text file smaller than 120 KB.");
                    return;
                  }
                  setScript((await file.text()).slice(0, 30000));
                  setTitle(file.name.replace(/\.txt$/iu, ""));
                  event.target.value = "";
                }}
              />
            </div>
            <div className="desk-divider" />
            <div className="pace-setting">
              <div>
                <span className="eyebrow">A COMFORTABLE START</span>
                <label htmlFor="base-pace">Your starting pace</label>
              </div>
              <strong>
                {baseWpm}
                <small> wpm</small>
              </strong>
            </div>
            <input
              id="base-pace"
              aria-label="Starting pace"
              type="range"
              min={80}
              max={200}
              step={5}
              value={baseWpm}
              onChange={(event) => setBaseWpm(Number(event.target.value))}
            />
            <div className="range-labels">
              <span>Unhurried</span>
              <span>A little quicker</span>
            </div>
            <div className="desk-tip">
              <Wind size={19} />
              <p>
                Your pulse is compared with <strong>your own baseline.</strong>{" "}
                When you pause, the prompter can wait with you.
              </p>
            </div>
          </section>

          <section className="prompter-card card">
            <div className="prompter-heading">
              <div>
                <span className="eyebrow">02 / YOUR DELIVERY</span>
                <h2>{title || "Your rehearsal"}</h2>
              </div>
              <button
                className="mobile-edit text-button"
                onClick={() =>
                  document
                    .querySelector(".script-desk")
                    ?.scrollIntoView({ block: "start", behavior: "smooth" })
                }
              >
                <FileText size={14} /> Edit
              </button>
              <span
                className={`rehearsal-badge ${source === "simulation" && connected ? "simulated" : ""}`}
              >
                <span />
                {phase === "calibrating"
                  ? "Calibrating"
                  : phase === "connecting"
                    ? "Connecting"
                    : connected
                      ? source === "simulation"
                        ? "Simulation"
                        : "Adaptive ready"
                      : "Preview"}
              </span>
            </div>
            {source === "simulation" && connected && (
              <div className="simulation-banner">
                <SlidersHorizontal size={13} />
                <span>Simulated signals · no camera</span>
                <button onClick={() => setSimulationOpen((value) => !value)}>
                  Controls
                </button>
              </div>
            )}
            {(phase === "calibrating" ||
              phase === "connecting" ||
              (stream && phase === "ready")) && (
              <div className="calibration-card">
                <video ref={cameraPreview} muted playsInline autoPlay />
                <div>
                  <span className="eyebrow">
                    {phase === "ready"
                      ? "YOUR BASELINE IS READY"
                      : "ONE QUIET MOMENT"}
                  </span>
                  <h3>
                    {phase === "ready"
                      ? "You’re ready to begin."
                      : "Sit still. Breathe normally."}
                  </h3>
                  <p>
                    {phase === "ready"
                      ? `${baseline?.pulse ? Math.round(baseline.pulse) + " bpm" : "Pulse off"} · ${baseline?.breathing ? Math.round(baseline.breathing) + " breaths/min" : "Breathing unavailable"} at your quiet baseline.`
                      : signal.validation
                        ? signal.hint ||
                          "Keep your face and upper chest visible in good light."
                        : signal.talking === true
                          ? "Pause speaking so we can collect your quiet baseline."
                          : "Rest your phone on a stand. Keep your face and upper chest in view and stay quiet for at least 35 seconds."}
                  </p>
                  {phase === "calibrating" && (
                    <>
                      <div className="calibration-track">
                        <span
                          style={{
                            width: `${Math.min(100, (calibrationSeconds / 35) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {calibrationSeconds < 35
                          ? `${Math.floor(calibrationSeconds)} / 35 seconds of quiet calibration`
                          : "Waiting for reliable readings…"}
                      </small>
                      <small>
                        Pulse averages 12 seconds. Breathing needs a full
                        30-second quiet window.
                      </small>
                      {calibrationSeconds >= 35 &&
                        calibration.current.pulse.length >= 3 && (
                          <button
                            className="text-button"
                            onClick={() => {
                              updateBaseline({
                                pulse: median(calibration.current.pulse),
                                breathing: null,
                                source: "live",
                              });
                              updatePhase("ready");
                            }}
                          >
                            Continue with pulse only <ArrowRight size={13} />
                          </button>
                        )}
                    </>
                  )}
                  {phase === "connecting" && <small>{status}</small>}
                </div>
              </div>
            )}
            {stream && running && (
              <div className="live-camera-strip">
                <video ref={cameraPreview} muted playsInline autoPlay />
                <span>
                  <span className="signal-dot green" /> Live camera ·{" "}
                  {signal.validation
                    ? signal.hint || "Adjust your framing"
                    : "Your script stays in this page"}
                </span>
              </div>
            )}
            <ScriptView
              text={script}
              markers={markers}
              activeWord={activeWord}
              fontSize={fontSize}
              mirror={mirror}
              breathCue={
                phase === "rehearsing" &&
                (decision.reason === "pulse" || decision.reason === "breathing")
              }
              viewportRef={viewport}
              contentRef={content}
            />
            <PrompterControls
              phase={phase}
              onStart={start}
              onPause={pause}
              onFinish={finish}
              onFocus={() => setFocusMode((value) => !value)}
              focusMode={focusMode}
              decision={decision}
              pace={pace}
              progress={progress}
              cameraEnabled={cameraEnabled}
              cameraToggleDisabled={source === "simulation" && running}
              onCameraToggle={(enabled) =>
                enabled ? openCameraConsent() : disconnectSignals()
              }
            />
            <div className="prompter-bottom">
              <span>
                <Wind size={13} /> Breathe markers at natural phrase breaks
              </span>
              <button
                className="text-button"
                onClick={() => setDialog("settings")}
              >
                Display <Settings2 size={13} />
              </button>
            </div>
          </section>

          {!focusMode && (
            <div className="how-it-works">
              <div>
                <span className="step-icon">
                  <FileText size={17} />
                </span>
                <p>
                  <strong>Make it yours</strong>
                  <span>Paste a script or try our example.</span>
                </p>
              </div>
              <ChevronRight size={17} />
              <div>
                <span className="step-icon">
                  <Heart size={17} />
                </span>
                <p>
                  <strong>Find a quiet baseline</strong>
                  <span>Consent, connect, and sit still.</span>
                </p>
              </div>
              <ChevronRight size={17} />
              <div>
                <span className="step-icon">
                  <Wind size={17} />
                </span>
                <p>
                  <strong>Give your words room</strong>
                  <span>Rehearse, pause, and keep the notes.</span>
                </p>
              </div>
            </div>
          )}
        </main>
      ) : (
        <main className="review-layout">
          <section className="review-main card">
            <div className="card-heading">
              <span className="eyebrow">YOUR REHEARSAL NOTES</span>
              <span
                className={`small-tag ${source === "simulation" ? "simulation-tag" : ""}`}
              >
                {source === "simulation"
                  ? "SIMULATION RESULTS"
                  : "PRESAGE REHEARSAL"}
              </span>
            </div>
            <h2>{title || "Your rehearsal"}</h2>
            <p className="review-intro">
              {source === "simulation"
                ? "These results use simulated signals. A live camera rehearsal is needed to demonstrate Presage measurements."
                : "Your camera is off. These notes use the readings and pauses from this rehearsal."}
            </p>
            <div className="review-stats">
              <div>
                <span>Rehearsal time</span>
                <strong>{duration(finalDuration)}</strong>
              </div>
              <div>
                <span>Prompter pace</span>
                <strong>
                  {Math.round(averagePace)}
                  <small>wpm</small>
                </strong>
              </div>
              <div>
                <span>Observed pauses</span>
                <strong>{pauses.length}</strong>
              </div>
              <div>
                <span>Median pulse</span>
                <strong>
                  {averagePulse ? Math.round(averagePulse) : "—"}
                  <small>bpm</small>
                </strong>
              </div>
            </div>
            <div className="review-chart">
              <div>
                <h3>A little room along the way</h3>
                <span>
                  {source === "simulation"
                    ? "Simulated pulse"
                    : "Reliable pulse estimates"}{" "}
                  <Heart size={13} />
                </span>
              </div>
              <Sparkline
                values={history.map((point) => point.pulse)}
                width={720}
                height={120}
                color="#647f58"
              />
              <div className="chart-scale">
                <span>00:00</span>
                <span>{duration(finalDuration)}</span>
              </div>
              {history.length === 0 && (
                <p className="quiet-note">
                  This take was too short for a signal history. Try a longer
                  rehearsal.
                </p>
              )}
            </div>
            <div className="review-insight">
              <Wind size={22} />
              <div>
                <h3>
                  {pauses.length
                    ? "Keep the pauses that felt like you."
                    : "Give the next take a few deliberate pauses."}
                </h3>
                <p>
                  {observedMarkers
                    ? `${observedMarkers} markers sit near pauses detected during rehearsal. `
                    : ""}
                  Other markers suggest phrase breaks
                  {baseline?.breathing
                    ? " using your quiet breathing baseline"
                    : ""}
                  . Word positions are approximate; edit them to suit your
                  delivery.
                </p>
              </div>
            </div>
            <button className="secondary-button" onClick={newTake}>
              <RotateCcw size={16} /> Rehearse again
            </button>
            <button
              className="text-button export-json"
              onClick={() =>
                download(
                  "cadence-rehearsal.json",
                  JSON.stringify(
                    {
                      title,
                      source,
                      sdkVersion: "3.5.0",
                      baseline,
                      durationSeconds: finalDuration,
                      pauses,
                      history,
                    },
                    null,
                    2,
                  ),
                  "application/json",
                )
              }
            >
              Export rehearsal data
            </button>
          </section>
          <section className="annotated-card card">
            <div className="card-heading">
              <span className="eyebrow">03 / YOUR NEXT TAKE</span>
              <Wind size={17} />
            </div>
            <h2>A script with breathing room.</h2>
            <p>
              {markers.length} suggested markers · {observedMarkers} near
              observed pauses
            </p>
            <pre className="annotated-script" data-testid="annotated-script">
              {scriptText}
            </pre>
            <DownloadButton
              onClick={() => download("cadence-breathe-script.txt", scriptText)}
            >
              Save marked script
            </DownloadButton>
            <p className="download-note">
              Saves text only. No camera frames or API key.
            </p>
          </section>
        </main>
      )}

      {!focusMode && (
        <footer>
          <span>
            <img src="/cadence.svg" alt="" /> Built for a human pace.
          </span>
          <button className="text-button" onClick={() => setDialog("privacy")}>
            <ShieldCheck size={13} /> Consent & data
          </button>
          <span className="powered-by">
            Powered by <strong>Presage SmartSpectra</strong>
          </span>
        </footer>
      )}
      {view === "studio" && (
        <Telemetry
          signal={signal}
          baseline={baseline}
          transport={transport}
          expanded={telemetryOpen}
          onToggle={() => setTelemetryOpen((value) => !value)}
          history={history}
          connected={connected}
        />
      )}
      {simulationOpen && source === "simulation" && connected && (
        <SimulationPanel
          pulse={simPulse}
          breathing={simBreathing}
          talking={simTalking}
          onPulse={setSimPulse}
          onBreathing={setSimBreathing}
          onTalking={setSimTalking}
          onClose={() => setSimulationOpen(false)}
        />
      )}

      {dialog === "connect" && (
        <Modal
          title="Make room for your rhythm."
          onClose={() => {
            if (phaseRef.current === "connecting") disconnectSignals();
            setConsent(false);
            setDialog(null);
          }}
        >
          <p className="modal-lead">
            Use your phone camera for a real rehearsal, or try the controls with
            simulated signals.
          </p>
          <div className="connection-options">
            <div className="connection-icon">
              <Camera size={24} />
            </div>
            <div>
              <h3>Connect your camera</h3>
              <p>
                Presage measures pulse, breathing, and speaking pauses. Set your
                phone on a stand in good light.
              </p>
            </div>
          </div>
          {roomToken ? (
            <div className="private-room-ready">
              <ShieldCheck size={18} />
              <div>
                <strong>Your private rehearsal room is ready.</strong>
                <p>
                  Your key is configured on the server. Just consent and connect
                  your camera.
                </p>
              </div>
            </div>
          ) : (
            <>
              <label className="field-label" htmlFor="api-key">
                Your Presage API key <LockKeyhole size={13} />
              </label>
              <input
                id="api-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste your developer API key"
                maxLength={2048}
              />
              <p className="field-help">
                No account yet?{" "}
                <a
                  href="https://physiology.presagetech.com/auth/register"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get a free developer key <ArrowRight size={11} />
                </a>{" "}
                Keep it private; Cadence does not save it.
              </p>
            </>
          )}
          <div className="signal-options">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={wantPulse}
                onChange={(event) => setWantPulse(event.target.checked)}
              />{" "}
              Include pulse
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={wantTalking}
                onChange={(event) => setWantTalking(event.target.checked)}
              />{" "}
              Detect speaking pauses
            </label>
          </div>
          <div className="consent-box">
            <ShieldCheck size={19} />
            <div>
              <p>
                Camera frames are sent over an encrypted connection to this VPS
                for Presage processing. Cadence does not record or save them.
                The camera stops when you finish or leave this page.
              </p>
              <p>
                SDK diagnostic telemetry is disabled. Presage service requests
                still require an internet connection.{" "}
                <button onClick={() => setDialog("privacy")}>
                  Read data handling
                </button>
              </p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => {
                    setConsent(event.target.checked);
                    if (
                      !event.target.checked &&
                      phaseRef.current === "connecting"
                    )
                      disconnectSignals();
                  }}
                />{" "}
                I agree to this camera processing.
              </label>
            </div>
          </div>
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button wide"
            onClick={() => void connect()}
            disabled={
              !consent ||
              (!roomToken && apiKey.trim().length < 8) ||
              phase === "connecting"
            }
          >
            <Camera size={16} />
            {phase === "connecting"
              ? "Connecting…"
              : "Consent & connect camera"}
            <ArrowRight size={17} />
          </button>
          <div className="or-divider">
            <span />
            or try it first
            <span />
          </div>
          <button className="simulation-choice" onClick={useSimulation}>
            <SlidersHorizontal size={18} />
            <span>
              <strong>Try a simulation</strong>
              <small>No key or camera. Clearly labeled test signals.</small>
            </span>
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title="A space that suits you." onClose={() => setDialog(null)}>
          <p className="modal-lead">
            Set up the script so it feels easy to read.
          </p>
          <div className="settings-field">
            <label htmlFor="script-size">
              Script text size <strong>{fontSize}px</strong>
            </label>
            <input
              id="script-size"
              type="range"
              min={26}
              max={60}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
          </div>
          <label className="checkbox-row settings-checkbox">
            <input
              type="checkbox"
              checked={mirror}
              onChange={(event) => setMirror(event.target.checked)}
            />{" "}
            Mirror text for a teleprompter reflector
          </label>
          <div className="settings-note">
            <Wind size={18} />
            <p>
              Breathing is calibrated while you are quiet. During speech, the
              prompter uses reliable pulse and speaking-pause signals. A pulse
              rise over 10% gently slows the scroll by 20–30% and adds a “Take a
              breath” cue. A higher pulse is not a diagnosis of nerves or
              stress.
            </p>
          </div>
          <details className="developer-settings">
            <summary>
              <SlidersHorizontal size={15} /> Simulation & developer controls
            </summary>
            <p>
              Simulation tests behavior without the camera. It cannot prove live
              SDK use.
            </p>
            {source === "simulation" && connected ? (
              <button
                className="secondary-button"
                onClick={() => {
                  setSimulationOpen(true);
                  setDialog(null);
                }}
              >
                Open simulation sliders
              </button>
            ) : (
              <button
                className="secondary-button"
                disabled={
                  running || phase === "connecting" || phase === "calibrating"
                }
                onClick={useSimulation}
              >
                Start a simulation
              </button>
            )}
            <small>Desktop shortcut: Ctrl / ⌘ + Shift + D</small>
          </details>
        </Modal>
      )}
      {dialog === "privacy" && (
        <Modal
          title="Your camera. Your choice."
          onClose={() => setDialog(null)}
        >
          <p className="modal-lead">
            Cadence asks for your consent before opening the camera. Simulation
            never opens it.
          </p>
          <div className="privacy-detail">
            <ShieldCheck size={20} />
            <div>
              <h3>Real-time processing</h3>
              <p>
                Your browser sends camera frames over HTTPS/WSS to this VPS. The
                server decodes them in memory and feeds Presage SmartSpectra’s
                native SDK. Cadence has no video-recording or frame-storage
                feature.
              </p>
            </div>
          </div>
          <div className="privacy-detail">
            <FileText size={20} />
            <div>
              <h3>A script stays in the page</h3>
              <p>
                Your script and rehearsal notes stay in browser memory until you
                reload or close the page. A download saves only the text or
                rehearsal data you explicitly choose to export. Keys entered
                into the app are held in memory for the camera session and
                cleared when it ends. The private hosted room keeps its owner’s
                key in server secret configuration and requires a private room
                token; that key is never sent to your browser.
              </p>
            </div>
          </div>
          <div className="privacy-detail">
            <LockKeyhole size={20} />
            <div>
              <h3>Presage services</h3>
              <p>
                Cadence sets <code>enableTelemetry: false</code>, disabling
                optional SDK diagnostic telemetry. The SDK still makes
                authenticated Presage service requests. Its device/model cache
                is isolated per session and removed when that session ends.
                Presage’s own service handling is governed by its policies.
              </p>
              <a
                href="https://smartspectra.presagetech.com/docs/telemetry-and-privacy"
                target="_blank"
                rel="noreferrer"
              >
                Presage telemetry & privacy <ArrowRight size={12} />
              </a>
              <a
                href="https://api.physiology.presagetech.com/privacypolicy"
                target="_blank"
                rel="noreferrer"
              >
                Presage privacy policy <ArrowRight size={12} />
              </a>
            </div>
          </div>
          <p className="privacy-footnote">
            For presentation rehearsal and general information. Pulse and
            breathing estimates are not medical measurements or proof of an
            emotional state.
          </p>
          <button
            className="primary-button wide"
            onClick={() => setDialog(null)}
          >
            Got it <Check size={17} />
          </button>
        </Modal>
      )}
    </div>
  );
}
