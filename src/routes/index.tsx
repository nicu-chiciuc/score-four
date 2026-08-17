import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Check,
  Clipboard,
  Dices,
  Link2,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../../convex/_generated/api";
import { ConvexClientProvider } from "../lib/convex";

type Color = "ember" | "cobalt";
type Cell = Color | null;
type GameStatus = "waiting" | "playing" | "won" | "draw";

type GameState = {
  roomKey: string;
  board: Cell[];
  players: Array<{
    name: string;
    color: Color;
    isViewer: boolean;
  }>;
  status: GameStatus;
  currentColor: Color;
  winner: Color | null;
  winningLine: number[] | null;
};

const BOARD_SIZE = 4;
const COLUMN_COUNT = BOARD_SIZE * BOARD_SIZE;
const BOARD_SPACING = 76;
const BOARD_SPAN = BOARD_SPACING * (BOARD_SIZE - 1);
const COLUMN_LABELS = Array.from({ length: COLUMN_COUNT }, (_, index) => {
  const row = String.fromCharCode(65 + Math.floor(index / BOARD_SIZE));
  const column = (index % BOARD_SIZE) + 1;
  return row + column;
});

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <ConvexClientProvider>
      <GameSession />
    </ConvexClientProvider>
  );
}

function GameSession() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    if (isLoading || isAuthenticated || sessionStarted) {
      return;
    }

    setSessionStarted(true);
    void signIn("anonymous").catch((error: unknown) => {
      setSessionError(error instanceof Error ? error.message : "Could not start a guest session.");
    });
  }, [isAuthenticated, isLoading, sessionStarted, signIn]);

  if (isLoading || (!isAuthenticated && !sessionError)) {
    return <LoadingScreen />;
  }

  if (sessionError) {
    return (
      <AppChrome>
        <section className="state-card state-card--error">
          <span className="eyebrow">Connection interrupted</span>
          <h1>Could not open the table.</h1>
          <p>{sessionError}</p>
          <button className="button button--primary" onClick={() => window.location.reload()}>
            Try again <RefreshCw size={16} />
          </button>
        </section>
      </AppChrome>
    );
  }

  return <RoomApp />;
}

function RoomApp() {
  const [roomKey, setRoomKey] = useState("");
  const [name, setName] = useState("");
  const [actionError, setActionError] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const game = useQuery(api.games.get, roomKey ? { roomKey } : "skip") as
    | GameState
    | null
    | undefined;
  const createGame = useMutation(api.games.create);
  const joinGame = useMutation(api.games.join);
  const dropBead = useMutation(api.games.drop);
  const resetGame = useMutation(api.games.reset);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextRoomKey = params.get("room")?.trim().toUpperCase() ?? "";
    setRoomKey(nextRoomKey);
    setName(window.localStorage.getItem("score-four-name") ?? "");
  }, []);

  const saveName = (nextName: string) => {
    const safeName = nextName.trim().slice(0, 24);
    if (safeName) {
      window.localStorage.setItem("score-four-name", safeName);
    }
    return safeName || "Guest";
  };

  const goToRoom = (nextRoomKey: string) => {
    const url = new URL(window.location.href);
    url.search = nextRoomKey ? "?room=" + nextRoomKey : "";
    window.history.pushState({}, "", url);
    setRoomKey(nextRoomKey);
  };

  const runAction = async (action: () => Promise<void>) => {
    setActionError("");
    setIsWorking(true);
    try {
      await action();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "That move could not be made.");
    } finally {
      setIsWorking(false);
    }
  };

  const createRoom = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const safeName = saveName(name);
    await runAction(async () => {
      const result = await createGame({ name: safeName });
      goToRoom(result.roomKey);
    });
  };

  const joinRoom = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const safeName = saveName(name);
    await runAction(async () => {
      await joinGame({ roomKey, name: safeName });
    });
  };

  const handleDrop = async (column: number) => {
    await runAction(async () => {
      await dropBead({ roomKey, column });
    });
  };

  const handleReset = async () => {
    await runAction(async () => {
      await resetGame({ roomKey });
    });
  };

  if (!roomKey) {
    return (
      <AppChrome>
        <LandingPage
          name={name}
          setName={setName}
          onCreate={createRoom}
          isWorking={isWorking}
          actionError={actionError}
        />
      </AppChrome>
    );
  }

  if (game === undefined) {
    return (
      <AppChrome>
        <LoadingScreen compact />
      </AppChrome>
    );
  }

  if (game === null) {
    return (
      <AppChrome>
        <section className="state-card">
          <span className="eyebrow">Room not found</span>
          <h1>That table has drifted off the map.</h1>
          <p>Deal a fresh board and send one clean link to your friend.</p>
          <button className="button button--primary" onClick={() => goToRoom("")}>
            Deal a new board <ArrowUpRight size={16} />
          </button>
        </section>
      </AppChrome>
    );
  }

  const viewer = game.players.find((player) => player.isViewer);
  if (!viewer) {
    return (
      <AppChrome>
        <JoinRoom
          game={game}
          name={name}
          setName={setName}
          onJoin={joinRoom}
          isWorking={isWorking}
          actionError={actionError}
          onBack={() => goToRoom("")}
        />
      </AppChrome>
    );
  }

  return (
    <AppChrome>
      <PlayRoom
        game={game}
        viewer={viewer}
        roomKey={roomKey}
        isWorking={isWorking}
        actionError={actionError}
        onDrop={handleDrop}
        onReset={handleReset}
        onBack={() => goToRoom("")}
      />
    </AppChrome>
  );
}

