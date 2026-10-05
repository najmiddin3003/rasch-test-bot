import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema(
  {
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
    userId: { type: Number, required: true, index: true },
    fullName: { type: String, required: true },
    username: { type: String, default: null },
    answers: { type: [String], required: true }, // test.items tartibida
    correct: { type: [Number], required: true }, // 1 — to'g'ri, 0 — xato
    rawScore: { type: Number, required: true },
    // Test yopilganda to'ldiriladi
    theta: { type: Number, default: null },
    se: { type: Number, default: null },
    tScore: { type: Number, default: null },
    grade: { type: String, default: null },
    rank: { type: Number, default: null },
    infit: { type: Number, default: null },
    outfit: { type: Number, default: null },
    notified: { type: Boolean, default: false },
    notifyAttempts: { type: Number, default: 0 },
    simulated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

submissionSchema.index({ test: 1, userId: 1 }, { unique: true });

export const Submission = mongoose.model('Submission', submissionSchema);
