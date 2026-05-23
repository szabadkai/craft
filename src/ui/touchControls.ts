import { BASE_MOUSE_RADIANS_PER_PIXEL } from '../player/mouseSensitivity';

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export type TouchCallbacks = {
  onMineStart: () => void;
  onMineStop: () => void;
  onPlace: () => void;
  onPlaceStop: () => void;
};

const JOYSTICK_RADIUS = 60;
const JOYSTICK_DEADZONE = 15;
const SPRINT_THRESHOLD = 0.8;

export class TouchControls {
  private readonly containerEl: HTMLDivElement;
  private readonly joystickEl: HTMLDivElement;
  private readonly knobEl: HTMLDivElement;
  private readonly jumpBtn: HTMLButtonElement;
  private readonly mineBtn: HTMLButtonElement;
  private readonly placeBtn: HTMLButtonElement;

  private joystickTouchId: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;

  private lookTouchId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  private visible = false;

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

    this.jumpBtn = this.createButton('touch-btn touch-btn-jump', '&#x25B2;');
    this.mineBtn = this.createButton('touch-btn touch-btn-mine', '&#x26CF;');
    this.placeBtn = this.createButton('touch-btn touch-btn-place', '&#x25A3;');

    document.body.appendChild(this.containerEl);

    this.bindEvents();
  }

  private createButton(className: string, icon: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = className;
    btn.innerHTML = icon;
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
    });
    this.jumpBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.keys.delete('Space');
    });

    this.mineBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onMineStart();
    });
    this.mineBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.callbacks.onMineStop();
    });

    this.placeBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onPlace();
    });
    this.placeBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.callbacks.onPlaceStop();
    });
  }

  private onTouchStart = (e: TouchEvent): void => {
    if (!this.visible) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX;
      const y = touch.clientY;
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (this.isUiTouch(touch)) continue;

      if (x < w * 0.4 && y > h * 0.2 && this.joystickTouchId === null) {
        e.preventDefault();
        this.joystickTouchId = touch.identifier;
        this.joystickOriginX = x;
        this.joystickOriginY = y;
        this.joystickEl.style.display = 'block';
        this.joystickEl.style.left = `${x - JOYSTICK_RADIUS}px`;
        this.joystickEl.style.top = `${y - JOYSTICK_RADIUS}px`;
        this.knobEl.style.transform = 'translate(-50%, -50%)';
      } else if (this.lookTouchId === null) {
        e.preventDefault();
        this.lookTouchId = touch.identifier;
        this.lookLastX = x;
        this.lookLastY = y;
      }
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.visible) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        e.preventDefault();
        const dx = touch.clientX - this.joystickOriginX;
        const dy = touch.clientY - this.joystickOriginY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
        const angle = Math.atan2(dy, dx);
        const cx = Math.cos(angle) * clampedDist;
        const cy = Math.sin(angle) * clampedDist;

        this.knobEl.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;

        const normalizedDist = clampedDist / JOYSTICK_RADIUS;

        this.keys.delete('KeyW');
        this.keys.delete('KeyS');
        this.keys.delete('KeyA');
        this.keys.delete('KeyD');
        this.keys.delete('ShiftLeft');

        if (clampedDist > JOYSTICK_DEADZONE) {
          const nx = cx / JOYSTICK_RADIUS;
          const ny = cy / JOYSTICK_RADIUS;
          if (ny < -0.3) this.keys.add('KeyW');
          if (ny > 0.3) this.keys.add('KeyS');
          if (nx < -0.3) this.keys.add('KeyA');
          if (nx > 0.3) this.keys.add('KeyD');
          if (normalizedDist > SPRINT_THRESHOLD) this.keys.add('ShiftLeft');
        }
      }

      if (touch.identifier === this.lookTouchId) {
        e.preventDefault();
        const dx = touch.clientX - this.lookLastX;
        const dy = touch.clientY - this.lookLastY;
        this.lookLastX = touch.clientX;
        this.lookLastY = touch.clientY;

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
        this.joystickEl.style.display = 'none';
        this.keys.delete('KeyW');
        this.keys.delete('KeyS');
        this.keys.delete('KeyA');
        this.keys.delete('KeyD');
        this.keys.delete('ShiftLeft');
      }

      if (touch.identifier === this.lookTouchId) {
        this.lookTouchId = null;
      }
    }
  };

  private isUiTouch(touch: Touch): boolean {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return false;
    if (
      el === this.jumpBtn ||
      el === this.mineBtn ||
      el === this.placeBtn ||
      el.parentElement === this.jumpBtn ||
      el.parentElement === this.mineBtn ||
      el.parentElement === this.placeBtn
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
    this.joystickTouchId = null;
    this.lookTouchId = null;
    this.joystickEl.style.display = 'none';
    this.keys.delete('KeyW');
    this.keys.delete('KeyS');
    this.keys.delete('KeyA');
    this.keys.delete('KeyD');
    this.keys.delete('ShiftLeft');
    this.keys.delete('Space');
  }
}
