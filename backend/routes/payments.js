const express = require('express');
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const Loan = require('../models/Loan');
const User = require('../models/User');

const router = express.Router();

// Validation middleware
const validatePayment = [
  body('loan')
    .isMongoId()
    .withMessage('Valid loan ID is required'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Payment amount must be at least ₹0.01'),
  body('type')
    .isIn(['full', 'partial'])
    .withMessage('Payment type must be either "full" or "partial"'),
  body('note')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Note cannot exceed 200 characters'),
  body('paymentMethod')
    .optional()
    .isIn(['cash', 'bank_transfer', 'upi', 'cheque', 'other'])
    .withMessage('Invalid payment method'),
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

// GET /api/payments - Get all payments
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      user,
      loan,
      status = 'completed',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { status };
    if (user) query.user = user;
    if (loan) query.loan = loan;

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const payments = await Payment.find(query)
      .populate('user', 'name email')
      .populate('loan', 'amount description status')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: {
        payments,
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
      message: 'Error fetching payments',
      error: error.message
    });
  }
});

// GET /api/payments/:id - Get payment by ID
router.get('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('user', 'name email')
      .populate('loan', 'amount description status');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching payment',
      error: error.message
    });
  }
});

// POST /api/payments - Create new payment
router.post('/', validatePayment, handleValidationErrors, async (req, res) => {
  try {
    const { loan, amount, type, note, paymentMethod, reference } = req.body;

    // Verify loan exists and is active
    const loanDoc = await Loan.findById(loan);
    if (!loanDoc) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    if (loanDoc.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot make payment on inactive loan'
      });
    }

    // Apply compound interest before payment
    loanDoc.applyCompoundInterest();
    await loanDoc.save();

    // Validate payment amount
    if (amount > loanDoc.remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${amount}) exceeds remaining balance (₹${loanDoc.remainingAmount})`
      });
    }    // For full payment, use exact remaining amount
    const paymentAmount = type === 'full' ? loanDoc.remainingAmount : amount;

    // Calculate remaining amount after payment
    const remainingAfterPayment = loanDoc.remainingAmount - paymentAmount;

    const payment = new Payment({
      loan,
      user: loanDoc.user,
      amount: paymentAmount,
      type,
      note,
      paymentMethod,
      reference,
      remainingAfterPayment
    }); await payment.save();

    // Update the loan's remaining amount
    loanDoc.makePayment(paymentAmount);
    await loanDoc.save();

    // Populate details before sending response
    await payment.populate('user', 'name email');
    await payment.populate('loan', 'amount description status remainingAmount');

    res.status(201).json({
      success: true,
      message: 'Payment processed successfully',
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error processing payment',
      error: error.message
    });
  }
});

// PUT /api/payments/:id/status - Update payment status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status'
      });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    payment.status = status;
    await payment.save();

    await payment.populate('user', 'name email');
    await payment.populate('loan', 'amount description status');

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating payment status',
      error: error.message
    });
  }
});

// GET /api/payments/loan/:loanId - Get payments by loan
router.get('/loan/:loanId', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const payments = await Payment.getPaymentsByLoan(req.params.loanId)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Payment.countDocuments({
      loan: req.params.loanId,
      status: 'completed'
    });

    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    res.json({
      success: true,
      data: {
        payments,
        totalPaid,
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
      message: 'Error fetching loan payments',
      error: error.message
    });
  }
});

// GET /api/payments/user/:userId - Get payments by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const payments = await Payment.getPaymentsByUser(req.params.userId)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Payment.countDocuments({
      user: req.params.userId,
      status: 'completed'
    });

    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    res.json({
      success: true,
      data: {
        payments,
        totalPaid,
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
      message: 'Error fetching user payments',
      error: error.message
    });
  }
});

// GET /api/payments/month/:month - Get payments by month
router.get('/month/:month', async (req, res) => {
  try {
    const payments = await Payment.getPaymentsByMonth(req.params.month);

    const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

    res.json({
      success: true,
      data: {
        month: req.params.month,
        payments,
        totalPayments: payments.length,
        totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching monthly payments',
      error: error.message
    });
  }
});

// GET /api/payments/stats/total - Get total payments
router.get('/stats/total', async (req, res) => {
  try {
    const total = await Payment.getTotalPayments();

    res.json({
      success: true,
      data: {
        totalPayments: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching total payments',
      error: error.message
    });
  }
});

// DELETE /api/payments/:id - Delete payment (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (payment.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete completed payment'
      });
    }

    await Payment.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting payment',
      error: error.message
    });
  }
});

module.exports = router;
