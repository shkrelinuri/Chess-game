import { TIME_CONTROLS, type TimeControl } from "./game-session";

export type Pairing = { first: string; second: string; timeControl: TimeControl };

export class Matchmaker {
  private readonly waiting = new Map<TimeControl, string[]>();
  private readonly playerControl = new Map<string, TimeControl>();

  join(playerId: string, timeControl: TimeControl): Pairing | null {
    if (!TIME_CONTROLS.includes(timeControl)) throw new Error("Unsupported time control");
    this.leave(playerId);
    const queue = this.waiting.get(timeControl) ?? [];
    const opponent = queue.shift();
    if (opponent) {
      this.playerControl.delete(opponent);
      if (queue.length === 0) this.waiting.delete(timeControl);
      return { first: opponent, second: playerId, timeControl };
    }

    queue.push(playerId);
    this.waiting.set(timeControl, queue);
    this.playerControl.set(playerId, timeControl);
    return null;
  }

  leave(playerId: string): boolean {
    const timeControl = this.playerControl.get(playerId);
    if (!timeControl) return false;
    const queue = this.waiting.get(timeControl);
    if (queue) {
      const index = queue.indexOf(playerId);
      if (index >= 0) queue.splice(index, 1);
      if (queue.length === 0) this.waiting.delete(timeControl);
    }
    this.playerControl.delete(playerId);
    return true;
  }
}