// Main Game Logic - Tic Tac Toe Multiplayer
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onDisconnect,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

// ============ STATE ============
const state = {
  playerName: "",
  roomId: null,
  playerSlot: null, // 1 or 2
  opponentSlot: null,
  roomData: null,
  unsubscribe: null,
  mySymbol: null,
  isMyTurn: false,
  gameEnded: false
};

// ============ DOM ELEMENTS ============
const $ = (id) => document.getElementById(id);
const screens = {
  lobby: $("lobbyScreen"),
  waiting: $("waitingScreen"),
  game: $("gameScreen")
};

// ============ AUDIO (Web Audio API - no external files) ============
const AudioFX = (() => {
  let ctx;
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };

  const play = (freq, type, duration, volume = 0.15) => {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      gain.gain.setValueAtTime(volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + duration);
    } catch (e) {}
  };

  return {
    click: () => play(800, "sine", 0.08, 0.1),
    place: () => {
      play(600, "sine", 0.1, 0.15);
      setTimeout(() => play(900, "sine", 0.1, 0.12), 50);
    },
    win: () => {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => play(f, "triangle", 0.25, 0.2), i * 120)
      );
    },
    lose: () => {
      [400, 350, 300, 200].forEach((f, i) =>
        setTimeout(() => play(f, "sawtooth", 0.3, 0.15), i * 150)
      );
    },
    draw: () => {
      play(440, "sine", 0.3, 0.15);
      setTimeout(() => play(440, "sine", 0.3, 0.15), 200);
    },
    join: () => {
      play(660, "sine", 0.1, 0.15);
      setTimeout(() => play(880, "sine", 0.15, 0.15), 100);
    },
    error: () => play(200, "square", 0.2, 0.15)
  };
})();

// ============ UTILITIES ============
const generateRoomId = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
};

const showScreen = (name) => {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
};

const showToast = (msg, isError = false) => {
  const toast = $("toast");
  toast.textContent = msg;
  toast.className = "toast" + (isError ? " error" : "");
  setTimeout(() => toast.classList.add("hidden"), 3000);
};

const showModal = (title, message, showPlayAgain = true) => {
  $("modalTitle").textContent = title;
  $("modalMessage").textContent = message;
  $("btnModalPlayAgain").style.display = showPlayAgain ? "flex" : "none";
  $("modal").classList.remove("hidden");
};

const hideModal = () => $("modal").classList.add("hidden");

// ============ CONNECTION MONITOR ============
// Firestore doesn't have a direct onDisconnect like RTDB, so we use a simple ping
let connectionCheckInterval;
const startConnectionMonitor = () => {
  const statusEl = $("connectionStatus");
  const updateStatus = (online) => {
    statusEl.classList.toggle("online", online);
    statusEl.classList.toggle("offline", !online);
    statusEl.querySelector(".text").textContent = online ? "Online" : "Offline";
  };

  const check = () => {
    updateStatus(navigator.onLine);
  };

  window.addEventListener("online", () => {
    updateStatus(true);
    showToast("✓ Reconnected");
  });
  window.addEventListener("offline", () => {
    updateStatus(false);
    showToast("✗ Connection lost", true);
  });

  check();
  connectionCheckInterval = setInterval(check, 5000);
};

// ============ BOARD RENDERING ============
const buildBoard = () => {
  const board = $("board");
  board.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = i;
    cell.addEventListener("click", () => handleCellClick(i));
    board.appendChild(cell);
  }
};

