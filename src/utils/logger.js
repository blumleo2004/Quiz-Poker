const winston = require('winston');
const path = require('path');

// Logger-Konfiguration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'quiz-poker' },
  transports: [
    // Schreibe alle Logs mit Level 'error' und darunter in 'error.log'
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/error.log'), 
      level: 'error' 
    }),
    // Schreibe alle Logs mit Level 'info' und darunter in 'combined.log'
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/combined.log') 
    })
  ]
});

// Wenn wir nicht in Produktion sind, log auch zur Console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Logging-Funktionen
const logGameEvent = (eventType, data) => {
  logger.info({
    event: eventType,
    data,
    timestamp: new Date().toISOString()
  });
};

const logError = (error, context = {}) => {
  logger.error({
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  logGameEvent,
  logError
}; 