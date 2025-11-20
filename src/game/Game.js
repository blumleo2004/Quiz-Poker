const { logGameEvent, logError } = require('../utils/logger');
const Question = require('../models/Question');
const GameSession = require('../models/GameSession'); // Import GameSession model

const GameState = {
  WAITING: 'WAITING',
  ANSWERING: 'ANSWERING',
  BETTING_ROUND_1: 'BETTING_ROUND_1',
  HINT_1: 'HINT_1',
  BETTING_ROUND_2: 'BETTING_ROUND_2',
  HINT_2: 'HINT_2',
  BETTING_ROUND_3: 'BETTING_ROUND_3',
  ANSWER_REVEAL: 'ANSWER_REVEAL',
  BETTING_ROUND_4: 'BETTING_ROUND_4',
  SHOWDOWN: 'SHOWDOWN'
};

class Game {
  constructor(io) {
    this.io = io; // Socket.IO Instanz für Broadcasting
    this.gameId = 'default_quiz_poker_game'; // Static ID for now, could be dynamic
    this.players = {}; // socket.id -> playerObject
    this.playerOrder = []; // Array von socket.ids in Spielreihenfolge
    this.hostSocketId = null;
    this.state = GameState.WAITING;
    this.currentQuestion = null;
    this.pot = 0;
    this.currentBet = 0; // Höchster Einsatz in der aktuellen Runde
    this.hints = [];
    this.revealedHints = []; // Track which hints have been revealed
    this.activePlayerSocketId = null; // Der Spieler, der gerade am Zug ist
    this.lastRaise = 0; // Höhe der letzten Erhöhung
    this.bettingRound = 0; // 1, 2 oder 3
    this.minimumRaise = 20; // Mindesterhöhung
    this.correctAnswer = null;
    this.playerWhoMadeLastBetOrRaise = null;
    this.playerWhoInitiatedCurrentBettingAction = null;
    // Properties that were in the snapshot but not in constructor - adding them if they are essential
    this.roundNumber = 0;
    this.smallBlind = 10; // Example default
    this.bigBlind = 20;   // Example default
    this.dealerPosition = 0; // Index in playerOrder
    this.actionHistory = [];
    this.gameLog = [];
    this.playerScores = {}; // socket.id -> score
    this.blindsEnabled = true; // Default to true (Tournament Mode active)

    this._loadGameFromDB().catch(err => logError(err, { context: 'Game Constructor - _loadGameFromDB' }));
  }

  async _saveGameToDB() {
    try {
      // Create a plain object for players to avoid circular references
      const plainPlayers = {};
      for (const socketId in this.players) {
        // Ensure we are saving a plain version of the player object
        const player = this.players[socketId];
        plainPlayers[socketId] = {
          name: player.name,
          role: player.role,
          balance: player.balance,
          finalAnswer: player.finalAnswer,
          currentBetInRound: player.currentBetInRound,
          isActive: player.isActive,
          hasFolded: player.hasFolded,
          socketId: player.socketId, // Ensure socketId is saved
          // Add any other serializable player properties here
        };
      }

      const gameStateToSave = {
        gameId: this.gameId,
        players: plainPlayers, // Use the plainPlayers object
        playerOrder: this.playerOrder,
        hostSocketId: this.hostSocketId,
        state: this.state,
        currentQuestionId: this.currentQuestion ? this.currentQuestion._id : null,
        correctAnswer: this.correctAnswer,
        hints: this.hints,
        revealedHints: this.revealedHints || [],
        pot: this.pot,
        currentBet: this.currentBet,
        bettingRound: this.bettingRound,
        activePlayerSocketId: this.activePlayerSocketId,
        lastRaise: this.lastRaise,
        minimumRaise: this.minimumRaise,
        playerWhoMadeLastBetOrRaise: this.playerWhoMadeLastBetOrRaise,
        playerWhoInitiatedCurrentBettingAction: this.playerWhoInitiatedCurrentBettingAction,
        roundNumber: this.roundNumber,
        smallBlind: this.smallBlind,
        bigBlind: this.bigBlind,
        dealerPosition: this.dealerPosition,
        playerScores: this.playerScores,
        lastUpdatedAt: new Date()
      };
      await GameSession.findOneAndUpdate({ gameId: this.gameId }, gameStateToSave, { upsert: true, new: true, runValidators: true });
      logGameEvent('GAME_STATE_SAVED', { gameId: this.gameId });
    } catch (error) {
      logError(error, { context: 'Game._saveGameToDB', gameId: this.gameId });
    }
  }

  async _loadGameFromDB() {
    try {
      const savedGame = await GameSession.findOne({ gameId: this.gameId });
      if (savedGame) {
        // Convert saved players (likely plain objects from DB) back into this.players
        this.players = {}; // Reset players object
        if (savedGame.players && typeof savedGame.players === 'object') {
            for (const socketId in savedGame.players) {
                // Skip Mongoose internal properties that start with $
                if (socketId.startsWith('$')) continue;
                
                // Ensure the loaded player object is a plain JS object
                // and not a Mongoose document/subdocument by explicitly copying properties.
                const dbPlayer = savedGame.players[socketId];
                // Skip if dbPlayer is not a valid object or doesn't have required properties
                if (!dbPlayer || typeof dbPlayer !== 'object' || !dbPlayer.name) continue;
                
                this.players[socketId] = {
                    name: dbPlayer.name,
                    role: dbPlayer.role,
                    balance: dbPlayer.balance || 1000,
                    finalAnswer: dbPlayer.finalAnswer,
                    currentBetInRound: dbPlayer.currentBetInRound || 0,
                    isActive: false, // Set to false initially, will be true on reconnect
                    hasFolded: dbPlayer.hasFolded || false,
                    isAllIn: dbPlayer.isAllIn || false,
                    socketId: dbPlayer.socketId || socketId, // Ensure socketId is present
                    // Copy other necessary properties
                };
            }
        }

        this.playerOrder = savedGame.playerOrder || [];
        this.hostSocketId = savedGame.hostSocketId;
        this.state = savedGame.state || GameState.WAITING;
        if (savedGame.currentQuestionId) {
            this.currentQuestion = await Question.findById(savedGame.currentQuestionId);
        } else {
            this.currentQuestion = null;
        }
        this.correctAnswer = savedGame.correctAnswer;
        this.hints = savedGame.hints || [];
        this.revealedHints = savedGame.revealedHints || [];
        this.pot = savedGame.pot || 0;
        this.currentBet = savedGame.currentBet || 0;
        this.bettingRound = savedGame.bettingRound || 0;
        this.activePlayerSocketId = savedGame.activePlayerSocketId;
        this.lastRaise = savedGame.lastRaise || 0;
        this.minimumRaise = savedGame.minimumRaise || 20;
        this.playerWhoMadeLastBetOrRaise = savedGame.playerWhoMadeLastBetOrRaise;
        this.playerWhoInitiatedCurrentBettingAction = savedGame.playerWhoInitiatedCurrentBettingAction;
        
        this.roundNumber = savedGame.roundNumber || 0;
        this.smallBlind = savedGame.smallBlind || 10;
        this.bigBlind = savedGame.bigBlind || 20;
        this.dealerPosition = savedGame.dealerPosition || 0;
        this.playerScores = savedGame.playerScores || {};


        logGameEvent('GAME_STATE_LOADED', { gameId: this.gameId, state: this.state });
      } else {
        logGameEvent('NO_SAVED_GAME_FOUND', { gameId: this.gameId });
        await this._saveGameToDB(); 
      }
    } catch (error) {
      logError(error, { context: 'Game._loadGameFromDB', gameId: this.gameId });
      this.resetGameToDefaults(); // Reset to a known good state
      await this._saveGameToDB(); 
    }
  }