function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell">
      <div className="shell-glow shell-glow--one" />
      <div className="shell-glow shell-glow--two" />
      <div className="app-width">{children}</div>
    </main>
  );
}

function LandingPage({
  name,
  setName,
  onCreate,
  isWorking,
  actionError,
}: {
  name: string;
  setName: (value: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  isWorking: boolean;
  actionError: string;
}) {
  return (
    <section className="landing">
      <div className="landing-copy">
        <div className="brand-lockup">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>Score Four</span>
        </div>

        <span className="eyebrow">A room game in three dimensions</span>
        <h1>
          Make a line.
          <br />
          <em>In the air.</em>
        </h1>
        <p className="landing-lede">
          A small board with a lot of room to think. Drop four beads into a straight line across,
          up, or through the middle.
        </p>

        <form className="start-form" onSubmit={onCreate}>
          <label htmlFor="player-name">Your name on the board</label>
          <div className="start-form__row">
            <input
              id="player-name"
              value={name}
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Mina"
              autoComplete="nickname"
            />
            <button className="button button--primary" disabled={isWorking} type="submit">
              {isWorking ? "Dealing..." : "Deal a room"} <ArrowUpRight size={17} />
            </button>
          </div>
        </form>

        {actionError ? <ErrorNotice message={actionError} /> : null}

        <div className="trust-line">
          <Sparkles size={15} />
          <span>No accounts. One room link. Live moves.</span>
        </div>
      </div>

      <HeroBoard />
    </section>
  );
}

function HeroBoard() {
  return (
    <div className="hero-board-wrap" aria-label="A preview of the four by four by four board">
      <div className="hero-board__note">the little cube</div>
      <div className="hero-board">
        <div className="hero-board__shadow" />
        <div className="hero-board__grid">
          {Array.from({ length: 16 }, (_, index) => (
            <div className="hero-column" key={index}>
              <span className="hero-slot hero-slot--empty" />
              <span className="hero-slot hero-slot--empty" />
              <span className="hero-slot hero-slot--cobalt" />
              <span className="hero-slot hero-slot--ember" />
            </div>
          ))}
        </div>
        <div className="hero-board__edge hero-board__edge--left" />
        <div className="hero-board__edge hero-board__edge--right" />
      </div>
      <div className="hero-board__caption">
        <span>4 × 4 columns</span>
        <span>4 deep</span>
      </div>
    </div>
  );
}

function JoinRoom({
  game,
  name,
  setName,
  onJoin,
  isWorking,
  actionError,
  onBack,
}: {
  game: GameState;
  name: string;
  setName: (value: string) => void;
  onJoin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  isWorking: boolean;
  actionError: string;
  onBack: () => void;
}) {
  return (
    <section className="join-page">
      <button className="text-button" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to lobby
      </button>
      <div className="join-card">
        <div className="join-card__cube">
          <Dices size={38} strokeWidth={1.3} />
        </div>
        <span className="eyebrow">You were invited</span>
        <h1>Take the other side.</h1>
        <p>
          {game.players[0]?.name ?? "Someone"} is waiting at table <strong>{game.roomKey}</strong>.
        </p>
        <form className="join-form" onSubmit={onJoin}>
          <label htmlFor="join-name">Name on the board</label>
          <input
            id="join-name"
            value={name}
            maxLength={24}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Sol"
            autoComplete="nickname"
            autoFocus
          />
          <button
            className="button button--primary button--wide"
            disabled={isWorking}
            type="submit"
          >
            {isWorking ? "Joining..." : "Join the room"} <ArrowUpRight size={17} />
          </button>
        </form>
        {actionError ? <ErrorNotice message={actionError} /> : null}
        <div className="join-card__fineprint">No account or password needed.</div>
      </div>
    </section>
  );
}

function PlayRoom({
  game,
  viewer,
  roomKey,
  isWorking,
  actionError,
  onDrop,
  onReset,
  onBack,
}: {
  game: GameState;
  viewer: { name: string; color: Color; isViewer: boolean };
  roomKey: string;
  isWorking: boolean;
  actionError: string;
  onDrop: (column: number) => Promise<void>;
  onReset: () => Promise<void>;
  onBack: () => void;
}) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");
  const viewerColor = viewer.color;
  const isYourTurn = game.status === "playing" && game.currentColor === viewerColor;
  const currentPlayer = game.players.find((player) => player.color === game.currentColor);
  const winner = game.players.find((player) => player.color === game.winner);
  const filledCount = game.board.filter((cell) => cell !== null).length;
  const winningLine = useMemo(() => new Set(game.winningLine ?? []), [game.winningLine]);

  const shareRoom = async () => {
    const url = window.location.href;
    setShareState("idle");
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Score Four",
          text: "Join my Score Four room.",
          url,
        });
        setShareState("shared");
        return;
      } catch {
        // The share sheet can be dismissed; keep the copy fallback available.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      setShareState("idle");
    }
  };

  const statusCopy =
    game.status === "waiting"
      ? "Waiting for a second player"
      : game.status === "won"
        ? (winner?.name ?? "A player") + " closed the line"
        : game.status === "draw"
          ? "The cube is full — no line"
          : isYourTurn
            ? "Your drop"
            : (currentPlayer?.name ?? "Opponent") + "'s drop";

  return (
    <section className="room-page">
      <header className="room-header">
        <button className="brand-lockup brand-lockup--button" onClick={onBack}>
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>Score Four</span>
        </button>
        <div className="room-header__actions">
          <span className="room-chip">
            <span className="room-chip__dot" />
            Room {roomKey}
          </span>
          <button className="icon-button" title="Share this room" onClick={shareRoom}>
            {shareState === "copied" || shareState === "shared" ? (
              <Check size={17} />
            ) : (
              <Share2 size={17} />
            )}
          </button>
        </div>
      </header>

      <div className="room-heading">
        <div>
          <span className="eyebrow">The cube is live</span>
          <h1>Find the line before they do.</h1>
        </div>
        <div
          className={"turn-status turn-status--" + (isYourTurn ? viewerColor : "quiet")}
          aria-live="polite"
        >
          <span className="turn-status__bead" />
          <span>{statusCopy}</span>
        </div>
      </div>

      {shareState === "copied" ? (
        <div className="toast-line">
          <Check size={15} /> Link copied — your friend can join from any browser.
        </div>
      ) : null}
      {shareState === "shared" ? (
        <div className="toast-line">
          <Check size={15} /> Room shared.
        </div>
      ) : null}
      {actionError ? <ErrorNotice message={actionError} /> : null}

      <div className="game-layout">
        <div className="board-card">
          <div className="board-card__header">
            <div>
              <span className="eyebrow">Spatial board</span>
              <h2>Drag to orbit</h2>
            </div>
            <div className="board-count">
              <strong>{filledCount}</strong>
              <span>/ 64 beads</span>
            </div>
          </div>

          <Board3D
            board={game.board}
            winningLine={winningLine}
            canDrop={isYourTurn && !isWorking}
            currentColor={game.currentColor}
            onDrop={onDrop}
          />

          <div className="board-card__footer">
            <span>
              <span className="legend-bead legend-bead--ember" />
              Ember
            </span>
            <span>
              <span className="legend-bead legend-bead--cobalt" />
              Cobalt
            </span>
            <span className="board-card__hint">Drag to rotate. Tap a floor tile to drop.</span>
          </div>
        </div>

        <aside className="room-sidebar">
          <section className="side-card side-card--players">
            <div className="side-card__heading">
              <span className="eyebrow">At the table</span>
              <span className="live-dot">LIVE</span>
            </div>
            <div className="player-list">
              {game.players.map((player) => (
                <PlayerRow key={player.color} player={player} />
              ))}
              {game.players.length < 2 ? (
                <div className="player-row player-row--empty">
                  <span className="player-avatar player-avatar--empty">+</span>
                  <span>
                    <strong>Open seat</strong>
                    <small>Send the room link</small>
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="side-card side-card--share">
            <div className="side-icon">
              <Link2 size={18} />
            </div>
            <div>
              <span className="eyebrow">Invite a friend</span>
              <p>One tap copies this room to your clipboard.</p>
            </div>
            <button className="button button--secondary button--wide" onClick={shareRoom}>
              {shareState === "copied" ? "Copied" : "Copy room link"} <Clipboard size={16} />
            </button>
          </section>

          <section className="side-card side-card--rules">
            <div className="side-card__heading">
              <span className="eyebrow">The short rules</span>
              <Sparkles size={16} />
            </div>
            <ol>
              <li>Choose any open column.</li>
              <li>Your bead drops to the bottom.</li>
              <li>Four in a straight line wins.</li>
            </ol>
            <p className="side-card__note">Lines can run flat, diagonal, or vertical.</p>
          </section>

          {game.status === "won" || game.status === "draw" ? (
            <button
              className="button button--primary button--wide"
              disabled={isWorking}
              onClick={onReset}
            >
              <RefreshCw size={16} /> New round
            </button>
          ) : null}
        </aside>
      </div>

      <footer className="room-footer">
        <span>
          You are{" "}
          <strong className={"inline-color inline-color--" + viewerColor}>{viewer.name}</strong>
        </span>
        <span>Room links are guest-only; keep yours private.</span>
      </footer>
    </section>
  );
}

function Board3D({
  board,
  winningLine,
  canDrop,
  currentColor,
  onDrop,
}: {
  board: Cell[];
  winningLine: Set<number>;
  canDrop: boolean;
  currentColor: Color;
  onDrop: (column: number) => Promise<void>;
}) {
  const [rotation, setRotation] = useState({ x: -18, y: 38 });
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rotationX: number;
    rotationY: number;
  } | null>(null);

  const nextIndexByColumn = useMemo(
    () =>
      Array.from({ length: COLUMN_COUNT }, (_, column) => {
        for (let level = 0; level < BOARD_SIZE; level += 1) {
          const index = level * COLUMN_COUNT + column;
          if (board[index] === null) {
            return index;
          }
        }
        return null;
      }),
    [board],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    if ((event.target as Element).closest("[data-column]")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rotationX: rotation.x,
      rotationY: rotation.y,
    };
    setIsDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - activeDrag.startX;
    const deltaY = event.clientY - activeDrag.startY;
    setRotation({
      x: Math.max(-68, Math.min(18, activeDrag.rotationX - deltaY * 0.34)),
      y: activeDrag.rotationY + deltaX * 0.42,
    });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) {
      return;
    }
    drag.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rotations: Partial<Record<string, { x: number; y: number }>> = {
      ArrowUp: { x: Math.min(18, rotation.x + 8), y: rotation.y },
      ArrowDown: { x: Math.max(-68, rotation.x - 8), y: rotation.y },
      ArrowLeft: { x: rotation.x, y: rotation.y - 10 },
      ArrowRight: { x: rotation.x, y: rotation.y + 10 },
    };
    const nextRotation = rotations[event.key];
    if (!nextRotation) {
      return;
    }
    event.preventDefault();
    setRotation(nextRotation);
  };

  const boardStyle = {
    "--board-rx": rotation.x + "deg",
    "--board-ry": rotation.y + "deg",
  } as CSSProperties;

  return (
    <div className="board3d">
      <div className="board3d__toolbar">
        <span>
          <span className="board3d__drag-dot" />
          Drag anywhere around the lattice
        </span>
        <button
          type="button"
          onClick={() => setRotation({ x: -18, y: 38 })}
          aria-label="Reset board view"
        >
          <RefreshCw size={13} /> Reset view
        </button>
      </div>

      <div
        className={"board3d__viewport" + (isDragging ? " board3d__viewport--dragging" : "")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="group"
        aria-label="Draggable three-dimensional Score Four board"
        aria-describedby="board-orbit-instructions"
      >
        <div className="board3d__orbit-ring board3d__orbit-ring--one" />
        <div className="board3d__orbit-ring board3d__orbit-ring--two" />

        <div className="board3d__world" style={boardStyle}>
          {Array.from({ length: BOARD_SIZE }, (_, level) => (
            <span
              className="board3d__plane"
              key={"plane-" + level}
              style={{
                transform: "translate3d(0, " + levelOffset(level) + "px, 0) rotateX(90deg)",
              }}
            />
          ))}

          {Array.from({ length: COLUMN_COUNT }, (_, column) => (
            <span
              className="board3d__rod"
              key={"rod-" + column}
              style={{
                transform:
                  "translate3d(" + columnX(column) + "px, 0, " + columnDepth(column) + "px)",
              }}
            />
          ))}

          {board.map((cell, index) => {
            const column = index % COLUMN_COUNT;
            const level = Math.floor(index / COLUMN_COUNT);
            const isNext = nextIndexByColumn[column] === index;
            const isWinning = winningLine.has(index);
            return (
              <span
                className="board3d__point"
                key={index}
                style={{
                  transform:
                    "translate3d(" +
                    columnX(column) +
                    "px, " +
                    levelOffset(level) +
                    "px, " +
                    columnDepth(column) +
                    "px)",
                }}
              >
                <span
                  className={
                    "board3d__point-face" +
                    (cell ? " board3d__orb board3d__orb--" + cell : " board3d__node") +
                    (isNext && canDrop
                      ? " board3d__node--next board3d__node--" + currentColor
                      : "") +
                    (isWinning ? " board3d__orb--winning" : "")
                  }
                >
                  {cell ? <span className="board3d__orb-shine" /> : null}
                </span>
              </span>
            );
          })}

          {Array.from({ length: COLUMN_COUNT }, (_, column) => {
            const isFull = nextIndexByColumn[column] === null;
            return (
              <button
                type="button"
                data-column={column}
                className={
                  "board3d__drop-pad" + (canDrop && !isFull ? " board3d__drop-pad--ready" : "")
                }
                disabled={!canDrop || isFull}
                key={"pad-" + column}
                onClick={() => void onDrop(column)}
                style={{
                  transform:
                    "translate3d(" +
                    columnX(column) +
                    "px, " +
                    (BOARD_SPAN / 2 + 31) +
                    "px, " +
                    columnDepth(column) +
                    "px) rotateX(90deg)",
                }}
                aria-label={
                  isFull
                    ? "Column " + COLUMN_LABELS[column] + " is full"
                    : "Drop in column " + COLUMN_LABELS[column]
                }
              >
                <span>{COLUMN_LABELS[column]}</span>
              </button>
            );
          })}
        </div>

        <span className="board3d__axis board3d__axis--height">height</span>
        <span className="board3d__axis board3d__axis--depth">depth</span>
      </div>

      <div className="board3d__caption" id="board-orbit-instructions">
        <span>4 wide</span>
        <span>Drag or use arrow keys to rotate</span>
        <span>4 high</span>
      </div>
    </div>
  );
}