const renderBoard = (board, turn, winner, winningLine) => {
  const cells = document.querySelectorAll(".cell");
  cells.forEach((cell, i) => {
    const value = board[i] || "";
    cell.classList.toggle("filled", !!value);
    cell.classList.toggle("disabled", !state.isMyTurn || state.gameEnded);

    const existing = cell.querySelector(".mark");
    if (value && (!existing || existing.textContent !== value)) {
      cell.innerHTML = `<span class="mark ${value.toLowerCase()}">${value}</span>`;
    } else if (!value) {
      cell.innerHTML = "";
    }

    cell.classList.toggle("winning", winningLine && winningLine.includes(i));
  });

  // Turn indicator
  const turnSymbol = $("turnSymbol");
  turnSymbol.textContent = turn;
  turnSymbol.className = "turn-symbol " + turn.toLowerCase();

  // Player active highlight
  $("player1Info").classList.toggle("active", turn === "X" && !state.gameEnded);
  $("player2Info").classList.toggle("active", turn === "O" && !state.gameEnded);

  // Draw win line
  drawWinLine(winningLine);
};

const drawWinLine = (line) => {
  const path = $("winLinePath");
  if (!line || line.length < 2) {
    path.classList.remove("draw");
    return;
  }

  // Map cell index to center coordinates in 300x300 viewBox
  const coords = (idx) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    return { x: col * 100 + 50, y: row * 100 + 50 };
  };

  const start = coords(line[0]);
  const end = coords(line[line.length - 1]);

  path.setAttribute("x1", start.x);
  path.setAttribute("y1", start.y);
  path.setAttribute("x2", end.x);
  path.setAttribute("y2", end.y);

  // Reset then animate
  path.classList.remove("draw");
  void path.offsetWidth; // force reflow
  requestAnimationFrame(() => path.classList.add("draw"));
};

// ============ GAME LOGIC ============
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6]             // diagonals
];

const checkWinner = (board) => {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((c) => c)) return { winner: "draw", line: null };
  return null;
};

const handleCellClick = async (index) => {
  if (state.gameEnded) return;
  if (!state.isMyTurn) {
    showToast("Bukan giliranmu!", true);
    AudioFX.error();
    return;
  }
  if (state.roomData.board[index]) {
    showToast("Cell sudah terisi!", true);
    AudioFX.error();
    return;
  }

  AudioFX.place();

  // Update board in Firestore
  const newBoard = [...state.roomData.board];
  newBoard[index] = state.mySymbol;

  const result = checkWinner(newBoard);
  const updates = {
    board: newBoard,
    turn: state.mySymbol === "X" ? "O" : "X",
    updatedAt: serverTimestamp()
  };

  if (result) {
    updates.status = "finished";
    updates.winner = result.winner;
    updates.winningLine = result.line || [];
  }

  try {
    await updateDoc(doc(db, "rooms", state.roomId), updates);
  } catch (err) {
    console.error(err);
    showToast("Gagal mengirim langkah", true);
  }
};

// ============ ROOM MANAGEMENT ============
const createRoom = async () => {
  const name = $("playerName").value.trim();
  if (!name) {
    showToast("Masukkan nama dulu!", true);
    AudioFX.error();
    return;
  }

  state.playerName = name;
  const roomId = generateRoomId();

  try {
    // Check uniqueness
    const existing = await getDoc(doc(db, "rooms", roomId));
    if (existing.exists()) {
      // Very unlikely but retry
      return createRoom();
    }

    await setDoc(doc(db, "rooms", roomId), {
      player1Name: name,
      player2Name: "",
      board: Array(9).fill(""),
      turn: "X",
      winner: "",
      winningLine: [],
      status: "waiting",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    state.roomId = roomId;
    state.playerSlot = 1;
    state.mySymbol = "X";
    AudioFX.click();
    enterWaitingRoom();
  } catch (err) {
    console.error(err);
    showToast("Gagal membuat room: " + err.message, true);
  }
};

const joinRoom = async (roomId) => {
  const name = $("playerName").value.trim();
  if (!name) {
    showToast("Masukkan nama dulu!", true);
    AudioFX.error();
    return;
  }
  if (!roomId || roomId.length !== 6) {
    showToast("Kode room tidak valid!", true);
    AudioFX.error();
    return;
  }

  roomId = roomId.toUpperCase();

  try {
    // Use transaction to safely join
    const roomRef = doc(db, "rooms", roomId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) {
        throw new Error("Room tidak ditemukan");
      }

      const data = snap.data();
      if (data.status === "finished") {
        throw new Error("Room sudah selesai");
      }
      if (data.player2Name) {
        throw new Error("Room sudah penuh");
      }

      transaction.update(roomRef, {
        player2Name: name,
        status: "playing",
        updatedAt: serverTimestamp()
      });
    });

    state.playerName = name;
    state.roomId = roomId;
    state.playerSlot = 2;
    state.mySymbol = "O";
    AudioFX.join();
    enterGame();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Gagal join room", true);
    AudioFX.error();
  }
};

