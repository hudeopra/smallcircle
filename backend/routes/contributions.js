const express = require('express');
const { body, validationResult } = require('express-validator');
const Contribution = require('../models/Contribution');
const User = require('../models/User');

const router = express.Router();

// Validation middleware
const validateContribution = [
  body('user')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least ₹1'),
  body('month')
    .optional()
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('Month must be in YYYY-MM format'),
  body('description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters'),
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

// GET /api/contributions - Get all contributions
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      user,
      month,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    if (user) query.user = user;
    if (month) query.month = month;

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const contributions = await Contribution.find(query)
      .populate('user', 'name email')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Contribution.countDocuments(query);

    res.json({
      success: true,
      data: {
        contributions,
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
      message: 'Error fetching contributions',
      error: error.message
    });
  }
});

// GET /api/contributions/:id - Get contribution by ID
router.get('/:id', async (req, res) => {
  try {
    const contribution = await Contribution.findById(req.params.id)
      .populate('user', 'name email');

    if (!contribution) {
      return res.status(404).json({
        success: false,
        message: 'Contribution not found'
      });
    }

    res.json({
      success: true,
      data: contribution
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contribution',
      error: error.message
    });
  }
});

// POST /api/contributions - Create new contribution
router.post('/', validateContribution, handleValidationErrors, async (req, res) => {
  try {
    const { user, amount, month, description, paymentMethod, reference } = req.body;

    // Verify user exists
    const userExists = await User.findById(user);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Set month to current month if not provided
    const contributionMonth = month || new Date().toISOString().slice(0, 7);

    const contribution = new Contribution({
      user,
      amount,
      month: contributionMonth,
      description,
      paymentMethod,
      reference
    });

    await contribution.save();

    // Populate user details before sending response
    await contribution.populate('user', 'name email');

    res.status(201).json({
      success: true,
      message: 'Contribution added successfully',
      data: contribution
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User has already contributed for this month'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating contribution',
      error: error.message
    });
  }
});

// PUT /api/contributions/:id - Update contribution
router.put('/:id', validateContribution, handleValidationErrors, async (req, res) => {
  try {
    const { amount, description, paymentMethod, reference } = req.body;

    const contribution = await Contribution.findByIdAndUpdate(
      req.params.id,
      { amount, description, paymentMethod, reference },
      { new: true, runValidators: true }
    ).populate('user', 'name email');

    if (!contribution) {
      return res.status(404).json({
        success: false,
        message: 'Contribution not found'
      });
    }

    res.json({
      success: true,
      message: 'Contribution updated successfully',
      data: contribution
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating contribution',
      error: error.message
    });
  }
});

// DELETE /api/contributions/:id - Delete contribution
router.delete('/:id', async (req, res) => {
  try {
    const contribution = await Contribution.findByIdAndDelete(req.params.id);

    if (!contribution) {
      return res.status(404).json({
        success: false,
        message: 'Contribution not found'
      });
    }

    res.json({
      success: true,
      message: 'Contribution deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting contribution',
      error: error.message
    });
  }
});

// GET /api/contributions/user/:userId - Get contributions by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const contributions = await Contribution.getUserContributions(req.params.userId)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Contribution.countDocuments({ user: req.params.userId });

    res.json({
      success: true,
      data: {
        contributions,
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
      message: 'Error fetching user contributions',
      error: error.message
    });
  }
});

// GET /api/contributions/month/:month - Get contributions by month
router.get('/month/:month', async (req, res) => {
  try {
    const contributions = await Contribution.getContributionsByMonth(req.params.month);

    const totalAmount = contributions.reduce((sum, contrib) => sum + contrib.amount, 0);

    res.json({
      success: true,
      data: {
        month: req.params.month,
        contributions,
        totalContributions: contributions.length,
        totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching monthly contributions',
      error: error.message
    });
  }
});

// GET /api/contributions/stats/total - Get total contributions
router.get('/stats/total', async (req, res) => {
  try {
    const total = await Contribution.getTotalContributions();

    res.json({
      success: true,
      data: {
        totalContributions: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching total contributions',
      error: error.message
    });
  }
});

module.exports = router;
