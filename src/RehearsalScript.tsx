import { useMemo, useState, type ReactNode } from "react";
import { Heart, Wind } from "lucide-react";
import { Modal } from "./components";
import { scriptWords } from "../shared/engine";
import { scriptSentences } from "../shared/rehearsal";
import type {
  Baseline,
  BreathMarker,
  SentenceMoment,
  SignalSource,
} from "../shared/types";

function timeLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function RehearsalScript({
  text,
  markers,
  moments,
  baseline,
  source,
}: {
  text: string;
  markers: BreathMarker[];
  moments: SentenceMoment[];
  baseline: Baseline | null;
  source: SignalSource | null;
}) {
  const [selected, setSelected] = useState<SentenceMoment | null>(null);
  const sentences = useMemo(() => scriptSentences(text), [text]);
  const words = useMemo(() => scriptWords(text), [text]);
  const insertions = [
    ...new Set(
      markers
        .map((marker) => words[marker.afterWord]?.end)
        .filter((offset): offset is number => offset !== undefined),
    ),
  ].sort((a, b) => a - b);
  const bySentence = new Map(
    moments.map((moment) => [moment.sentenceIndex, moment]),
  );
  const renderRange = (start: number, end: number): ReactNode[] => {
    const parts: ReactNode[] = [];
    let cursor = start;
    for (const offset of insertions) {
      if (offset <= start || offset > end) continue;
      parts.push(text.slice(cursor, offset));
      parts.push(
        <span className="review-breath-marker" key={`marker-${offset}`}>
          {" [ BREATHE ]"}
        </span>,
      );
      cursor = offset;
    }
    parts.push(text.slice(cursor, end));
    return parts;
  };
  const content: ReactNode[] = [];
  let cursor = 0;
  for (const sentence of sentences) {
    if (sentence.start > cursor)
      content.push(...renderRange(cursor, sentence.start));
    const moment = bySentence.get(sentence.sentenceIndex);
    if (moment) {
      const reasons = [
        moment.pulsePeak !== null ? "pulse" : "",
        moment.breathingPeak !== null ? "breathing" : "",
      ].filter(Boolean);
      const kind = reasons.length === 2 ? "both" : reasons[0];
      content.push(
        <mark
          key={`sentence-${sentence.sentenceIndex}`}
          className={`sentence-highlight ${kind}`}
          data-review-reasons={reasons.join(" ")}
          role="button"
          tabIndex={0}
          aria-label={`Inspect estimated signals near: ${text.slice(sentence.start, sentence.end).trim()}`}
          aria-describedby="sentence-mapping-note"
          onClick={() => setSelected(moment)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              setSelected(moment);
            }
          }}
        >
          {renderRange(sentence.start, sentence.end)}
        </mark>,
      );
    } else {
      content.push(
        <span key={`sentence-${sentence.sentenceIndex}`}>
          {renderRange(sentence.start, sentence.end)}
        </span>,
      );
    }
    cursor = sentence.end;
  }
  if (cursor < text.length) content.push(...renderRange(cursor, text.length));
  return (
    <>
      <pre className="annotated-script" data-testid="annotated-script">
        {content}
      </pre>
      {selected && (
        <Modal
          title="A moment from this take."
          onClose={() => setSelected(null)}
        >
          <span
            className={`small-tag ${source === "simulation" ? "simulation-tag" : ""}`}
          >
            {source === "simulation"
              ? "Simulated readings"
              : "Presage estimates"}
          </span>
          <p className="moment-sentence">
            {text.slice(selected.start, selected.end).trim()}
          </p>
          <p className="moment-timing">
            Estimated reading position around{" "}
            {timeLabel(selected.firstSeenSeconds)}
            {selected.lastSeenSeconds > selected.firstSeenSeconds
              ? `–${timeLabel(selected.lastSeenSeconds)}`
              : ""}
          </p>
          <div className="moment-values">
            {selected.pulsePeak !== null && (
              <div>
                <span>
                  <Heart size={14} /> Pulse estimate
                </span>
                <strong>
                  {Math.round(selected.pulsePeak)} <small>bpm</small>
                </strong>
                {baseline?.pulse && (
                  <p>
                    {Math.round(
                      (selected.pulsePeak / baseline.pulse - 1) * 100,
                    )}
                    % above your {Math.round(baseline.pulse)} bpm baseline
                  </p>
                )}
              </div>
            )}
            {selected.breathingPeak !== null && (
              <div>
                <span>
                  <Wind size={14} /> Quiet breathing estimate
                </span>
                <strong>
                  {Math.round(selected.breathingPeak)}{" "}
                  <small>breaths/min</small>
                </strong>
                {baseline?.breathing && (
                  <p>
                    {Math.round(
                      (selected.breathingPeak / baseline.breathing - 1) * 100,
                    )}
                    % above your {Math.round(baseline.breathing)} breaths/min
                    baseline
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="moment-method">
            Pulse averages 12 seconds; breathing 30 seconds of quiet capture.
            The highlight follows the displayed script line and does not
            establish which words caused a rate change.
          </p>
        </Modal>
      )}
    </>
  );
}
