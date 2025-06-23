const mongoose = require('mongoose');

const contributionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [1, 'Amount must be at least ₹1']
  },
  month: {
    type: String,
    required: [true, 'Month is required'],
    validate: {
      validator: function (month) {
        return /^\d{4}-\d{2}$/.test(month); // YYYY-MM format
      },
      message: 'Month must be in YYYY-MM format'
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters'],
    default: 'Monthly contribution'
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
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate contributions for same user in same month
contributionSchema.index({ user: 1, month: 1 }, { unique: true });

// Indexes for queries
contributionSchema.index({ createdAt: -1 });
contributionSchema.index({ month: -1 });
contributionSchema.index({ amount: -1 });

// Pre-save middleware to validate month
contributionSchema.pre('save', function (next) {
  // Ensure month is in correct format
  if (!this.month) {
    this.month = new Date().toISOString().slice(0, 7);
  }
  next();
});

// Static methods
contributionSchema.statics.getTotalContributions = function () {
  return this.aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).then(result => result[0]?.total || 0);
};

contributionSchema.statics.getContributionsByMonth = function (month) {
  return this.find({ month }).populate('user', 'name email');
};

contributionSchema.statics.getUserContributions = function (userId) {
  return this.find({ user: userId }).sort({ createdAt: -1 });
};

// Post-save middleware to update user totals
contributionSchema.post('save', async function () {
  const User = mongoose.model('User');
  const user = await User.findById(this.user);
  if (user) {
    await user.updateTotals();
  }
});

// Post-remove middleware to update user totals
contributionSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    const User = mongoose.model('User');
    const user = await User.findById(doc.user);
    if (user) {
      await user.updateTotals();
    }
  }
});

module.exports = mongoose.model('Contribution', contributionSchema);
