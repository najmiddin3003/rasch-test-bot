import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, unique: true },
    fullName: { type: String, default: null },
    username: { type: String, default: null },
    firstName: { type: String, default: null },
    // Suhbat holati (FSM): qaysi bosqichda ekanligi va oraliq ma'lumotlar
    state: { type: String, default: null },
    stateData: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);

export const User = mongoose.model('User', userSchema);
