const CONFIG = {
    // Spieleinstellungen
    INITIAL_BALANCE: 1000,
    MINIMUM_RAISE: 20,
    
    // UI-Einstellungen
    TABLE_WIDTH: 900,
    TABLE_HEIGHT: 500,
    SEAT_RADIUS_FACTOR: 0.6,
    
    // Animation-Einstellungen
    ERROR_MESSAGE_DURATION: 5000,
    ACTION_MESSAGE_DURATION: 3000,
    PHASE_TRANSITION_DELAY: 50,
    
    // Chip-Werte
    CHIP_VALUES: [100, 25, 10, 5, 1],
    
    // Spielphasen
    PHASES: ['preflopPhase', 'flopPhase', 'turnPhase', 'riverPhase', 'showdownPhase'],
    
    // Validierung
    VALIDATION: {
        NAME: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 20
        },
        BET: {
            MIN: 0,
            MAX: 1000000
        },
        ANSWER: {
            MIN: 0,
            MAX: 1000000000000
        }
    }
};

// Export für globale Verfügbarkeit
window.CONFIG = CONFIG; 