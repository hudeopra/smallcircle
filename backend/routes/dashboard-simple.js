const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Contribution = require('../models/Contribution');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');

// GET /api/dashboard - Get dashboard statistics (simplified)
router.get('/', async (req, res) => {
  try {
    console.log('Dashboard route called');

    // Get basic counts
    const totalUsers = await User.countDocuments();
    console.log('Total users:', totalUsers);

    // Get total contributions
    const totalContributions = await Contribution.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalAllTimeContributions = totalContributions.length > 0 ? totalContributions[0].total : 0;
    console.log('Total contributions:', totalAllTimeContributions);

    // Get active loans
    const activeLoans = await Loan.find({ status: 'active' });
    const totalActiveLoans = activeLoans.length;
    const totalLoanAmount = activeLoans.reduce((sum, loan) => sum + loan.remainingAmount, 0);
    console.log('Active loans:', totalActiveLoans, 'Total amount:', totalLoanAmount);

    // Get total payments
    const totalPayments = await Payment.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalPaymentsAmount = totalPayments.length > 0 ? totalPayments[0].total : 0;
    console.log('Total payments:', totalPaymentsAmount);    // Calculate total interest earned (ONLY from completed loans)
    let totalInterestEarned = 0;

    // Get completed loans and calculate interest earned from them
    const completedLoans = await Loan.find({ status: 'paid' });

    for (const loan of completedLoans) {
      // Only count interest from loans that have been fully paid
      const loanPayments = await Payment.find({ loan: loan._id, status: 'completed' });
      const totalPaidForLoan = loanPayments.reduce((sum, payment) => sum + payment.amount, 0);

      // Interest is only the amount paid above the original principal
      const interestFromLoan = Math.max(0, totalPaidForLoan - loan.amount);
      totalInterestEarned += interestFromLoan;
    }

    // Calculate available funds correctly
    // Available funds = contributions + interest earned from completed loans - active loan principals
    const activeLoansOriginalAmount = activeLoans.reduce((sum, loan) => sum + loan.amount, 0);
    const availableFunds = totalAllTimeContributions + totalInterestEarned - activeLoansOriginalAmount;

    console.log('Total interest earned/accrued:', totalInterestEarned);
    console.log('Sending response...'); res.json({
      success: true,
      data: {
        totalUsers,
        totalAvailableFunds: availableFunds,
        totalActiveLoans: totalLoanAmount,
        totalInterestEarned: totalInterestEarned
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
});

module.exports = router;
