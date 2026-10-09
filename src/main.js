// War Machine — entry point.
// Plain scripts, no modules, no bundler, no server: index.html works from a
// double-click. Script order in index.html matters: three.js, beat.js,
// input.js, game.js, then this.
const canvas = document.getElementById('game');
const game = new Game(canvas);
game.run();

// Handy for poking at state from the devtools console.
window.warMachine = game;
