const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Contribution = require('../models/Contribution');
const Loan = require('../models/Loan');

const router = express.Router();

// Validation middleware
const validateUser = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
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

// GET /api/users - Get all users
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const query = search ? {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    } : {};

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const users = await User.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-__v');

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
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
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('contributions')
      .populate('loans')
      .select('-__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

// POST /api/users - Create new user
router.post('/', validateUser, handleValidationErrors, async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = new User({
      name,
      email: email || undefined
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    if (error.code === 'DUPLICATE_NAME') {
      return res.status(400).json({
        success: false,
        message: 'User with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', validateUser, handleValidationErrors, async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email: email || undefined },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    if (error.code === 'DUPLICATE_NAME') {
      return res.status(400).json({
        success: false,
        message: 'User with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
});

// DELETE /api/users/:id - Delete user (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has active loans
    const activeLoans = await Loan.countDocuments({
      user: req.params.id,
      status: 'active'
    });

    if (activeLoans > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete user with active loans'
      });
    }

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
});

// GET /api/users/:id/summary - Get user financial summary
router.get('/:id/summary', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get latest contributions
    const recentContributions = await Contribution.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .limit(5);

    // Get active loans
    const activeLoans = await Loan.find({
      user: req.params.id,
      status: 'active'
    }).populate('payments');

    // Get total payments made
    const totalPayments = await Loan.aggregate([
      { $match: { user: user._id } },
      { $lookup: { from: 'payments', localField: '_id', foreignField: 'loan', as: 'payments' } },
      { $unwind: { path: '$payments', preserveNullAndEmptyArrays: true } },
      { $match: { 'payments.status': 'completed' } },
      { $group: { _id: null, total: { $sum: '$payments.amount' } } }
    ]);

    const summary = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        totalContributions: user.totalContributions,
        totalLoans: user.totalLoans,
        totalPayable: user.totalPayable
      },
      recentContributions,
      activeLoans: activeLoans.length,
      totalPaymentsMade: totalPayments[0]?.total || 0,
      joinedDate: user.createdAt
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user summary',
      error: error.message
    });
  }
});

module.exports = router;