  resetGameToDefaults() {
    // Method to reset the game to a clean, default state
    this.players = {};
    this.playerOrder = [];
    this.hostSocketId = null;
    this.state = GameState.WAITING;
    this.currentQuestion = null;
    this.pot = 0;
    this.currentBet = 0;
    this.hints = [];
    this.revealedHints = []; // Reset revealed hints
    this.activePlayerSocketId = null;
    this.lastRaise = 0;
    this.bettingRound = 0;
    this.minimumRaise = 20;
    this.correctAnswer = null;
    this.playerWhoMadeLastBetOrRaise = null;
    this.playerWhoInitiatedCurrentBettingAction = null;
    this.roundNumber = 0;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.dealerPosition = 0;
    this.actionHistory = [];
    this.gameLog = [];
    this.playerScores = {};
    logGameEvent('GAME_RESET_TO_DEFAULTS', { gameId: this.gameId });
  }

  async resetGame(actorSocketId) {
    if (actorSocketId !== this.hostSocketId) {
        this.io.to(actorSocketId).emit('errorMessage', "Nur der Host kann das Spiel zurücksetzen.");
        return false;
    }

    this.resetGameToDefaults();
    // Keep the host
    this.hostSocketId = actorSocketId;
    // Re-add host to players if needed, or just ensure host state is clean
    this.players[actorSocketId] = {
        name: 'Host', // Or keep previous name if stored
        role: 'host',
        socketId: actorSocketId
    };

    logGameEvent('GAME_RESET_BY_HOST', { hostSocketId: actorSocketId });
    
    // Notify all clients to reset their state
    this.io.emit('gameReset', { message: 'Das Spiel wurde vom Host zurückgesetzt.' });
    
    await this._saveGameToDB();
    return true;
  }

  async reconnectPlayer(oldSocketId, newSocketId) {
    const player = this.players[oldSocketId];
    if (player) {
        // Update player object
        this.players[newSocketId] = {
            ...player,
            socketId: newSocketId,
            isActive: true
        };
        delete this.players[oldSocketId];

        // Update order
        const orderIndex = this.playerOrder.indexOf(oldSocketId);
        if (orderIndex !== -1) {
            this.playerOrder[orderIndex] = newSocketId;
        }
        
        // Update host if needed
        if (this.hostSocketId === oldSocketId || player.role === 'host') {
            this.hostSocketId = newSocketId;
        }
        
        // Update active player if needed
        if (this.activePlayerSocketId === oldSocketId) {
            this.activePlayerSocketId = newSocketId;
        }

        logGameEvent('PLAYER_RECONNECTED_VIA_TOKEN', { oldSocketId, newSocketId, name: player.name });
        await this._saveGameToDB();
        return this.players[newSocketId];
    }
    return null;
  }

  // Wrap methods that change critical game state with _saveGameToDB()
  async addPlayer(socketId, name, role, avatarSeed) {
    if (this.players[socketId]) {
      logError(new Error(`Player with socketId ${socketId} already exists.`));
      return this.players[socketId]; // Spieler existiert bereits
    }

    if (role === 'host') {
      if (this.hostSocketId) {
        logError(new Error('Host already exists. Replacing host.'));
        // Ggf. alten Host entfernen oder Fehler werfen
      }
      this.hostSocketId = socketId;
      this.players[socketId] = {
        name: name,
        role: role,
        socketId: socketId,
        avatarSeed: avatarSeed || name, // Use name as fallback seed
        // Host-spezifische Eigenschaften
      };
      logGameEvent('HOST_JOINED', { socketId, name });
      await this._saveGameToDB();
      return this.players[socketId];
    }

    // Logik für wiederkehrende Spieler (basierend auf Name, später auf echter Auth)
    const existingPlayerByName = Object.values(this.players).find(p => p.name === name && p.role === 'player');
    if (existingPlayerByName) {
      const oldSocketId = existingPlayerByName.socketId;
      this.players[socketId] = {
        ...existingPlayerByName, // Übernehme alte Daten
        socketId: socketId,     // Aktualisiere Socket-ID
        isActive: true,         // Setze wieder aktiv
        avatarSeed: avatarSeed || existingPlayerByName.avatarSeed || name // Update avatar if provided
      };
      delete this.players[oldSocketId];

      const orderIndex = this.playerOrder.indexOf(oldSocketId);
      if (orderIndex !== -1) {
        this.playerOrder[orderIndex] = socketId;
      }
      logGameEvent('PLAYER_RECONNECTED', { newSocketId: socketId, oldSocketId, name });
      await this._saveGameToDB();
      return this.players[socketId];
    }
    
    // Neuer Spieler
    this.players[socketId] = {
      name: name,
      role: role,
      balance: 1000, // Standard-Kontostand
      finalAnswer: null,
      currentBetInRound: 0, // Einsatz des Spielers in der aktuellen Wettrunde
      isActive: true,
      hasFolded: false,
      socketId: socketId,
      avatarSeed: avatarSeed || name // Store avatar seed
    };
    if (role === 'player') {
      this.playerOrder.push(socketId);
    }
    logGameEvent('PLAYER_JOINED_GAME', { socketId, name, role });
    await this._saveGameToDB();
    return this.players[socketId];
  }

  async removePlayer(socketId) {
    const player = this.players[socketId];
    if (player) {
      logGameEvent('PLAYER_LEFT_GAME', { socketId, name: player.name, role: player.role });
      const wasActivePlayer = socketId === this.activePlayerSocketId;

      if (player.role === 'player') {
        player.isActive = false; // Mark as inactive
        // player.hasFolded = true; // Optionally, treat disconnect as a fold

        // If the game is in a betting round and the disconnected player was active
        if (this.state.startsWith('BETTING_ROUND_') && wasActivePlayer) {
          logGameEvent('ACTIVE_PLAYER_DISCONNECTED', { name: player.name, socketId });
          this.io.emit('playerAction', {
            player: player.name,
            action: 'disconnect_fold', // Custom action type for client UI
            message: `${player.name} disconnected and is considered folded.`,
            gameState: this.getGameStateSnapshot()
          });
          this.moveToNextPlayer(); // Move to the next player
        } else if (this.state === GameState.ANSWERING) {
          // If player disconnects during answer phase, check if all remaining active players have answered
          const allOthersAnswered = this.getActivePlayers().every(p => p.finalAnswer !== null || p.socketId === socketId);
          if (allOthersAnswered && this.getActivePlayers().filter(p => p.socketId !== socketId).length > 0) {
            logGameEvent('PLAYER_DISCONNECTED_DURING_ANSWERING_TRIGGERS_BETTING', { name: player.name });
            this.startNewBettingRound(1);
          } else if (this.getActivePlayers().filter(p => p.socketId !== socketId).length < 1 && this.state !== GameState.WAITING) {
            // Not enough players to continue if this one leaves
            logGameEvent('NOT_ENOUGH_PLAYERS_AFTER_DISCONNECT', { name: player.name });
            this.io.emit('gameOver', { message: "Not enough players to continue after a disconnect.", gameState: this.getGameStateSnapshot() });
            this.resetForNextRound(); // Or a more complete game end
          }
        }
      } else if (player.role === 'host' && this.hostSocketId === socketId) {
        logGameEvent('HOST_DISCONNECTED', { name: player.name, socketId });
        this.hostSocketId = null;
        // Optionally, assign a new host or pause/end the game
        this.io.emit('hostDisconnected', { message: 'The host has disconnected. The game may be paused.', newHost: null });
        // Consider if game should auto-pause or if a player can become host
        if (this.state !== GameState.WAITING) {
            // this.state = GameState.WAITING; // Or a PAUSED state
            // this.io.emit('gameStateUpdate', this.getGameStateSnapshot());
            logGameEvent('GAME_PAUSED_DUE_TO_HOST_DISCONNECT', {});
            // For now, we don't automatically end the game, but this is a good place for such logic.
        }
      }
      // Don't delete player object immediately to allow for reconnection, mark inactive instead.
      // delete this.players[socketId];
      // this.playerOrder = this.playerOrder.filter(id => id !== socketId); // Only if not supporting reconnection for order
      
      this.broadcastPlayerList(); // Update all clients about the change in player status
      this.io.emit('gameStateUpdate', this.getGameStateSnapshot()); // Also send full game state
      await this._saveGameToDB();
    }
  }