const leaveRoom = async () => {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }

  if (state.roomId) {
    try {
      const roomRef = doc(db, "rooms", state.roomId);
      const snap = await getDoc(roomRef);
      if (snap.exists()) {
        const data = snap.data();
        // If game not finished, mark as abandoned
        if (data.status !== "finished") {
          await updateDoc(roomRef, {
            status: "finished",
            winner: state.playerSlot === 1 ? "O" : "X",
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (err) {
      console.error("Leave error:", err);
    }
  }

  // Reset state
  state.roomId = null;
  state.playerSlot = null;
  state.roomData = null;
  state.gameEnded = false;

  AudioFX.click();
  showScreen("lobby");
};

// ============ ENTER SCREENS ============
const enterWaitingRoom = () => {
  showScreen("waiting");
  $("roomCodeDisplay").textContent = state.roomId;
  $("waitingPlayer1").textContent = state.playerName;

  // Listen to room updates
  subscribeToRoom();
};

const enterGame = () => {
  showScreen("game");
  $("gameRoomCode").textContent = state.roomId;
  buildBoard();
  subscribeToRoom();
};

const subscribeToRoom = () => {
  if (state.unsubscribe) state.unsubscribe();

  const roomRef = doc(db, "rooms", state.roomId);
  state.unsubscribe = onSnapshot(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        showToast("Room dihapus oleh host", true);
        leaveRoom();
        return;
      }

      const data = snap.data();
      const prevStatus = state.roomData?.status;
      state.roomData = data;

      if (data.status === "waiting") {
        updateWaitingUI(data);
      } else if (data.status === "playing" || data.status === "finished") {
        if (screens.game.classList.contains("active") === false) {
          enterGame();
        }
        updateGameUI(data, prevStatus);
      }
    },
    (err) => {
      console.error("Snapshot error:", err);
      showToast("Error: " + err.message, true);
    }
  );
};

const updateWaitingUI = (data) => {
  $("waitingPlayer1").textContent = data.player1Name || state.playerName;

  const slot2 = $("waitingPlayer2Slot");
  if (data.player2Name) {
    slot2.classList.remove("empty");
    slot2.classList.add("filled");
    slot2.querySelector(".avatar").textContent = "🎮";
    $("waitingPlayer2").textContent = data.player2Name;
    const loader = slot2.querySelector(".loader-ring");
    if (loader) loader.remove();

    // Add ready badge if not exists
    if (!slot2.querySelector(".badge")) {
      const badge = document.createElement("span");
      badge.className = "badge ready";
      badge.textContent = "READY";
      slot2.appendChild(badge);
    }
  } else {
    slot2.classList.add("empty");
    slot2.classList.remove("filled");
    slot2.querySelector(".avatar").textContent = "👤";
    $("waitingPlayer2").textContent = "Searching...";
    if (!slot2.querySelector(".loader-ring")) {
      const loader = document.createElement("div");
      loader.className = "loader-ring";
      slot2.appendChild(loader);
    }
    const badge = slot2.querySelector(".badge");
    if (badge) badge.remove();
  }
};

const updateGameUI = (data, prevStatus) => {
  // Update player names
  $("p1Name").textContent = data.player1Name || "Player 1";
  $("p2Name").textContent = data.player2Name || "Player 2";

  // Determine turn
  state.isMyTurn = data.turn === state.mySymbol && data.status === "playing";
  state.gameEnded = data.status === "finished";

  renderBoard(data.board, data.turn, data.winner, data.winningLine);

  // Status text
  const statusText = $("statusText");
  if (data.status === "finished") {
    if (data.winner === "draw") {
      statusText.textContent = "🤝 Seri!";
      statusText.style.color = "var(--neon-yellow)";
    } else if (data.winner === state.mySymbol) {
      statusText.textContent = "🏆 Kamu Menang!";
      statusText.style.color = "var(--neon-green)";
    } else {
      statusText.textContent = "💀 Kamu Kalah!";
      statusText.style.color = "var(--danger)";
    }
  } else if (state.isMyTurn) {
    statusText.textContent = "Giliranmu!";
    statusText.style.color = "var(--neon-cyan)";
  } else {
    statusText.textContent = "Menunggu lawan...";
    statusText.style.color = "var(--text-muted)";
  }

  // Handle game end effects (only once)
  if (data.status === "finished" && prevStatus !== "finished") {
    setTimeout(() => {
      if (data.winner === "draw") {
        AudioFX.draw();
        showModal("🤝 Seri!", "Tidak ada pemenang kali ini.", false);
      } else if (data.winner === state.mySymbol) {
        AudioFX.win();
        showModal("🏆 Kemenangan!", "Selamat, kamu menang!");
      } else {
        AudioFX.lose();
        showModal("💀 Kekalahan", "Lawan lebih hebat kali ini.", false);
      }
    }, 700);
  }
};

// ============ COPY ROOM ID ============
const copyRoomId = async () => {
  if (!state.roomId) return;
  try {
    await navigator.clipboard.writeText(state.roomId);
    showToast("✓ Kode room disalin!");
    AudioFX.click();
  } catch {
    // Fallback
    const input = document.createElement("input");
    input.value = state.roomId;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    showToast("✓ Kode room disalin!");
    AudioFX.click();
  }
};

// ============ EVENT LISTENERS ============
$("btnCreateRoom").addEventListener("click", createRoom);
$("btnJoinRoom").addEventListener("click", () => {
  const code = $("roomIdInput").value.trim().toUpperCase();
  if (!code) {
    showToast("Masukkan kode room!", true);
    AudioFX.error();
    return;
  }
  joinRoom(code);
});
$("btnJoinByCode").addEventListener("click", () => {
  const code = $("roomIdInput").value.trim().toUpperCase();
  joinRoom(code);
});
$("btnCopyRoomId").addEventListener("click", copyRoomId);
$("btnLeaveRoom").addEventListener("click", leaveRoom);
$("btnLeaveGame").addEventListener("click", () => {
  if (confirm("Yakin ingin meninggalkan room?")) leaveRoom();
});

$("btnModalPlayAgain").addEventListener("click", async () => {
  hideModal();
  if (!state.roomId) return;
  // Reset room for new game (only host can)
  if (state.playerSlot === 1) {
    try {
      await updateDoc(doc(db, "rooms", state.roomId), {
        board: Array(9).fill(""),
        turn: "X",
        winner: "",
        winningLine: [],
        status: "playing",
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      showToast("Gagal reset room", true);
    }
  } else {
    showToast("Host harus reset room", true);
  }
});

$("btnModalLobby").addEventListener("click", () => {
  hideModal();
  leaveRoom();
});

// Enter key support
$("playerName").addEventListener("keypress", (e) => {
  if (e.key === "Enter") createRoom();
});
$("roomIdInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const code = $("roomIdInput").value.trim().toUpperCase();
    joinRoom(code);
  }
});

// ============ INIT ============
buildBoard();
startConnectionMonitor();

// Auto-resume audio context on first interaction
document.addEventListener("click", () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
  } catch (e) {}
}, { once: true });
