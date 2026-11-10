// The game's script engine has a console (its lines go to the content log), but no DOM or Node
// typings describe it.
declare const console: {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};