  getPlayer(socketId) {
    return this.players[socketId];
  }

  getAllPlayers() {
    return this.players;
  }
  
  getActivePlayers() {
    return Object.values(this.players).filter(p => p.role === 'player' && p.isActive && !p.hasFolded);
  }

  getPlayerOrderNames() {
    return this.playerOrder.map(id => this.players[id]?.name || "Unbekannt");
  }
  
  broadcastPlayerList() {
    this.io.emit('playerList', { // Oder spezifischeres Event
        players: this.getAllPlayers(), // Sende alle Spielerinfos
        playerOrder: this.getPlayerOrderNames()
    });
  }

  async setHost(socketId, name) {
    if (this.hostSocketId && this.hostSocketId !== socketId) {
      logGameEvent('HOST_REPLACED', { oldHostId: this.hostSocketId, newHostId: socketId, name });
      // Potentially notify the old host or handle disconnection
    }
    this.hostSocketId = socketId;
    // Add host to players list for consistency, or handle separately
    this.players[socketId] = {
      name: name,
      role: 'host',
      socketId: socketId,
    };
    logGameEvent('HOST_SET', { socketId, name });
    await this._saveGameToDB();
  }

  getPlayersState() {
    // Returns a simplified list of players, e.g., for a lobby display
    // or when only player names and roles are needed.
    const playerStates = {};
    for (const id in this.players) {
      playerStates[id] = {
        name: this.players[id].name,
        role: this.players[id].role,
        isActive: this.players[id].isActive,
        // Add other relevant non-sensitive info if needed
      };
    }
    return {
        players: playerStates,
        playerOrder: this.getPlayerOrderNames(),
        hostSocketId: this.hostSocketId
    };
  }

  async startGame(starterSocketId) {
    if (starterSocketId !== this.hostSocketId) {
      // Send error message to the specific socket that tried to start
      this.io.to(starterSocketId).emit('errorMessage', "Nur der Host kann das Spiel starten!");
      logError(new Error('Non-host tried to start game'), { context: 'startGame', starterSocketId });
      return false; // Indicate failure
    }
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length < 1) { // Mindestens 1 Spieler für Tests (sonst 2)
      this.io.to(starterSocketId).emit('errorMessage', "Es müssen mindestens 1 Spieler aktiv sein, um das Spiel zu starten!");
      logError(new Error('Not enough players to start game'), { context: 'startGame', activePlayerCount: activePlayers.length });
      return false; // Indicate failure
    }

    let question;
    try {
      // Try to find a question that is different from the current one
      const filter = this.currentQuestion ? { _id: { $ne: this.currentQuestion._id } } : {};
      question = await Question.findRandomQuestion(filter);
      
      // Fallback if no other question found (e.g. only 1 question in DB)
      if (!question) {
         question = await Question.findRandomQuestion();
      }
    } catch (dbError) {
      logError(dbError, { context: 'startGame - findRandomQuestion' });
      this.io.to(starterSocketId).emit('errorMessage', "Fehler beim Laden der Frage aus der Datenbank.");
      return false;
    }

    if (!question) {
      this.io.to(starterSocketId).emit('errorMessage', "Keine Fragen verfügbar!");
      logError(new Error('No questions available in DB'), { context: 'startGame' });
      return false; // Indicate failure
    }

    this.currentQuestion = question;
    this.correctAnswer = question.answer;
    this.hints = question.hints ? [...question.hints] : []; // Create a copy of hints array
    this.revealedHints = []; // Reset revealed hints
    this.pot = 0;
    this.currentBet = 0;
    this.bettingRound = 0;
    this.activePlayerSocketId = null; // Wird in startNewBettingRound gesetzt
    this.state = GameState.ANSWERING;

    Object.values(this.players).forEach(player => {
      if (player.role === 'player') {
        player.finalAnswer = null;
        player.isAnswerRevealed = false; // Reset revealed status
        player.currentBetInRound = 0;
        player.hasFolded = false;
        player.isActive = true; // Sicherstellen, dass alle teilnehmenden Spieler zu Beginn aktiv sind
      }
    });
    
    logGameEvent('GAME_STARTED_IN_GAME_CLASS', { 
        questionId: question._id, 
        question: question.question,
        playerCount: activePlayers.length 
    });
    
