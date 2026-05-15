const STORAGE_KEY = 'craft-sandbox-mode';

export function loadSandboxMode(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function saveSandboxMode(value: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(value));
}
