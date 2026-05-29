import { BASE_MOUSE_RADIANS_PER_PIXEL } from '../player/mouseSensitivity';
import type { TouchControlSettings } from './touchSettings';

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export type TouchCallbacks = {
  onPrimaryStart: (point: { clientX: number; clientY: number }) => void;
  onPrimaryStop: () => void;
  onSecondaryTap: (point: { clientX: number; clientY: number }) => void;
  onSecondaryStop: () => void;
  onAudioResume: () => void;
};

const JOYSTICK_RADIUS = 60;
const JOYSTICK_DEADZONE = 15;
const HOLD_TO_MINE_MS = 320;
const LOOK_THRESHOLD_PX = 8;

export class TouchControls {
  private readonly containerEl: HTMLDivElement;
  private readonly joystickEl: HTMLDivElement;
  private readonly knobEl: HTMLDivElement;
  private readonly jumpBtn: HTMLButtonElement;
  private readonly runBtn: HTMLButtonElement;
  private readonly crouchBtn: HTMLButtonElement;

  private joystickTouchId: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;

  private lookTouchId: number | null = null;
  private lookStartX = 0;
  private lookStartY = 0;
  private lookLastX = 0;
  private lookLastY = 0;
  private lookMoved = false;
  private miningFromTouch = false;
  private holdTimer: number | null = null;

  private visible = false;
  private runLocked = false;
  private crouchLocked = false;

  constructor(
    private readonly keys: Set<string>,
    private readonly player: { yaw: number; pitch: number },
    private readonly getSensitivity: () => number,
    private readonly callbacks: TouchCallbacks,
  ) {
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'touch-controls hidden';

    this.joystickEl = document.createElement('div');
    this.joystickEl.className = 'touch-joystick';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'touch-joystick-knob';
    this.joystickEl.appendChild(this.knobEl);
    this.containerEl.appendChild(this.joystickEl);

    this.jumpBtn = this.createButton('touch-btn touch-btn-jump', '&#x25B2;', 'Jump');
    this.runBtn = this.createButton('touch-btn touch-btn-run', '&#x21E7;', 'Run lock');
    this.crouchBtn = this.createButton('touch-btn touch-btn-crouch', '&#x25BC;', 'Crouch');

    document.body.appendChild(this.containerEl);

    this.bindEvents();
  }

  applySettings(settings: TouchControlSettings): void {
    this.containerEl.style.setProperty('--touch-scale', String(settings.scale));
    this.containerEl.style.setProperty('--touch-opacity', String(settings.opacity));
  }

  private createButton(className: string, icon: string, label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = className;
    btn.innerHTML = icon;
    btn.ariaLabel = label;
    btn.title = label;
    btn.type = 'button';
    this.containerEl.appendChild(btn);
    return btn;
  }

