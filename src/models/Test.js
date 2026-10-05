import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true }, // "1", "2", ..., "36a", "36b"
    kind: { type: String, enum: ['closed', 'open'], required: true },
    key: { type: [String], required: true }, // yopiq: ["b"], ochiq: ["0.5", "1/2"]
    correctCount: { type: Number, default: null },
    difficulty: { type: Number, default: null }, // Rasch qiyinligi (logit)
    se: { type: Number, default: null },
    infit: { type: Number, default: null },
    outfit: { type: Number, default: null },
    ptBiserial: { type: Number, default: null },
    flag: { type: String, default: null }, // adminga ogohlantirish (masalan, kalit xato bo'lishi mumkin)
  },
  { _id: false },
);

const testSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    createdBy: { type: Number, required: true },
    items: { type: [itemSchema], required: true },
    status: { type: String, enum: ['open', 'closing', 'closed'], default: 'open', index: true },
    closedAt: { type: Date, default: null },
    // Yopilgandan keyin natijalar avval adminga ko'rsatiladi; qatnashchilarga
    // faqat admin «Natijalarni yuborish» ni bosgandan keyin yuboriladi
    publishedAt: { type: Date, default: null },
    stats: {
      participants: { type: Number, default: 0 },
      meanTheta: { type: Number, default: null },
      sdTheta: { type: Number, default: null },
      iterations: { type: Number, default: null },
      converged: { type: Boolean, default: null },
      method: { type: String, default: null },
      reliability: { type: Number, default: null },
      kr20: { type: Number, default: null },
    },
  },
  { timestamps: true },
);

testSchema.virtual('closedCount').get(function () {
  return this.items.filter((i) => i.kind === 'closed').length;
});

testSchema.virtual('openCount').get(function () {
  return this.items.filter((i) => i.kind === 'open').length;
});

export const Test = mongoose.model('Test', testSchema);
