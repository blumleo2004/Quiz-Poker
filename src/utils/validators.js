// Validierungsregeln
const VALIDATION_RULES = {
  bet: {
    min: 0,
    max: 1000000,
    type: 'number'
  },
  raiseAmount: { // Specific for the amount a player raises by
    min: 1, // A raise must be at least 1 unit
    max: 1000000, // Same max as a bet
    type: 'number'
  },
  answer: {
    min: 0,
    max: 1000000000000,
    type: 'number'
  },
  name: {
    minLength: 2,
    maxLength: 20,
    type: 'string'
  }
};

// Allgemeine Validierungsfunktion
const validateInput = (input, type) => {
  const rules = VALIDATION_RULES[type];
  if (!rules) {
    return {
      isValid: false,
      message: `Ungültiger Validierungstyp: ${type}`
    };
  }

  // Typ-Prüfung
  if (rules.type === 'number') {
    if (isNaN(input)) {
      return {
        isValid: false,
        message: 'Eingabe muss eine Zahl sein'
      };
    }
    const num = Number(input);
    if (num < rules.min || num > rules.max) {
      return {
        isValid: false,
        message: `Zahl muss zwischen ${rules.min} und ${rules.max} liegen`
      };
    }
  } else if (rules.type === 'string') {
    if (typeof input !== 'string') {
      return {
        isValid: false,
        message: 'Eingabe muss ein Text sein'
      };
    }
    if (input.length < rules.minLength || input.length > rules.maxLength) {
      return {
        isValid: false,
        message: `Text muss zwischen ${rules.minLength} und ${rules.maxLength} Zeichen lang sein`
      };
    }
  }

  return {
    isValid: true,
    message: 'Validierung erfolgreich'
  };
};

// Spezifische Validierungsfunktionen
const validateBet = (bet) => validateInput(bet, 'bet');
const validateAnswer = (answer) => validateInput(answer, 'answer');
const validatePlayerName = (name) => validateInput(name, 'name');
const validateRaiseAmount = (amount) => validateInput(amount, 'raiseAmount');

// Validiere ein komplettes Spieler-Objekt
const validatePlayer = (player) => {
  const errors = [];
  
  const nameValidation = validatePlayerName(player.name);
  if (!nameValidation.isValid) {
    errors.push(nameValidation.message);
  }

  if (!['player', 'host'].includes(player.role)) {
    errors.push('Ungültige Spielerrolle');
  }

  if (typeof player.balance !== 'number' || player.balance < 0) {
    errors.push('Ungültiges Guthaben');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  validateBet,
  validateAnswer,
  validatePlayerName,
  validatePlayer,
  validateRaiseAmount // Export new validator
};