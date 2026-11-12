// Abanoub Rezkalla - CS 310, Project 4 - Fall 2026
// Multiplayer Tic-Tac-Toe server using Node.js, Express, HTTP, and WebSockets.

const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

// SERVER SETUP
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, "public")));

// The password follows the classroom example in Lecture 7.
const GAME_PASSWORD = "secret123";

// GAME STATE: The server, rather than either browser, owns the shared game.
function freshGameState() {
  return {
    board: Array(9).fill(""),
    currentPlayer: "X",
    winner: null,
    draw: false
  };
}

let gameState = freshGameState();

// Exactly two sockets can be active players; additional clients are spectators.
const players = { X: null, O: null };

// SEND GAME STATE TO EVERY CONNECTED CLIENT
function broadcastState() {
  const payload = JSON.stringify({ type: "state", gameState });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// CHECK ALL EIGHT POSSIBLE WINNING LINES
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function sendError(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "error", message }));
  }
}

// MAIN CONNECTION EVENT LISTENER
wss.on("connection", ws => {
  ws.playerName = "";
  ws.role = "spectator";
  ws.authenticated = false;

  // Display the server's current board as soon as a browser connects.
  ws.send(JSON.stringify({ type: "state", gameState }));

  // RECEIVE MESSAGES: LOGIN, PLACE, AND RESET
  ws.on("message", message => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch {
      sendError(ws, "The message could not be read.");
      return;
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      sendError(ws, "Invalid message.");
      return;
    }

    // LOGIN / PASSWORD CHECK / ASSIGN X, O, OR SPECTATOR
    if (data.type === "login") {
      if (ws.authenticated) {
        sendError(ws, "You have already joined. Refresh to reconnect.");
        return;
      }
      if (data.password !== GAME_PASSWORD) {
        sendError(ws, "Invalid password.");
        return;
      }
      if (typeof data.name !== "string" || !data.name.trim()) {
        sendError(ws, "Please enter your first name.");
        return;
      }

      ws.playerName = data.name.trim().slice(0, 40);
      ws.authenticated = true;

      if (!players.X) {
        players.X = ws;
        ws.role = "X";
      } else if (!players.O) {
        players.O = ws;
        ws.role = "O";
      } else {
        ws.role = "spectator";
      }

      ws.send(JSON.stringify({
        type: "role",
        role: ws.role,
        name: ws.playerName
      }));
      console.log(`${ws.playerName} joined as ${ws.role}.`);
      return;
    }

    // No game commands are accepted before successful login.
    if (!ws.authenticated) {
      sendError(ws, "Please join the game first.");
      return;
    }

    // PLACE A PIECE (ALL RULES ARE ENFORCED SERVER-SIDE)
    if (data.type === "place") {
      const index = data.index;

      // A spectator cannot play or make moves on another player's behalf.
      if ((ws.role !== "X" && ws.role !== "O") || players[ws.role] !== ws) {
        return;
      }
      if (ws.role !== gameState.currentPlayer || gameState.winner || gameState.draw) {
        return;
      }
      if (!Number.isInteger(index) || index < 0 || index >= 9) {
        return;
      }
      if (gameState.board[index] !== "") {
        return;
      }

      gameState.board[index] = ws.role;
      const winner = checkWinner(gameState.board);
      if (winner) {
        gameState.winner = winner;
      } else if (gameState.board.every(cell => cell !== "")) {
        gameState.draw = true;
      } else {
        gameState.currentPlayer = gameState.currentPlayer === "X" ? "O" : "X";
      }

      broadcastState();
      return;
    }

    // RESET THE GAME. As in Lecture 7, any logged-in client may request a reset.
    if (data.type === "reset") {
      gameState = freshGameState();
      broadcastState();
    }
  });

  // CLIENT DISCONNECTS: RELEASE THE PLAYER'S ROLE FOR A FUTURE JOIN.
  ws.on("close", () => {
    if (players.X === ws) players.X = null;
    if (players.O === ws) players.O = null;
    if (ws.authenticated) {
      console.log(`${ws.playerName} (${ws.role}) disconnected.`);
    }
  });
});

// START HTTP AND WEBSOCKET SERVER ON PORT 3000 FOR LOCAL DEMOS.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
