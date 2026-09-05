import { Grid2X2, RotateCcw, Scan } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { COLUMN_LABELS, columnCells, describeColumn, WOOD_NAMES } from "../lib/game";
import type { BeadColor, Cell } from "../lib/game";
import type { createWoodenScene, SceneState } from "../lib/wooden-scene";

type BoardController = ReturnType<typeof createWoodenScene>;

export function WoodenBoard({
  board,
  winningLine = [],
  canDrop = false,
  currentColor = "ember",
  preview = false,
  onDrop,
}: {
  board: readonly Cell[];
  winningLine?: readonly number[];
  canDrop?: boolean;
  currentColor?: BeadColor;
  preview?: boolean;
  onDrop?: (column: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const targets = useRef(new Map<number, HTMLButtonElement>());
  const controller = useRef<BoardController | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const stateRef = useRef<SceneState>({ board, winningLine, canDrop, currentColor, preview });
  const dropRef = useRef(onDrop);
  stateRef.current = { board, winningLine, canDrop, currentColor, preview };
  dropRef.current = onDrop;

  useEffect(() => {
    const element = host.current;
    const canvasElement = canvas.current;
    if (!element || !canvasElement || failed) return;
    let cancelled = false;
    void import("../lib/wooden-scene")
      .then(({ createWoodenScene }) => {
        if (cancelled) return;
        controller.current = createWoodenScene({
          canvas: canvasElement,
          host: element,
          targets: targets.current,
          onDrop: (column) => dropRef.current?.(column),
          onHover: setHovered,
          onContextLost: () => setFailed(true),
        });
        controller.current.setState(stateRef.current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      controller.current?.dispose();
      controller.current = null;
    };
  }, [failed]);

  useEffect(() => {
    controller.current?.setState(stateRef.current);
  }, [board, winningLine, canDrop, currentColor, preview]);

  const highlight = (column: number | null) => {
    setHovered(column);
    controller.current?.highlight(column);
  };
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, column: number) => {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -4,
      ArrowDown: 4,
    };
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 15;
    else if (event.key in offsets) next = (column + offsets[event.key] + 16) % 16;
    else return;
    event.preventDefault();
    targets.current.get(next)?.focus();
  };

  const useMap = mapOpen || failed;
  return (
    <div className={`wooden-board${preview ? " wooden-board--preview" : ""}`}>
      <div ref={host} className="board-viewport" data-ready={ready}>
        <canvas ref={canvas} aria-hidden="true" />
        {!ready && !failed ? (
          <div className="board-loading" role="status">
            Setting the table…
          </div>
        ) : null}
        {failed ? (
          <p className="board-fallback" role="status">
            3D is unavailable. You can play on the board map.
          </p>
        ) : null}
        {!preview ? (
          <div
            className={`peg-controls${useMap ? " peg-controls--map" : ""}`}
            role="group"
            aria-label="Board pegs. Rows A to D, columns 1 to 4. Levels are listed bottom to top."
            data-testid="board-controls"
          >
            {COLUMN_LABELS.map((label, column) => {
              const cells = columnCells(board, column);
              const nextLevel = cells.indexOf(null);
              const available = canDrop && nextLevel >= 0;
              const isWinning = winningLine.some((index) => index % 16 === column);
              return (
                <button
                  key={label}
                  ref={(button) => {
                    if (button) targets.current.set(column, button);
                    else targets.current.delete(column);
                  }}
                  className={`peg-button${hovered === column ? " peg-button--hover" : ""}${isWinning ? " peg-button--winning" : ""}`}
                  type="button"
                  data-column={label}
                  data-next-level={nextLevel === -1 ? "full" : nextLevel + 1}
                  data-stack={cells
                    .map((cell) => (cell ? WOOD_NAMES[cell].toLowerCase() : "empty"))
                    .join(",")}
                  aria-label={describeColumn(board, column, currentColor, canDrop)}
                  aria-disabled={!available}
                  onClick={() => {
                    if (available) onDrop?.(column);
                  }}
                  onPointerEnter={() => highlight(column)}
                  onPointerLeave={() => highlight(null)}
                  onFocus={() => highlight(column)}
                  onBlur={() => highlight(null)}
                  onKeyDown={(event) => navigate(event, column)}
                >
                  <span>{label}</span>
                  <span className="peg-stack" aria-hidden="true">
                    {cells.map((cell, level) => (
                      <i
                        key={level}
                        className={cell ? `wood-dot wood-dot--${cell}` : "wood-dot wood-dot--empty"}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="board-tools">
        <span className="board-hint">
          {preview
            ? "Drag to turn the board"
            : useMap
              ? "Beads read left to right, bottom to top"
              : "Choose a peg · drag to turn"}
        </span>
        <div className="view-controls" role="group" aria-label="Board view">
          <button
            aria-label="Reset 3D view"
            title="Reset 3D view"
            disabled={failed}
            onClick={() => {
              setMapOpen(false);
              controller.current?.setView("perspective");
            }}
          >
            <RotateCcw size={16} />
          </button>
          <button
            aria-label="Top view"
            title="Top view"
            disabled={failed}
            onClick={() => {
              setMapOpen(false);
              controller.current?.setView("top");
            }}
          >
            <Scan size={17} />
          </button>
          {!preview ? (
            <button
              aria-label="Board map"
              title="Board map"
              aria-pressed={useMap}
              onClick={() => setMapOpen(!useMap)}
            >
              <Grid2X2 size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
