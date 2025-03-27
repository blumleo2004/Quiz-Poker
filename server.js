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
    if (data.role === 'player') {
      players[socket.id] = { name: data.name, role: data.role, balance: 1000 };
      playerOrder.push(socket.id);
      console.log(`Spieler ${data.name} ist beigetreten.`);
      io.emit('playerList', players);
      io.emit('playerOrder', playerOrder.map(id => players[id] ? players[id].name : "Unbekannt"));
    } else {
      console.log(`Host ${data.name} ist beigetreten.`);
      // Host wird separat behandelt
    }
  });

  // Host startet eine Runde: Hole eine zufällige Frage aus der DB und weise Blinds zu
  socket.on('startGame', async () => {
    console.log('Host startet die Runde.');
    if (playerOrder.length < 3) {
      socket.emit('errorMessage', "Mindestens 3 Spieler sind erforderlich!");
      return;
    }
    try {
      const count = await Question.countDocuments();
      if (count === 0) {
        console.log('Keine Fragen in der Datenbank gefunden!');
        io.emit('noQuestions');
        return;
      }
      const random = Math.floor(Math.random() * count);
      const question = await Question.findOne().skip(random);
      if (question) {
        currentQuestion = question;
        currentBets = {};
        currentAnswers = {};
        
        // Rollen zuweisen: Dealer, Small Blind und Big Blind basierend auf der Spieler-Reihenfolge
        let dealerId = playerOrder[dealerIndex % playerOrder.length];
        let smallBlindId = playerOrder[(dealerIndex + 1) % playerOrder.length];
        let bigBlindId = playerOrder[(dealerIndex + 2) % playerOrder.length];
        
        const smallBlind = 10;
        const bigBlind = 20;
        
        // Blinds abziehen (bei unzureichendem Guthaben wird der Rest gesetzt)
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
        
        // Informiere alle über die Rollenzuweisung
        io.emit('roleAssignment', {
          dealer: players[dealerId].name,
          smallBlind: players[smallBlindId].name,
          bigBlind: players[bigBlindId].name,
          bets: currentBets
        });
        
        // Sende die Frage und den ersten Hinweis an alle Spieler
        io.emit('newQuestion', { 
          question: question.question, 
          hint: question.hints.length > 0 ? question.hints[0] : ''
        });
        
        dealerIndex++;
      }
    } catch (err) {
      console.error('Fehler beim Abrufen der Frage:', err);
    }
  });

  // Spieler platzieren ihren Einsatz (Betting-Phase)
  socket.on('placeBet', (bet) => {
    if (players[socket.id] && players[socket.id].balance >= bet) {
      currentBets[socket.id] = bet;
      console.log(`Spieler ${players[socket.id].name} setzt ${bet}€`);
      io.emit('betUpdate', currentBets);
    } else {
      socket.emit('errorMessage', "Nicht genug Guthaben!");
    }
  });

  // Host schließt das Betting ab – Wechsel zur Antwort-Phase
  socket.on('closeBetting', () => {
    console.log('Betting wurde vom Host geschlossen.');
    io.emit('bettingClosed');
  });

  // Spieler senden ihre Antwort (Antwort-Phase)
  socket.on('sendAnswer', (answer) => {
    console.log(`Antwort von ${socket.id}: ${answer}`);
    currentAnswers[socket.id] = answer;
  });

  // Host löst die Auswertung der Antworten aus
  socket.on('evaluateAnswers', async () => {
    if (!currentQuestion) {
      console.log("Keine aktive Frage!");
      return;
    }
    const correctAnswer = currentQuestion.answer.trim().toLowerCase();
    let winnerId = null;
    let bestDiff = Infinity;
    let correctNum = Number(correctAnswer);
    let isNumeric = !isNaN(correctNum);
    if (isNumeric) {
      for (const id in currentAnswers) {
        let playerAns = Number(currentAnswers[id]);
        let diff = Math.abs(playerAns - correctNum);
        if (diff < bestDiff) {
          bestDiff = diff;
          winnerId = id;
        }
      }
    } else {
      for (const id in currentAnswers) {
        if (currentAnswers[id].trim().toLowerCase() === correctAnswer) {
          winnerId = id;
          break;
        }
      }
    }
    
    let pot = 0;
    for (const id in currentBets) {
      pot += currentBets[id];
    }
    
    if (winnerId) {
      players[winnerId].balance += pot;
      for (const id in currentBets) {
        if (id !== winnerId) {
          players[id].balance -= currentBets[id];
        }
      }
      io.emit('evaluationResult', { 
        winner: players[winnerId].name, 
        pot: pot, 
        players: players 
      });
    } else {
      io.emit('evaluationResult', { 
        message: "Kein Gewinner ermittelt (keine passende Antwort)", 
        players: players 
      });
    }
    
    // Lösche die verwendete Frage, um Wiederholungen zu vermeiden
    if (currentQuestion) {
      try {
        await Question.deleteOne({ _id: currentQuestion._id });
        console.log("Frage gelöscht, um Wiederholungen zu vermeiden.");
      } catch (err) {
        console.error("Fehler beim Löschen der Frage:", err);
      }
      currentQuestion = null;
    }
    currentBets = {};
    currentAnswers = {};
  });

  // Host kann einen zusätzlichen Hinweis anzeigen
  socket.on('revealHint', () => {
    if (currentQuestion && currentQuestion.hints.length > 1) {
      io.emit('newHint', currentQuestion.hints[1]);
    } else {
      socket.emit('errorMessage', "Kein weiterer Hinweis verfügbar.");
    }
  });

  socket.on('disconnect', () => {
    console.log('Spieler disconnected: ' + socket.id);
    delete players[socket.id];
    playerOrder = playerOrder.filter(id => id !== socket.id);
    io.emit('playerList', players);
    io.emit('playerOrder', playerOrder.map(id => players[id] ? players[id].name : "Unbekannt"));
  });
});

http.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
