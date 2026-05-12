import { itemDefs } from '../inventory/items';

export type ConsoleCommand = {
  name: string;
  description: string;
  execute: (args: string[], all: ConsoleCommand[]) => string;
};

export function defaultConsoleCommands(
  addItem: (item: string, count: number) => number,
): ConsoleCommand[] {
  const resolve = (name: string) =>
    itemDefs.find((d) => d.id === name.toLowerCase())?.id ??
    itemDefs.find((d) => d.id.includes(name.toLowerCase()))?.id ?? null;
  return [
    {
      name: 'give',
      description: 'give <item> [count] — Add items to inventory',
      execute: (args) => {
        if (args.length === 0) return 'Usage: give <item> [count]';
        const item = resolve(args[0]);
        if (!item) return `Unknown item: ${args[0]}`;
        const count = args.length >= 2 ? Math.max(1, Math.min(999, Math.floor(Number(args[1]) || 1))) : 64;
        return `Gave ${addItem(item, count)} x ${item}`;
      },
    },
    {
      name: 'items',
      description: 'items — List all item IDs',
      execute: () => `Items: ${itemDefs.map((d) => d.id).join(', ')}`,
    },
    {
      name: 'help',
      description: 'help — Show available commands',
      execute: (_, all) => all.map((c) => c.description).join('\n'),
    },
    {
      name: 'clear',
      description: 'clear — Clear console output',
      execute: () => '',
    },
  ];
}

export class ConsoleSystem {
  isOpen = false;
  private readonly root: HTMLDivElement;
  private readonly outputEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly commands: Map<string, ConsoleCommand>;
  private history: string[] = [];
  private historyIndex = -1;
  private currentDraft = '';

  constructor(commands: ConsoleCommand[]) {
    this.commands = new Map(commands.map((command) => [command.name, command]));

    this.root = document.createElement('div');
    this.root.className = 'console';

    const body = document.createElement('div');
    body.className = 'console-body';

    this.outputEl = document.createElement('div');
    this.outputEl.className = 'console-output';

    const inputRow = document.createElement('div');
    inputRow.className = 'console-input-row';

    const prompt = document.createElement('span');
    prompt.className = 'console-prompt';
    prompt.textContent = '>';

    this.inputEl = document.createElement('input');
    this.inputEl.className = 'console-input';
    this.inputEl.type = 'text';
    this.inputEl.spellcheck = false;
    this.inputEl.autocomplete = 'off';

    inputRow.append(prompt, this.inputEl);
    body.append(this.outputEl, inputRow);
    this.root.appendChild(body);
    document.body.appendChild(this.root);

    this.inputEl.addEventListener('keydown', (event) => this.handleInputKey(event));
    this.inputEl.addEventListener('input', () => {
      this.currentDraft = this.inputEl.value;
    });
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.root.classList.toggle('open', this.isOpen);
    if (this.isOpen) {
      this.inputEl.value = '';
      this.currentDraft = '';
      this.historyIndex = -1;
      this.outputEl.scrollTop = this.outputEl.scrollHeight;
      requestAnimationFrame(() => this.inputEl.focus());
    }
  }

  log(message: string): void {
    const line = document.createElement('div');
    line.className = 'console-line';
    line.textContent = message;
    const maxLines = 120;
    while (this.outputEl.children.length > maxLines)
      this.outputEl.removeChild(this.outputEl.firstChild!);
    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  private execute(commandText: string): void {
    const trimmed = commandText.trim();
    if (!trimmed) return;

    this.history.push(trimmed);
    if (this.history.length > 80) this.history.shift();
    this.historyIndex = -1;

    this.log(`> ${trimmed}`);

    const parts = trimmed.split(/\s+/);
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);

    const command = this.commands.get(name);
    if (command) {
      try {
        const result = command.execute(args, [...this.commands.values()]);
        if (result) this.log(result);
      } catch (error) {
        this.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      this.log(`Unknown command: ${name}. Type "help" for available commands.`);
    }
  }

  private handleInputKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.history.length === 0) return;
      if (this.historyIndex === -1) this.currentDraft = this.inputEl.value;
      this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + 1);
      this.inputEl.value = this.history[this.history.length - 1 - this.historyIndex];
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.historyIndex <= 0) {
        this.historyIndex = -1;
        this.inputEl.value = this.currentDraft;
        return;
      }
      this.historyIndex--;
      this.inputEl.value = this.history[this.history.length - 1 - this.historyIndex];
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      this.tryComplete();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const value = this.inputEl.value;
      this.inputEl.value = '';
      this.currentDraft = '';
      this.execute(value);
    }
  }

  private tryComplete(): void {
    const value = this.inputEl.value;
    const lastSpace = value.lastIndexOf(' ');
    const prefix = lastSpace >= 0 ? value.slice(lastSpace + 1).toLowerCase() : value.toLowerCase();

    if (prefix.length === 0) return;

    if (lastSpace < 0) {
      const matches = [...this.commands.keys()].filter((name) => name.startsWith(prefix));
      if (matches.length === 1) {
        this.inputEl.value = matches[0];
      } else if (matches.length > 1) {
        const common = commonPrefix(matches);
        if (common.length > prefix.length) this.inputEl.value = common;
      }
      return;
    }

    const commandName = value.slice(0, lastSpace).trim().split(/\s+/)[0]?.toLowerCase();
    if (commandName === 'give') {
      const matches = itemDefs.map((def) => def.id).filter((id) => id.startsWith(prefix));
      if (matches.length === 1) {
        this.inputEl.value = `${value.slice(0, lastSpace + 1)}${matches[0]}`;
      }
    }
  }
}

function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  let i = 0;
  const first = strings[0];
  while (i < first.length && strings.every((s) => s[i] === first[i])) i++;
  return first.slice(0, i);
}