export type HealthState = {
  hp: number;
  maxHp: number;
  isDead: boolean;
  lastDamageTime: number;
};

export type HealthSystem = ReturnType<typeof createHealth>;

export function createHealth(
  getSpawnY: () => number,
  onRespawn: (spawnY: number) => void,
) {
  const state: HealthState = {
    hp: 20,
    maxHp: 20,
    isDead: false,
    lastDamageTime: -Infinity,
  };

  let lastGroundY = 0;
  let airborneStartY: number | null = null;
  let wasOnGround = false;

  let heartsEl: HTMLElement | null = null;
  let lastHeartsText = '';

  function mount(el: HTMLElement): void {
    heartsEl = el;
    lastHeartsText = '';
  }

  function reconcile(onGround: boolean, y: number, now: number): void {
    const fallDamage = updateFallTracking(onGround, y);
    if (fallDamage > 0) damage(fallDamage);
    if (state.isDead) {
      const spawnY = getSpawnY();
      onRespawn(spawnY);
      respawn(spawnY);
    }
    if (heartsEl) {
      const html = buildHeartSpans(state.hp, state.maxHp);
      if (html !== lastHeartsText) {
        lastHeartsText = html;
        heartsEl.innerHTML = html;
      }
      const flashing = now - state.lastDamageTime < 300;
      heartsEl.classList.toggle('damage-flash', flashing);
    }
  }

  function damage(amount: number): void {
    if (state.isDead || amount <= 0) return;
    state.hp = Math.max(0, state.hp - amount);
    state.lastDamageTime = performance.now();
    if (state.hp <= 0) {
      state.isDead = true;
    }
  }

  function heal(amount: number): void {
    if (state.isDead || amount <= 0) return;
    state.hp = Math.min(state.maxHp, state.hp + amount);
  }

  function respawn(spawnY: number): void {
    state.hp = state.maxHp;
    state.isDead = false;
    airborneStartY = spawnY;
    lastGroundY = spawnY;
    wasOnGround = true;
  }

  /** Call every frame. Returns fall damage to apply (0 if none). */
  function updateFallTracking(onGround: boolean, y: number): number {
    if (state.isDead) return 0;

    if (onGround && !wasOnGround && airborneStartY !== null) {
      const fallDistance = airborneStartY - y;
      airborneStartY = null;
      lastGroundY = y;
      wasOnGround = true;
      if (fallDistance > 3) {
        const fallDamage = Math.floor((fallDistance - 3) * 1);
        return fallDamage;
      }
    } else if (onGround) {
      lastGroundY = y;
      airborneStartY = null;
    } else if (!onGround && wasOnGround) {
      airborneStartY = lastGroundY;
      wasOnGround = false;
    }

    wasOnGround = onGround;
    return 0;
  }

  function snapshot(): HealthState {
    return { ...state };
  }

  return { state, damage, heal, mount, reconcile, snapshot };
}

function createHeartSprites(): { full: string; empty: string } {
  const size = 10;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const draw = (ox: number, pixels: number[]) => {
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i]) {
        const x = ox + (i % size);
        const y = Math.floor(i / size);
        const r = (pixels[i] >> 16) & 0xff;
        const g = (pixels[i] >> 8) & 0xff;
        const b = pixels[i] & 0xff;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };

  const R = 0xff2222;
  const W = 0xffffff;

  // full heart with white border (10x10)
  draw(0, [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, W, 0, 0, W, 0, 0, 0,
    0, 0, W, R, W, R, R, W, 0, 0,
    0, W, R, R, R, R, R, R, W, 0,
    W, R, R, R, R, R, R, R, R, W,
    W, R, R, R, R, R, R, R, R, W,
    0, W, R, R, R, R, R, R, W, 0,
    0, 0, W, R, R, R, R, W, 0, 0,
    0, 0, 0, W, R, R, W, 0, 0, 0,
    0, 0, 0, 0, W, W, 0, 0, 0, 0,
  ]);

  // empty heart (white outline only, 10x10)
  draw(size, [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, W, 0, 0, W, 0, 0, 0,
    0, 0, W, 0, W, 0, 0, W, 0, 0,
    0, W, 0, 0, 0, 0, 0, 0, W, 0,
    W, 0, 0, 0, 0, 0, 0, 0, 0, W,
    W, 0, 0, 0, 0, 0, 0, 0, 0, W,
    0, W, 0, 0, 0, 0, 0, 0, W, 0,
    0, 0, W, 0, 0, 0, 0, W, 0, 0,
    0, 0, 0, W, 0, 0, W, 0, 0, 0,
    0, 0, 0, 0, W, W, 0, 0, 0, 0,
  ]);

  const url = canvas.toDataURL();
  return { full: url, empty: url };
}

const heartSprites = createHeartSprites();

function buildHeartSpans(hp: number, maxHp: number): string {
  const total = Math.ceil(maxHp / 2);
  const full = Math.min(total, Math.floor(hp / 2));
  const empty = total - full;
  const bgFull = `background-image:url(${heartSprites.full});background-position:0 0`;
  const bgEmpty = `background-image:url(${heartSprites.empty});background-position:-20px 0`;
  const f = `<span class="heart" style="${bgFull}"></span>`;
  const e = `<span class="heart" style="${bgEmpty}"></span>`;
  return f.repeat(full) + e.repeat(empty);
}
