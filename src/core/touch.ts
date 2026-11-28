// Touch input (v0.21): holding a finger on something shows its info (tooltip, unit card) instead of clicking it,
// and lifting the finger after dragging (map scrolling) does not click what is under it.
import Phaser from 'phaser';

/** How long a finger has to stay down to count as "hold" (ms). */
export const HOLD_MS = 480;

/** downTime of the touch that was used up by a hold or drag: its release does not click */
let consumedDown = -1;

/** Moved further than a tap (in game pixels, ~14 screen pixels). */
function moved(p: Phaser.Input.Pointer): boolean {
  const k = p.manager?.game?.scale?.displayScale?.x ?? 1;
  return p.getDistance() > 14 * k;
}

/** Mark this touch as used: releasing it will not click anything. */
export function consumeTouch(p: Phaser.Input.Pointer): void {
  consumedDown = p.downTime;
}

/** After HOLD_MS with the finger still down (and not moved), call `onHold` and use up the touch. */
export function onHold(p: Phaser.Input.Pointer, onHoldCb?: () => void): void {
  if (!p.wasTouch) return;
  const down = p.downTime;
  setTimeout(() => {
    if (!p.isDown || p.downTime !== down || moved(p)) return;
    consumeTouch(p);
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    onHoldCb?.();
  }, HOLD_MS);
}

/** True if this release should not click (hold or drag). */
export function touchUsedUp(p: Phaser.Input.Pointer): boolean {
  return p.wasTouch && (consumedDown === p.downTime || moved(p));
}

/** Objects that show info while hovered (tooltips, item details) are marked with holdInfo(). */
type Over = Phaser.GameObjects.GameObject & { holdInfo?: boolean };

/** Touch: holding this object shows its hover info, and lifting the finger then does not click it. */
export function holdInfo<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  (obj as Over).holdInfo = true;
  return obj;
}

/** Patch Phaser's input once: hold arms on touch start, used-up releases fire no up events. */
export function installTouch(): void {
  const proto = Phaser.Input.InputPlugin.prototype as unknown as {
    processDownEvents: (p: Phaser.Input.Pointer) => number;
    processUpEvents: (p: Phaser.Input.Pointer) => number;
    _temp: Over[];
  };
  const down = proto.processDownEvents;
  proto.processDownEvents = function (this: typeof proto, p: Phaser.Input.Pointer): number {
    const n = down.call(this, p);
    if (p.wasTouch && this._temp.some((o) => o.holdInfo)) onHold(p);
    return n;
  };
  const up = proto.processUpEvents;
  proto.processUpEvents = function (this: typeof proto, p: Phaser.Input.Pointer): number {
    if (touchUsedUp(p)) return 0;
    return up.call(this, p);
  };
}