  private bindEvents(): void {
    document.addEventListener('touchstart', this.onTouchStart, { passive: false });
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
    document.addEventListener('touchend', this.onTouchEnd);
    document.addEventListener('touchcancel', this.onTouchEnd);

    this.jumpBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.keys.add('Space');
      this.jumpBtn.classList.add('pressed');
    });
    this.jumpBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.keys.delete('Space');
      this.jumpBtn.classList.remove('pressed');
    });
    this.jumpBtn.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      this.keys.delete('Space');
      this.jumpBtn.classList.remove('pressed');
    });

    this.runBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.runLocked = !this.runLocked;
      this.syncLockButtons();
    });

    this.crouchBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.crouchLocked = !this.crouchLocked;
      this.syncLockButtons();
    });
  }

  private onTouchStart = (e: TouchEvent): void => {
    this.callbacks.onAudioResume();
    if (!this.visible) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX;
      const y = touch.clientY;

      if (this.isJoystickTouch(touch) && this.joystickTouchId === null) {
        e.preventDefault();
        this.joystickTouchId = touch.identifier;
        this.setJoystickOrigin();
        this.updateJoystick(touch);
      } else if (this.isUiTouch(touch)) {
        continue;
      } else if (this.lookTouchId === null) {
        e.preventDefault();
        this.lookTouchId = touch.identifier;
        this.lookStartX = x;
        this.lookStartY = y;
        this.lookLastX = x;
        this.lookLastY = y;
        this.lookMoved = false;
        this.miningFromTouch = false;
        this.clearHoldTimer();
        this.holdTimer = window.setTimeout(() => {
          if (this.lookTouchId !== touch.identifier || this.lookMoved) return;
          this.miningFromTouch = true;
          this.callbacks.onPrimaryStart({ clientX: this.lookStartX, clientY: this.lookStartY });
        }, HOLD_TO_MINE_MS);
      }
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.visible) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        e.preventDefault();
        this.updateJoystick(touch);
      }

      if (touch.identifier === this.lookTouchId) {
        e.preventDefault();
        const dx = touch.clientX - this.lookLastX;
        const dy = touch.clientY - this.lookLastY;
        const totalDx = touch.clientX - this.lookStartX;
        const totalDy = touch.clientY - this.lookStartY;
        this.lookLastX = touch.clientX;
        this.lookLastY = touch.clientY;
        if (!this.lookMoved && Math.sqrt(totalDx * totalDx + totalDy * totalDy) > LOOK_THRESHOLD_PX) {
          this.lookMoved = true;
          this.clearHoldTimer();
          if (this.miningFromTouch) {
            this.miningFromTouch = false;
            this.callbacks.onPrimaryStop();
          }
        }

        const sens = BASE_MOUSE_RADIANS_PER_PIXEL * this.getSensitivity();
        this.player.yaw -= dx * sens;
        this.player.pitch -= dy * sens;
        this.player.pitch = Math.max(
          -Math.PI / 2 + 0.02,
          Math.min(Math.PI / 2 - 0.02, this.player.pitch),
        );
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        this.joystickTouchId = null;
        this.knobEl.style.transform = 'translate(-50%, -50%)';
        this.keys.delete('KeyW');
        this.keys.delete('KeyS');
        this.keys.delete('KeyA');
        this.keys.delete('KeyD');
        this.syncLockButtons();
      }

      if (touch.identifier === this.lookTouchId) {
        this.clearHoldTimer();
        if (this.miningFromTouch) {
          this.callbacks.onPrimaryStop();
        } else if (!this.lookMoved) {
          this.callbacks.onSecondaryTap({ clientX: touch.clientX, clientY: touch.clientY });
        } else {
          this.callbacks.onSecondaryStop();
        }
        this.lookTouchId = null;
        this.lookMoved = false;
        this.miningFromTouch = false;
      }
    }
  };

  private updateJoystick(touch: Touch): void {
    const dx = touch.clientX - this.joystickOriginX;
    const dy = touch.clientY - this.joystickOriginY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    const cx = Math.cos(angle) * clampedDist;
    const cy = Math.sin(angle) * clampedDist;

    this.knobEl.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
    this.keys.delete('KeyW');
    this.keys.delete('KeyS');
    this.keys.delete('KeyA');
    this.keys.delete('KeyD');

    if (clampedDist > JOYSTICK_DEADZONE) {
      const nx = cx / JOYSTICK_RADIUS;
      const ny = cy / JOYSTICK_RADIUS;
      if (ny < -0.3) this.keys.add('KeyW');
      if (ny > 0.3) this.keys.add('KeyS');
      if (nx < -0.3) this.keys.add('KeyA');
      if (nx > 0.3) this.keys.add('KeyD');
    }
    this.syncLockButtons();
  }

  private setJoystickOrigin(): void {
    const rect = this.joystickEl.getBoundingClientRect();
    this.joystickOriginX = rect.left + rect.width / 2;
    this.joystickOriginY = rect.top + rect.height / 2;
  }

  private isJoystickTouch(touch: Touch): boolean {
    const rect = this.joystickEl.getBoundingClientRect();
    return (
      touch.clientX >= rect.left - 18 &&
      touch.clientX <= rect.right + 18 &&
      touch.clientY >= rect.top - 18 &&
      touch.clientY <= rect.bottom + 18
    );
  }

  private isUiTouch(touch: Touch): boolean {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return false;
    if (
      el === this.jumpBtn ||
      el === this.runBtn ||
      el === this.crouchBtn ||
      el === this.joystickEl ||
      el === this.knobEl ||
      el.parentElement === this.jumpBtn ||
      el.parentElement === this.runBtn ||
      el.parentElement === this.crouchBtn ||
      el.parentElement === this.joystickEl
    ) return true;
    return Boolean(
      el.closest(
        '.hotbar, .inventory-overlay, .furnace-overlay, .chest-overlay, .pause-screen, .pause-btn, .console',
      ),
    );
  }

  show(): void {
    this.visible = true;
    this.containerEl.classList.remove('hidden');
  }

  hide(): void {
    this.visible = false;
    this.containerEl.classList.add('hidden');
    this.releaseAll();
  }

  private releaseAll(): void {
    this.clearHoldTimer();
    this.joystickTouchId = null;
    this.lookTouchId = null;
    this.lookMoved = false;
    this.miningFromTouch = false;
    this.knobEl.style.transform = 'translate(-50%, -50%)';
    this.keys.delete('KeyW');
    this.keys.delete('KeyS');
    this.keys.delete('KeyA');
    this.keys.delete('KeyD');
    this.keys.delete('ShiftLeft');
    this.keys.delete('ControlLeft');
    this.keys.delete('Space');
    this.jumpBtn.classList.remove('pressed');
    this.runLocked = false;
    this.crouchLocked = false;
    this.syncLockButtons();
  }

  private clearHoldTimer(): void {
    if (this.holdTimer === null) return;
    window.clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  private syncLockButtons(): void {
    if (this.runLocked) {
      this.keys.add('ShiftLeft');
      this.runBtn.classList.add('locked');
    } else {
      this.keys.delete('ShiftLeft');
      this.runBtn.classList.remove('locked');
    }
    if (this.crouchLocked) {
      this.keys.add('ControlLeft');
      this.crouchBtn.classList.add('locked');
    } else {
      this.keys.delete('ControlLeft');
      this.crouchBtn.classList.remove('locked');
    }
  }
}
