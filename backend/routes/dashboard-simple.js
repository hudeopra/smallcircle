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
    console.log('Total payments:', totalPaymentsAmount);    // Calculate available funds
    const availableFunds = totalAllTimeContributions + totalPaymentsAmount - totalLoanAmount;    // Calculate total interest earned/accrued
    // Show the interest that's built into the loan system

    let totalInterestEarned = 0;

    // Get all loans (active and paid)
    const allLoans = await Loan.find({});

    for (const loan of allLoans) {
      // For active loans: interest = remainingAmount - originalAmount  
      // For paid loans: interest = totalPayments - originalAmount

      if (loan.status === 'active') {
        // Interest accrued in remaining balance
        const interestInRemaining = Math.max(0, loan.remainingAmount - loan.amount);
        totalInterestEarned += interestInRemaining;
      }

      // Add interest from payments made (payments above original principal)
      const loanPayments = await Payment.find({ loan: loan._id, status: 'completed' });
      const totalPaidForLoan = loanPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const interestFromPayments = Math.max(0, totalPaidForLoan - loan.amount);
      totalInterestEarned += interestFromPayments;
    }

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
