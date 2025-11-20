module.exports = {
    // Game Rules
    MIN_BET: 20,
    BLIND_INCREASE_INTERVAL: 3, // Rounds before blinds increase
    STARTING_BALANCE: 1000,

    // Timeouts (in milliseconds) - kept for reference even if not used for timers
    // SHOWDOWN_DELAY: 5000, 

    // Rate Limiting
    RATE_LIMITS: {
        WINDOW_MS: 60 * 1000,
        MAX_CONNECTIONS: 10,
        MAX_EVENTS: 20
    },

    // Game States
    GAME_STATES: {
        WAITING: 'WAITING',
        ANSWERING: 'ANSWERING',
        BETTING_ROUND_1: 'BETTING_ROUND_1',
        HINT_1: 'HINT_1',
        BETTING_ROUND_2: 'BETTING_ROUND_2',
        HINT_2: 'HINT_2',
        BETTING_ROUND_3: 'BETTING_ROUND_3',
        HINT_3: 'HINT_3',
        BETTING_ROUND_4: 'BETTING_ROUND_4',
        ANSWER_REVEAL: 'ANSWER_REVEAL',
        SHOWDOWN: 'SHOWDOWN'
    }
};
