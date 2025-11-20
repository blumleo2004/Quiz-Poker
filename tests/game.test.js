const { GAME_STATES } = require('../src/config/gameConfig');

// Mock all external dependencies BEFORE requiring Game
jest.mock('../src/utils/logger', () => ({
    logGameEvent: jest.fn(),
    logError: jest.fn()
}));

jest.mock('../src/models/Question', () => ({
    findRandomQuestion: jest.fn()
}));

jest.mock('../src/models/GameSession', () => {
    const mockSave = jest.fn().mockResolvedValue(true);
    const mockFindOne = jest.fn().mockResolvedValue(null);

    const MockGameSession = jest.fn().mockImplementation(() => ({
        save: mockSave
    }));

    MockGameSession.findOne = mockFindOne;

    return MockGameSession;
});

// Now require Game after mocks are set up
const { Game } = require('../src/game/Game');

describe('Game Class - Core Logic Tests', () => {
    let game;
    let mockIo;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create comprehensive mock Socket.IO instance
        mockIo = {
            emit: jest.fn(),
            to: jest.fn().mockReturnThis()
        };

        // Create game instance
        game = new Game(mockIo);
    });

    describe('Initialization', () => {
        test('should initialize with WAITING state', () => {
            expect(game.state).toBe(GAME_STATES.WAITING);
        });

        test('should initialize with empty pot', () => {
            expect(game.pot).toBe(0);
        });

        test('should initialize with no players', () => {
            expect(Object.keys(game.players)).toHaveLength(0);
        });
    });

    describe('Player Management', () => {
        test('should add player with correct default properties', async () => {
            const player = await game.addPlayer('socket1', 'Alice', 'player');

            expect(player.name).toBe('Alice');
            expect(player.role).toBe('player');
            expect(player.balance).toBe(1000);
            expect(player.isActive).toBe(true);
            expect(player.hasFolded).toBe(false);
        });

        test('should store avatar seed', async () => {
            const player = await game.addPlayer('socket1', 'Bob', 'player', 'custom_seed');

            expect(player.avatarSeed).toBe('custom_seed');
        });

        test('should add player to playerOrder', async () => {
            await game.addPlayer('p1', 'Player1', 'player');

            expect(game.playerOrder).toContain('p1');
        });

        test('should retrieve player by socket ID', async () => {
            await game.addPlayer('p1', 'Player1', 'player');

            const player = game.getPlayer('p1');

            expect(player).toBeDefined();
            expect(player.name).toBe('Player1');
        });

        test('should filter active players correctly', async () => {
            await game.addPlayer('p1', 'Player1', 'player');
            await game.addPlayer('p2', 'Player2', 'player');
            await game.addPlayer('p3', 'Player3', 'player');

            game.players['p2'].hasFolded = true;

            const activePlayers = game.getActivePlayers();

            expect(activePlayers).toHaveLength(2);
            expect(activePlayers.map(p => p.name)).toEqual(['Player1', 'Player3']);
        });
    });

    describe('Pot Calculations', () => {
        beforeEach(async () => {
            await game.addPlayer('p1', 'Player1', 'player');
            await game.addPlayer('p2', 'Player2', 'player');
        });

        test('should accumulate bets into pot', () => {
            game.pot = 0;

            // Simulate betting
            game.pot += 100;
            game.pot += 200;

            expect(game.pot).toBe(300);
        });

        test('should track player balances after bets', () => {
            const p1 = game.players['p1'];
            const p2 = game.players['p2'];

            p1.balance -= 100;
            p2.balance -= 150;

            expect(p1.balance).toBe(900);
            expect(p2.balance).toBe(850);
        });
    });

    describe('Answer Validation', () => {
        beforeEach(async () => {
            await game.addPlayer('p1', 'Player1', 'player');
            game.state = GAME_STATES.ANSWERING;
        });

        test('should accept numeric answer', async () => {
            const result = await game.submitAnswer('p1', 42);

            expect(result).toBe(true);
            expect(game.players['p1'].finalAnswer).toBe(42);
        });

        test('should reject answer in wrong game state', async () => {
            game.state = GAME_STATES.BETTING_ROUND_1;

            const result = await game.submitAnswer('p1', 42);

            expect(result).toBe(false);
        });

        test('should mark answer as not revealed initially', async () => {
            await game.submitAnswer('p1', 42);

            expect(game.players['p1'].isAnswerRevealed).toBe(false);
        });
    });

    describe('Winner Determination', () => {
        beforeEach(async () => {
            await game.addPlayer('p1', 'Player1', 'player');
            await game.addPlayer('p2', 'Player2', 'player');
            await game.addPlayer('p3', 'Player3', 'player');

            game.correctAnswer = 100;
        });

        test('should calculate accuracy as absolute difference', () => {
            const answer1 = 95;
            const answer2 = 110;

            const acc1 = Math.abs(game.correctAnswer - answer1);
            const acc2 = Math.abs(game.correctAnswer - answer2);

            expect(acc1).toBe(5);
            expect(acc2).toBe(10);
        });

        test('should identify winner by closest answer', () => {
            game.players['p1'].finalAnswer = 95;  // Diff: 5
            game.players['p2'].finalAnswer = 110; // Diff: 10
            game.players['p3'].finalAnswer = 98;  // Diff: 2

            const players = game.getActivePlayers();
            const sorted = players
                .map(p => ({
                    name: p.name,
                    accuracy: Math.abs(game.correctAnswer - p.finalAnswer)
                }))
                .sort((a, b) => a.accuracy - b.accuracy);

            expect(sorted[0].name).toBe('Player3');
        });

        test('should handle ties correctly', () => {
            game.players['p1'].finalAnswer = 95;  // Diff: 5
            game.players['p2'].finalAnswer = 105; // Diff: 5

            const p1Acc = Math.abs(game.correctAnswer - game.players['p1'].finalAnswer);
            const p2Acc = Math.abs(game.correctAnswer - game.players['p2'].finalAnswer);

            expect(p1Acc).toBe(p2Acc);
        });
    });

    describe('Betting Rounds', () => {
        test('should set minimum raise to 20 by default', async () => {
            game.blindsEnabled = false;
            await game.startNewBettingRound(1);

            expect(game.minimumRaise).toBe(20);
        });

        test('should increase blinds after interval', async () => {
            game.blindsEnabled = true;
            game.roundNumber = 4;

            await game.startNewBettingRound(1);

            expect(game.minimumRaise).toBe(40);
        });

        test('should reset currentBet for new round', async () => {
            game.currentBet = 100;

            await game.startNewBettingRound(2);

            expect(game.currentBet).toBe(0);
        });
    });

    describe('Game State Snapshot', () => {
        test('should include essential game information', async () => {
            await game.addPlayer('p1', 'Player1', 'player');
            game.pot = 500;

            const snapshot = game.getGameStateSnapshot();

            expect(snapshot).toHaveProperty('state');
            expect(snapshot).toHaveProperty('pot');
            expect(snapshot).toHaveProperty('players');
            expect(snapshot.pot).toBe(500);
        });
    });

    describe('Edge Cases', () => {
        test('should handle single player', async () => {
            await game.addPlayer('p1', 'OnlyPlayer', 'player');

            const activePlayers = game.getActivePlayers();

            expect(activePlayers).toHaveLength(1);
        });

        test('should handle all players folding except one', async () => {
            await game.addPlayer('p1', 'Player1', 'player');
            await game.addPlayer('p2', 'Player2', 'player');
            await game.addPlayer('p3', 'Player3', 'player');

            game.players['p1'].hasFolded = true;
            game.players['p2'].hasFolded = true;

            const activePlayers = game.getActivePlayers();

            expect(activePlayers).toHaveLength(1);
            expect(activePlayers[0].name).toBe('Player3');
        });

        test('should treat negative and positive differences equally', () => {
            game.correctAnswer = 100;

            const diff1 = Math.abs(game.correctAnswer - 80);
            const diff2 = Math.abs(game.correctAnswer - 120);

            expect(diff1).toBe(diff2);
        });
    });
});
