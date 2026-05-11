// Undo/redo via command pattern. Each command knows how to apply() and
// revert() itself. The editor wraps each user gesture (one stroke, one
// click, one rectangle-fill) in a Command and pushes it onto the stack.
//
// Strokes compose multiple per-cell mutations into a single Command using
// a CompoundCommand below — so Ctrl+Z walks back one user gesture, not one
// painted cell.

export interface Command {
  apply(): void;
  revert(): void;
}

export class CompoundCommand implements Command {
  constructor(private readonly children: Command[]) {}
  apply(): void {
    for (const c of this.children) c.apply();
  }
  revert(): void {
    // Revert in reverse order so paired apply/revert nest correctly.
    for (let i = this.children.length - 1; i >= 0; i--) this.children[i].revert();
  }
  get size(): number {
    return this.children.length;
  }
}

export class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  /**
   * @param capacity  Optional cap on the undo history. Older commands are
   *                  dropped when the stack overflows.
   */
  constructor(private readonly capacity: number | null = null) {}

  apply(command: Command): void {
    command.apply();
    this.undoStack.push(command);
    if (this.capacity !== null && this.undoStack.length > this.capacity) {
      this.undoStack.shift();
    }
    // Any new gesture invalidates the redo branch — the user has chosen a
    // different timeline.
    this.redoStack = [];
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.revert();
    this.redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.apply();
    this.undoStack.push(cmd);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
