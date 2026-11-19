import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  Check,
  ChevronDown,
  Heart,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SlidersHorizontal,
  Wind,
  X,
} from "lucide-react";
import {
  scriptWords,
  type PaceDecision,
  validPulse,
  validBreathing,
} from "../shared/engine";
import type {
  Baseline,
  BreathMarker,
  SessionPoint,
  SignalSnapshot,
  TransportStats,
} from "../shared/types";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <img src="/cadence.svg" alt="" />
      <span>
        cadence<span className="brand-dot">.</span>
      </span>
      {!compact && (
        <span className="brand-caption">A little room to breathe</span>
      )}
    </div>
  );
}

export function Modal({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <button
          className="icon-button modal-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Sparkline({
  values,
  color = "#8ca76e",
  width = 220,
  height = 56,
}: {
  values: (number | null)[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const present = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const min = present.length ? Math.min(...present) - 2 : 0;
  const max = present.length ? Math.max(...present) + 2 : 1;
  let d = "";
  let connected = false;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      connected = false;
      return;
    }
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - 5 - ((value - min) / (max - min)) * (height - 10);
    d += `${connected ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    connected = true;
  });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Signal history"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Telemetry({
  signal,
  baseline,
  transport,
  expanded,
  onToggle,
  history,
  connected,
}: {
  signal: SignalSnapshot;
  baseline: Baseline | null;
  transport: TransportStats;
  expanded: boolean;
  onToggle: () => void;
  history: SessionPoint[];
  connected: boolean;
}) {
  const now = Date.now();
  const simulated = signal.source === "simulation";
  const pulse = validPulse(signal.pulse, now, simulated) && connected;
  const breathing = validBreathing(signal.breathing, now) && connected;
  const source = connected
    ? simulated
      ? "Simulation"
      : "Presage live"
    : "Camera off";
  return (
    <aside
      className={`telemetry ${expanded ? "expanded" : ""}`}
      aria-label="Live signal telemetry"
    >
      <button
        className="telemetry-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span
          className={`signal-dot ${connected ? (simulated ? "amber" : "green") : ""}`}
        />
        <span>{source}</span>
        <span className="telemetry-mini">
          <Heart size={13} />
          {pulse ? Math.round(signal.pulse!.value) : "—"}
          <span className="unit">bpm</span>
        </span>
        <ChevronDown size={15} className={expanded ? "flipped" : ""} />
      </button>
      {expanded && (
        <div className="telemetry-body">
          <div className="telemetry-title">
            <span>LIVE SIGNAL TELEMETRY</span>
            <Activity size={14} />
          </div>
          <div className="telemetry-values">
            <div>
              <span>
                <Heart size={13} /> Pulse
              </span>
              <strong>
                {pulse ? Math.round(signal.pulse!.value) : "—"}
                <small>bpm</small>
              </strong>
              <em>
                {signal.pulse && connected
                  ? `${Math.round(signal.pulse.confidence)}% confidence`
                  : "Waiting for a reading"}
              </em>
            </div>
            <div>
              <span>
                <Wind size={13} /> Breathing
              </span>
              <strong>
                {breathing ? Math.round(signal.breathing!.value) : "—"}
                <small>/min</small>
              </strong>
              <em>
                {signal.talking === true
                  ? "Reference only during speech"
                  : signal.breathing && connected
                    ? `${Math.round(signal.breathing.confidence)}% confidence`
                    : "30s quiet window needed"}
              </em>
            </div>
          </div>
          {history.length > 2 && (
            <div className="telemetry-chart">
              <Sparkline
                values={history.slice(-100).map((point) => point.pulse)}
              />
            </div>
          )}
          <div className="telemetry-row">
            <span>Speech pause sensing</span>
            <b>
              {!connected || !signal.talkingStable
                ? "Waiting"
                : signal.talking
                  ? "Speaking"
                  : "Quiet"}
            </b>
          </div>
          {baseline && (
            <div className="telemetry-row">
              <span>{simulated ? "Simulated" : "Your"} baseline</span>
              <b>
                {baseline.pulse ? `${Math.round(baseline.pulse)} bpm` : "—"} ·{" "}
                {baseline.breathing
                  ? `${Math.round(baseline.breathing)} /min`
                  : "—"}
              </b>
            </div>
          )}
          {!simulated && connected && (
            <div className="telemetry-row">
              <span>Camera feed</span>
              <b>
                {transport.fps.toFixed(0)} fps · {transport.width}×
                {transport.height}
              </b>
            </div>
          )}
          <p className="telemetry-note">
            {simulated
              ? "Developer test values. No camera or real biometrics."
              : "SDK estimates: pulse over 12s, breathing over 30s. Cadence disables SDK diagnostic telemetry."}
          </p>
        </div>
      )}
    </aside>
  );
}

export function ScriptView({
  text,
  markers,
  activeWord,
  fontSize,
  mirror,
  breathCue,
  viewportRef,
  contentRef,
}: {
  text: string;
  markers: BreathMarker[];
  activeWord: number;
  fontSize: number;
  mirror: boolean;
  breathCue: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const words = scriptWords(text);
  const marked = new Map(markers.map((marker) => [marker.afterWord, marker]));
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () =>
      node.style.setProperty("--stage-height", `${node.clientHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewportRef]);
  return (
    <div
      className={`script-viewport ${mirror ? "mirrored" : ""}`}
      ref={viewportRef}
      tabIndex={0}
      aria-label="Teleprompter script"
      style={
        {
          "--reading-line-height": `${fontSize * 1.45}px`,
        } as React.CSSProperties
      }
    >
      <div
        className={`reading-guide ${breathCue ? "breath-cue-active" : ""}`}
        aria-hidden="true"
      >
        <span />
        <span />
      </div>
      <div
        className="reading-cue"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {breathCue && (
          <span className="reading-breath-cue" data-testid="breath-cue">
            <Wind size={13} aria-hidden="true" /> Take a breath
          </span>
        )}
      </div>
      <div className="prompter-copy" ref={contentRef} style={{ fontSize }}>
        {words.length ? (
          words.map((word, index) => {
            const gap = text.slice(
              index ? words[index - 1].end : 0,
              word.start,
            );
            const paragraph = /\n\s*\n/u.test(gap);
            return (
              <span key={`${word.start}-${word.text}`}>
                {paragraph ? (
                  <>
                    <br />
                    <br />
                  </>
                ) : index > 0 ? (
                  " "
                ) : null}
                <span
                  data-word={index}
                  className={
                    index < activeWord
                      ? "word-read"
                      : index < activeWord + 10
                        ? "word-current"
                        : "word-ahead"
                  }
                >
                  {word.text}
                </span>
                {marked.has(index) && (
                  <span
                    className={`breath-chip ${marked.get(index)!.reason === "pause" ? "observed" : ""}`}
                    title={
                      marked.get(index)!.reason === "pause"
                        ? "Near a pause observed in rehearsal"
                        : "Suggested pause at a natural phrase break"
                    }
                  >
                    <Wind size={11} /> breathe
                  </span>
                )}
              </span>
            );
          })
        ) : (
          <span className="empty-copy">
            Your words go here.
            <br />
            Give them a little room.
          </span>
        )}
      </div>
    </div>
  );
}

