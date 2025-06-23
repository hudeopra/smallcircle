const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Contribution = require('../models/Contribution');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');

// GET /api/dashboard - Get dashboard statistics
router.get('/', async (req, res) => {
  try {
    // Get basic counts (start simple, just like the original frontend)
    const totalUsers = await User.countDocuments();

    // Get total contributions (available funds)
    const totalContributions = await Contribution.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalAvailableFunds = totalContributions.length > 0 ? totalContributions[0].total : 0;

    // Get total active loan amounts
    const activeLoans = await Loan.find({ status: 'active' });
    const totalActiveLoans = activeLoans.reduce((sum, loan) => sum + loan.amount, 0);

    // Calculate total interest earned (simplified)
    const totalInterestEarned = 0; // Start with 0, can be enhanced later

    res.json({
      success: true,
      data: {
        totalUsers,
        totalAvailableFunds,
        totalActiveLoans,
        totalInterestEarned
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
});

module.exports = router;
