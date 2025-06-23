const express = require('express');
const { body, validationResult } = require('express-validator');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Contribution = require('../models/Contribution');
const Payment = require('../models/Payment');

const router = express.Router();

// Validation middleware
const validateLoan = [
  body('user')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('amount')
    .isFloat({ min: 100, max: 1000000 })
    .withMessage('Loan amount must be between ₹100 and ₹10,00,000'),
  body('description')
    .isLength({ min: 5, max: 500 })
    .withMessage('Description must be between 5 and 500 characters'),
  body('interestRate')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Interest rate must be between 0 and 1'),
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Helper function to check available funds
const checkAvailableFunds = async (requestedAmount) => {
  const totalContributions = await Contribution.getTotalContributions();
  const totalPayments = await Payment.getTotalPayments();
  const totalActiveLoans = await Loan.getTotalActiveLoans();

  const availableFunds = (totalContributions + totalPayments) - totalActiveLoans;

  return {
    availableFunds,
    canApprove: requestedAmount <= availableFunds,
    totalContributions,
    totalPayments,
    totalActiveLoans
  };
};

// GET /api/loans - Get all loans
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      user,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    if (user) query.user = user;
    if (status) query.status = status;

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const loans = await Loan.find(query)
      .populate('user', 'name email')
      .populate('payments')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Loan.countDocuments(query);

    res.json({
      success: true,
      data: {
        loans,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching loans',
      error: error.message
    });
  }
});

// GET /api/loans/:id - Get loan by ID
router.get('/:id', async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate('user', 'name email')
      .populate('payments');

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    res.json({
      success: true,
      data: loan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching loan',
      error: error.message
    });
  }
});

// POST /api/loans - Create new loan
router.post('/', validateLoan, handleValidationErrors, async (req, res) => {
  try {
    const { user, amount, description, interestRate } = req.body;

    // Verify user exists
    const userExists = await User.findById(user);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check available funds
    const fundsCheck = await checkAvailableFunds(amount);
    if (!fundsCheck.canApprove) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Available: ₹${fundsCheck.availableFunds}, Requested: ₹${amount}`,
        data: {
          availableFunds: fundsCheck.availableFunds,
          requestedAmount: amount,
          totalContributions: fundsCheck.totalContributions,
          totalPayments: fundsCheck.totalPayments,
          totalActiveLoans: fundsCheck.totalActiveLoans
        }
      });
    }

    const loan = new Loan({
      user,
      amount,
      description,
      interestRate: interestRate || process.env.ANNUAL_INTEREST_RATE || 0.20
    });

    await loan.save();

    // Populate user details before sending response
    await loan.populate('user', 'name email');

    res.status(201).json({
      success: true,
      message: 'Loan approved successfully',
      data: loan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating loan',
      error: error.message
    });
  }
});

// PUT /api/loans/:id - Update loan
router.put('/:id', async (req, res) => {
  try {
    const { description, status } = req.body;

    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    // Only allow certain updates
    if (description) loan.description = description;
    if (status && ['active', 'cancelled', 'defaulted'].includes(status)) {
      loan.status = status;
    }

    await loan.save();
    await loan.populate('user', 'name email');

    res.json({
      success: true,
      message: 'Loan updated successfully',
      data: loan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating loan',
      error: error.message
    });
  }
});

// GET /api/loans/user/:userId - Get loans by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = { user: req.params.userId };
    if (status) query.status = status;

    const loans = await Loan.find(query)
      .populate('payments')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Loan.countDocuments(query);

    res.json({
      success: true,
      data: {
        loans,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user loans',
      error: error.message
    });
  }
});

// POST /api/loans/:id/compound - Apply compound interest to loan
router.post('/:id/compound', async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    if (loan.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Can only apply compound interest to active loans'
      });
    }

    const oldAmount = loan.remainingAmount;
    loan.applyCompoundInterest();
    await loan.save();

    res.json({
      success: true,
      message: 'Compound interest applied successfully',
      data: {
        loanId: loan._id,
        oldAmount,
        newAmount: loan.remainingAmount,
        interestAdded: loan.remainingAmount - oldAmount,
        compoundingMonths: loan.compoundingMonths
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error applying compound interest',
      error: error.message
    });
  }
});

// POST /api/loans/compound-all - Apply compound interest to all active loans
router.post('/compound-all', async (req, res) => {
  try {
    const updatedCount = await Loan.updateCompoundInterestForAll();

    res.json({
      success: true,
      message: `Compound interest applied to ${updatedCount} active loans`,
      data: {
        updatedLoans: updatedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error applying compound interest to all loans',
      error: error.message
    });
  }
});

// GET /api/loans/stats/summary - Get loan statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const totalActiveLoans = await Loan.getTotalActiveLoans();
    const totalInterestEarned = await Loan.getTotalInterestEarned();

    const loanCounts = await Loan.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const overdueLoanCount = await Loan.countDocuments({
      status: 'active',
      dueDate: { $lt: new Date() }
    });

    res.json({
      success: true,
      data: {
        totalActiveLoans,
        totalInterestEarned,
        loanCounts,
        overdueLoanCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching loan statistics',
      error: error.message
    });
  }
});

// GET /api/loans/available-funds - Get available funds for new loans
router.get('/available-funds', async (req, res) => {
  try {
    const fundsInfo = await checkAvailableFunds(0);

    res.json({
      success: true,
      data: fundsInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching available funds',
      error: error.message
    });
  }
});

module.exports = router;
