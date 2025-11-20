const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PlayerStateSchema = new Schema({
    socketId: { type: String, required: true }, // Or a persistent player ID post-authentication
    name: { type: String, required: true },
    role: { type: String, enum: ['player', 'host'], required: true },
    balance: { type: Number, default: 1000 },
    finalAnswer: { type: Schema.Types.Mixed, default: null }, // Can be number or string depending on question
    currentBetInRound: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    hasFolded: { type: Boolean, default: false },
    isAllIn: { type: Boolean, default: false },
    // Add any other player-specific fields that need to be persisted
}, { _id: false });

const GameSessionSchema = new Schema({
    gameId: { type: String, default: 'default_quiz_poker_game', unique: true, required: true },
    players: { type: Map, of: PlayerStateSchema, default: {} },
    playerOrder: { type: [String], default: [] }, // Array of player socketIds (or persistent IDs)
    hostSocketId: { type: String, default: null },
    
    state: { type: String, required: true, default: 'WAITING' }, // e.g., WAITING, ANSWERING, BETTING_ROUND_1
    currentQuestionId: { type: Schema.Types.ObjectId, ref: 'Question', default: null },
    correctAnswer: { type: Schema.Types.Mixed, default: null },
    hints: { type: [String], default: [] }, // Remaining hints
    revealedHints: { type: [String], default: [] }, // Hints that have been revealed

    pot: { type: Number, default: 0 },
    pots: [{
        amount: { type: Number, default: 0 },
        eligiblePlayers: { type: [String], default: [] }
    }],
    currentBet: { type: Number, default: 0 }, // Highest bet in the current round
    bettingRound: { type: Number, default: 0 }, // 0, 1, 2, 3
    
    activePlayerSocketId: { type: String, default: null },
    lastRaise: { type: Number, default: 0 }, // Amount of the last raise
    minimumRaise: { type: Number, default: 20 },

    playerWhoMadeLastBetOrRaise: { type: String, default: null },
    playerWhoInitiatedCurrentBettingAction: { type: String, default: null },

    lastUpdatedAt: { type: Date, default: Date.now }
});

// Update lastUpdatedAt timestamp before saving
GameSessionSchema.pre('save', function(next) {
    this.lastUpdatedAt = Date.now();
    next();
});

module.exports = mongoose.model('GameSession', GameSessionSchema);
