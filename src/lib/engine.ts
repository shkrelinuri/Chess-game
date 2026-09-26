export type EngineLevel = "casual" | "club" | "expert";

const engineSettings: Record<EngineLevel, { skill: number; thinkTime: number }> = {
  casual: { skill: 2, thinkTime: 180 },
  club: { skill: 8, thinkTime: 350 },
  expert: { skill: 16, thinkTime: 600 },
};

export type EngineCallbacks = {
  onReady: () => void;
  onMove: (move: string) => void;
};

export function createChessEngine(callbacks: EngineCallbacks) {
  const engine = new Worker("/engine/stockfish-19-lite-single.js");
  let ready = false;

  engine.addEventListener("message", (event: MessageEvent<string>) => {
    const message = event.data.trim();
    if (message === "uciok" && !ready) {
      ready = true;
      callbacks.onReady();
    }
    if (message.startsWith("bestmove ")) {
      callbacks.onMove(message.split(/\s+/)[1]);
    }
  });

  engine.postMessage("uci");

  return {
    get ready() {
      return ready;
    },
    move(fen: string, level: EngineLevel) {
      const settings = engineSettings[level];
      engine.postMessage(`setoption name Skill Level value ${settings.skill}`);
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go movetime ${settings.thinkTime}`);
    },
    stop() {
      engine.postMessage("stop");
    },
    destroy() {
      engine.terminate();
    },
  };
}