    this.io.emit('gameStarted', {
        question: this.currentQuestion.question,
        gameState: this.getGameStateSnapshot(), // Sende einen Snapshot des Spielzustands
        phase: 'ANSWERING'
    });
    await this._saveGameToDB();
    return true; // Indicate success
  }

  async submitAnswer(socketId, answer) {
    const player = this.getPlayer(socketId);
    if (!player || player.role !== 'player') {
      this.io.to(socketId).emit('errorMessage', 'Ungültiger Spieler für Antwortabgabe.');
      logError(new Error('Invalid player for submitAnswer'), { context: 'submitAnswer', socketId });
      return false;
    }
    if (this.state !== GameState.ANSWERING) {
      this.io.to(socketId).emit('errorMessage', 'Aktuell können keine Antworten abgegeben werden!');
      logError(new Error('Cannot submit answer in current game state'), { context: 'submitAnswer', socketId, currentState: this.state });
      return false;
    }
    // TODO: Antwortvalidierung hier einfügen (Schritt 3)
    player.finalAnswer = answer;
    player.isAnswerRevealed = false; // Ensure it starts hidden
    logGameEvent('PLAYER_SUBMITTED_ANSWER', { socketId, name: player.name, answer });

    // Notify everyone that a player has submitted an answer
    this.io.emit('playerAnswered', { playerId: socketId });

    if (this.hostSocketId) {
        this.io.to(this.hostSocketId).emit('answerSubmitted', {
            player: player.name,
            answer: answer
        });
    }

    const allPlayersAnswered = this.getActivePlayers().every(p => p.finalAnswer !== null);
    if (allPlayersAnswered) {
      logGameEvent('ALL_PLAYERS_ANSWERED', {});
      await this.startNewBettingRound(1); // Starte die erste Wettrunde (now async)
    } else {
      await this._saveGameToDB(); // Save if round not changing yet
    }
    return true;
  }
  
  async startNewBettingRound(roundNumber) {
    roundNumber = parseInt(roundNumber, 10); // Ensure it's a number
    if (isNaN(roundNumber)) {
        logError(new Error(`Invalid roundNumber passed to startNewBettingRound: ${roundNumber}`), { context: 'startNewBettingRound' });
        return;
    }
    this.state = GameState[`BETTING_ROUND_${roundNumber}`];
    this.bettingRound = roundNumber;
    this.currentBet = 0; // Der höchste Einsatz in DIESER Runde wird zurückgesetzt
    
    // Calculate Minimum Bet based on Round Number (Tournament Mode)
    // Increases every 3 rounds
    const baseMinBet = 20;
    
    if (this.blindsEnabled) {
        const increaseInterval = 3;
        // roundNumber is the game round (question number), but here 'roundNumber' arg is betting round (1-4).
        // We need this.roundNumber (the question count).
        // Ensure this.roundNumber is at least 1
        const currentQuestionRound = Math.max(1, this.roundNumber);
        const multiplier = Math.pow(2, Math.floor((currentQuestionRound - 1) / increaseInterval));
        this.minimumRaise = baseMinBet * multiplier;
    } else {
        this.minimumRaise = baseMinBet;
    }
    
    this.getActivePlayers().forEach(p => p.currentBetInRound = 0); // Einsätze pro Runde zurücksetzen

    // Finde den ersten aktiven Spieler für die Runde
    // Dies könnte z.B. der Spieler links vom Dealer sein
    let firstPlayerId = null;
    if (this.playerOrder.length > 0) {
        // Einfache Logik: erster Spieler in der Order, der aktiv ist
        for (const playerId of this.playerOrder) {
            const p = this.players[playerId];
            if (p && p.isActive && !p.hasFolded && p.role === 'player') {
                firstPlayerId = playerId;
                break;
            }
        }
    }

    if (firstPlayerId) {
      this.activePlayerSocketId = firstPlayerId;
      logGameEvent('BETTING_ROUND_STARTED_IN_GAME', { round: this.bettingRound, activePlayer: this.players[this.activePlayerSocketId].name });
      this.io.emit('bettingRoundStarted', {
        round: this.bettingRound,
        activePlayer: this.players[this.activePlayerSocketId].name,
        minimumBet: this.minimumRaise, // Oder currentBet, je nach Regel
        gameState: this.getGameStateSnapshot()
      });
      await this._saveGameToDB();
    } else {
      logError(new Error('Keine aktiven Spieler für Betting-Runde gefunden.'), { context: 'startNewBettingRound' });
      await this.completeBettingRound(); // now async
    }
  }

  async handlePlayerAction(socketId, action, data) {
    const player = this.getPlayer(socketId);
    // Basic validation for player state, already done before calling specific handlers
    if (!player || player.socketId !== this.activePlayerSocketId) {
      this.io.to(socketId).emit('errorMessage', 'Nicht am Zug oder Spieler nicht gefunden.');
      logError(new Error('Player action out of turn or player not found'), { context: 'handlePlayerAction', socketId, action, activePlayerSocketId: this.activePlayerSocketId });
      return false;
    }
    if (player.hasFolded) {
      this.io.to(socketId).emit('errorMessage', 'Spieler hat bereits gepasst.');
      logError(new Error('Player action attempted after folding'), { context: 'handlePlayerAction', socketId, action });
      return false;
    }
    if (player.isAllIn && action !== 'show') { // All-in players can't take further betting actions
        this.io.to(socketId).emit('errorMessage', 'Spieler ist All-In und kann keine weiteren Aktionen außer Showdown durchführen.');
        logError(new Error('Player action attempted while all-in'), { context: 'handlePlayerAction', socketId, action });
        return false;
    }

    let success = false;
    let requiresSave = true; // Most actions will require a save
    try {
      switch (action) {
        case 'fold':
          success = await this.handleFold(socketId); // now async
          break;
        case 'call': 
          success = await this.handleCall(socketId); // now async
          break;
        case 'raise':
          // The amount validation is now expected to happen in server.js
          // However, a check for data.amount existence is good.
          if (typeof data.amount !== 'number') {
            this.io.to(socketId).emit('errorMessage', 'Ungültiger oder fehlender Erhöhungsbetrag.');
            logError(new Error('Invalid or missing raise amount in handlePlayerAction'), { context: 'handlePlayerAction - raise', socketId, data });
            return false;
          }
          success = await this.handleRaise(socketId, data.amount); // now async
          break;
        default:
          this.io.to(socketId).emit('errorMessage', 'Unbekannte Aktion.');
          logError(new Error('Unknown player action'), { context: 'handlePlayerAction', socketId, action });
          requiresSave = false;
          return false;
      }
    } catch (error) {
      this.io.to(socketId).emit('errorMessage', error.message);
      logError(error, { context: `handlePlayerAction - ${action}`, socketId, data });
      requiresSave = false;
      return false;
    }
    // No explicit save here, sub-methods will call it if they complete successfully
    // OR, if sub-methods don't call moveToNextPlayer which saves, save here.
    // For now, assuming sub-methods + moveToNextPlayer handle saves.
    return success; 
  }

  async handleFold(socketId) {
    const player = this.getPlayer(socketId); // Already validated in handlePlayerAction
    player.hasFolded = true;
    logGameEvent('PLAYER_FOLDED_IN_GAME', { socketId, name: player.name });
    this.io.emit('playerAction', {
      player: player.name,
      action: 'fold',
      gameState: this.getGameStateSnapshot()
    });
    await this.moveToNextPlayer(); // now async
    return true;
  }

  async handleCall(socketId) {
    const player = this.getPlayer(socketId); // Already validated
    const amountToCall = this.currentBet - player.currentBetInRound;

    if (amountToCall > player.balance) {
      // All-In Logik - Spieler setzt alles, was er hat
      const allInAmount = player.balance;
      this.pot += allInAmount;
      player.currentBetInRound += allInAmount;
      player.balance = 0;
      player.isAllIn = true; // Mark as all-in
      logGameEvent('PLAYER_CALLED_ALL_IN_IN_GAME', { socketId, name: player.name, amount: allInAmount });
      this.io.emit('playerAction', {
        player: player.name,
        action: 'call_all_in',
        amount: allInAmount,
        playerBetInRound: player.currentBetInRound,
        pot: this.pot,
        gameState: this.getGameStateSnapshot()
      });
    } else if (amountToCall > 0) {
        player.balance -= amountToCall;
        this.pot += amountToCall;
        player.currentBetInRound += amountToCall;
        logGameEvent('PLAYER_CALLED_IN_GAME', { socketId, name: player.name, amount: amountToCall });
        this.io.emit('playerAction', {
          player: player.name,
          action: 'call',
          amount: amountToCall,
          playerBetInRound: player.currentBetInRound,
          pot: this.pot,
          gameState: this.getGameStateSnapshot()
        });
    } else { // amountToCall is 0, effectively a check
        logGameEvent('PLAYER_CHECKED_IN_GAME', { socketId, name: player.name });
        this.io.emit('playerAction', {
            player: player.name,
            action: 'check',
            playerBetInRound: player.currentBetInRound,
            pot: this.pot,
            gameState: this.getGameStateSnapshot()
        });
    }
    await this.moveToNextPlayer(); // now async
    return true;
  }

  async handleRaise(socketId, raiseAmount) {
    const player = this.getPlayer(socketId); // Already validated

    const amountToCall = this.currentBet - player.currentBetInRound;
    const totalBetByPlayer = amountToCall + raiseAmount; // This is the additional amount player puts in pot

    if (totalBetByPlayer > player.balance) {
      this.io.to(socketId).emit('errorMessage', 'Nicht genug Guthaben zum Erhöhen.');
      logError(new Error('Insufficient balance for raise'), { context: 'handleRaise', socketId, raiseAmount, balance: player.balance });
      return false;
    }

    // Die tatsächliche Erhöhung über den aktuellen höchsten Einsatz
    const actualRaiseOverCurrentMaxBet = (player.currentBetInRound + totalBetByPlayer) - this.currentBet;

    if (actualRaiseOverCurrentMaxBet < this.minimumRaise && this.currentBet > 0) {
        this.io.to(socketId).emit('errorMessage', `Erhöhung muss mindestens ${this.minimumRaise} betragen oder der erste Einsatz sein.`);
        logError(new Error('Raise too small'), { context: 'handleRaise', socketId, raiseAmount, minimumRaise: this.minimumRaise, currentBet: this.currentBet });
        return false;
    }

    player.balance -= totalBetByPlayer;
    this.pot += totalBetByPlayer;
    player.currentBetInRound += totalBetByPlayer;
    
    this.lastRaise = actualRaiseOverCurrentMaxBet > 0 ? actualRaiseOverCurrentMaxBet : raiseAmount; // Track the size of the raise itself
    this.currentBet = player.currentBetInRound; // Das neue Höchstgebot in der Runde
    this.playerWhoMadeLastBetOrRaise = socketId; // Track who made the last significant action

    logGameEvent('PLAYER_RAISED_IN_GAME', { socketId, name: player.name, raisedBy: raiseAmount, newTotalBetInRound: player.currentBetInRound, newPot: this.pot });
    this.io.emit('playerAction', {
      player: player.name,
      action: 'raise',
      raisedBy: raiseAmount, // Der Betrag, um den erhöht wurde (über den Call-Betrag hinaus)
      playerBetInRound: player.currentBetInRound,
      currentMaxBet: this.currentBet,
      pot: this.pot,
      gameState: this.getGameStateSnapshot()
    });
    await this.moveToNextPlayer(); // now async
    return true;
  }
  
  async moveToNextPlayer() {
    const activePlayersInGame = this.getActivePlayers().filter(p => !p.isAllIn && p.balance > 0); // Players who can still make decisions
    const allInPlayersCount = this.getActivePlayers().filter(p => p.isAllIn).length;
    const nonFoldedPlayersCount = this.getActivePlayers().length; // Includes active all-ins

    if (nonFoldedPlayersCount <= 1 && this.bettingRound > 0) {
      this.completeBettingRound();
      return;
    }
    // If all players who can act are all-in, or only one player can act, proceed to showdown/next phase.
    if (activePlayersInGame.length === 0 && nonFoldedPlayersCount > 1 && this.bettingRound > 0) {
        logGameEvent('ALL_REMAINING_PLAYERS_ALL_IN_OR_ONLY_ONE_CAN_ACT', { context: 'moveToNextPlayer' });
        this.completeBettingRound();
        return;
    }
    if (activePlayersInGame.length === 1 && nonFoldedPlayersCount > 1 && this.bettingRound > 0) {
        // Only one player can make decisions, but others are all-in. Check if this player needs to act.
        const decisionMaker = activePlayersInGame[0];
        if (decisionMaker.currentBetInRound === this.currentBet && this.currentBet > 0) {
            // This player has already matched the highest bet, or made it. Round ends.
            logGameEvent('ONLY_ONE_DECISION_MAKER_MATCHED_BET', { context: 'moveToNextPlayer' });
            this.completeBettingRound();
            return;
        }
        // Otherwise, this player still needs to act.
    }

    let currentIndexInOrder = -1;
    if (this.activePlayerSocketId) {
        currentIndexInOrder = this.playerOrder.indexOf(this.activePlayerSocketId);
    }
    
    // Fallback if activePlayerSocketId is somehow invalid or not in order, find first valid player
    if (this.activePlayerSocketId && currentIndexInOrder === -1) {
        logError(new Error(`Aktiver Spieler ${this.activePlayerSocketId} nicht in playerOrder gefunden beim Suchen des nächsten Spielers.`), { currentOrder: this.playerOrder, activeId: this.activePlayerSocketId });
        this.activePlayerSocketId = null; // Reset to allow finding the first valid player
    }

    let nextPlayerId = null;
    let attempts = 0;
    // If activePlayerSocketId is null (start of round), start search from index 0, else from next player.
    let nextIndex = this.activePlayerSocketId === null ? 0 : (currentIndexInOrder + 1) % this.playerOrder.length;

    // This loop finds the next player who is active, not folded, and not all-in (unless they are the only one left to act).
    while (attempts < this.playerOrder.length * 2) { // Increased attempts to be safe with complex order/state changes
      const potentialNextPlayerId = this.playerOrder[nextIndex % this.playerOrder.length]; // Ensure index wraps
      const potentialNextPlayer = this.players[potentialNextPlayerId];

      if (potentialNextPlayer && potentialNextPlayer.isActive && !potentialNextPlayer.hasFolded && potentialNextPlayer.role === 'player') {
        if (!potentialNextPlayer.isAllIn || potentialNextPlayer.balance > 0) { // Player can act if not all-in OR if they somehow have balance despite being all-in (should not happen)
            nextPlayerId = potentialNextPlayerId;
            break;
        }
      }
      nextIndex++;
      attempts++;
    }
    
    if (!nextPlayerId && activePlayersInGame.length > 0) {
        // This might happen if playerOrder is out of sync or all remaining players became all-in simultaneously in a weird way.
        // Try to pick the first from activePlayersInGame as a fallback if loop fails.
        nextPlayerId = activePlayersInGame[0].socketId;
        logError(new Error("Fallback: Konnte nächsten Spieler nicht durch Standard-Loop finden, wähle ersten aktiven."), { activePlayersInGame });
    }

    if (!nextPlayerId) {
        logError(new Error("Konnte keinen nächsten Spieler finden, obwohl aktive Spieler vorhanden sein sollten."), { activePlayersCount: activePlayersInGame.length, nonFoldedCount: nonFoldedPlayersCount });
        this.completeBettingRound(); // No one to move to
        return;
    }

    // Determine if the betting round is over
    let roundOver = false;
    const playersToCheck = this.getActivePlayers(); // All non-folded players, including those all-in

    if (playersToCheck.length <= 1) {
        roundOver = true;
    } else {
        // Condition 1: All players who can act have acted, and all bets are equalized.
        // This means the action has come back to the player who made the last bet/raise,
        // and everyone else has called or folded.
        // Or, everyone has checked around.

        const highestBetInRound = this.currentBet;
        let allActivePlayersMatchedOrAllIn = true;
        let countOfPlayersYetToActOnCurrentBet = 0;

        for (const p of playersToCheck) {
            if (p.isAllIn && p.currentBetInRound < highestBetInRound) continue; // All-in for less is fine
            if (p.currentBetInRound !== highestBetInRound) {
                allActivePlayersMatchedOrAllIn = false;
                // If this player is the nextPlayerId, they still need to act on the current highest bet.
                // If this player is NOT nextPlayerId, it means someone before nextPlayerId still needs to act.
                if (p.socketId !== nextPlayerId) {
                    // This implies an issue or a player before nextPlayerId needs to act.
                }
            }
            // Check if this player has acted since the current highestBet was established by playerWhoMadeLastBetOrRaise
            // This is complex. Simpler: if nextPlayerId is the one who made the last raise, and all others called/folded.
        }
        
        // If there was a bet or raise that other players needed to respond to:
        if (this.playerWhoMadeLastBetOrRaise) {
            if (nextPlayerId === this.playerWhoMadeLastBetOrRaise && allActivePlayersMatchedOrAllIn) {
                // Action is back to the aggressor, and everyone else has matched or folded/is all-in.
                roundOver = true;
            }
        } else if (this.currentBet === 0) { // No bets or raises yet, players are checking
            // If nextPlayerId is the one who started this betting round (playerWhoInitiatedCurrentBettingAction)
            // and no bets have been made, it means everyone checked.
            if (nextPlayerId === this.playerWhoInitiatedCurrentBettingAction && this.activePlayerSocketId !== null) {
                 // Ensure the activePlayerSocketId (previous player) is not null, meaning at least one player has acted (checked).
                roundOver = true;
            }
        }
        
        // If only one player is not all-in and they have made/matched the current bet.
        const playersWhoCanStillBet = playersToCheck.filter(p => !p.isAllIn && p.balance > 0);
        if (playersWhoCanStillBet.length === 1 && playersToCheck.length > 1) {
            if (playersWhoCanStillBet[0].currentBetInRound === this.currentBet) {
                // The only player who can still bet has already matched the current bet (or made it).
                // All others are all-in or folded. Round ends.
                let othersAllInOrFolded = true;
                for(const p of playersToCheck) {
                    if (p.socketId === playersWhoCanStillBet[0].socketId) continue;
                    if (!p.isAllIn && !p.hasFolded) {
                        othersAllInOrFolded = false;
                        break;
                    }
                }
                if (othersAllInOrFolded) roundOver = true;
            }
        }
        if (playersWhoCanStillBet.length === 0 && playersToCheck.length > 1) {
            // All remaining players are all-in, round ends, proceed to fill side pots / showdown.
            roundOver = true;
        }
    }

    if (roundOver) {
        await this.completeBettingRound(); // now async
        return;
    }
    
    this.activePlayerSocketId = nextPlayerId;
    // Set playerWhoInitiatedCurrentBettingAction if it's the first action of the round
    if (!this.playerWhoInitiatedCurrentBettingAction && this.players[this.activePlayerSocketId] && this.currentBet === 0) {
        this.playerWhoInitiatedCurrentBettingAction = this.activePlayerSocketId;
    }

    logGameEvent('ACTIVE_PLAYER_CHANGED_IN_GAME', { activePlayer: this.players[this.activePlayerSocketId]?.name, socketId: this.activePlayerSocketId, bettingRound: this.bettingRound, currentBet: this.currentBet });
    this.io.emit('activePlayerChanged', {
      activePlayer: this.players[this.activePlayerSocketId].name,
      gameState: this.getGameStateSnapshot()
    });
    await this._saveGameToDB(); // Save after active player changes
  }

  async completeBettingRound() {
    logGameEvent('BETTING_ROUND_COMPLETED_IN_GAME', { round: this.bettingRound, pot: this.pot });
    this.activePlayerSocketId = null; 
    this.playerWhoMadeLastBetOrRaise = null; // Reset for next round
    this.playerWhoInitiatedCurrentBettingAction = null; // Reset for next round
    // this.currentBet = 0; // Reset in startNewBettingRound
    // Object.values(this.players).forEach(p => p.currentBetInRound = 0); // Reset in startNewBettingRound

    // Check if only one player remains (not folded)
    const activeNonFoldedPlayers = this.getActivePlayers();

    // DETAILED LOGGING FOR SHOWDOWN CONDITION
    logGameEvent('DEBUG_SHOWDOWN_CONDITION_CHECK', {
        bettingRound: this.bettingRound,
        hintsLength: this.hints ? this.hints.length : 'undefined',
        activeNonFoldedPlayerCount: activeNonFoldedPlayers.length,
        areAllActiveNonFoldedPlayersAllIn: activeNonFoldedPlayers.length > 1 ? activeNonFoldedPlayers.every(p => p.isAllIn) : 'N/A (<=1 player)',
        condition1_bettingRoundGe3: this.bettingRound >= 3,
        condition2_noMoreHints: this.hints ? this.hints.length === 0 : 'N/A (hints undefined)',
        condition3_allActivePlayersAllIn: activeNonFoldedPlayers.length > 1 && activeNonFoldedPlayers.every(p => p.isAllIn)
    });

    if (activeNonFoldedPlayers.length === 1) {
        this.state = GameState.SHOWDOWN; // Or a specific state for "winner by default"
        this.io.emit('gameOver', {
            message: `${activeNonFoldedPlayers[0].name} wins as all other players folded!`,
            winner: activeNonFoldedPlayers[0].name,
            pot: this.pot,
            gameState: this.getGameStateSnapshot()
        });
        // Award pot to winner - this logic needs to be robust
        this.awardPotToWinner(activeNonFoldedPlayers[0]);
        // TODO: Reset game for next round or end game session
        return; // End here, no further hints or betting
    }

    if (this.bettingRound === 3) {
        this.state = GameState.ANSWER_REVEAL;
        if (this.hostSocketId) {
            this.io.to(this.hostSocketId).emit('enableRevealAnswerButton', { enabled: true });
        }
        this.io.emit('bettingComplete', {
            message: "Wettrunde 3 abgeschlossen. Der Host kann nun die Antwort enthüllen.",
            pot: this.pot,
            gameState: this.getGameStateSnapshot()
        });
    } else if (this.bettingRound >= 4 || (this.hints && this.hints.length === 0) || (activeNonFoldedPlayers.length > 1 && activeNonFoldedPlayers.every(p => p.isAllIn))) {
      this.state = GameState.SHOWDOWN;
      if (this.hostSocketId) {
        this.io.to(this.hostSocketId).emit('enableShowdownButton', { enabled: true });
      }
      this.io.emit('bettingComplete', {
        message: "Alle Wettrunden abgeschlossen. Der Host kann nun den Showdown starten.",
        pot: this.pot,
        gameState: this.getGameStateSnapshot()
      });
    } else {
      // Nächste Phase ist das Zeigen eines Hinweises
      // After BETTING_ROUND_1 -> HINT_1, after BETTING_ROUND_2 -> HINT_2
      const nextHintPhase = `HINT_${this.bettingRound}`; // HINT_1 after round 1, HINT_2 after round 2
      if (GameState[nextHintPhase]) {
        this.state = GameState[nextHintPhase];
        if (this.hostSocketId) {
          this.io.to(this.hostSocketId).emit('enableHintButton', { enabled: true });
        }
        this.io.emit('nextBettingRoundReady', { // Oder spezifischeres Event 'readyForHint'
          message: `Wettrunde ${this.bettingRound} beendet. Der Host kann nun einen Hinweis anzeigen.`,
          nextPhase: this.state,
          gameState: this.getGameStateSnapshot()
        });
      } else {
        // Fallback: direkt zum Showdown wenn keine Hint-Phase mehr möglich
        this.state = GameState.SHOWDOWN;
        if (this.hostSocketId) {
          this.io.to(this.hostSocketId).emit('enableShowdownButton', { enabled: true });
        }
        this.io.emit('bettingComplete', {
          message: "Alle Wettrunden abgeschlossen. Der Host kann nun den Showdown starten.",
          pot: this.pot,
          gameState: this.getGameStateSnapshot()
        });
      }
    }
    await this._saveGameToDB(); // Save state after completing betting round
    await this._saveGameToDB();
  }

  async showHint(actorSocketId) {
    if (actorSocketId !== this.hostSocketId) {
      this.io.to(actorSocketId).emit('errorMessage', "Nur der Host kann Hinweise anzeigen!");
      logError(new Error('Non-host tried to show hint'), { context: 'showHint', actorSocketId });
      return false;
    }
    if (!this.currentQuestion) {
      this.io.to(actorSocketId).emit('errorMessage', "Es läuft kein Spiel!");
      logError(new Error('No game in progress for showHint'), { context: 'showHint', actorSocketId });
      return false;
    }

    // Force bettingRound to match the state if we are in a hint phase
    // This overrides any mismatch that might have occurred
    if (this.state === GameState.HINT_1) {
        this.bettingRound = 1;
    } else if (this.state === GameState.HINT_2) {
        this.bettingRound = 2;
    }

    // Debug logging for hint issue
    logGameEvent('DEBUG_SHOW_HINT_ATTEMPT', {
        state: this.state,
        bettingRound: this.bettingRound,
        hintsAvailable: this.hints ? this.hints.length : 'undefined',
        hintsContent: this.hints,
        expectedPhase: `HINT_${this.bettingRound}`
    });

    if (this.state !== GameState[`HINT_${this.bettingRound}`]) {
        this.io.to(actorSocketId).emit('errorMessage', `Hinweis kann nicht in der aktuellen Phase ${this.state} angezeigt werden. Erwartet HINT_${this.bettingRound}.`);
        logError(new Error(`Hint cannot be shown in current phase ${this.state}. Expected HINT_${this.bettingRound}.`), { context: 'showHint', actorSocketId });
        return false;
    }
    if (!this.hints || this.hints.length === 0) {
      this.io.to(actorSocketId).emit('errorMessage', "Keine weiteren Hinweise verfügbar!");
      logError(new Error('No more hints available'), { context: 'showHint', actorSocketId, questionId: this.currentQuestion._id });
      return false;
    }

    const nextHint = this.hints.shift();
    this.revealedHints.push(nextHint); // Track revealed hint
    logGameEvent('HINT_REVEALED_IN_GAME', { hint: nextHint, hintsRemaining: this.hints.length });
    this.io.emit('hintRevealed', {
      hint: nextHint,
      hintsRemaining: this.hints.length,
      gameState: this.getGameStateSnapshot()
    });

    // Nach dem Anzeigen eines Hinweises beginnt die nächste Wettrunde
    await this.startNewBettingRound(this.bettingRound + 1); // now async
    // _saveGameToDB will be called by startNewBettingRound
    return true;
  }

  async revealAnswer(actorSocketId) {
    if (actorSocketId !== this.hostSocketId) {
        this.io.to(actorSocketId).emit('errorMessage', "Nur der Host kann die Antwort enthüllen.");
        logError(new Error('Non-host tried to reveal answer'), { context: 'revealAnswer', actorSocketId });
        return false;
    }
    if (this.state !== GameState.ANSWER_REVEAL) {
        this.io.to(actorSocketId).emit('errorMessage', "Antwort kann nicht in der aktuellen Spielphase enthüllt werden.");
        logError(new Error('Reveal answer attempted in wrong phase'), { context: 'revealAnswer', actorSocketId, currentState: this.state });
        return false;
    }

    logGameEvent('ANSWER_REVEALED', { host: this.players[this.hostSocketId]?.name, answer: this.correctAnswer });
    
    this.io.emit('answerRevealed', {
        answer: this.correctAnswer,
        message: `Die korrekte Antwort ist: ${this.correctAnswer}. Es folgt die finale Wettrunde!`,
        gameState: this.getGameStateSnapshot()
    });

    // Start final betting round (Round 4)
    await this.startNewBettingRound(4);
    return true;
  }

  async awardPotToWinner(winnerPlayerObject) {
    if (winnerPlayerObject && this.players[winnerPlayerObject.socketId]) {
        this.players[winnerPlayerObject.socketId].balance += this.pot;
        logGameEvent('POT_AWARDED', { winner: winnerPlayerObject.name, amount: this.pot, newBalance: this.players[winnerPlayerObject.socketId].balance });
        this.pot = 0;
        // Broadcast new balances
        this.io.emit('gameStateUpdate', this.getGameStateSnapshot()); // Or a specific event for balance changes
        await this._saveGameToDB();
    } else {
        logError(new Error('Winner player object not found for awarding pot'), { winnerPlayerObject });
    }
  }

  // Placeholder for showdown logic
  async handleShowdown(actorSocketId) {
    if (actorSocketId !== this.hostSocketId) {
        this.io.to(actorSocketId).emit('errorMessage', "Nur der Host kann den Showdown starten.");
        logError(new Error('Non-host tried to start showdown'), { context: 'handleShowdown', actorSocketId });
        return false;
    }
    if (this.state !== GameState.SHOWDOWN) {
        this.io.to(actorSocketId).emit('errorMessage', "Showdown kann nicht in der aktuellen Spielphase gestartet werden.");
        logError(new Error('Showdown attempted in wrong phase'), { context: 'handleShowdown', actorSocketId, currentState: this.state });
        return false;
    }

    logGameEvent('SHOWDOWN_INITIATED', { host: this.players[this.hostSocketId]?.name });

    const participatingPlayers = this.getActivePlayers(); // Players who haven't folded
    if (participatingPlayers.length === 0) {
        this.io.emit('gameOver', { message: "Keine Spieler mehr im Spiel für Showdown.", gameState: this.getGameStateSnapshot() });
        // TODO: Reset game logic
        return true;
    }
    if (participatingPlayers.length === 1) {
        this.awardPotToWinner(participatingPlayers[0]);
        this.io.emit('gameOver', {
            message: `${participatingPlayers[0].name} gewinnt den Pot, da alle anderen gepasst haben!`,
            winner: participatingPlayers[0].name,
            pot: this.pot, // Pot should be 0 after awardPotToWinner if called before this emit
            finalAnswers: this.getFinalAnswersForShowdown(),
            correctAnswer: this.correctAnswer,
            gameState: this.getGameStateSnapshot() // Snapshot after pot awarded
        });
        this.resetForNextRound();
        return true;
    }

    // Determine winner(s) based on answers
    let winners = [];
    let closestDiff = Infinity;

    participatingPlayers.forEach(player => {
        const answerVal = parseFloat(player.finalAnswer);
        if (isNaN(answerVal)) {
            player.accuracy = Infinity; // Invalid answers are furthest
            return;
        }
        player.accuracy = Math.abs(answerVal - this.correctAnswer);
        if (player.accuracy < closestDiff) {
            closestDiff = player.accuracy;
            winners = [player];
        } else if (player.accuracy === closestDiff) {
            winners.push(player);
        }
    });

    let potDistribution = {};
    if (winners.length > 0) {
        const potPerWinner = Math.floor(this.pot / winners.length);
        winners.forEach(winner => {
            this.players[winner.socketId].balance += potPerWinner;
            potDistribution[winner.name] = potPerWinner;
        });
        const remainder = this.pot % winners.length;
        if (remainder > 0 && winners.length > 0) { // Distribute remainder to first winner
            this.players[winners[0].socketId].balance += remainder;
            potDistribution[winners[0].name] += remainder;
        }
        this.pot = 0;
    }

    logGameEvent('SHOWDOWN_COMPLETED', { winners: winners.map(w=>w.name), potDistribution, correctAnswer: this.correctAnswer });

    this.io.emit('showdownResults', {
        winners: winners.map(w => ({ name: w.name, finalAnswer: w.finalAnswer, accuracy: w.accuracy })),
        potDistribution,
        correctAnswer: this.correctAnswer,
        finalAnswers: this.getFinalAnswersForShowdown(),
        gameState: this.getGameStateSnapshot() // Snapshot after pot awarded
    });
    
    await this.resetForNextRound(); // now async
    return true;
  }

  getFinalAnswersForShowdown() {
    const answers = {};
    Object.values(this.players).forEach(p => {
        if (p.role === 'player' && p.finalAnswer !== null) {
            answers[p.name] = p.finalAnswer;
        }
    });
    return answers;
  }

  async resetForNextRound() {
    this.state = GameState.WAITING;
    this.currentQuestion = null;
    // pot is already 0 or handled by awardPotToWinner
    this.currentBet = 0;
    this.hints = [];
    this.revealedHints = []; // Reset revealed hints for next round
    this.activePlayerSocketId = null;
    this.bettingRound = 0;
    this.correctAnswer = null;
    this.playerWhoMadeLastBetOrRaise = null;
    this.playerWhoInitiatedCurrentBettingAction = null;
    this.actionHistory = []; // Clear action history for the new round

    Object.values(this.players).forEach(player => {
        if (player.role === 'player') {
            player.finalAnswer = null;
            player.isAnswerRevealed = false; // Reset revealed status
            player.currentBetInRound = 0;
            player.hasFolded = false;
            player.isAllIn = false; // Reset all-in status
        }
    });

    this.roundNumber++; // Increment round number
    
    // Check if blinds just increased
    if (this.blindsEnabled) {
        const baseMinBet = 20;
        const increaseInterval = 3;
        const prevMultiplier = Math.pow(2, Math.floor((this.roundNumber - 2) / increaseInterval));
        const newMultiplier = Math.pow(2, Math.floor((this.roundNumber - 1) / increaseInterval));
        
        if (newMultiplier > prevMultiplier) {
            const newMinBet = baseMinBet * newMultiplier;
            this.io.emit('blindsIncreased', { 
                message: `⚠️ Blinds Increased! Minimum bet is now ${newMinBet}.`,
                newMinBet 
            });
        }
    }

    logGameEvent('GAME_RESET_FOR_NEXT_ROUND', { roundNumber: this.roundNumber });
    this.io.emit('nextRoundReady', { gameState: this.getGameStateSnapshot() });
    await this._saveGameToDB();
  }

  getGameStateSnapshot() {
    return {
        gameId: this.gameId,
        players: Object.values(this.players)
            .filter(p => p && typeof p === 'object' && p.socketId && !p.socketId.startsWith('$') && p.name) // Filter out invalid objects (Mongoose internals, empty objects)
            .map(p => ({
            // Ensure 'p' is a valid player object.
            // The 'id' property was an issue. Player objects in this.players are keyed by socketId.
            // The player object itself should have a socketId or a unique id property.
            // Assuming player objects have 'socketId' and 'name', 'balance' etc.
            id: p.socketId, // Use socketId as the unique identifier for the player in the snapshot
            socketId: p.socketId, // Also include socketId for frontend compatibility
            name: p.name,
            role: p.role, // Include role for filtering
            avatarSeed: p.avatarSeed || p.name, // Include avatar seed
            balance: p.balance || 1000, // Changed from 'chips' to 'balance' to match player object, default to 1000
            score: this.playerScores[p.socketId] || 0, // Use p.socketId for scores
            isDealer: this.playerOrder[this.dealerPosition] === p.socketId,
            isCurrentTurn: this.activePlayerSocketId === p.socketId,
            currentBetInRound: p.currentBetInRound || 0,
            hasFolded: p.hasFolded || false,
            isActive: p.isActive !== undefined ? p.isActive : true,
            isAllIn: p.isAllIn || false, // Assuming player object has isAllIn
            isAnswerRevealed: p.isAnswerRevealed || false,
            finalAnswer: (this.state === GameState.SHOWDOWN || this.state === GameState.WAITING || p.isAnswerRevealed) ? p.finalAnswer : undefined, // Show answers only at showdown/end or if revealed
            hasAnswered: p.finalAnswer !== null && p.finalAnswer !== undefined,
        })),
        hostSocketId: this.hostSocketId,
        state: this.state,
        currentQuestion: this.currentQuestion ? {
            question: this.currentQuestion.question, // Changed from 'text'
            category: this.currentQuestion.category,
            // Do NOT send correctAnswer or hints here unless explicitly needed by phase
            hintsAvailable: this.hints ? this.hints.length > 0 : false, // Based on remaining hints in game state
            // timeRemaining: ... (if you add question timers)
        } : null,
        revealedHints: this.revealedHints || [], // Track which hints have been revealed
        pot: this.pot,
        currentBet: this.currentBet, // Highest bet to call in current betting round
        smallBlind: this.smallBlind,
        bigBlind: this.bigBlind,
        dealerPositionName: this.players[this.playerOrder[this.dealerPosition]]?.name, // Name of dealer
        activePlayerName: this.players[this.activePlayerSocketId]?.name, // Name of current player
        activePlayerSocketId: this.activePlayerSocketId, // Socket ID of current player (for frontend)
        roundNumber: this.roundNumber,
        bettingRound: this.bettingRound, // Current betting sub-round (1, 2, 3)
        blindsEnabled: this.blindsEnabled, // Include blinds state
        // communityCards: this.communityCards, // If you add poker hand evaluation
        actionHistory: this.actionHistory.slice(-10), 
        gameLog: this.gameLog.slice(-5),
        minimumRaise: this.minimumRaise,
        correctAnswer: (this.state === GameState.SHOWDOWN || this.state === GameState.WAITING) ? this.correctAnswer : undefined, // Show correct answer only at showdown/end
        // roundResults: this.roundResults, // If you have a dedicated round results object
    };
  }

  getGameStateForClient(socketId) {
    const fullState = this.getGameStateSnapshot();
    // For now, client gets the same full snapshot. 
    // Add redaction logic here if needed, similar to the previous version.
    // Example: Hiding other players' final answers unless it's showdown.
    
    // If it's not showdown or game end, and the client is a player, hide other players' final answers.
    if (this.state !== GameState.SHOWDOWN && this.state !== GameState.WAITING) {
        fullState.players.forEach(p => {
            if (p.id !== socketId && !p.isAnswerRevealed) { // Allow if revealed
                delete p.finalAnswer;
            }
        });
        delete fullState.correctAnswer; // Also hide correct answer until showdown
    }
    
    // Add player-specific info
    const playerSelf = this.players[socketId];
    if (playerSelf) {
        fullState.myPlayerInfo = {
            socketId: playerSelf.socketId,
            name: playerSelf.name,
            balance: playerSelf.balance,
            score: this.playerScores[playerSelf.socketId] || 0,
            finalAnswer: playerSelf.finalAnswer, // They can always see their own answer
            isAnswerRevealed: playerSelf.isAnswerRevealed || false,
            // any other specific details for the player
        };
    }
    
    if (socketId === this.hostSocketId) {
        fullState.isHost = true;
        // Host always sees all answers
        fullState.players.forEach(p => {
             const originalPlayer = this.players[p.id];
             if (originalPlayer && originalPlayer.finalAnswer !== null && originalPlayer.finalAnswer !== undefined) {
                 p.finalAnswer = originalPlayer.finalAnswer;
             }
        });
        
        // Host might get more details, e.g., all final answers during answering phase for verification
        if (this.state === GameState.ANSWERING) {
            fullState.allFinalAnswers = Object.values(this.players)
                .filter(p => p.role === 'player' && p.finalAnswer !== null)
                .map(p => ({ name: p.name, answer: p.finalAnswer }));
        }
    }

    return fullState;
  }

  async resetRound(actorSocketId) {
    if (actorSocketId !== this.hostSocketId) {
        this.io.to(actorSocketId).emit('errorMessage', "Nur der Host kann die Runde zurücksetzen.");
        return false;
    }

    // Reset state to ANSWERING
    this.state = GameState.ANSWERING;
    this.bettingRound = 0;
    this.currentBet = 0;
    this.activePlayerSocketId = null;
    this.revealedHints = [];
    
    // Reset player round-specific flags
    Object.values(this.players).forEach(player => {
        if (player.role === 'player') {
            player.finalAnswer = null;
            player.currentBetInRound = 0;
            player.hasFolded = false;
            player.isAllIn = false;
            player.isActive = true; // Unfold everyone
        }
    });

    logGameEvent('ROUND_RESET_BY_HOST', { hostSocketId: actorSocketId });

    // Notify clients
    this.io.emit('gameStarted', {
        question: this.currentQuestion ? this.currentQuestion.question : "Round Reset",
        gameState: this.getGameStateSnapshot(),
        phase: 'ANSWERING'
    });
    
    await this._saveGameToDB();
    return true;
  }

  async revealPlayerAnswer(socketId) {
    const player = this.getPlayer(socketId);
    if (!player || player.finalAnswer === null) {
        return false;
    }
    player.isAnswerRevealed = true;
    logGameEvent('PLAYER_REVEALED_ANSWER', { socketId, name: player.name, answer: player.finalAnswer });
    
    this.io.emit('playerRevealedAnswer', { 
        playerId: socketId, 
        answer: player.finalAnswer,
        gameState: this.getGameStateSnapshot() 
    });
    
    await this._saveGameToDB();
    return true;
  }

  async kickPlayer(hostSocketId, targetSocketId) {
    if (hostSocketId !== this.hostSocketId) {
        this.io.to(hostSocketId).emit('errorMessage', "Nur der Host kann Spieler kicken.");
        return false;
    }
    const player = this.players[targetSocketId];
    if (!player) return false;

    logGameEvent('PLAYER_KICKED_BY_HOST', { host: this.players[hostSocketId]?.name, target: player.name });
    
    // Send specific message to kicked player before removing
    this.io.to(targetSocketId).emit('kicked', { message: 'Du wurdest vom Host aus dem Spiel entfernt.' });
    
    await this.removePlayer(targetSocketId);
    return true;
  }

  async adjustPlayerBalance(hostSocketId, targetSocketId, amount) {
    if (hostSocketId !== this.hostSocketId) {
        this.io.to(hostSocketId).emit('errorMessage', "Nur der Host kann Guthaben ändern.");
        return false;
    }
    const player = this.players[targetSocketId];
    if (!player) return false;

    const oldBalance = player.balance;
    player.balance += amount;
    
    logGameEvent('HOST_ADJUSTED_BALANCE', { 
        host: this.players[hostSocketId]?.name, 
        target: player.name, 
        amount, 
        oldBalance,
        newBalance: player.balance 
    });
    
    this.io.emit('gameStateUpdate', this.getGameStateSnapshot());
    await this._saveGameToDB();
    return true;
  }

  async toggleBlinds(hostSocketId, enabled) {
    if (hostSocketId !== this.hostSocketId) {
        return false;
    }
    this.blindsEnabled = enabled;
    logGameEvent('BLINDS_TOGGLED', { enabled });
    
    // If disabled, reset min bet immediately for next round logic
    if (!enabled) {
        this.minimumRaise = 20;
    }
    
    this.io.emit('blindsStateChanged', { enabled, minimumRaise: this.minimumRaise });
    await this._saveGameToDB();
    return true;
  }
}

module.exports = { Game, GameState };
