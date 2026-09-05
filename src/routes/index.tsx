import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, Check, Copy, HelpCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { WoodenBoard } from "../components/wooden-board";
import { ConvexClientProvider } from "../lib/convex";
import { emptyPosition, playLocalMove, PREVIEW_BOARD, WOOD_NAMES } from "../lib/game";
import type { BeadColor, Position, Room } from "../lib/game";

export const Route = createFileRoute("/")({ component: HomePage });
type Screen = { kind: "lobby" } | { kind: "local" } | { kind: "online"; roomKey: string };

function HomePage() {
  const [screen, setScreen] = useState<Screen>({ kind: "lobby" });
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    const readLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const roomKey = params.get("room")?.trim().toUpperCase();
      setScreen(
        roomKey
          ? { kind: "online", roomKey }
          : params.get("play") === "local"
            ? { kind: "local" }
            : { kind: "lobby" },
      );
    };
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);
  const navigate = (next: Screen) => {
    const url = new URL(window.location.href);
    url.search =
      next.kind === "online" && next.roomKey
        ? `?room=${next.roomKey}`
        : next.kind === "local"
          ? "?play=local"
          : "";
    window.history.pushState({}, "", url);
    setScreen(next);
  };
  return (
    <main className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => navigate({ kind: "lobby" })}
          aria-label="Score Four home"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            Score Four<span className="brand-period">.</span>
          </span>
        </button>
        <button className="quiet-button" onClick={() => setRulesOpen(true)}>
          <HelpCircle size={16} /> How to play
        </button>
      </header>
      {screen.kind === "lobby" ? (
        <Lobby
          onLocal={() => navigate({ kind: "local" })}
          onOnline={() => navigate({ kind: "online", roomKey: "" })}
        />
      ) : screen.kind === "local" ? (
        <LocalTable onBack={() => navigate({ kind: "lobby" })} />
      ) : (
        <ConvexClientProvider>
          <OnlineSession
            roomKey={screen.roomKey}
            onRoom={(roomKey) => navigate({ kind: "online", roomKey })}
            onBack={() => navigate({ kind: "lobby" })}
          />
        </ConvexClientProvider>
      )}
      {rulesOpen ? (
        <Dialog title="How to play" onClose={() => setRulesOpen(false)}>
          <div className="rule-beads" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>Take turns placing a bead on any peg with space. Each peg holds four beads.</p>
          <p>
            Make a straight line of four of your beads to win: across, up, or diagonally through the
            board.
          </p>
          <p className="muted">
            Drag to turn the board. Use the map to see every stack. With a keyboard, use the arrow
            keys between pegs and Enter to play.
          </p>
        </Dialog>
      ) : null}
    </main>
  );
}

function Lobby({ onLocal, onOnline }: { onLocal: () => void; onOnline: () => void }) {
  return (
    <section className="lobby">
      <div className="lobby-heading">
        <h1>
          Four in a row.
          <br />
          <span>In any direction.</span>
        </h1>
      </div>
      <WoodenBoard board={PREVIEW_BOARD} preview />
      <div className="lobby-actions">
        <button className="primary-button" onClick={onLocal}>
          Play on this device <ArrowRight size={17} />
        </button>
        <button className="secondary-button" onClick={onOnline}>
          Invite a friend
        </button>
      </div>
    </section>
  );
}

