/* ============================================================
   Puzle 15 — juego mobile-first de números
   - Mezcla garantizada resoluble (siempre ejecutable)
   - Control táctil: deslizar (swipe) + tocar ficha
   - Tiempo, movimientos, récord, pistas y confeti
   ============================================================ */

(() => {
  "use strict";

  const SIZE = 4;
  const GOAL = "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0";
  const HINTS_PER_GAME = 3;
  const STORAGE_KEY = "puzle15:best";
  const SWIPE_MIN = 24;

  // ===== Elementos =====
  const boardEl = document.getElementById("board");
  const movesEl = document.getElementById("moves");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const hintBtn = document.getElementById("hintBtn");
  const restartBtn = document.getElementById("restartBtn");
  const modal = document.getElementById("modal");
  const modalStats = document.getElementById("modalStats");
  const modalBest = document.getElementById("modalBest");
  const playAgainBtn = document.getElementById("playAgainBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const toastEl = document.getElementById("toast");

  // ===== Estado =====
  let board = [];            // 16 posiciones, 0 = hueco
  let tiles = [];            // { value, el }
  let emptyIndex = 15;
  let moves = 0;
  let seconds = 0;
  let timerId = null;
  let started = false;
  let won = false;
  let hintsLeft = HINTS_PER_GAME;
  let hintTile = null;
  let history = [];          // para deshacer con el hueco
  let lastTap = { index: -1, time: 0 };
  let toastTimer = null;

  // ===== Utilidades =====
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const rowOf = (i) => Math.floor(i / SIZE);
  const colOf = (i) => i % SIZE;

  function neighborsOf(index) {
    const r = rowOf(index);
    const c = colOf(index);
    const list = [];
    if (r > 0) list.push(index - SIZE);
    if (r < SIZE - 1) list.push(index + SIZE);
    if (c > 0) list.push(index - 1);
    if (c < SIZE - 1) list.push(index + 1);
    return list;
  }

  function isAdjacent(a, b) {
    return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1;
  }

  // ===== Persistencia =====
  function loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveBest(record) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      /* modo privado o sin soporte */
    }
  }

  function updateBestLabel() {
    const best = loadBest();
    bestEl.textContent = best ? `${best.moves} 🏆` : "—";
  }

  // ===== Retroalimentación =====
  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2000);
  }

  // ===== Render =====
  function createTile(value, index) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "tile";
    el.textContent = value;
    el.setAttribute("role", "gridcell");
    el.setAttribute("aria-label", `Ficha ${value}`);
    el.dataset.value = value;
    positionTileEl(el, index);
    el.addEventListener("click", () => onTileTap(parseInt(el.dataset.value, 10)));
    return el;
  }


  function positionTileEl(el, index) {
    el.style.setProperty("--row", rowOf(index));
    el.style.setProperty("--col", colOf(index));
  }

  function render() {
    boardEl.innerHTML = "";
    tiles = [];
    board.forEach((value, index) => {
      if (value === 0) return;
      const el = createTile(value, index);
      boardEl.appendChild(el);
      tiles.push({ value, el });
    });
    emptyIndex = board.indexOf(0);
  }

  function positionAll() {
    board.forEach((value, index) => {
      if (value === 0) return;
      const tile = tiles.find((t) => t.value === value);
      if (tile) positionTileEl(tile.el, index);
    });
  }

  // ===== Movimientos =====
  function tryMove(index, { silent = false, count = true } = {}) {
    if (won) return false;
    if (index === emptyIndex) return false;
    if (!isAdjacent(index, emptyIndex)) {
      if (!silent) {
        boardEl.classList.remove("shake");
        void boardEl.offsetWidth; // reinicia animación
        boardEl.classList.add("shake");
        vibrate(30);
      }
      return false;
    }

    if (!started) startTimer();

    const value = board[index];
    const tile = tiles.find((t) => t.value === value);

    board[emptyIndex] = value;
    board[index] = 0;
    if (tile) positionTileEl(tile.el, emptyIndex);
    emptyIndex = index;

    if (count) {
      moves++;
      movesEl.textContent = moves;
      history.push(index); // posición a la que se movió (para deshacer)
    }

    if (tile) {
      tile.el.classList.add("moving");
      setTimeout(() => tile.el.classList.remove("moving"), 180);
    }

    clearHint();
    vibrate(8);

    if (board.join(",") === GOAL) win();
    return true;
  }

  function onTileTap(value) {
    const index = board.indexOf(value);
    if (index < 0) return;

    const now = Date.now();
    const isDoubleTap = lastTap.index === index && now - lastTap.time < 320;
    lastTap = { index, time: now };

    if (!isAdjacent(index, emptyIndex)) {
      if (!isDoubleTap) {
        showToast(`Mueve la ficha ${value} al lado del hueco 👆`);
      }
      boardEl.classList.remove("shake");
      void boardEl.offsetWidth;
      boardEl.classList.add("shake");
      vibrate(30);
      return;
    }

    tryMove(index);
  }

  // Deshacer: tocar el hueco
  boardEl.addEventListener("click", (e) => {
    if (e.target !== boardEl) return;
    if (!history.length || won) {
      if (!history.length && !won) showToast("Toca una ficha junto al hueco 🧩");
      return;
    }
    const prev = history.pop();
    const value = board[prev];
    const tile = tiles.find((t) => t.value === value);
    board[prev] = 0;
    board[emptyIndex] = value;
    if (tile) positionTileEl(tile.el, emptyIndex);
    emptyIndex = prev;
    moves = Math.max(0, moves - 1);
    movesEl.textContent = moves;
    clearHint();
    vibrate(8);
  });

  // ===== Deslizar (swipe) en el tablero =====
  let touch = null;

  function onStart(e) {
    if (won) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    touch = { x: t.clientX, y: t.clientY, id: t.identifier ?? "mouse" };
  }

  function onMove(e) {
    if (!touch || won) return;
    const t = e.changedTouches
      ? Array.from(e.changedTouches).find((x) => x.identifier === touch.id)
      : e;
    if (!t) return;

    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      // deslizar izquierda/ derecha: mover ficha en esa dirección hacia el hueco
      tryMoveFromSwipe(dx > 0 ? -1 : 1, 0); // si el dedo va a la derecha, la ficha que
                                            // debe moverse está a la izquierda del hueco
    } else {
      tryMoveFromSwipe(0, dy > 0 ? -1 : 1);
    }
    touch = null;
  }

  function onEnd() {
    touch = null;
  }

  // dx,dy = dirección relativa del hueco hacia la ficha a mover
  function tryMoveFromSwipe(dx, dy) {
    const r = rowOf(emptyIndex) + dy;
    const c = colOf(emptyIndex) + dx;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
      boardEl.classList.remove("shake");
      void boardEl.offsetWidth;
      boardEl.classList.add("shake");
      vibrate(30);
      return;
    }
    tryMove(r * SIZE + c);
  }

  boardEl.addEventListener("touchstart", onStart, { passive: true });
  boardEl.addEventListener("touchmove", onMove, { passive: true });
  boardEl.addEventListener("touchend", onEnd, { passive: true });
  boardEl.addEventListener("touchcancel", onEnd, { passive: true });
  boardEl.addEventListener("mousedown", onStart);
  boardEl.addEventListener("mousemove", onMove);
  boardEl.addEventListener("mouseup", onEnd);
  boardEl.addEventListener("mouseleave", onEnd);

  // ===== Reloj =====
  function startTimer() {
    started = true;
    timerId = setInterval(() => {
      seconds++;
      timeEl.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  function formatTime(total) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ===== Mezcla garantizada resoluble =====
  function shuffleSolvable() {
    board = Array.from({ length: SIZE * SIZE }, (_, i) =>
      i === SIZE * SIZE - 1 ? 0 : i + 1
    );
    emptyIndex = SIZE * SIZE - 1;

    let last = -1;
    for (let step = 0; step < 160; step++) {
      let options = neighborsOf(emptyIndex).filter((n) => n !== last);
      if (!options.length) options = neighborsOf(emptyIndex);
      const pick = options[Math.floor(Math.random() * options.length)];
      last = emptyIndex;
      [board[emptyIndex], board[pick]] = [board[pick], board[emptyIndex]];
      emptyIndex = pick;
    }

    // Evita arrancar ya resuelto
    if (board.join(",") === GOAL) {
      [board[0], board[1]] = [board[1], board[0]];
      emptyIndex = board.indexOf(0);
    }
  }

  // ===== Pista =====
  function clearHint() {
    if (hintTile) {
      hintTile.classList.remove("hint");
      hintTile = null;
    }
  }

  function giveHint() {
    if (won) return;
    if (hintsLeft <= 0) {
      showToast("No te quedan pistas en esta partida 😅");
      vibrate([40, 60, 40]);
      return;
    }

    // Candidato óptimo: la ficha que, al moverse, más reduce la distancia
    const dist = (b) =>
      b.reduce(
        (acc, v, i) =>
          v === 0
            ? acc
            : acc +
              Math.abs(rowOf(v - 1) - rowOf(i)) +
              Math.abs(colOf(v - 1) - colOf(i)),
        0
      );

    let bestIndex = -1;
    let bestGain = -Infinity;
    neighborsOf(emptyIndex).forEach((n) => {
      const copy = board.slice();
      [copy[emptyIndex], copy[n]] = [copy[n], copy[emptyIndex]];
      const gain = dist(board) - dist(copy);
      if (gain > bestGain) {
        bestGain = gain;
        bestIndex = n;
      }
    });

    if (bestIndex < 0) return;

    const value = board[bestIndex];
    const tile = tiles.find((t) => t.value === value);
    if (!tile) return;

    clearHint();
    hintTile = tile.el;
    hintTile.classList.add("hint");
    hintsLeft--;
    hintBtn.textContent = `💡 Pista (${hintsLeft})`;
    if (hintsLeft <= 0) hintBtn.disabled = true;
    showToast(`Mueve la ficha ${value} ✨`);
    vibrate(20);
    setTimeout(clearHint, 4000);
  }

  // ===== Victoria =====
  function win() {
    won = true;
    stopTimer();
    vibrate([60, 80, 60, 80, 120]);
    launchConfetti();

    const previous = loadBest();
    const isNewRecord =
      !previous ||
      moves < previous.moves ||
      (moves === previous.moves && seconds < previous.time);

    if (isNewRecord) {
      saveBest({ moves, time: seconds });
      updateBestLabel();
    }

    modalStats.textContent = `⏱️ ${formatTime(seconds)} · ${moves} movimientos`;
    modalBest.textContent = isNewRecord ? "🏆 ¡Nuevo récord!" : "";

    setTimeout(() => {
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
    }, 450);
  }

  function launchConfetti() {
    const colors = ["#38bdf8", "#fbbf24", "#f472b6", "#34d399", "#a78bfa", "#f87171"];
    for (let i = 0; i < 70; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      piece.style.animationDelay = `${Math.random() * 0.5}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 3600);
    }
  }

  // ===== Reinicio =====
  function reset() {
    stopTimer();
    moves = 0;
    seconds = 0;
    started = false;
    won = false;
    hintsLeft = HINTS_PER_GAME;
    history = [];
    hintBtn.disabled = false;
    hintBtn.textContent = `💡 Pista (${hintsLeft})`;
    movesEl.textContent = "0";
    timeEl.textContent = "00:00";
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    clearHint();

    shuffleSolvable();
    render();
    updateBestLabel();
  }

  // ===== Eventos de UI =====
  restartBtn.addEventListener("click", () => {
    if (moves > 0 && !won) {
      if (!confirm("¿Mezclar de nuevo? Se perderá el avance actual.")) return;
    }
    reset();
    showToast("¡Nueva partida! 🧩");
  });

  hintBtn.addEventListener("click", giveHint);
  playAgainBtn.addEventListener("click", reset);
  closeModalBtn.addEventListener("click", () => {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  });

  // Evita el menú contextual en móvil
  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  // ===== Arranque =====
  reset();
  hintBtn.textContent = `💡 Pista (${hintsLeft})`;
})();
