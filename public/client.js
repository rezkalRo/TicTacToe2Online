// Abanoub Rezkalla - CS 310, Project 4 - Fall 2026
// Browser client: display the game and send user actions to the Node.js server.

// DOM ELEMENTS
const boardCanvas = document.getElementById("board");
const ctx = boardCanvas.getContext("2d");
const statusElement = document.getElementById("status");
const roleElement = document.getElementById("role");
const resetBtn = document.getElementById("resetBtn");
const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");
const passwordInput = document.getElementById("passwordInput");

const CELL_SIZE = 200;
const BOARD_SIZE = CELL_SIZE * 3;

// Use ws:// on localhost and wss:// if hosted on HTTPS.
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${protocol}//${window.location.host}`);

let gameState = null; // The display copy of the server's authoritative state.
let role = "spectator";
let authenticated = false;

// Draw the blue background and the three-by-three grid.
function drawGrid() {
  ctx.fillStyle = "#43C4EE";
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  ctx.strokeStyle = "#171717";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let position = CELL_SIZE; position < BOARD_SIZE; position += CELL_SIZE) {
    ctx.moveTo(position, 0);
    ctx.lineTo(position, BOARD_SIZE);
    ctx.moveTo(0, position);
    ctx.lineTo(BOARD_SIZE, position);
  }
  ctx.stroke();
}

// Draw an X in the indicated cell.
function drawX(x, y) {
  const margin = 31;
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + margin, y + margin);
  ctx.lineTo(x + CELL_SIZE - margin, y + CELL_SIZE - margin);
  ctx.moveTo(x + CELL_SIZE - margin, y + margin);
  ctx.lineTo(x + margin, y + CELL_SIZE - margin);
  ctx.stroke();
}

// Draw an O in the indicated cell.
function drawO(x, y) {
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE / 2 - 30, 0, 2 * Math.PI);
  ctx.stroke();
}

// Redraw every piece whenever the server broadcasts an updated state.
function drawBoard() {
  drawGrid();
  if (!gameState) return;

  gameState.board.forEach((value, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = col * CELL_SIZE;
    const y = row * CELL_SIZE;
    if (value === "X") {
      drawX(x, y);
    } else if (value === "O") {
      drawO(x, y);
    }
  });

  if (gameState.winner) {
    statusElement.textContent = `Winner: ${gameState.winner}`;
  } else if (gameState.draw) {
    statusElement.textContent = "Draw! No winner.";
  } else {
    statusElement.textContent = `Turn: ${gameState.currentPlayer}`;
  }
}

function sendMessage(data) {
  if (ws.readyState !== WebSocket.OPEN) {
    alert("Connection to the server is not available. Please refresh the page.");
    return;
  }
  ws.send(JSON.stringify(data));
}

// MOUSE CLICK: Translate the clicked canvas cell to indices 0 through 8.
boardCanvas.addEventListener("click", event => {
  if (!authenticated || (role !== "X" && role !== "O") || !gameState) return;
  if (gameState.winner || gameState.draw || gameState.currentPlayer !== role) return;

  const rect = boardCanvas.getBoundingClientRect();
  // Canvas can be visually scaled; translate browser coordinates to its 600px grid.
  const x = (event.clientX - rect.left) * (boardCanvas.width / rect.width);
  const y = (event.clientY - rect.top) * (boardCanvas.height / rect.height);
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return;

  const col = Math.floor(x / CELL_SIZE);
  const row = Math.floor(y / CELL_SIZE);
  const index = row * 3 + col;
  if (gameState.board[index] !== "") return;
  sendMessage({ type: "place", index });
});

// SERVER MESSAGES: board state, assigned role, or password/error message.
ws.onmessage = event => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (data.type === "state") {
    gameState = data.gameState;
    drawBoard();
  } else if (data.type === "role") {
    role = data.role;
    authenticated = true;
    roleElement.textContent = `Logged in as ${data.name} (${role})`;
    nameInput.disabled = true;
    passwordInput.disabled = true;
    passwordInput.value = "";
    joinBtn.disabled = true;
  } else if (data.type === "error") {
    alert(data.message);
  }
};

ws.onopen = () => {
  roleElement.textContent = "Enter your first name and password to join.";
};

ws.onclose = () => {
  authenticated = false;
  roleElement.textContent = "Disconnected from server. Refresh to reconnect.";
  statusElement.textContent = "Connection closed.";
};

ws.onerror = () => {
  if (!authenticated) {
    roleElement.textContent = "Could not connect to server.";
  }
};

// JOIN GAME BUTTON, ALSO SUPPORTING THE ENTER KEY IN LOGIN FIELDS.
function joinGame() {
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter your first name.");
    nameInput.focus();
    return;
  }
  if (!passwordInput.value) {
    alert("Please enter the game password.");
    passwordInput.focus();
    return;
  }
  sendMessage({ type: "login", name, password: passwordInput.value });
}

joinBtn.addEventListener("click", joinGame);
[nameInput, passwordInput].forEach(input => {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") joinGame();
  });
});

// RESET GAME BUTTON: The server resets and updates all connected browsers.
resetBtn.addEventListener("click", () => {
  if (!authenticated) {
    alert("Please join the game before resetting.");
    return;
  }
  sendMessage({ type: "reset" });
});

// Display the empty blue grid while waiting for the first state message.
drawGrid();