export function PrompterControls({
  phase,
  onStart,
  onPause,
  onFinish,
  onFocus,
  focusMode,
  decision,
  pace,
  progress,
  cameraEnabled,
  cameraToggleDisabled,
  onCameraToggle,
}: {
  phase: string;
  onStart: () => void;
  onPause: () => void;
  onFinish: () => void;
  onFocus: () => void;
  focusMode: boolean;
  decision: PaceDecision;
  pace: number;
  progress: number;
  cameraEnabled: boolean;
  cameraToggleDisabled: boolean;
  onCameraToggle: (enabled: boolean) => void;
}) {
  const playing = phase === "rehearsing";
  const started = playing || phase === "paused";
  return (
    <div className="prompter-controls">
      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="control-main">
        <div className="pace-readout">
          <span>{playing && decision.held ? "PAUSE" : "PROMPTER PACE"}</span>
          <strong data-testid="pace-value">
            {playing && decision.held ? "Held" : Math.round(pace)}
            <small>{playing && decision.held ? "" : " wpm"}</small>
          </strong>
        </div>
        <div className="play-actions">
          <button
            className="play-button"
            onClick={started ? onPause : onStart}
            aria-label={
              playing
                ? "Pause rehearsal"
                : phase === "paused"
                  ? "Resume rehearsal"
                  : "Start rehearsal"
            }
            disabled={phase === "calibrating" || phase === "connecting"}
          >
            {playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
          {started && (
            <button className="finish-button" onClick={onFinish}>
              <Check size={17} /> Finish
            </button>
          )}
        </div>
        <button
          className="icon-button focus-button"
          onClick={onFocus}
          aria-label={focusMode ? "Exit focus view" : "Open focus view"}
        >
          {focusMode ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
      </div>
      <div className="pace-feedback" aria-live="polite">
        <span className={`feedback-dot ${decision.held ? "paused" : ""}`} />
        {phase === "rehearsing"
          ? decision.message
          : phase === "paused"
            ? "Rehearsal paused. Resume whenever you are ready."
            : "Press play when you’re ready. There’s no rush."}
      </div>
      <div className="camera-pacing-control">
        <label className="camera-pacing-label" htmlFor="enable-camera-pacing">
          <span>Enable Camera & Biometric Pacing</span>
          <input
            id="enable-camera-pacing"
            className="camera-pacing-switch"
            type="checkbox"
            role="switch"
            checked={cameraEnabled}
            disabled={cameraToggleDisabled}
            aria-describedby="camera-pacing-help"
            onChange={(event) => onCameraToggle(event.target.checked)}
          />
        </label>
        <p id="camera-pacing-help">
          {cameraToggleDisabled
            ? "Finish this simulation before enabling the camera."
            : cameraEnabled
              ? phase === "connecting"
                ? "Connecting camera…"
                : started
                  ? "On. Switching off ends this take and stops the camera."
                  : "On. Switch off to stop the camera."
              : "Off. Enabling opens the consent step."}
        </p>
      </div>
    </div>
  );
}

export function SimulationPanel({
  pulse,
  breathing,
  talking,
  onPulse,
  onBreathing,
  onTalking,
  onClose,
}: {
  pulse: number;
  breathing: number;
  talking: boolean;
  onPulse: (value: number) => void;
  onBreathing: (value: number) => void;
  onTalking: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="simulation-panel" data-testid="simulation-panel">
      <div className="simulation-heading">
        <SlidersHorizontal size={16} />
        <b>Simulation controls</b>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Hide simulation controls"
        >
          <X size={16} />
        </button>
      </div>
      <p>
        Test the response with invented signals. This is not a live Presage
        measurement.
      </p>
      <label>
        Simulated pulse <strong>{pulse} bpm</strong>
        <input
          aria-label="Simulated BPM"
          type="range"
          min={60}
          max={140}
          value={pulse}
          onChange={(event) => onPulse(Number(event.target.value))}
        />
      </label>
      <label>
        Simulated breathing <strong>{breathing} /min</strong>
        <input
          aria-label="Simulated breathing rate"
          type="range"
          min={8}
          max={28}
          value={breathing}
          onChange={(event) => onBreathing(Number(event.target.value))}
        />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={talking}
          onChange={(event) => onTalking(event.target.checked)}
        />{" "}
        Simulate speaking
      </label>
      <div className="simulation-presets">
        <button
          onClick={() => {
            onPulse(72);
            onBreathing(14);
            onTalking(true);
          }}
        >
          Baseline
        </button>
        <button
          onClick={() => {
            onPulse(104);
            onBreathing(22);
            onTalking(true);
          }}
        >
          Raised pulse
        </button>
        <button onClick={() => onTalking(false)}>Take a pause</button>
      </div>
    </div>
  );
}

export function DownloadButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className="primary-button" onClick={onClick}>
      <ArrowDownToLine size={17} />
      {children}
    </button>
  );
}
