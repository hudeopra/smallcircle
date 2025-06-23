const express = require('express');
const router = express.Router();
const Loan = require('../models/Loan');
const User = require('../models/User');
const Contribution = require('../models/Contribution');
const Payment = require('../models/Payment');

// Simple available funds endpoint (MUST be before /:id route)
router.get('/available-funds', async (req, res) => {
  try {
    // Get total contributions
    const contributions = await Contribution.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalContributions = contributions.length > 0 ? contributions[0].total : 0;    // Get all completed payments
    const payments = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRepayments = payments.length > 0 ? payments[0].total : 0;

    // Calculate total interest earned from completed loans
    const completedLoans = await Loan.find({ status: 'paid' });
    let totalInterestEarned = 0;

    for (const loan of completedLoans) {
      const loanPayments = await Payment.aggregate([
        { $match: { loan: loan._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const totalPaidForLoan = loanPayments.length > 0 ? loanPayments[0].total : 0;
      const interestForLoan = Math.max(0, totalPaidForLoan - loan.amount);
      totalInterestEarned += interestForLoan;
    }

    // Get active loans (original loan amounts, not remaining)
    const activeLoans = await Loan.find({ status: 'active' });
    const totalActiveLoans = activeLoans.reduce((sum, loan) => sum + loan.amount, 0);

    // Available funds = contributions + interest earned - active loan principals
    const availableFunds = Math.max(0, totalContributions + totalInterestEarned - totalActiveLoans);

    res.json({
      success: true, data: {
        availableFunds,
        totalContributions,
        totalRepayments,
        totalInterestEarned,
        totalActiveLoans
      }
    });
  } catch (error) {
    console.error('Available funds error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available funds',
      error: error.message
    });
  }
});

// GET /api/loans - Get all loans with pagination
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
    console.error('Loans fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching loans',
      error: error.message
    });
  }
});

// GET /api/loans/:id - Get a specific loan by ID (MUST be after specific routes)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('Fetching loan with ID:', id);

    const loan = await Loan.findById(id).populate('user', 'name email');

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    console.log('Found loan:', loan._id);

    res.json({
      success: true,
      data: loan
    });
  } catch (error) {
    console.error('Loan fetch by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching loan',
      error: error.message
    });
  }
});

// Simple loan creation route
router.post('/', async (req, res) => {
  try {
    console.log('Loan creation request:', req.body);

    const { user, amount, description } = req.body;

    // Basic validation
    if (!user || !amount || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: user, amount, description'
      });
    }

    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum loan amount is ₹100'
      });
    }

    // Verify user exists
    const userExists = await User.findById(user);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('Creating loan for user:', userExists.name);

    // Create loan with simple logic
    const loan = new Loan({
      user,
      amount,
      description,
      interestRate: 0.20  // 20% annual
    });

    console.log('Saving loan...');
    await loan.save();
    console.log('Loan saved successfully:', loan._id);

    // Populate user details
    await loan.populate('user', 'name email');

    res.status(201).json({
      success: true,
      message: 'Loan approved successfully',
      data: loan
    });

  } catch (error) {
    console.error('Loan creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating loan',
      error: error.message
    });
  }
});

module.exports = router;
