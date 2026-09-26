"use client";

import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { io, type Socket } from "socket.io-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createChessEngine, type EngineLevel } from "@/lib/engine";
import type { GameView, Side, TimeControl } from "../../server/game-session";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/socket-protocol";
import { SiteHeader } from "@/components/site-header";

type PlayerSide = "white" | "black";
type GameMove = { san: string; color: "w" | "b"; from: Square; to: Square; promotion?: string };
type PlayMode = "computer" | "online";

const timeControls: { id: TimeControl; label: string }[] = [
  { id: "bullet-1-0", label: "Bullet · 1|0" },
  { id: "blitz-3-2", label: "Blitz · 3|2" },
  { id: "blitz-5-0", label: "Blitz · 5|0" },
  { id: "rapid-10-0", label: "Rapid · 10|0" },
  { id: "rapid-15-10", label: "Rapid · 15|10" },
  { id: "classical-30-0", label: "Classical · 30|0" },
];

const levels: { id: EngineLevel; label: string; detail: string }[] = [
  { id: "casual", label: "Easy", detail: "A relaxed sparring partner" },
  { id: "club", label: "Intermediate", detail: "A thoughtful club player" },
  { id: "expert", label: "Strong", detail: "A serious test" },
];

function resultText(game: Chess) {
  if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
  if (game.isStalemate()) return "Draw by stalemate";
  if (game.isThreefoldRepetition()) return "Draw by repetition";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material";
  if (game.isDraw()) return "Game drawn";
  return game.isCheck() ? "Check" : "Your move";
}

