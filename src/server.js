require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { logGameEvent, logError } = require('./utils/logger');
const Question = require('./models/Question');
const { Game } = require('./game/Game'); // Import the Game class
// Import validators
const { validatePlayerName, validateAnswer, validateRaiseAmount } = require('./utils/validators');

// Socket.IO Rate Limiting Configuration
const SOCKET_CONNECTION_WINDOW_MS = (parseInt(process.env.SOCKET_CONNECTION_WINDOW_SECONDS) || 60) * 1000;
const SOCKET_MAX_CONNECTIONS_PER_WINDOW = parseInt(process.env.SOCKET_MAX_CONNECTIONS_PER_WINDOW) || 10;
const SOCKET_EVENT_WINDOW_MS = (parseInt(process.env.SOCKET_EVENT_WINDOW_SECONDS) || 10) * 1000;
const SOCKET_MAX_EVENTS_PER_WINDOW = parseInt(process.env.SOCKET_MAX_EVENTS_PER_WINDOW) || 20;

const ipConnections = {}; // For connection rate limiting

// Create a single game instance
const game = new Game(io); // Pass io to Game instance for broadcasting

// Middleware
app.use(helmet({
  hsts: false, // Disable HSTS to prevent browsers from forcing HTTPS on local dev
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "ws:", "wss:", "*"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "*"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "*"],
      imgSrc: ["'self'", "data:", "blob:", "https://api.dicebear.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      upgradeInsecureRequests: null, // Explicitly disable upgrade-insecure-requests
    },
  },
}));
app.use(cors());
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX
});
app.use(limiter);

// Debug middleware for static files
app.use((req, res, next) => {
    if (req.url.endsWith('.css')) {
        console.log(`CSS Request: ${req.method} ${req.url} from ${req.ip}`);
    }
    next();
});

// Socket.IO Connection Rate Limiting Middleware
io.use((socket, next) => {
  const ip = socket.handshake.address;
  const now = Date.now();

  if (!ipConnections[ip]) {
    ipConnections[ip] = [];
  }

  // Filter out old connection timestamps
  ipConnections[ip] = ipConnections[ip].filter(timestamp => now - timestamp < SOCKET_CONNECTION_WINDOW_MS);

  if (ipConnections[ip].length >= SOCKET_MAX_CONNECTIONS_PER_WINDOW) {
    logError(new Error(`Too many connections from IP: ${ip}`), { context: 'Socket Connection Rate Limit', ipAddress: ip });
    // The client will receive an 'error' event with this message
    return next(new Error('Too many connections, please try again later.'));
  }

  ipConnections[ip].push(now);
  next();
});

// Verbindung zur MongoDB-Datenbank mit verbesserten Optionen
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(async () => {
  logGameEvent('DATABASE_CONNECTED', { host: mongoose.connection.host });
  console.log('Verbunden mit MongoDB');
  
  // Debug: Überprüfe vorhandene Fragen
  const questionCount = await Question.countDocuments();
  console.log(`Anzahl der Fragen in der Datenbank: ${questionCount}`);
})
.catch(err => {
  logError(err, { context: 'Database Connection' });
  console.error('Fehler beim Verbinden mit MongoDB:', err);
  process.exit(1); // Beende den Server bei Verbindungsfehler
});

// Verbesserte Fehlerbehandlung für MongoDB-Verbindung
mongoose.connection.on('error', err => {
  console.error('MongoDB Verbindungsfehler:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB Verbindung getrennt');
});