function columnX(column: number) {
  return ((column % BOARD_SIZE) - (BOARD_SIZE - 1) / 2) * BOARD_SPACING;
}

function columnDepth(column: number) {
  return (Math.floor(column / BOARD_SIZE) - (BOARD_SIZE - 1) / 2) * BOARD_SPACING;
}

function levelOffset(level: number) {
  return ((BOARD_SIZE - 1) / 2 - level) * BOARD_SPACING;
}

function PlayerRow({ player }: { player: { name: string; color: Color; isViewer: boolean } }) {
  return (
    <div className="player-row">
      <span className={"player-avatar player-avatar--" + player.color}>
        <span />
      </span>
      <span className="player-row__name">
        <strong>{player.name}</strong>
        <small>{player.isViewer ? "You" : "Opponent"}</small>
      </span>
      {player.isViewer ? <span className="player-row__tag">YOU</span> : null}
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-notice" role="alert">
      <span>!</span>
      <p>{message}</p>
    </div>
  );
}

function LoadingScreen({ compact = false }: { compact?: boolean }) {
  return (
    <AppChrome>
      <section className={"loading-card" + (compact ? " loading-card--compact" : "")}>
        <span className="loading-cube">
          <span />
          <span />
          <span />
        </span>
        <span>{compact ? "Looking for the room..." : "Setting the table..."}</span>
      </section>
    </AppChrome>
  );
}
