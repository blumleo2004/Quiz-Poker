const Joi = require('joi');

const joinGameSchema = Joi.object({
  name: Joi.string().min(2).max(20).required().messages({
    'string.base': 'Name muss ein Text sein.',
    'string.min': 'Name muss mindestens 2 Zeichen lang sein.',
    'string.max': 'Name darf maximal 20 Zeichen lang sein.',
    'any.required': 'Name ist erforderlich.'
  }),
  role: Joi.string().valid('player', 'host').required().messages({
    'any.only': 'Rolle muss entweder "player" oder "host" sein.',
    'any.required': 'Rolle ist erforderlich.'
  }),
  token: Joi.string().optional() // For reconnection
});

const playerActionSchema = Joi.object({
  action: Joi.string().valid('fold', 'call', 'raise', 'check', 'all-in').required(),
  amount: Joi.number().integer().min(0).when('action', {
    is: 'raise',
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

const submitAnswerSchema = Joi.object({
  answer: Joi.alternatives().try(
    Joi.number(),
    Joi.string().trim().min(1)
  ).required().messages({
    'alternatives.match': 'Antwort muss eine Zahl oder ein Text sein.',
    'any.required': 'Antwort ist erforderlich.'
  })
});

module.exports = {
  joinGameSchema,
  playerActionSchema,
  submitAnswerSchema
};