// Statische Dateien aus dem Ordner "public" bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// Route für die Startseite
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Socket.IO: Ereignisse
io.on('connection', (socket) => {
  // Socket.IO Event Rate Limiting for this specific connection
  socket.eventTimestamps = []; // Initialize on the socket object

  socket.use(([event, ...args], next) => {
    const now = Date.now();
    
    // Filter out old event timestamps
    // Ensure eventTimestamps is an array before calling filter
    if (!Array.isArray(socket.eventTimestamps)) {
        socket.eventTimestamps = [];
    }
    socket.eventTimestamps = socket.eventTimestamps.filter(timestamp => now - timestamp < SOCKET_EVENT_WINDOW_MS);

    if (socket.eventTimestamps.length >= SOCKET_MAX_EVENTS_PER_WINDOW) {
      logError(new Error(`Too many events from socket: ${socket.id}, IP: ${socket.handshake.address}, Event: ${event}`), { context: 'Socket Event Rate Limit', socketId: socket.id, ipAddress: socket.handshake.address, eventName: event });
      socket.emit('errorMessage', 'Too many requests. Please slow down.'); // Inform client via custom event
      // This will also cause an 'error' event on the client for this specific socket if not handled by 'errorMessage'
      return next(new Error(`Too many requests for event '${event}'. Please slow down.`));
    }

    socket.eventTimestamps.push(now);
    next();
  });

  logGameEvent('PLAYER_CONNECTED', { socketId: socket.id, ip: socket.handshake.address });
  console.log('Neuer Spieler verbunden:', socket.id, 'IP:', socket.handshake.address);

  // Check for reconnection token
  const token = socket.handshake.auth.token;
  if (token) {
      console.log(`Versuche Reconnection mit Token: ${token}`);
      game.reconnectPlayer(token, socket.id).then(player => {
          if (player) {
              console.log(`Spieler ${player.name} erfolgreich wiederverbunden.`);
              socket.emit('sessionRestored', {
                  name: player.name,
                  role: player.role,
                  token: socket.id // Update token to new socket id
              });
              socket.emit('gameState', game.getGameStateForClient(socket.id));
              
              // If host, send question count
              if (player.role === 'host') {
                  Question.countDocuments().then(count => {
                      socket.emit('questionsAvailable', { count: count });
                  });
              }

              io.emit('playerJoined', game.getGameStateSnapshot()); // Notify others
          }
      });
  }

  // Spieler beitreten
  socket.on('joinGame', (data) => {
    console.log('Spieler versucht beizutreten:', { socketId: socket.id, data: data });
    
    // Validate name using the imported validator
    const nameValidation = validatePlayerName(data.name);
    if (!nameValidation.isValid) {
      socket.emit('errorMessage', nameValidation.message);
      logError(new Error(`Invalid player name: ${data.name}`), { context: 'joinGame validation', details: nameValidation.message });
      return;
    }

    // Validate role (simple check here, can be expanded)
    if (!data.role || !['player', 'host'].includes(data.role)) {
        socket.emit('errorMessage', 'Ungültige Rolle angegeben.');
        logError(new Error(`Invalid role: ${data.role}`), { context: 'joinGame validation' });
        return;
    }

    if (data.role === 'player') {
      try {
        const player = game.addPlayer(socket.id, data.name, data.role, data.avatarSeed);
        if (player) {
          console.log(`Spieler ${data.name} (${socket.id}) ist beigetreten oder hat sich neu verbunden.`);
          
          // Emit sessionCreated to the joining player
          socket.emit('sessionCreated', {
            name: player.name,
            role: player.role,
            token: socket.id // Simple token for now
          });

          // Send game state to the joining player
          socket.emit('gameState', game.getGameStateForClient(socket.id));
          // Broadcast updated player list to all clients - send full state to everyone
          const fullState = game.getGameStateSnapshot();
          io.emit('playerJoined', fullState); // Send full state to all clients
        } else {
          // This case should ideally be handled within addPlayer, e.g., by throwing an error
          socket.emit('errorMessage', 'Fehler beim Beitreten zum Spiel. Name möglicherweise vergeben oder Spiel voll.');
          logError(new Error('Failed to add player'), { context: 'joinGame', socketId: socket.id, name: data.name });
        }
      } catch (error) {
        socket.emit('errorMessage', error.message);
        logError(error, { context: 'joinGame', socketId: socket.id, name: data.name });
      }
    } else if (data.role === 'host') {
      try {
        game.setHost(socket.id, data.name);
        console.log(`Host ${data.name} (${socket.id}) ist beigetreten.`);
        
        // Emit sessionCreated to the host
        socket.emit('sessionCreated', {
            name: data.name,
            role: 'host',
            token: socket.id
        });

        // Send game state to the host
        socket.emit('gameState', game.getGameStateForClient(socket.id));
        
        // Informiere den Host über die Anzahl der Fragen in der Datenbank
        Question.countDocuments()
          .then(count => {
            socket.emit('questionsAvailable', { count: count });
          })
          .catch(err => {
            console.error('Fehler beim Zählen der Fragen:', err);
            logError(err, { context: 'Count Questions for Host' });
          });
      } catch (error) {
        socket.emit('errorMessage', error.message);
        logError(error, { context: 'joinGame - Host', socketId: socket.id, name: data.name });
      }
    }
    logGameEvent('PLAYER_JOINED_ATTEMPT_PROCESSED', { socketId: socket.id, ...data, playerState: game.players[socket.id] });
  });

  // Spielerliste anfordern
  socket.on('requestPlayerList', () => {
    console.log('Spielerliste angefordert von:', socket.id);
    // The Game class should provide a method to get just the player list if needed
    // For now, sending the full game state which includes player info.
    socket.emit('playerList', game.getPlayersState()); // Assuming getPlayersState() exists or getGameStateForClient() is sufficient
  });

  // Host startet eine Runde
  socket.on('startGame', async () => {
    try {
      logGameEvent('START_GAME_REQUESTED', { socketId: socket.id, hostSocketId: game.hostSocketId });
      const success = await game.startGame(socket.id);
      if (success) {
        // Game.startGame now handles broadcasting
        logGameEvent('START_GAME_SUCCESS', { socketId: socket.id });
      } else {
        // Error message already sent by Game.startGame to the socket
        logGameEvent('START_GAME_FAILED', { socketId: socket.id, reason: 'Game.startGame returned false' });
      }
    } catch (error) {
      // Catch any unexpected errors from game.startGame that weren't handled by emitting to socket
      socket.emit('errorMessage', "Fehler beim Spielstart: " + error.message);
      logError(error, { context: 'startGame event handler', socketId: socket.id });
    }
  });

  // Spieler gibt Antwort ab
  socket.on('submitFinalAnswer', (answer) => {
    const answerValidation = validateAnswer(answer);
    if (!answerValidation.isValid) {
        socket.emit('errorMessage', answerValidation.message);
        logError(new Error(`Invalid answer format: ${answer}`), { context: 'submitFinalAnswer validation', details: answerValidation.message, socketId: socket.id });
        return;
    }

    try {
      logGameEvent('SUBMIT_FINAL_ANSWER_REQUESTED', { socketId: socket.id, answer });
      const success = game.submitAnswer(socket.id, answer);
      if (success) {
        // Game.submitAnswer handles broadcasting to host and checking if all answered
        logGameEvent('SUBMIT_FINAL_ANSWER_SUCCESS', { socketId: socket.id });
      } else {
        // Error message already sent by Game.submitAnswer
        logGameEvent('SUBMIT_FINAL_ANSWER_FAILED', { socketId: socket.id, reason: 'Game.submitAnswer returned false' });
      }
    } catch (error) {
      socket.emit('errorMessage', "Fehler beim Abgeben der Antwort: " + error.message);
      logError(error, { context: 'submitFinalAnswer event handler', socketId: socket.id });
    }
  });

  // Host zeigt einen Hinweis an
  socket.on('showHint', () => {
    try {
      logGameEvent('SHOW_HINT_REQUESTED', { socketId: socket.id });
      const success = game.showHint(socket.id);
      if (success) {
        // Game.showHint handles broadcasting
        logGameEvent('SHOW_HINT_SUCCESS', { socketId: socket.id });
      } else {
        // Error message already sent by Game.showHint
        logGameEvent('SHOW_HINT_FAILED', { socketId: socket.id, reason: 'Game.showHint returned false' });
      }
    } catch (error) {
      socket.emit('errorMessage', "Fehler beim Anzeigen des Hinweises: " + error.message);
      logError(error, { context: 'showHint event handler', socketId: socket.id });
    }
  });

  // Spieler führt eine Aktion aus (fold, call, raise)
  socket.on('playerAction', (data) => {
    if (!data || typeof data.action !== 'string') {
        socket.emit('errorMessage', 'Ungültige Aktion oder fehlende Daten.');
        logError(new Error('Invalid player action data'), { context: 'playerAction validation', data, socketId: socket.id });
        return;
    }

    const { action, amount } = data;

    if (action === 'raise') {
        const raiseValidation = validateRaiseAmount(amount);
        if (!raiseValidation.isValid) {
            socket.emit('errorMessage', raiseValidation.message);
            logError(new Error(`Invalid raise amount: ${amount}`), { context: 'playerAction validation - raise', details: raiseValidation.message, socketId: socket.id });
            return;
        }
    }
    // Add more validation for other actions or general data structure if needed

    try {
      logGameEvent('PLAYER_ACTION_REQUESTED', { socketId: socket.id, action: action, amount: amount });
      // Pass validated amount for raise action
      const success = game.handlePlayerAction(socket.id, action, { action, amount }); 
      if (success) {
        // Game.handlePlayerAction and its sub-handlers (handleFold, handleCall, handleRaise)
        // are responsible for broadcasting the results of the action.
        logGameEvent('PLAYER_ACTION_SUCCESS', { socketId: socket.id, action: data.action });
      } else {
        // Error messages are typically sent by game.handlePlayerAction or its sub-handlers.
        logGameEvent('PLAYER_ACTION_FAILED', { socketId: socket.id, action: data.action, reason: 'Game.handlePlayerAction returned false' });
      }
    } catch (error) {
      socket.emit('errorMessage', `Fehler bei Aktion '${data.action}': ${error.message}`);
      logError(error, { context: `playerAction event handler (${data.action})`, socketId: socket.id, data });
    }
  });

  // Host startet den Showdown
  socket.on('startShowdown', async () => {
    try {
      logGameEvent('START_SHOWDOWN_REQUESTED', { socketId: socket.id });
      const success = await game.handleShowdown(socket.id);
      if (success) {
        // Game.handleShowdown handles broadcasting results
        logGameEvent('START_SHOWDOWN_SUCCESS', { socketId: socket.id });
      } else {
        // Error message sent by Game.handleShowdown
        logGameEvent('START_SHOWDOWN_FAILED', { socketId: socket.id, reason: 'Game.handleShowdown returned false' });
      }
    } catch (error) {
      socket.emit('errorMessage', "Fehler beim Starten des Showdowns: " + error.message);
      logError(error, { context: 'startShowdown event handler', socketId: socket.id });
    }
  });

  // Host enthüllt die Antwort
  socket.on('revealAnswer', async () => {
    try {
      logGameEvent('REVEAL_ANSWER_REQUESTED', { socketId: socket.id });
      const success = await game.revealAnswer(socket.id);
      if (success) {
        logGameEvent('REVEAL_ANSWER_SUCCESS', { socketId: socket.id });
      } else {
        logGameEvent('REVEAL_ANSWER_FAILED', { socketId: socket.id, reason: 'Game.revealAnswer returned false' });
      }
    } catch (error) {
      socket.emit('errorMessage', "Fehler beim Enthüllen der Antwort: " + error.message);
      logError(error, { context: 'revealAnswer event handler', socketId: socket.id });
    }
  });

  // Spieler enthüllt seine Antwort
  socket.on('revealMyAnswer', async () => {
    try {
      logGameEvent('REVEAL_MY_ANSWER_REQUESTED', { socketId: socket.id });
      const success = await game.revealPlayerAnswer(socket.id);
      if (success) {
        logGameEvent('REVEAL_MY_ANSWER_SUCCESS', { socketId: socket.id });
      } else {
        socket.emit('errorMessage', "Antwort konnte nicht enthüllt werden (vielleicht noch keine abgegeben?).");
      }
    } catch (error) {
      socket.emit('errorMessage', "Fehler beim Enthüllen der Antwort: " + error.message);
      logError(error, { context: 'revealMyAnswer event handler', socketId: socket.id });
    }
  });

  // Host setzt das Spiel zurück
  socket.on('resetGame', async () => {
    try {
        logGameEvent('RESET_GAME_REQUESTED', { socketId: socket.id });
        const success = await game.resetGame(socket.id);
        if (success) {
            logGameEvent('RESET_GAME_SUCCESS', { socketId: socket.id });
        }
    } catch (error) {
        socket.emit('errorMessage', "Fehler beim Zurücksetzen des Spiels: " + error.message);
        logError(error, { context: 'resetGame event handler', socketId: socket.id });
    }
  });

  // Host setzt die Runde zurück
  socket.on('resetRound', async () => {
    try {
        logGameEvent('RESET_ROUND_REQUESTED', { socketId: socket.id });
        const success = await game.resetRound(socket.id);
        if (success) {
            logGameEvent('RESET_ROUND_SUCCESS', { socketId: socket.id });
        }
    } catch (error) {
        socket.emit('errorMessage', "Fehler beim Zurücksetzen der Runde: " + error.message);
        logError(error, { context: 'resetRound event handler', socketId: socket.id });
    }
  });

  // Host startet die nächste Runde (neue Frage)
  socket.on('nextRound', async () => {
    try {
        logGameEvent('NEXT_ROUND_REQUESTED', { socketId: socket.id });
        // Reuse startGame logic but ensure it handles next round correctly
        // Or implement a specific nextRound method in Game if needed.
        // For now, startGame seems to do what is needed (pick question, reset round state, keep balances)
        const success = await game.startGame(socket.id); 
        if (success) {
            logGameEvent('NEXT_ROUND_SUCCESS', { socketId: socket.id });
        }
    } catch (error) {
        socket.emit('errorMessage', "Fehler beim Starten der nächsten Runde: " + error.message);
        logError(error, { context: 'nextRound event handler', socketId: socket.id });
    }
  });

  // Host überspringt die aktuelle Frage
  socket.on('skipQuestion', async () => {
    try {
        logGameEvent('SKIP_QUESTION_REQUESTED', { socketId: socket.id });
        // Reuse startGame logic to pick a new question and reset round
        const success = await game.startGame(socket.id); 
        if (success) {
            logGameEvent('SKIP_QUESTION_SUCCESS', { socketId: socket.id });
        }
    } catch (error) {
        socket.emit('errorMessage', "Fehler beim Überspringen der Frage: " + error.message);
        logError(error, { context: 'skipQuestion event handler', socketId: socket.id });
    }
  });

  // Spieler verlässt das Spiel / Verbindung wird getrennt
  socket.on('disconnect', () => {
    logGameEvent('PLAYER_DISCONNECTED', { socketId: socket.id });
    console.log('Spieler getrennt:', socket.id);
    game.removePlayer(socket.id); // Game class handles broadcasting player list update
    // No need to manually emit playerLeft here if removePlayer handles it
  });

  // Weitere Event-Handler...
});

// Server starten
http.listen(process.env.PORT || 3000, () => {
  console.log(`Server läuft auf Port ${process.env.PORT || 3000}`);
  console.log(`HINWEIS: Nutzen Sie http:// (nicht https://) für den Zugriff.`);
  logGameEvent('SERVER_STARTED', { port: process.env.PORT || 3000 });
});