function LocalTable({ onBack }: { onBack: () => void }) {
  const [history, setHistory] = useState<Position[]>([emptyPosition()]);
  const [resetOpen, setResetOpen] = useState(false);
  const game = history[history.length - 1];
  const status =
    game.status === "won" && game.winner
      ? `${WOOD_NAMES[game.winner]} wins`
      : game.status === "draw"
        ? "A draw"
        : `${WOOD_NAMES[game.currentColor]}'s turn`;
  const finished = game.status !== "playing";
  return (
    <section
      className="table"
      data-game-status={game.status}
      data-current-player={WOOD_NAMES[game.currentColor].toLowerCase()}
    >
      <div className="table-bar">
        <button className="quiet-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <span className="table-mode">On this device</span>
        <button
          className="quiet-button"
          disabled={history.length === 1}
          onClick={() => setHistory((value) => value.slice(0, -1))}
        >
          Undo
        </button>
      </div>
      <TableStatus color={game.winner ?? game.currentColor} status={status} />
      <WoodenBoard
        board={game.board}
        winningLine={game.winningLine ?? []}
        canDrop={!finished}
        currentColor={game.currentColor}
        onDrop={(column) =>
          setHistory((value) => [...value, playLocalMove(value[value.length - 1], column)])
        }
      />
      <div className="table-footer">
        <Player color="ember" name="Maple" active={!finished && game.currentColor === "ember"} />
        <button
          className={finished ? "primary-button" : "quiet-button"}
          onClick={() =>
            finished || history.length === 1 ? setHistory([emptyPosition()]) : setResetOpen(true)
          }
        >
          <RotateCcw size={15} /> {finished ? "Play again" : "New game"}
        </button>
        <Player color="cobalt" name="Walnut" active={!finished && game.currentColor === "cobalt"} />
      </div>
      {resetOpen ? (
        <Dialog title="Start a new game?" onClose={() => setResetOpen(false)}>
          <p>This clears the current board.</p>
          <button
            className="primary-button"
            onClick={() => {
              setHistory([emptyPosition()]);
              setResetOpen(false);
            }}
          >
            New game <ArrowRight size={16} />
          </button>
        </Dialog>
      ) : null}
    </section>
  );
}

function OnlineSession({
  roomKey,
  onRoom,
  onBack,
}: {
  roomKey: string;
  onRoom: (key: string) => void;
  onBack: () => void;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (isLoading || isAuthenticated || started.current) return;
    started.current = true;
    void signIn("anonymous").catch((cause: unknown) => setError(errorMessage(cause)));
  }, [isLoading, isAuthenticated, signIn]);
  if (!isAuthenticated)
    return (
      <section className="connection-state">
        <h1>{error ? "Could not connect" : "Opening your table…"}</h1>
        {error ? (
          <>
            <ErrorNotice message={error} />
            <button className="secondary-button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </>
        ) : (
          <p className="muted">Starting a guest session.</p>
        )}
        <button className="quiet-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
      </section>
    );
  return <OnlineRoom roomKey={roomKey} onRoom={onRoom} onBack={onBack} />;
}

