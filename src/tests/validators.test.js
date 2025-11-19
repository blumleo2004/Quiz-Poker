const { validatePlayerName, validateAnswer, validateRaiseAmount, validateBet } = require('../utils/validators');

describe('Validators', () => {
  describe('validatePlayerName', () => {
    it('should validate a correct name', () => {
      const result = validatePlayerName('Player1');
      expect(result.isValid).toBe(true);
    });

    it('should reject a name that is too short', () => {
      const result = validatePlayerName('A');
      expect(result.isValid).toBe(false);
    });

    it('should reject a name that is too long', () => {
      const result = validatePlayerName('A'.repeat(21));
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateAnswer', () => {
    it('should validate a correct answer', () => {
      const result = validateAnswer(42);
      expect(result.isValid).toBe(true);
    });

    it('should reject a negative answer', () => {
      const result = validateAnswer(-1);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateRaiseAmount', () => {
    it('should validate a correct raise amount', () => {
      const result = validateRaiseAmount(100);
      expect(result.isValid).toBe(true);
    });

    it('should reject a zero raise amount', () => {
        // Assuming min raise is 1 based on validators.js
      const result = validateRaiseAmount(0);
      expect(result.isValid).toBe(false);
    });
  });
});
