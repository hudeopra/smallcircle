const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function (email) {
        if (!email) return true; // Optional field
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email);
      },
      message: 'Please enter a valid email'
    }
  },
  totalContributions: {
    type: Number,
    default: 0,
    min: [0, 'Total contributions cannot be negative']
  },
  totalLoans: {
    type: Number,
    default: 0,
    min: [0, 'Total loans cannot be negative']
  },
  totalPayable: {
    type: Number,
    default: 0,
    min: [0, 'Total payable cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for contributions
userSchema.virtual('contributions', {
  ref: 'Contribution',
  localField: '_id',
  foreignField: 'user'
});

// Virtual for loans
userSchema.virtual('loans', {
  ref: 'Loan',
  localField: '_id',
  foreignField: 'user'
});

// Indexes
userSchema.index({ name: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware to ensure unique names
userSchema.pre('save', async function (next) {
  if (this.isModified('name')) {
    const existingUser = await mongoose.model('User').findOne({
      name: { $regex: new RegExp(`^${this.name}$`, 'i') },
      _id: { $ne: this._id }
    });

    if (existingUser) {
      const error = new Error('User with this name already exists');
      error.code = 'DUPLICATE_NAME';
      return next(error);
    }
  }
  next();
});

// Instance methods
userSchema.methods.updateTotals = async function () {
  const Contribution = mongoose.model('Contribution');
  const Loan = mongoose.model('Loan');

  // Calculate total contributions
  const contributionSum = await Contribution.aggregate([
    { $match: { user: this._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  // Calculate total loans (principal amounts)
  const loanSum = await Loan.aggregate([
    { $match: { user: this._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  // Calculate total payable (remaining amounts for active loans)
  const payableSum = await Loan.aggregate([
    { $match: { user: this._id, status: 'active' } },
    { $group: { _id: null, total: { $sum: '$remainingAmount' } } }
  ]);

  this.totalContributions = contributionSum[0]?.total || 0;
  this.totalLoans = loanSum[0]?.total || 0;
  this.totalPayable = payableSum[0]?.total || 0;

  return this.save();
};

module.exports = mongoose.model('User', userSchema);
