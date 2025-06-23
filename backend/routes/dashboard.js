const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Contribution = require('../models/Contribution');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');

// GET /api/dashboard - Get dashboard statistics
router.get('/', async (req, res) => {
  try {
    // Get all active users
    const totalUsers = await User.countDocuments();
    // Get total contributions for current month and year
    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7); // YYYY-MM format

    const monthlyContributions = await Contribution.aggregate([
      {
        $match: {
          month: currentMonth
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalMonthlyContributions = monthlyContributions.length > 0 ? monthlyContributions[0].total : 0;

    // Get total contributions all time
    const totalContributions = await Contribution.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalAllTimeContributions = totalContributions.length > 0 ? totalContributions[0].total : 0;

    // Get active loans
    const activeLoans = await Loan.find({ status: 'active' });
    const totalActiveLoans = activeLoans.length;

    // Calculate total loan amount outstanding
    const totalLoanAmount = activeLoans.reduce((sum, loan) => sum + loan.remainingAmount, 0);

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

    // Calculate available funds
    const availableFunds = totalAllTimeContributions - totalLoanAmount + totalPaymentsAmount;
    // Calculate total interest earned (simplified calculation)
    // Interest = Total payments received - original loan amounts for paid loans
    const paidLoans = await Loan.find({ status: 'paid' });
    let totalInterest = 0;

    for (const loan of paidLoans) {
      const totalPaymentsForLoan = await Payment.aggregate([
        { $match: { loan: loan._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const paymentsReceived = totalPaymentsForLoan.length > 0 ? totalPaymentsForLoan[0].total : 0;
      totalInterest += Math.max(0, paymentsReceived - loan.amount);
    }

    // Add accrued interest on active loans
    for (const loan of activeLoans) {
      totalInterest += Math.max(0, loan.remainingAmount - loan.amount);
    }
    // Recent activities
    const recentContributions = await Contribution.find()
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentLoans = await Loan.find()
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentPayments = await Payment.find()
      .populate('loan')
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalMonthlyContributions,
          totalAllTimeContributions,
          totalActiveLoans,
          totalLoanAmount,
          totalPaymentsAmount,
          availableFunds,
          totalInterestEarned: totalInterest
        },
        recentActivity: {
          contributions: recentContributions,
          loans: recentLoans,
          payments: recentPayments
        }
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

// GET /api/dashboard/monthly-stats - Get monthly contribution statistics
router.get('/monthly-stats', async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const yearPrefix = currentYear.toString();

    const monthlyStats = await Contribution.aggregate([
      {
        $match: {
          month: { $regex: `^${yearPrefix}-` }
        }
      },
      {
        $group: {
          _id: '$month',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Convert YYYY-MM format to month numbers and fill missing months
    const months = Array.from({ length: 12 }, (_, i) => {
      const monthStr = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
      const monthData = monthlyStats.find(m => m._id === monthStr);
      return {
        month: i + 1,
        monthName: new Date(currentYear, i, 1).toLocaleString('default', { month: 'long' }),
        total: monthData ? monthData.total : 0,
        count: monthData ? monthData.count : 0
      };
    });

    res.json({
      success: true,
      data: {
        year: currentYear,
        months
      }
    });

  } catch (error) {
    console.error('Monthly stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching monthly statistics',
      error: error.message
    });
  }
});

module.exports = router;
