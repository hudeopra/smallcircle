const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  amount: {
    type: Number,
    required: [true, 'Loan amount is required'],
    min: [100, 'Minimum loan amount is ₹100'],
    max: [1000000, 'Maximum loan amount is ₹10,00,000']
  },
  description: {
    type: String,
    required: [true, 'Loan description is required'],
    trim: true,
    minlength: [5, 'Description must be at least 5 characters'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  interestRate: {
    type: Number,
    required: true,
    default: 0.20, // 20% annual
    min: [0, 'Interest rate cannot be negative'],
    max: [1, 'Interest rate cannot exceed 100%']
  }, monthlyInterest: {
    type: Number
  },
  totalPayable: {
    type: Number
  },
  remainingAmount: {
    type: Number
  },
  status: {
    type: String,
    enum: ['active', 'paid', 'defaulted', 'cancelled'],
    default: 'active'
  }, dueDate: {
    type: Date
  },
  lastCompoundDate: {
    type: Date,
    default: Date.now
  },
  compoundingMonths: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for payments
loanSchema.virtual('payments', {
  ref: 'Payment',
  localField: '_id',
  foreignField: 'loan'
});

// Indexes
loanSchema.index({ user: 1 });
loanSchema.index({ status: 1 });
loanSchema.index({ dueDate: 1 });
loanSchema.index({ createdAt: -1 });
loanSchema.index({ user: 1, status: 1 });

// Pre-save middleware to calculate interest
loanSchema.pre('save', function (next) {
  if (this.isNew) {
    this.monthlyInterest = (this.amount * this.interestRate) / 12;
    this.totalPayable = this.amount + this.monthlyInterest;
    this.remainingAmount = this.totalPayable;

    // Set due date to next month
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    this.dueDate = nextMonth;
  }
  next();
});

// Instance methods
loanSchema.methods.applyCompoundInterest = function () {
  if (this.status !== 'active') return this;

  const currentDate = new Date();
  const lastCompound = new Date(this.lastCompoundDate);

  // Calculate months difference
  const monthsDiff = (currentDate.getFullYear() - lastCompound.getFullYear()) * 12 +
    (currentDate.getMonth() - lastCompound.getMonth());

  if (monthsDiff > 0) {
    const monthlyRate = this.interestRate / 12;

    // Apply compound interest
    this.remainingAmount = this.remainingAmount * Math.pow(1 + monthlyRate, monthsDiff);
    this.totalPayable = this.remainingAmount;
    this.compoundingMonths += monthsDiff;
    this.lastCompoundDate = currentDate;
  }

  return this;
};

loanSchema.methods.makePayment = function (paymentAmount) {
  if (this.status !== 'active') {
    throw new Error('Cannot make payment on inactive loan');
  }

  if (paymentAmount > this.remainingAmount) {
    throw new Error('Payment amount exceeds remaining balance');
  }

  this.remainingAmount -= paymentAmount;

  if (this.remainingAmount <= 0.01) { // Account for floating point precision
    this.remainingAmount = 0;
    this.status = 'paid';
  }

  return this;
};

// Static methods
loanSchema.statics.getTotalActiveLoans = function () {
  return this.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).then(result => result[0]?.total || 0);
};

loanSchema.statics.getTotalInterestEarned = function () {
  return this.aggregate([
    {
      $lookup: {
        from: 'payments',
        localField: '_id',
        foreignField: 'loan',
        as: 'payments'
      }
    },
    {
      $project: {
        amount: 1,
        status: 1,
        remainingAmount: 1,
        totalPayments: { $sum: '$payments.amount' },
        interestEarned: {
          $cond: {
            if: { $eq: ['$status', 'active'] },
            then: { $subtract: ['$remainingAmount', '$amount'] },
            else: { $subtract: ['$totalPayments', '$amount'] }
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        totalInterest: { $sum: '$interestEarned' }
      }
    }
  ]).then(result => result[0]?.totalInterest || 0);
};

loanSchema.statics.updateCompoundInterestForAll = async function () {
  const activeLoans = await this.find({ status: 'active' });

  for (const loan of activeLoans) {
    loan.applyCompoundInterest();
    await loan.save();
  }

  return activeLoans.length;
};

// Post-save middleware to update user totals
loanSchema.post('save', async function () {
  const User = mongoose.model('User');
  const user = await User.findById(this.user);
  if (user) {
    await user.updateTotals();
  }
});

// Post-remove middleware to update user totals
loanSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    const User = mongoose.model('User');
    const user = await User.findById(doc.user);
    if (user) {
      await user.updateTotals();
    }
  }
});

module.exports = mongoose.model('Loan', loanSchema);