function OnlineRoom({
  roomKey,
  onRoom,
  onBack,
}: {
  roomKey: string;
  onRoom: (key: string) => void;
  onBack: () => void;
}) {
  const game = useQuery(api.games.get, roomKey ? { roomKey } : "skip");
  const create = useMutation(api.games.create);
  const join = useMutation(api.games.join);
  const drop = useMutation(api.games.drop);
  const reset = useMutation(api.games.reset);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    try {
      setName(window.localStorage.getItem("score-four-name") ?? "");
    } catch {
      /* Storage is optional for guests. */
    }
  }, []);
  const action = async (run: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const enter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const safeName = name.trim().slice(0, 24) || "Guest";
    try {
      window.localStorage.setItem("score-four-name", safeName);
    } catch {
      /* Play without saving the name. */
    }
    void action(async () => {
      if (roomKey) await join({ roomKey, name: safeName });
      else onRoom((await create({ name: safeName })).roomKey);
    });
  };
  if (roomKey && game === undefined)
    return (
      <section className="connection-state" role="status">
        <h1>Opening the room…</h1>
      </section>
    );
  if (roomKey && game === null)
    return (
      <section className="connection-state">
        <h1>Room not found</h1>
        <p>Check the invite link or start a new room.</p>
        <button className="secondary-button" onClick={() => onRoom("")}>
          New room
        </button>
      </section>
    );
  const viewer = game?.players.find((player) => player.isViewer);
  if (!roomKey || (game && !viewer)) {
    const full = game && game.players.length >= 2;
    return (
      <section className="entry-page">
        <button className="quiet-button entry-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="entry-board">
          <WoodenBoard board={game?.board ?? PREVIEW_BOARD} preview />
        </div>
        <form className="entry-form" onSubmit={enter}>
          <h1>{full ? "This room is full" : roomKey ? "Take a seat." : "Bring a friend."}</h1>
          <p className="muted">
            {full
              ? "Start another room to play together."
              : roomKey
                ? `${game?.players[0]?.name ?? "Your friend"} invited you to play.`
                : "Create a room and send them the link."}
          </p>
          {full ? (
            <button type="button" className="primary-button" onClick={() => onRoom("")}>
              New room
            </button>
          ) : (
            <>
              <label htmlFor="player-name">Your name</label>
              <input
                id="player-name"
                autoComplete="nickname"
                placeholder="Guest"
                maxLength={24}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Opening…" : roomKey ? "Join game" : "Create room"}
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {error ? <ErrorNotice message={error} /> : null}
        </form>
      </section>
    );
  }
  if (!game || !viewer) return null;
  return (
    <SharedTable
      game={game}
      viewer={viewer}
      busy={busy}
      error={error}
      onBack={onBack}
      onDrop={(column) => {
        void action(() => drop({ roomKey, column }));
      }}
      onReset={() => {
        void action(() => reset({ roomKey }));
      }}
    />
  );
}

function SharedTable({
  game,
  viewer,
  busy,
  error,
  onDrop,
  onReset,
  onBack,
}: {
  game: Room;
  viewer: Room["players"][number];
  busy: boolean;
  error: string;
  onDrop: (column: number) => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [link, setLink] = useState("");
  const isYourTurn = game.status === "playing" && viewer.color === game.currentColor;
  const finished = game.status === "won" || game.status === "draw";
  const current = game.players.find((player) => player.color === game.currentColor);
  const winner = game.players.find((player) => player.color === game.winner);
  const status =
    game.status === "waiting"
      ? "Waiting for your friend"
      : game.status === "won"
        ? `${winner?.name ?? "Your friend"} wins`
        : game.status === "draw"
          ? "A draw"
          : isYourTurn
            ? "Your turn"
            : `${current?.name ?? "Your friend"}'s turn`;
  useEffect(() => {
    setLink(window.location.href);
  }, [game.roomKey]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError("Select and copy the invite link below.");
    }
  };
  return (
    <section
      className="table"
      data-game-status={game.status}
      data-current-player={WOOD_NAMES[game.currentColor].toLowerCase()}
      aria-busy={busy}
    >
      <div className="table-bar">
        <button className="quiet-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <span className="table-mode">Room {game.roomKey}</span>
        <button
          className="quiet-button"
          onClick={() => {
            void copyLink();
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Invite"}
        </button>
      </div>
      <TableStatus color={game.winner ?? game.currentColor} status={status} />
      {error ? <ErrorNotice message={error} /> : null}
      {copyError ? (
        <p className="copy-fallback" role="status">
          {copyError}
          <input
            readOnly
            aria-label="Room invite link"
            value={link}
            onFocus={(event) => event.currentTarget.select()}
          />
        </p>
      ) : null}
      <WoodenBoard
        board={game.board}
        winningLine={game.winningLine ?? []}
        canDrop={isYourTurn && !busy}
        currentColor={game.currentColor}
        onDrop={onDrop}
      />
      <div className="table-footer">
        {(["ember", "cobalt"] satisfies BeadColor[]).map((color) => {
          const player = game.players.find((candidate) => candidate.color === color);
          return (
            <Player
              key={color}
              color={color}
              name={player ? `${player.name}${player.isViewer ? " (you)" : ""}` : "Open seat"}
              active={game.status === "playing" && game.currentColor === color}
            />
          );
        })}
        {game.status === "waiting" ? (
          <button
            className="primary-button"
            onClick={() => {
              void copyLink();
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        ) : null}
        {finished ? (
          <button className="primary-button" disabled={busy} onClick={onReset}>
            <RotateCcw size={15} /> Play again
          </button>
        ) : null}
      </div>
    </section>
  );
}

function TableStatus({ color, status }: { color: BeadColor; status: string }) {
  return (
    <div className="table-status" role="status" aria-live="polite" aria-atomic="true">
      <span className={`status-bead status-bead--${color}`} aria-hidden="true" />
      <h1>{status}</h1>
    </div>
  );
}

function Player({ color, name, active }: { color: BeadColor; name: string; active: boolean }) {
  return (
    <div className={`player${active ? " player--active" : ""}`}>
      <span className={`status-bead status-bead--${color}`} aria-hidden="true" />
      <span>{name}</span>
    </div>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <button className="close-button" aria-label="Close" onClick={onClose}>
          <X size={19} />
        </button>
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
function ErrorNotice({ message }: { message: string }) {
  return (
    <p className="error-notice" role="alert">
      {message}
    </p>
  );
}
