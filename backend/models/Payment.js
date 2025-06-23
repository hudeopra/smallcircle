const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  loan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: [true, 'Loan is required']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0.01, 'Payment amount must be at least ₹0.01']
  },
  type: {
    type: String,
    enum: ['full', 'partial'],
    required: [true, 'Payment type is required']
  },
  note: {
    type: String,
    trim: true,
    maxlength: [200, 'Note cannot exceed 200 characters']
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'upi', 'cheque', 'other'],
    default: 'cash'
  },
  reference: {
    type: String,
    trim: true,
    maxlength: [50, 'Reference cannot exceed 50 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  remainingAfterPayment: {
    type: Number,
    required: true,
    min: [0, 'Remaining amount cannot be negative']
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ loan: 1 });
paymentSchema.index({ user: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ loan: 1, createdAt: -1 });

// Pre-save middleware to validate payment
paymentSchema.pre('save', async function (next) {
  if (this.isNew) {
    const Loan = mongoose.model('Loan');
    const loan = await Loan.findById(this.loan);

    if (!loan) {
      return next(new Error('Loan not found'));
    }

    if (loan.status !== 'active') {
      return next(new Error('Cannot make payment on inactive loan'));
    }

    if (this.amount > loan.remainingAmount) {
      return next(new Error('Payment amount exceeds remaining loan balance'));
    }

    // Set the user from loan if not provided
    if (!this.user) {
      this.user = loan.user;
    }

    // Calculate remaining amount after payment
    this.remainingAfterPayment = loan.remainingAmount - this.amount;
  }
  next();
});

// Post-save middleware to update loan
paymentSchema.post('save', async function () {
  if (this.status === 'completed') {
    const Loan = mongoose.model('Loan');
    const loan = await Loan.findById(this.loan);

    if (loan) {
      loan.makePayment(this.amount);
      await loan.save();
    }
  }
});

// Static methods
paymentSchema.statics.getTotalPayments = function () {
  return this.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).then(result => result[0]?.total || 0);
};

paymentSchema.statics.getPaymentsByLoan = function (loanId) {
  return this.find({ loan: loanId, status: 'completed' })
    .sort({ createdAt: -1 })
    .populate('user', 'name email');
};

paymentSchema.statics.getPaymentsByUser = function (userId) {
  return this.find({ user: userId, status: 'completed' })
    .sort({ createdAt: -1 })
    .populate('loan', 'amount description');
};

paymentSchema.statics.getPaymentsByMonth = function (month) {
  const startOfMonth = new Date(month + '-01');
  const endOfMonth = new Date(startOfMonth);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);

  return this.find({
    status: 'completed',
    createdAt: {
      $gte: startOfMonth,
      $lt: endOfMonth
    }
  }).populate('user', 'name email').populate('loan', 'amount description');
};

// Instance methods
paymentSchema.methods.cancel = function () {
  if (this.status !== 'pending') {
    throw new Error('Can only cancel pending payments');
  }

  this.status = 'cancelled';
  return this.save();
};

paymentSchema.methods.complete = function () {
  if (this.status !== 'pending') {
    throw new Error('Can only complete pending payments');
  }

  this.status = 'completed';
  return this.save();
};

module.exports = mongoose.model('Payment', paymentSchema);
