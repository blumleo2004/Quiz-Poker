const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { 
    type: String, 
    required: [true, 'Frage ist erforderlich'],
    trim: true,
    minlength: [10, 'Frage muss mindestens 10 Zeichen lang sein'],
    maxlength: [500, 'Frage darf maximal 500 Zeichen lang sein']
  },
  answer: { 
    type: String, 
    required: [true, 'Antwort ist erforderlich'],
    trim: true
  },
  hints: {
    type: [String],
    validate: [
      {
        validator: function(hints) {
          return hints.length >= 1 && hints.length <= 3;
        },
        message: 'Es müssen zwischen 1 und 3 Hinweise vorhanden sein'
      },
      {
        validator: function(hints) {
          return hints.every(hint => hint.length >= 5 && hint.length <= 200);
        },
        message: 'Jeder Hinweis muss zwischen 5 und 200 Zeichen lang sein'
      }
    ]
  },
  difficulty: {
    type: String,
    enum: ['leicht', 'mittel', 'schwer'],
    default: 'mittel'
  },
  category: {
    type: String,
    required: [true, 'Kategorie ist erforderlich'],
    enum: ['Allgemein', 'Geschichte', 'Geographie', 'Wissenschaft', 'Sport', 'Kultur']
  },
  created: {
    type: Date,
    default: Date.now
  },
  timesUsed: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indizes für bessere Abfrageleistung
questionSchema.index({ category: 1, difficulty: 1 });
questionSchema.index({ timesUsed: 1 });

// Virtuelle Felder
questionSchema.virtual('isNew').get(function() {
  return this.timesUsed === 0;
});

// Methoden
questionSchema.methods.incrementUsage = async function() {
  this.timesUsed += 1;
  return this.save();
};

// Statische Methoden
questionSchema.statics.findRandomQuestion = async function(filter = {}) {
  const count = await this.countDocuments(filter);
  const random = Math.floor(Math.random() * count);
  return this.findOne(filter).skip(random);
};

module.exports = mongoose.model('Question', questionSchema); 