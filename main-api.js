// Money Management App - SmallCircle (API Version)
class MoneyManager {
  constructor() {
    this.users = [];
    this.currentUserId = null;
    this.currentLoanId = null;
    this.monthlyContribution = 500; // Default monthly contribution
    this.interestRate = 0.20; // 20% annual interest
    this.apiBaseUrl = 'https://smallcircle-backend.onrender.com/api';
    this.init();
  }

  async init() {
    try {
      await this.loadUsers();
      this.loadDashboard();
      this.setupEventListeners();
      await this.updateDashboardStats();
    } catch (error) {
      console.error('Initialization error:', error);
      this.showToast('Failed to initialize app. Please check backend connection.', 'error');
    }
  }

  setupEventListeners() {
    // Create User Form
    document.getElementById('createUserForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.createUser();
    });

    // Loan Form
    document.getElementById('loanForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.applyForLoan();
    });

    // Loan Amount Input - Real-time calculation
    document.getElementById('loanAmount').addEventListener('input', (e) => {
      this.calculateLoanDetails(parseFloat(e.target.value) || 0);
    });

    // Payment Form
    document.getElementById('paymentForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.makePayment();
    });

    // Payment type radio buttons
    document.querySelectorAll('input[name="paymentType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.togglePartialPaymentInput(e.target.value);
      });
    });
  }

  // API Helper Methods
  async apiCall(endpoint, method = 'GET', data = null) {
    try {
      const config = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (data) {
        config.body = JSON.stringify(data);
      }

      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, config);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'API request failed');
      }

      return result;
    } catch (error) {
      console.error('API Error:', error);
      this.showToast(`Error: ${error.message}`, 'error');
      throw error;
    }
  }
  async loadUsers() {
    try {
      console.log('Loading users from API...');
      const result = await this.apiCall('/users');
      console.log('Users API response:', result);

      // Ensure we have a valid response structure
      if (result && result.data && Array.isArray(result.data.users)) {
        this.users = result.data.users;
        console.log(`Loaded ${this.users.length} users`);
      } else if (result && Array.isArray(result.data)) {
        // Handle case where data is directly an array
        this.users = result.data;
        console.log(`Loaded ${this.users.length} users (direct array)`);
      } else {
        console.warn('Invalid API response structure for users:', result);
        this.users = [];
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      this.users = [];
      // Don't throw the error, just set empty array and continue
    }

    // Final safety check to ensure users is always an array
    if (!Array.isArray(this.users)) {
      console.warn('Users is not an array after loadUsers, forcing to empty array');
      this.users = [];
    }
  }

  // User Management
  async createUser() {
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();

    if (!name) {
      this.showToast('Please enter a user name', 'error');
      return;
    }

    try {
      const userData = { name };
      if (email) userData.email = email;

      const result = await this.apiCall('/users', 'POST', userData);

      await this.loadUsers();
      this.closeCreateUser();
      this.loadDashboard();
      await this.updateDashboardStats();
      this.showToast(`User "${name}" created successfully!`, 'success');
    } catch (error) {
      if (error.message.includes('already exists')) {
        this.showToast('User with this name already exists', 'error');
      }
    }
  }

  // Loan Management
  async applyForLoan() {
    const amount = parseFloat(document.getElementById('loanAmount').value);
    const description = document.getElementById('loanDescription').value.trim();

    if (!amount || amount <= 0) {
      this.showToast('Please enter a valid loan amount', 'error');
      return;
    }

    if (!description) {
      this.showToast('Please provide a loan description', 'error');
      return;
    }

    try {
      // Check available funds before applying
      const fundsResult = await this.apiCall('/loans/available-funds');
      const maxLoanAmount = fundsResult.data.availableFunds;

      if (amount > maxLoanAmount) {
        this.showToast(`Loan amount exceeds available funds. Maximum: ₹${maxLoanAmount}`, 'error');
        return;
      }

      const loanData = {
        userId: this.currentUserId,
        amount: amount,
        description: description
      };

      const result = await this.apiCall('/loans', 'POST', loanData);

      this.showToast(`Loan of ₹${amount} approved successfully!`, 'success');
      this.backToUserDetails();
      await this.loadUserDetails(this.currentUserId);
      await this.updateDashboardStats();
    } catch (error) {
      console.error('Loan application failed:', error);
    }
  }

  // Contribution Management
  async contributeThisMonth() {
    if (!this.currentUserId) return;

    try {
      const contributionData = {
        userId: this.currentUserId,
        amount: this.monthlyContribution
      };

      const result = await this.apiCall('/contributions', 'POST', contributionData);

      this.showToast(`Monthly contribution of ₹${this.monthlyContribution} added!`, 'success');
      await this.loadUserDetails(this.currentUserId);
      await this.updateDashboardStats();
    } catch (error) {
      if (error.message.includes('already contributed')) {
        this.showToast('You have already contributed this month!', 'warning');
      }
    }
  }

  // Data Management
  getUserById(id) {
    return this.users.find(user => user._id === id);
  }

  // UI Management
  showDashboard() {
    this.setActivePage('dashboard');
    this.loadDashboard();
    this.updateDashboardStats();
  }
  async loadDashboard() {
    try {
      await this.loadUsers();

      // Ensure users is always an array with additional safety check
      if (!Array.isArray(this.users)) {
        console.warn('Users is not an array in loadDashboard, resetting to empty array');
        this.users = [];
      }

      const usersList = document.getElementById('usersList');

      if (this.users.length === 0) {
        usersList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <h3>No Users Yet</h3>
                        <p>Create your first user to start managing money</p>
                    </div>
                `;
        return;
      }

      usersList.innerHTML = this.users.map(user => `
                <div class="user-card" onclick="app.showUserDetails('${user._id}')">
                    <h4><i class="fas fa-user"></i> ${user.name}</h4>
                    <div class="user-stats">
                        <div class="stat">
                            <span class="label">Contributions:</span>
                            <span class="value">₹${user.totalContributions || 0}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Active Loans:</span>
                            <span class="value">₹${user.totalActiveLoans || 0}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Total Payable:</span>
                            <span class="value ${(user.totalPayable || 0) > 0 ? 'highlight' : ''}">₹${Math.round(user.totalPayable || 0)}</span>
                        </div>
                    </div>
                </div>
            `).join('');

      this.loadCharts();
    } catch (error) {
      console.error('Failed to load dashboard:', error);

      // Show error state to user
      const usersList = document.getElementById('usersList');
      if (usersList) {
        usersList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i>
                        <h3>Failed to Load Dashboard</h3>
                        <p>There was an error connecting to the server. Please check your backend connection.</p>
                        <button class="btn btn-primary" onclick="app.showDashboard()">Retry</button>
                    </div>
                `;
      }

      this.showToast('Failed to load dashboard. Please check backend connection.', 'error');
    }
  }

  async showUserDetails(userId) {
    this.currentUserId = userId;
    this.setActivePage('userDetails');
    await this.loadUserDetails(userId);
  }

  async loadUserDetails(userId) {
    try {
      const result = await this.apiCall(`/users/${userId}`);
      const user = result.data;

      if (!user) return;

      // Update user info
      document.getElementById('userDetailsTitle').innerHTML = `<i class="fas fa-user"></i> ${user.name}`;
      document.getElementById('userName').textContent = user.name;
      document.getElementById('userContributions').textContent = `₹${user.totalContributions || 0}`;
      document.getElementById('userActiveLoans').textContent = `₹${user.totalActiveLoans || 0}`;
      document.getElementById('userTotalPayable').textContent = `₹${Math.round(user.totalPayable || 0)}`;
      document.getElementById('monthlyContribution').textContent = this.monthlyContribution;

      // Load loan history
      await this.loadLoanHistory(userId);

      // Load contribution history
      await this.loadContributionHistory(userId);
    } catch (error) {
      console.error('Failed to load user details:', error);
    }
  }

  async loadLoanHistory(userId) {
    try {
      const result = await this.apiCall(`/loans?userId=${userId}`);
      const loans = result.data || [];

      const loanHistory = document.getElementById('loanHistory');

      if (loans.length === 0) {
        loanHistory.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-hand-holding-usd"></i>
                        <h3>No Loans Yet</h3>
                        <p>Apply for your first loan</p>
                    </div>
                `;
        return;
      }

      loanHistory.innerHTML = loans.map(loan => `
                <div class="history-item loan" onclick="app.showLoanDetails('${loan._id}')">
                    <div class="history-header">
                        <span class="history-title">Loan #${loan._id.slice(-6)}</span>
                        <span class="history-amount">₹${loan.amount}</span>
                    </div>
                    <div class="history-date">${new Date(loan.createdAt).toLocaleDateString()}</div>
                    <div class="history-description">${loan.description}</div>
                    <div style="margin-top: 0.5rem;">
                        <span class="loan-status ${loan.status}">${loan.status}</span>
                        <span style="margin-left: 1rem; color: #dc3545; font-weight: 600;">
                            Payable: ₹${Math.round(loan.remainingAmount)}
                        </span>
                        ${loan.status === 'active' ? '<i class="fas fa-chevron-right" style="float: right; color: #667eea; margin-top: 2px;"></i>' : ''}
                    </div>
                </div>
            `).join('');
    } catch (error) {
      console.error('Failed to load loan history:', error);
    }
  }

  async loadContributionHistory(userId) {
    try {
      const result = await this.apiCall(`/contributions?userId=${userId}`);
      const contributions = result.data || [];

      const contributionHistory = document.getElementById('contributionHistory');

      if (contributions.length === 0) {
        contributionHistory.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-calendar-alt"></i>
                        <h3>No Contributions Yet</h3>
                        <p>Make your first monthly contribution</p>
                    </div>
                `;
        return;
      }

      contributionHistory.innerHTML = contributions.map(contrib => `
                <div class="history-item contribution">
                    <div class="history-header">
                        <span class="history-title">Monthly Contribution</span>
                        <span class="history-amount">₹${contrib.amount}</span>
                    </div>
                    <div class="history-date">${new Date(contrib.date).toLocaleDateString()}</div>
                </div>
            `).join('');
    } catch (error) {
      console.error('Failed to load contribution history:', error);
    }
  }

  async showLoanApplication() {
    this.setActivePage('loanApplication');
    // Reset form
    document.getElementById('loanForm').reset();
    this.calculateLoanDetails(0);
    await this.updateMaxLoanAmount();
  }

  async updateMaxLoanAmount() {
    try {
      const result = await this.apiCall('/loans/available-funds');
      const data = result.data;

      const maxLoanAmount = Math.max(0, data.availableFunds);

      // Update the available funds display
      document.getElementById('totalContributionsLoan').textContent = `₹${data.totalContributions}`;
      document.getElementById('totalLoanPayments').textContent = `₹${data.totalRepayments}`;
      document.getElementById('totalActiveLoansLoan').textContent = `₹${data.totalActiveLoans}`;
      document.getElementById('availableFundsLoan').textContent = `₹${maxLoanAmount}`;

      // Update the input max attribute and display text
      const loanInput = document.getElementById('loanAmount');
      const maxLoanText = document.getElementById('maxLoanText');

      loanInput.setAttribute('max', maxLoanAmount);
      maxLoanText.textContent = `Maximum loan amount: ₹${maxLoanAmount}`;

      // If there's not enough money available, show warning
      if (maxLoanAmount <= 0) {
        maxLoanText.innerHTML = `<span style="color: #dc3545;">No funds available for loans. Need more contributions!</span>`;
        loanInput.disabled = true;
        document.querySelector('button[type="submit"]').disabled = true;
      } else {
        loanInput.disabled = false;
        document.querySelector('button[type="submit"]').disabled = false;
      }

      return maxLoanAmount;
    } catch (error) {
      console.error('Failed to update max loan amount:', error);
      return 0;
    }
  }

  calculateLoanDetails(amount) {
    const monthlyInterest = (amount * this.interestRate) / 12;
    const total = amount + monthlyInterest;

    document.getElementById('calcPrincipal').textContent = `₹${amount}`;
    document.getElementById('calcInterest').textContent = `₹${Math.round(monthlyInterest)}`;
    document.getElementById('calcTotal').textContent = `₹${Math.round(total)}`;
  }

  backToUserDetails() {
    this.setActivePage('userDetails');
  }

  // Loan Details and Payment Management
  async showLoanDetails(loanId) {
    this.currentLoanId = loanId;
    this.setActivePage('loanDetails');
    await this.loadLoanDetails(loanId);
  }

  async loadLoanDetails(loanId) {
    try {
      const result = await this.apiCall(`/loans/${loanId}`);
      const loan = result.data;

      if (!loan) return;

      // Update loan information
      document.getElementById('loanId').textContent = `#${loan._id.slice(-6)}`;
      document.getElementById('loanPrincipal').textContent = `₹${loan.amount}`;
      document.getElementById('loanDate').textContent = this.formatDate(loan.createdAt);
      document.getElementById('loanDesc').textContent = loan.description;
      document.getElementById('loanStatusDetail').innerHTML = `<span class="loan-status ${loan.status}">${loan.status}</span>`;
      document.getElementById('loanPayable').textContent = `₹${Math.round(loan.remainingAmount)}`;
      document.getElementById('fullPaymentAmount').textContent = `₹${Math.round(loan.remainingAmount)}`;

      // Show/hide payment section based on loan status
      const paymentSection = document.getElementById('paymentSection');
      if (loan.status === 'active' && loan.remainingAmount > 0) {
        paymentSection.style.display = 'block';
      } else {
        paymentSection.style.display = 'none';
      }

      // Load payment history
      await this.loadPaymentHistory(loanId);
    } catch (error) {
      console.error('Failed to load loan details:', error);
    }
  }

  async loadPaymentHistory(loanId) {
    try {
      const result = await this.apiCall(`/payments?loanId=${loanId}`);
      const payments = result.data || [];

      const paymentHistory = document.getElementById('paymentHistory');

      if (payments.length === 0) {
        paymentHistory.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-receipt"></i>
                        <h3>No Payments Yet</h3>
                        <p>Payment history will appear here</p>
                    </div>
                `;
        return;
      }

      paymentHistory.innerHTML = payments.map(payment => `
                <div class="payment-item">
                    <div class="payment-header">
                        <span class="payment-title">${payment.type === 'full' ? 'Full Payment' : 'Partial Payment'}</span>
                        <span class="payment-amount-paid">₹${payment.amount}</span>
                    </div>
                    <div class="payment-date">${new Date(payment.date).toLocaleDateString()}</div>
                    ${payment.note ? `<div class="payment-note">"${payment.note}"</div>` : ''}
                </div>
            `).join('');
    } catch (error) {
      console.error('Failed to load payment history:', error);
    }
  }

  async makePayment() {
    const paymentType = document.querySelector('input[name="paymentType"]:checked').value;
    const paymentNote = document.getElementById('paymentNote').value.trim();

    try {
      const loanResult = await this.apiCall(`/loans/${this.currentLoanId}`);
      const loan = loanResult.data;

      if (!loan) return;

      let paymentAmount = 0;

      if (paymentType === 'full') {
        paymentAmount = loan.remainingAmount;
      } else {
        paymentAmount = parseFloat(document.getElementById('partialAmount').value);
        if (!paymentAmount || paymentAmount <= 0) {
          this.showToast('Please enter a valid payment amount', 'error');
          return;
        }
        if (paymentAmount > loan.remainingAmount) {
          this.showToast('Payment amount cannot exceed remaining balance', 'error');
          return;
        }
      }

      const paymentData = {
        loanId: this.currentLoanId,
        amount: paymentAmount,
        type: paymentType,
        note: paymentNote
      };

      const result = await this.apiCall('/payments', 'POST', paymentData);

      this.showToast(`Payment of ₹${Math.round(paymentAmount)} processed successfully!`, 'success');

      // Reload the loan details
      await this.loadLoanDetails(this.currentLoanId);
      await this.updateDashboardStats();

      // Reset form
      document.getElementById('paymentForm').reset();
      document.getElementById('fullPayment').checked = true;
      this.togglePartialPaymentInput('full');
    } catch (error) {
      console.error('Payment failed:', error);
    }
  }

  togglePartialPaymentInput(paymentType) {
    const partialGroup = document.getElementById('partialAmountGroup');
    if (paymentType === 'partial') {
      partialGroup.style.display = 'block';
      document.getElementById('partialAmount').required = true;
    } else {
      partialGroup.style.display = 'none';
      document.getElementById('partialAmount').required = false;
    }
  }

  // Modal Management
  showCreateUser() {
    document.getElementById('createUserModal').classList.add('active');
    document.getElementById('newUserName').focus();
  }

  closeCreateUser() {
    document.getElementById('createUserModal').classList.remove('active');
    document.getElementById('createUserForm').reset();
  }

  // Charts
  loadCharts() {
    this.loadContributionsChart();
    this.loadLoansChart();
  }
  loadContributionsChart() {
    // Safety check to ensure users is an array
    if (!Array.isArray(this.users)) {
      console.warn('Cannot load contributions chart: users is not an array');
      return;
    }

    const ctx = document.getElementById('contributionsChart').getContext('2d');

    const userNames = this.users.map(user => user.name);
    const contributions = this.users.map(user => user.totalContributions || 0);

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: userNames,
        datasets: [{
          label: 'Total Contributions',
          data: contributions,
          backgroundColor: 'rgba(102, 126, 234, 0.8)',
          borderColor: 'rgba(102, 126, 234, 1)',
          borderWidth: 2,
          borderRadius: 10
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return '₹' + value;
              }
            }
          }
        }
      }
    });
  }
  loadLoansChart() {
    // Safety check to ensure users is an array
    if (!Array.isArray(this.users)) {
      console.warn('Cannot load loans chart: users is not an array');
      return;
    }

    const ctx = document.getElementById('loansChart').getContext('2d');

    const userNames = this.users.map(user => user.name);
    const loans = this.users.map(user => Math.round(user.totalPayable || 0));

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: userNames,
        datasets: [{
          data: loans,
          backgroundColor: [
            '#667eea',
            '#764ba2',
            '#f093fb',
            '#f5576c',
            '#4facfe',
            '#00f2fe'
          ],
          borderWidth: 3,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.label + ': ₹' + context.parsed;
              }
            }
          }
        }
      }
    });
  }

  // Dashboard Statistics
  async updateDashboardStats() {
    try {
      const result = await this.apiCall('/dashboard');
      const stats = result.data;

      document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
      document.getElementById('totalContributions').textContent = `₹${Math.round(stats.totalAvailableFunds || 0)}`;
      document.getElementById('totalLoans').textContent = `₹${stats.totalActiveLoans || 0}`;
      document.getElementById('totalInterest').textContent = `₹${Math.round(stats.totalInterestEarned || 0)}`;
    } catch (error) {
      console.error('Failed to update dashboard stats:', error);
      // Set default values
      document.getElementById('totalUsers').textContent = '0';
      document.getElementById('totalContributions').textContent = '₹0';
      document.getElementById('totalLoans').textContent = '₹0';
      document.getElementById('totalInterest').textContent = '₹0';
    }
  }

  // Utility Functions
  setActivePage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
  }

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

// Initialize the app
const app = new MoneyManager();

// Global functions for HTML onclick events
function showDashboard() {
  app.showDashboard();
}

function showCreateUser() {
  app.showCreateUser();
}

function closeCreateUser() {
  app.closeCreateUser();
}

function contributeThisMonth() {
  app.contributeThisMonth();
}

function showLoanApplication() {
  app.showLoanApplication();
}

function backToUserDetails() {
  app.backToUserDetails();
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    app.closeCreateUser();
  }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    app.closeCreateUser();
  }
});

console.log('SmallCircle Money Management App Loaded Successfully! (API Version)');
console.log('Features:');
console.log('- User Creation and Management');
console.log('- Monthly Contributions (₹500 default)');
console.log('- Loan Application with 20% Annual Interest');
console.log('- Compound Interest Calculation');
console.log('- Visual Dashboard with Charts');
console.log('- Loan and Contribution History');
console.log('- Responsive Design');
console.log('- Backend API Integration');