function formatClock(milliseconds: number | undefined) {
  const totalSeconds = Math.max(0, Math.ceil((milliseconds ?? 0) / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function onlineResultText(game: GameView) {
  if (!game.result) return game.inCheck ? "Check" : "Game over";
  if (game.result.type === "agreement") return "Draw by agreement";
  if (game.result.type === "timeout") return `${game.result.winner === "white" ? "White" : "Black"} wins on time`;
  if (game.result.type === "resignation") return `${game.result.winner === "white" ? "White" : "Black"} wins by resignation`;
  if (game.result.type === "checkmate") return `${game.result.winner === "white" ? "White" : "Black"} wins by checkmate`;
  if (game.result.type === "stalemate") return "Draw by stalemate";
  return "Game drawn";
}

function ClockDisplay({ milliseconds, active, syncAt }: { milliseconds: number | undefined; active: boolean; syncAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = Math.max(0, (milliseconds ?? 0) - (active ? Math.max(0, now - syncAt) : 0));
  return <>{formatClock(remaining)}</>;
}

export default function Home() {
  const gameRef = useRef(new Chess());
  const engineRef = useRef<ReturnType<typeof createChessEngine> | null>(null);
  const humanSideRef = useRef<PlayerSide>("white");
  const moveCallbackRef = useRef<(move: string) => void>(() => {});
  const epochRef = useRef(0);
  const thinkingRef = useRef(false);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const pendingFenRef = useRef<string | null>(null);
  const [fen, setFen] = useState(() => new Chess().fen());
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [humanSide, setHumanSide] = useState<PlayerSide>("white");
  const [level, setLevel] = useState<EngineLevel>("club");
  const [promotion, setPromotion] = useState("q");
  const [engineReady, setEngineReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [gameNumber, setGameNumber] = useState(1);
  const [mode, setMode] = useState<PlayMode>("computer");
  const [onlineConnected, setOnlineConnected] = useState(false);
  const [searching, setSearching] = useState(false);
  const [timeControl, setTimeControl] = useState<TimeControl>("blitz-3-2");
  const [onlineGame, setOnlineGame] = useState<GameView | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState<string | null>(null);
  const [onlineError, setOnlineError] = useState("");
  const [onlineMovePending, setOnlineMovePending] = useState(false);
  const [clockReceivedAt, setClockReceivedAt] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const onlineSide: Side = onlineGame && onlinePlayerId
    ? onlineGame.players.white === onlinePlayerId ? "white" : "black"
    : "white";
  const sideToPlay = mode === "online" ? onlineSide : humanSide;
  const visibleSans = mode === "online" ? onlineGame?.sanMoves ?? [] : moves.map((move) => move.san);
  const liveFen = mode === "online" ? onlineGame?.fen ?? new Chess().fen() : fen;

  const snapshotAt = useCallback((ply: number, sans: string[]) => {
    const snapshot = new Chess();
    sans.slice(0, ply).forEach((san) => snapshot.move(san));
    return snapshot.fen();
  }, []);

  const displayedFen = reviewPly === null ? liveFen : snapshotAt(reviewPly, visibleSans);
  const shownGame = useMemo(() => new Chess(displayedFen), [displayedFen]);
  const liveGame = useMemo(() => new Chess(liveFen), [liveFen]);
  const gameOver = mode === "online" ? onlineGame?.status === "finished" : liveGame.isGameOver();
  const levelInfo = levels.find((item) => item.id === level) ?? levels[1];

  useEffect(() => {
    const socket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001",
      { autoConnect: false },
    ) as Socket<ServerToClientEvents, ClientToServerEvents>;
    socketRef.current = socket;
    socket.on("connect", () => setOnlineConnected(true));
    socket.on("disconnect", () => {
      setOnlineConnected(false);
      setSearching(false);
    });
    socket.on("queue:status", (status) => setSearching(status === "searching"));
    socket.on("game:started", ({ game, playerId }) => {
      setOnlineGame(game);
      setClockReceivedAt(Date.now());
      setOnlinePlayerId(playerId);
      setOnlineMovePending(false);
      setSelectedSquare(null);
      setSearching(false);
      setOnlineError("");
      setReviewPly(null);
      setGameNumber((number) => number + 1);
      setMode("online");
    });
    socket.on("game:state", (game) => {
      setOnlineGame(game);
      setClockReceivedAt(Date.now());
      if (game.status === "finished" || pendingFenRef.current === game.fen) {
        pendingFenRef.current = null;
        setOnlineMovePending(false);
      }
      setSelectedSquare(null);
    });
    socket.on("game:error", (message) => {
      setOnlineError(message);
      pendingFenRef.current = null;
      setOnlineMovePending(false);
      setSearching(false);
    });
    socket.connect();
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const syncFromGame = useCallback(() => {
    const game = gameRef.current;
    setFen(game.fen());
    setMoves(game.history({ verbose: true }).map(({ san, color, from, to, promotion }) => ({ san, color, from, to, promotion })));
    setReviewPly(null);
  }, []);

  const startNewGame = useCallback(() => {
    if (thinkingRef.current) engineRef.current?.stop();
    epochRef.current += 1;
    thinkingRef.current = false;
    setThinking(false);
    const game = new Chess();
    gameRef.current = game;
    setFen(game.fen());
    setMoves([]);
    setReviewPly(null);
    setGameNumber((number) => number + 1);
  }, []);

  useEffect(() => {
    const engine = createChessEngine({
      onReady: () => setEngineReady(true),
      onMove: (move) => moveCallbackRef.current(move),
    });
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    if (mode !== "computer") return;
    if (!engineReady || gameOver || gameRef.current.turn() === (humanSide === "white" ? "w" : "b")) return;
    if (thinkingRef.current || !engineRef.current) return;

    const gameEpoch = epochRef.current;
    thinkingRef.current = true;
    setThinking(true);
    moveCallbackRef.current = (uciMove) => {
      if (gameEpoch !== epochRef.current) return;
      const from = uciMove.slice(0, 2) as Square;
      const to = uciMove.slice(2, 4) as Square;
      const move = gameRef.current.move({ from, to, promotion: uciMove[4] ?? "q" });
      if (move) syncFromGame();
      thinkingRef.current = false;
      setThinking(false);
    };
    engineRef.current.move(fen, level);
  }, [engineReady, fen, gameOver, humanSide, level, mode, syncFromGame]);

  const tryMove = useCallback((sourceSquare: string, targetSquare: string) => {
    if (reviewPly !== null || gameOver || (mode === "online" ? onlineMovePending : thinkingRef.current)) return false;
    if (mode === "online") {
      if (!onlineGame || onlineGame.status !== "active" || onlineGame.turn !== onlineSide || !socketRef.current) return false;
      const predictedGame = new Chess(onlineGame.fen);
      try {
        predictedGame.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion });
      } catch {
        return false;
      }
      pendingFenRef.current = predictedGame.fen();
      setOnlineMovePending(true);
      socketRef.current.emit("game:move", { from: sourceSquare, to: targetSquare, promotion });
      return true;
    }
    if (gameRef.current.turn() !== (humanSideRef.current === "white" ? "w" : "b")) return false;
    try {
      const move = gameRef.current.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion,
      });
      if (!move) return false;
      syncFromGame();
      return true;
    } catch {
      return false;
    }
  }, [gameOver, mode, onlineGame, onlineMovePending, onlineSide, promotion, reviewPly, syncFromGame]);

  const onPieceDrop = useCallback(({ sourceSquare, targetSquare }: {
    piece: { pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!targetSquare) return false;
    const accepted = tryMove(sourceSquare, targetSquare);
    return mode === "online" ? false : accepted;
  }, [mode, tryMove]);

  const onSquareClick = useCallback(({ piece, square }: { piece: { pieceType: string } | null; square: string }) => {
    const canSelect = mode === "online"
      ? onlineConnected && onlineGame?.status === "active" && onlineGame.turn === onlineSide && !onlineMovePending
      : !thinking && !gameOver && liveGame.turn() === (humanSide === "white" ? "w" : "b");
    if (!canSelect) return;
    if (selectedSquare === null) {
      if (piece?.pieceType[0] === sideToPlay[0]) setSelectedSquare(square as Square);
      return;
    }
    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }
    if (tryMove(selectedSquare, square)) {
      setSelectedSquare(null);
      return;
    }
    if (piece?.pieceType[0] === sideToPlay[0]) setSelectedSquare(square as Square);
  }, [gameOver, humanSide, liveGame, mode, onlineConnected, onlineGame, onlineMovePending, onlineSide, selectedSquare, sideToPlay, thinking, tryMove]);

  const changeSide = (side: PlayerSide) => {
    humanSideRef.current = side;
    setHumanSide(side);
    startNewGame();
  };

  const joinQueue = () => {
    setMode("online");
    setOnlineError("");
    setReviewPly(null);
    if (!onlineConnected) {
      setOnlineError("The game server is not connected yet.");
      return;
    }
    socketRef.current?.emit("queue:join", timeControl);
  };

  const leaveQueue = () => socketRef.current?.emit("queue:cancel");
  const changeMode = (nextMode: PlayMode) => {
    if (onlineGame?.status === "active") return;
    if (searching) leaveQueue();
    setMode(nextMode);
    setReviewPly(null);
    setOnlineError("");
  };

  const onlineTurnOwned = Boolean(onlineGame && onlineGame.status === "active" && onlineGame.turn === onlineSide);
  const activeSide: Side | null = mode === "online"
    ? gameOver ? null : onlineGame?.turn ?? null
    : gameOver ? null : liveGame.turn() === "w" ? "white" : "black";
  const canDrag = mode === "online"
    ? onlineConnected && onlineTurnOwned && !onlineMovePending
    : !thinking && !gameOver && activeSide === humanSide;

  const boardOptions = {
    position: displayedFen,
    boardOrientation: sideToPlay,
    allowDragging: reviewPly === null && canDrag && !gameOver,
    canDragPiece: ({ piece }: { piece: { pieceType: string } }) =>
      piece.pieceType[0] === sideToPlay[0] && canDrag,
    onPieceDrop,
    onSquareClick,
    squareStyles: selectedSquare ? { [selectedSquare]: { boxShadow: "inset 0 0 0 4px rgba(230, 157, 86, .82)" } } : {},
    showAnimations: true,
    animationDurationInMs: 150,
    boardStyle: { borderRadius: 4, overflow: "hidden" },
    lightSquareStyle: { backgroundColor: "#e8e9df" },
    darkSquareStyle: { backgroundColor: "#71847a" },
    darkSquareNotationStyle: { color: "#edf1e9" },
    lightSquareNotationStyle: { color: "#68766d" },
    dropSquareStyle: { boxShadow: "inset 0 0 0 4px rgba(230, 157, 86, .72)" },
  };

  const turnText = mode === "online"
    ? onlineGame?.status === "finished"
      ? onlineResultText(onlineGame)
      : searching
        ? "Finding an opponent…"
        : onlineGame?.drawOfferBy && onlineGame.drawOfferBy !== onlinePlayerId
          ? "Opponent offers a draw"
          : onlineGame?.turn === onlineSide
            ? "Your move"
            : onlineGame
              ? "Opponent to move"
              : onlineConnected ? "Choose a time control" : "Connecting to game server…"
    : thinking ? "Engine is thinking" : gameOver ? resultText(liveGame) : resultText(shownGame);
  const opponentSide: Side = onlineSide === "white" ? "black" : "white";
  const opponentClock = onlineGame?.clocks[opponentSide];
  const playerClock = onlineGame?.clocks[onlineSide];
  const selectedTimeLabel = timeControls.find((item) => item.id === (onlineGame?.timeControl ?? timeControl))?.label ?? "Online game";

  return (
    <main className="app-shell">
      <SiteHeader active="play" />

      <div className="page-content" id="play">
        <div className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" />THE PRACTICE ROOM</div>
            <h1>Play a game<span>.</span></h1>
          </div>
          <div className="game-tag"><span className="tag-dot" />GAME {String(gameNumber).padStart(2, "0")}</div>
        </div>

        <div className="mode-switcher" role="group" aria-label="Choose game mode">
          <button className={mode === "computer" ? "mode-selected" : ""} onClick={() => changeMode("computer")} disabled={onlineGame?.status === "active"}>♟ <span>Vs computer</span></button>
          <button className={mode === "online" ? "mode-selected" : ""} onClick={() => changeMode("online")} disabled={onlineGame?.status === "active"}>◎ <span>Online</span></button>
          <span className={`connection-state ${onlineConnected ? "connection-ready" : ""}`}><i />{onlineConnected ? "SERVER CONNECTED" : "SERVER OFFLINE"}</span>
        </div>

        <section className="game-layout" aria-label="Chess game">
          <div className="board-column">
            <div className={`player-bar ${activeSide === (sideToPlay === "white" ? "black" : "white") ? "player-active" : ""}`}>
              <div className="player-identity"><span className="engine-avatar">{mode === "computer" ? "♞" : "?"}</span><div><strong>{mode === "computer" ? "Stockfish" : "Opponent"}</strong><span>{mode === "computer" ? `${levelInfo.label} engine` : onlineGame ? selectedTimeLabel : "Random opponent"}</span></div></div>
              <div className={`clock ${activeSide === opponentSide && mode === "online" ? "clock-running" : ""}`}>{mode === "online" && onlineGame ? <ClockDisplay milliseconds={opponentClock} active={onlineGame.status === "active" && onlineGame.turn === opponentSide} syncAt={clockReceivedAt} /> : "UNTIMED"}</div>
            </div>
            <div className="board-frame">
              <Chessboard options={boardOptions} />
              {reviewPly !== null && <div className="review-ribbon">REVIEWING POSITION</div>}
            </div>
            <div className={`player-bar human-bar ${activeSide === sideToPlay ? "player-active" : ""}`}>
              <div className="player-identity"><span className="avatar player-avatar">Y</span><div><strong>You <span className="rating-label">· 1200</span></strong><span>{sideToPlay === "white" ? "White pieces" : "Black pieces"}</span></div></div>
              <div className={`clock ${activeSide === sideToPlay && mode === "online" ? "clock-running" : ""}`}>{mode === "online" && onlineGame ? <ClockDisplay milliseconds={playerClock} active={onlineGame.status === "active" && onlineGame.turn === onlineSide} syncAt={clockReceivedAt} /> : "UNTIMED"}</div>
            </div>
            <div className="board-tools">
              <div className="orientation-label"><span className="mini-board-icon">▦</span> Playing as {sideToPlay}</div>
              <div className="review-controls" aria-label="Move review controls">
                <button title="Go to start" aria-label="Go to start" disabled={visibleSans.length === 0} onClick={() => setReviewPly(0)}>⇤</button>
                <button title="Previous move" aria-label="Previous move" disabled={visibleSans.length === 0} onClick={() => setReviewPly((ply) => Math.max(0, (ply ?? visibleSans.length) - 1))}>‹</button>
                <span>{reviewPly ?? visibleSans.length} / {visibleSans.length}</span>
                <button title="Next move" aria-label="Next move" disabled={reviewPly === null || reviewPly >= visibleSans.length} onClick={() => setReviewPly((ply) => Math.min(visibleSans.length, (ply ?? 0) + 1))}>›</button>
                <button title="Return to live game" aria-label="Return to live game" disabled={reviewPly === null} onClick={() => setReviewPly(null)}>⇥</button>
              </div>
            </div>
          </div>

          <aside className="side-panel">
            <div className="panel-heading"><div><span className="section-kicker">YOUR NEXT MOVE</span><h2>Make it count</h2></div><span className="spark-icon">✳</span></div>
            <div className={`turn-status ${gameOver ? "status-ended" : ""}`}><span className={`turn-indicator ${activeSide === "black" ? "turn-black" : ""}`} />{turnText}</div>

            {mode === "computer" ? <>
              <div className="control-block">
                <label className="control-label" htmlFor="difficulty">OPPONENT</label>
                <select id="difficulty" value={level} onChange={(event) => setLevel(event.target.value as EngineLevel)} disabled={thinking}>
                  {levels.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
                </select>
                <span className="control-hint">{levelInfo.detail}</span>
              </div>

              <div className="control-block">
                <span className="control-label">YOUR COLOR</span>
                <div className="segmented-control" role="group" aria-label="Choose your color">
                  <button className={humanSide === "white" ? "segment-selected" : ""} onClick={() => changeSide("white")}><span className="piece-white">♙</span> White</button>
                  <button className={humanSide === "black" ? "segment-selected" : ""} onClick={() => changeSide("black")}><span className="piece-black">♟</span> Black</button>
                </div>
              </div>

              <div className="control-block compact-control">
                <label className="control-label" htmlFor="promotion">PROMOTION</label>
                <select id="promotion" value={promotion} onChange={(event) => setPromotion(event.target.value)}>
                  <option value="q">Queen</option><option value="r">Rook</option><option value="b">Bishop</option><option value="n">Knight</option>
                </select>
              </div>

              <div className="action-row">
                <button className="primary-action" onClick={() => startNewGame()}><span>↻</span> New game</button>
                <button className="secondary-action" title="Undo last turn" aria-label="Undo last turn" onClick={() => {
                  if (thinkingRef.current) return;
                  gameRef.current.undo();
                  if (gameRef.current.turn() !== (humanSide === "white" ? "w" : "b")) gameRef.current.undo();
                  epochRef.current += 1;
                  thinkingRef.current = false;
                  setThinking(false);
                  syncFromGame();
                }} disabled={moves.length === 0 || thinking}>↶</button>
              </div>
            </> : <>
              {!onlineGame || onlineGame.status === "finished" ? <>
                <div className="control-block">
                  <label className="control-label" htmlFor="time-control">TIME CONTROL</label>
                  <select id="time-control" value={timeControl} onChange={(event) => setTimeControl(event.target.value as TimeControl)} disabled={searching}>
                    {timeControls.map((control) => <option value={control.id} key={control.id}>{control.label}</option>)}
                  </select>
                  <span className="control-hint">Clock starts when the game is paired.</span>
                </div>
                <div className="action-row online-queue-actions">
                  <button className="primary-action" onClick={searching ? leaveQueue : joinQueue} disabled={!onlineConnected && !searching}>
                    <span>{searching ? "×" : "◎"}</span>{searching ? "Cancel search" : "Find opponent"}
                  </button>
                </div>
              </> : <div className="online-actions">
                {onlineGame.drawOfferBy && onlineGame.drawOfferBy !== onlinePlayerId ? <>
                  <button className="primary-action" onClick={() => socketRef.current?.emit("game:draw-response", true)}>Accept draw</button>
                  <button className="secondary-action" onClick={() => socketRef.current?.emit("game:draw-response", false)}>Decline</button>
                </> : <button className="secondary-action" onClick={() => socketRef.current?.emit("game:draw-offer")} disabled={Boolean(onlineGame.drawOfferBy)}>Offer draw</button>}
                <button className="resign-action" onClick={() => socketRef.current?.emit("game:resign")}>Resign</button>
              </div>}
            </>}
            {onlineError && mode === "online" && <div className="online-error" role="alert">{onlineError}</div>}

            <div className="moves-section">
              <div className="moves-heading"><span className="control-label">MOVE HISTORY</span><span className="move-count">{visibleSans.length} PLY</span></div>
              <div className="move-list" aria-label="Move list">
                {visibleSans.length === 0 ? <div className="empty-moves"><span>♟</span><p>{mode === "online" && !onlineGame ? "Your game will appear here." : "Your first move starts the story."}</p></div> :
                  Array.from({ length: Math.ceil(visibleSans.length / 2) }, (_, row) => {
                    const whiteMove = visibleSans[row * 2];
                    const blackMove = visibleSans[row * 2 + 1];
                    return <div className="move-row" key={row}>
                      <span className="move-number">{row + 1}.</span>
                      <button className={reviewPly === row * 2 + 1 ? "move-selected" : ""} onClick={() => setReviewPly(row * 2 + 1)}>{whiteMove}</button>
                      {blackMove ? <button className={reviewPly === row * 2 + 2 ? "move-selected" : ""} onClick={() => setReviewPly(row * 2 + 2)}>{blackMove}</button> : <span />}
                    </div>;
                  })}
              </div>
            </div>
            <div className="engine-note"><span className="engine-pulse" />{mode === "online" ? onlineConnected ? "Server clock · authoritative" : "Waiting for game server" : engineReady ? "Stockfish 19 · WASM engine ready" : "Waking the engine…"}</div>
          </aside>
        </section>

        <footer className="page-footer"><span>ONE POSITION AT A TIME.</span><span>♞ &nbsp; THINK WELL. PLAY BOLDLY.</span><span>ENDGAME CHESS CLUB</span></footer>
      </div>
    </main>
  );
}