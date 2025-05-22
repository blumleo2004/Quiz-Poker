const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const PORT = process.env.PORT || 3000;

// Verbindung zur MongoDB-Datenbank (passe den Connection-String bei Bedarf an)
mongoose.connect('mongodb://localhost/quizpoker', { useNewUrlParser: true })
  .then(() => console.log('Verbunden mit MongoDB'))
  .catch(err => console.error('Fehler beim Verbinden mit MongoDB', err));

// In-Memory-Objekt zum Speichern der Spieler (nur Spieler, der Host wird getrennt behandelt)
let players = {};

// Globale Variablen für die aktuelle Frage, gesammelte Antworten und Einsätze
let currentQuestion = null;
let currentAnswers = {};
let currentBets = {};
let usedQuestionIds = []; // To track used questions
let hostSocketId = null; // To store the host's socket ID

// Spieler-Reihenfolge für Poker-Mechanik und Dealer-Zuweisung
let playerOrder = [];
let dealerIndex = 0;

const Question = require('./models/Question');

// Statische Dateien aus dem Ordner "public" bereitstellen
app.use(express.static('public'));

// Route für die Startseite
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Socket.IO: Ereignisse
io.on('connection', (socket) => {
  console.log('Neuer Spieler verbunden: ' + socket.id);

  // Spieler beitreten
  socket.on('joinGame', (data) => {
    try {
      if (!data || typeof data.role !== 'string') {
        console.error('Error in joinGame: Invalid data object or role.');
        socket.emit('errorMessage', 'Invalid join request.');
        return;
      }

      // Validate role
      if (data.role === 'player') {
        let playerName = data.name ? data.name.toString().trim() : '';
        playerName = playerName.replace(/<[^>]*>?/gm, ''); // Sanitize

        if (!playerName) {
          playerName = 'Anonymous';
        } else if (playerName.length < 2) {
          playerName = 'Player' + Math.floor(Math.random() * 1000);
        } else if (playerName.length > 20) {
          playerName = playerName.substring(0, 20);
        }

        players[socket.id] = { name: playerName, role: data.role, balance: 1000 };
        playerOrder.push(socket.id);
        console.log(`Spieler ${playerName} (${socket.id}) ist beigetreten.`);
        io.emit('playerList', players);
        io.emit('playerOrder', playerOrder.map(id => players[id] ? players[id].name : "Unbekannt"));

      } else if (data.role === 'host') {
        if (hostSocketId && hostSocketId !== socket.id) {
          console.log(`Attempt by ${socket.id} to become host, but host ${hostSocketId} already exists.`);
          socket.emit('errorMessage', 'A host is already present in the game.');
          return; // Prevent this socket from becoming a new host
        }
        hostSocketId = socket.id;
        let hostName = data.name ? data.name.toString().trim() : 'Host';
        hostName = hostName.replace(/<[^>]*>?/gm, '');
        if (!hostName) hostName = 'Anonymous Host';
        if (hostName.length > 20) hostName = hostName.substring(0, 20);
        console.log(`Host ${hostName} (${socket.id}) has connected.`);
        // Host is not added to 'players' object or 'playerOrder'
      } else {
        // Invalid role
        console.log(`Attempted join with invalid role: ${data.role} from ${socket.id}`);
        socket.emit('errorMessage', 'Invalid role specified.'); // Optionally inform client
        // Do not add to players or playerOrder
      }
    } catch (err) {
      console.error('Error in event joinGame:', err);
      socket.emit('serverErrorMessage', 'An unexpected error occurred while joining the game.');
    }
  });

  // Host startet eine Runde: Hole eine zufällige Frage aus der DB und weise Blinds zu
  socket.on('startGame', async () => {
    try {
      console.log('Host startet die Runde.');
      if (playerOrder.length < 3) {
        socket.emit('errorMessage', "Mindestens 3 Spieler sind erforderlich!");
        return;
      }

      // Ensure playerOrder contains valid player IDs and players exist
      if (!playerOrder.every(id => players[id])) {
        console.error('Error in startGame: playerOrder contains invalid player IDs or player objects are missing.');
        socket.emit('serverErrorMessage', 'Error starting game due to inconsistent player data.');
        return;
      }
      
      const totalQuestionsCount = await Question.countDocuments();
      if (totalQuestionsCount === 0) {
        console.log('Keine Fragen in der Datenbank gefunden!');
        io.emit('noQuestions'); // This can be an io.emit as it's a general game state
        return;
      }

      let question;
      const availableQuestionsCount = await Question.countDocuments({ _id: { $nin: usedQuestionIds } });

      if (availableQuestionsCount > 0) {
        const randomSkip = Math.floor(Math.random() * availableQuestionsCount);
        question = await Question.findOne({ _id: { $nin: usedQuestionIds } }).skip(randomSkip);
      } else {
        console.log('All questions have been used. Resetting question cycle.');
        io.emit('systemMessage', 'All questions have been used. Resetting question cycle.');
        usedQuestionIds = [];
        const randomSkip = Math.floor(Math.random() * totalQuestionsCount);
        question = await Question.findOne().skip(randomSkip);
      }
      
      if (!question) {
        console.error('Error in startGame: No question could be fetched.');
        socket.emit('serverErrorMessage', 'Error fetching question.');
        return;
      }

      currentQuestion = question;
      currentBets = {};
      currentAnswers = {};
      
      // Assign roles: Dealer, Small Blind, Big Blind
      // This check is slightly redundant given the initial one, but good for safety before array access
      if (playerOrder.length < 3) { 
           console.error('Error in startGame: Not enough players for role assignment just before assignment.');
           socket.emit('serverErrorMessage', 'Error assigning roles due to insufficient players.');
           return;
      }
      let dealerId = playerOrder[dealerIndex % playerOrder.length];
      let smallBlindId = playerOrder[(dealerIndex + 1) % playerOrder.length];
      let bigBlindId = playerOrder[(dealerIndex + 2) % playerOrder.length];

      // Existence checks for players assigned roles
      if (!players[dealerId] || !players[smallBlindId] || !players[bigBlindId]) {
          console.error(`Error in startGame: Player not found for role. Dealer: ${!!players[dealerId]}, SB: ${!!players[smallBlindId]}, BB: ${!!players[bigBlindId]}`);
          socket.emit('serverErrorMessage', 'Error assigning roles due to missing player data.');
          return;
      }
      
      const smallBlind = 10;
      const bigBlind = 20;
      
      // Deduct blinds
      if (players[smallBlindId].balance >= smallBlind) {
        players[smallBlindId].balance -= smallBlind;
        currentBets[smallBlindId] = smallBlind;
      } else {
        currentBets[smallBlindId] = players[smallBlindId].balance;
        players[smallBlindId].balance = 0;
      }
      if (players[bigBlindId].balance >= bigBlind) {
        players[bigBlindId].balance -= bigBlind;
        currentBets[bigBlindId] = bigBlind;
      } else {
        currentBets[bigBlindId] = players[bigBlindId].balance;
        players[bigBlindId].balance = 0;
      }
      
      io.emit('roleAssignment', {
        dealer: players[dealerId].name,
        smallBlind: players[smallBlindId].name,
        bigBlind: players[bigBlindId].name,
        bets: currentBets
      });
      io.emit('playerList', players); 
      
      io.emit('newQuestion', { 
        question: currentQuestion.question, 
        hint: currentQuestion.hints && currentQuestion.hints.length > 0 ? currentQuestion.hints[0] : ''
      });
      
      dealerIndex++;
      
    } catch (err) {
      console.error('Error in event startGame:', err);
      socket.emit('serverErrorMessage', 'An unexpected error occurred while starting the game.');
    }
  });

  // Spieler platzieren ihren Einsatz (Betting-Phase)
  socket.on('placeBet', (betAmount) => {
    try {
      const player = players[socket.id];
      if (!player) {
        console.error(`Error in placeBet: Player object not found for socket ID: ${socket.id}`);
        socket.emit('errorMessage', "Player not found. Cannot place bet.");
        return;
      }

      const parsedBet = Number(betAmount);
      // Validate bet amount: must be a positive integer.
      if (isNaN(parsedBet) || !Number.isInteger(parsedBet) || parsedBet <= 0) {
        socket.emit('errorMessage', "Invalid bet amount: Must be a positive integer.");
        return;
      }
      const totalBetForRound = parsedBet; // Use the validated bet

      const alreadyBet = currentBets[socket.id] || 0;
      const additionalBetRequired = totalBetForRound - alreadyBet;

      if (additionalBetRequired < 0) {
        socket.emit('errorMessage', "Cannot reduce bet."); // Or handle as a specific game action if allowed
        return;
      }
    
      if (player.balance >= additionalBetRequired) {
        player.balance -= additionalBetRequired;
        currentBets[socket.id] = totalBetForRound;
        console.log(`Spieler ${player.name} setzt ${totalBetForRound}€ (zusätzlich ${additionalBetRequired}€)`);
        io.emit('betUpdate', currentBets);
        io.emit('playerList', players);
      } else {
        socket.emit('errorMessage', "Nicht genug Guthaben!");
      }
    } catch (err) {
      console.error('Error in event placeBet:', err);
      socket.emit('serverErrorMessage', 'An unexpected error occurred while placing your bet.');
    }
  });

  // Host schließt das Betting ab – Wechsel zur Antwort-Phase
  socket.on('closeBetting', () => {
    try {
      console.log('Betting wurde vom Host geschlossen.');
      io.emit('bettingClosed');
    } catch (err) {
      console.error('Error in event closeBetting:', err);
      // This is a host action, error could be emitted to the host if host's socket is tracked,
      // or a general message if it affects game state for all.
      // For simplicity, emitting to the triggering socket (host).
      socket.emit('serverErrorMessage', 'An unexpected error occurred while closing betting.');
    }
  });

  // Spieler senden ihre Antwort (Antwort-Phase)
  socket.on('sendAnswer', (answer) => {
    try {
      // Optional: Check if the sender (socket.id) is a known player
      // if (!players[socket.id]) {
      //   console.warn(`Unrecognized socket ${socket.id} tried to send an answer.`);
      //   socket.emit('errorMessage', 'You are not recognized in the game to send an answer.');
      //   return;
      // }

      let playerAnswer = answer ? answer.toString().trim() : '';
      // Sanitize: Remove HTML tags
      playerAnswer = playerAnswer.replace(/<[^>]*>?/gm, '');

      // Validate length: Truncate if too long (empty answers are allowed)
      if (playerAnswer.length > 100) {
        playerAnswer = playerAnswer.substring(0, 100);
        console.log(`Antwort von ${socket.id} gekürzt auf 100 Zeichen.`);
      }
    
      console.log(`Verarbeitete Antwort von ${socket.id}: ${playerAnswer}`);
      currentAnswers[socket.id] = playerAnswer; // Store sanitized and possibly truncated answer
    } catch (err) {
      console.error('Error in event sendAnswer:', err);
      socket.emit('serverErrorMessage', 'An unexpected error occurred while sending your answer.');
    }
  });

  // Host löst die Auswertung der Antworten aus
  socket.on('evaluateAnswers', async () => {
    try {
      if (!currentQuestion) {
        console.log("Keine aktive Frage für Auswertung!");
        socket.emit('errorMessage', "No active question to evaluate."); // Inform host
        return;
      }
      // Ensure currentQuestion.answer exists before trying to access it
      if (typeof currentQuestion.answer !== 'string') {
        console.error("Error in evaluateAnswers: currentQuestion.answer is not a string or undefined.");
        socket.emit('serverErrorMessage', "Error evaluating answers due to question data problem.");
        // Potentially reset currentQuestion here or handle error more gracefully
        currentQuestion = null; // Avoid re-processing a bad question
        return;
      }

      const correctAnswer = currentQuestion.answer.trim().toLowerCase();
      let winnerId = null;
      let bestDiff = Infinity;
      let correctNum = Number(correctAnswer);
      let isNumeric = !isNaN(correctNum);

      if (isNumeric) {
        for (const id in currentAnswers) {
          if (!players[id]) { 
            console.warn(`Player ${id} who answered is no longer in the game during numeric check. Skipping their answer.`);
            continue;
          }
          let playerAns = Number(currentAnswers[id]);
          if (isNaN(playerAns)) continue; 
          let diff = Math.abs(playerAns - correctNum);
          if (diff < bestDiff) {
            bestDiff = diff;
            winnerId = id;
          } else if (diff === bestDiff) {
            // Tie-breaking logic for numeric answers can be complex.
            // For now, the first player to achieve the bestDiff wins.
            // Or, set winnerId to null or an array of tied IDs.
            console.log(`Numeric answer tie: ${id} and ${winnerId} both have diff ${diff}. Current winner: ${winnerId}`);
          }
        }
      } else {
        for (const id in currentAnswers) {
          if (!players[id]) { 
            console.warn(`Player ${id} who answered is no longer in the game during string check. Skipping their answer.`);
            continue;
          }
          if (typeof currentAnswers[id] === 'string' && currentAnswers[id].trim().toLowerCase() === correctAnswer) {
            winnerId = id;
            break; 
          }
        }
      }
    
      let pot = 0;
      for (const id in currentBets) {
        // It's possible a player bet and then disconnected. Their bet remains in the pot.
        if (!players[id]) { 
             console.warn(`Player ${id} who bet is no longer in the game. Their bet ${currentBets[id]} is still in the pot.`);
        }
        pot += currentBets[id];
      }
    
      if (winnerId && players[winnerId]) { 
        players[winnerId].balance += pot;
        io.emit('evaluationResult', { 
          winner: players[winnerId].name, 
          pot: pot, 
          players: players 
        });
      } else if (winnerId && !players[winnerId]) {
        console.error(`Error in evaluateAnswers: Designated winner ${winnerId} not found in players. Pot of ${pot} is not distributed.`);
        io.emit('evaluationResult', { 
          message: `Error: Winning player ${winnerId} no longer in game. Pot of ${pot} not distributed.`, 
          players: players 
        });
      } else {
        io.emit('evaluationResult', { 
          message: "Kein Gewinner ermittelt (keine passende Antwort oder Tie)", 
          players: players 
        });
      }
    
      if (currentQuestion && currentQuestion._id) { // currentQuestion might have been nulled if answer was bad
        usedQuestionIds.push(currentQuestion._id);
        console.log(`Question ${currentQuestion._id} added to used list.`);
      }
      currentQuestion = null; 
      currentBets = {};
      currentAnswers = {};
    } catch (err) {
      console.error('Error in event evaluateAnswers:', err);
      socket.emit('serverErrorMessage', 'An unexpected error occurred during answer evaluation.');
    }
  });

  // Host kann einen zusätzlichen Hinweis anzeigen
  socket.on('revealHint', () => {
    try {
      // Ensure currentQuestion and its hints are valid
      if (currentQuestion && currentQuestion.hints && Array.isArray(currentQuestion.hints) && currentQuestion.hints.length > 1) {
        // This logic assumes hint[0] is initial, hint[1] is the next.
        // A more robust system might track which hints have been revealed.
        // For now, sending hint at index 1 if available.
        io.emit('newHint', currentQuestion.hints[1]);
      } else {
        socket.emit('errorMessage', "Kein weiterer Hinweis verfügbar oder keine aktive Frage.");
      }
    } catch (err) {
      console.error('Error in event revealHint:', err);
      socket.emit('serverErrorMessage', 'An unexpected error occurred while revealing a hint.');
    }
  });

  socket.on('disconnect', () => {
    try {
      console.log(`Socket ${socket.id} disconnected.`);

      if (socket.id === hostSocketId) {
        // Host disconnected
        console.log(`Host (${socket.id}) has disconnected.`);
        hostSocketId = null; // Allow a new host to join
        
        io.emit('systemMessage', 'The host has disconnected. The game is currently paused. A new host can join to resume or restart.');
        
        // Reset game state
        currentQuestion = null;
        currentAnswers = {};
        currentBets = {};
        // usedQuestionIds = []; // Optional: reset if new host means entirely new game session
        // dealerIndex = 0; // Optional: reset if new host means new dealer cycle
        
        console.log("Game state reset due to host disconnection.");
        io.emit('gameStateReset'); // Inform clients to reset their UI

        // Host is not in players or playerOrder, so no need to remove from there or update player lists.

      } else if (players[socket.id]) {
        // Player disconnected
        const playerName = players[socket.id].name;
        console.log(`Player ${playerName} (${socket.id}) has disconnected.`);
        
        delete players[socket.id];
        const initialPlayerOrderLength = playerOrder.length;
        playerOrder = playerOrder.filter(id => id !== socket.id);

        // Bets of the disconnected player (currentBets[socket.id]) remain in the pot.
        // Answers of the disconnected player (currentAnswers[socket.id]) might still be evaluated if sent before disconnect.

        console.log(`Player ${playerName} removed from players object and playerOrder.`);
        io.emit('playerList', players);
        io.emit('playerOrder', playerOrder.map(id => (players[id] ? players[id].name : "Unbekannt")));

        // If a game was active and player count drops below minimum
        if (currentQuestion && playerOrder.length < 3 && initialPlayerOrderLength >= 3) {
          console.log(`Game paused due to insufficient players after ${playerName} disconnected.`);
          io.emit('systemMessage', `Player ${playerName} has left. The game is paused due to insufficient players (need at least 3).`);
          // Optionally, explicitly end the current round if desired:
          // currentQuestion = null;
          // currentBets = {}; // Or keep bets for a potential pot carry-over if game can resume.
          // currentAnswers = {};
          // io.emit('roundCancelled', { message: `Round paused: ${playerName} left, not enough players.` });
        } else if (currentQuestion && playerOrder.length >= 3 && initialPlayerOrderLength > playerOrder.length) {
            // Game continues, just notify who left
            io.emit('systemMessage', `Player ${playerName} has left the game.`);
        }

      } else {
        // Disconnected socket was neither the host nor a registered player
        console.log(`Socket ${socket.id} (not a registered player or host) disconnected.`);
      }
    } catch (err) {
      console.error('Error in event disconnect:', err);
      // Cannot emit to the disconnected socket. This error is server-side.
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
