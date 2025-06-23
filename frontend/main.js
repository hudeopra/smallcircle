// Money Management App - SmallCircle (Fixed API Version)
class MoneyManager {
    constructor() {
        this.users = [];
        this.currentUserId = null;
        this.currentLoanId = null;
        this.pendingUserId = null; // For email verification
        this.monthlyContribution = 500; // Default monthly contribution
        this.interestRate = 0.20; // 20% annual interest
        // Auto-detect API base URL based on environment
        this.apiBaseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:5000/api' 
            : 'https://smallcircle-backend.onrender.com/api';
        this.init();
    }    async init() {
        try {
            console.log('Initializing MoneyManager with API URL:', this.apiBaseUrl);
            
            // Test backend connectivity first
            await this.testBackendConnection();
            
            await this.loadUsers();
            this.loadDashboard();
            this.setupEventListeners();
            await this.updateDashboardStats();
            console.log('MoneyManager initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            console.error('API Base URL:', this.apiBaseUrl);
              // Check if it's a network error
            if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch') || error.message.includes('Cannot connect to backend')) {
                this.showBackendErrorMessage();
            } else {
                this.showToast('Failed to initialize app: ' + error.message, 'error');
            }
        }
    }

    async testBackendConnection() {
        try {
            console.log('Testing backend connection...');
            const response = await fetch(`${this.apiBaseUrl}/dashboard`);
            if (!response.ok) {
                throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
            }
            console.log('Backend connection successful');
        } catch (error) {
            console.error('Backend connection failed:', error);
            throw new Error(`Cannot connect to backend at ${this.apiBaseUrl}. ${error.message}`);
        }
    }    setupEventListeners() {
        // Helper function to safely add event listeners
        const addEventListenerSafely = (elementId, event, handler) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.addEventListener(event, handler);
                console.log(`Event listener added for ${elementId}`);
            } else {
                console.warn(`Element with ID '${elementId}' not found, skipping event listener`);
            }
        };

        // Create User Form
        addEventListenerSafely('createUserForm', 'submit', (e) => {
            e.preventDefault();
            this.createUser();
        });

        // Loan Form
        addEventListenerSafely('loanForm', 'submit', (e) => {
            e.preventDefault();
            this.applyForLoan();
        });

        // Loan Amount Input - Real-time calculation and validation
        addEventListenerSafely('loanAmount', 'input', (e) => {
            const amount = parseFloat(e.target.value) || 0;
            this.calculateLoanDetails(amount);
            this.validateLoanAmount(amount);
        });

        // Payment Form
        addEventListenerSafely('paymentForm', 'submit', (e) => {
            e.preventDefault();
            this.makePayment();
        });

        // Payment type radio buttons
        const paymentTypeRadios = document.querySelectorAll('input[name="paymentType"]');
        if (paymentTypeRadios.length > 0) {
            paymentTypeRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    this.togglePartialPaymentInput(e.target.value);
                });
            });
            console.log(`Event listeners added for ${paymentTypeRadios.length} payment type radios`);
        } else {
            console.warn('Payment type radio buttons not found, skipping event listeners');
        }

        // Email Verification Form
        addEventListenerSafely('emailVerificationForm', 'submit', (e) => {
            e.preventDefault();
            this.verifyEmailAndShowDetails();
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

        // Validate current user
        if (!this.currentUserId) {
            this.showToast('Please select a user first', 'error');
            return;
        }

        if (!amount || amount <= 0) {
            this.showToast('Please enter a valid loan amount', 'error');
            return;
        }

        if (amount < 100) {
            this.showToast('Minimum loan amount is ₹100', 'error');
            return;
        }

        if (!description || description.length < 5) {
            this.showToast('Please provide a loan description (minimum 5 characters)', 'error');
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
                user: this.currentUserId,
                amount: amount,
                description: description
            };

            console.log('Submitting loan application:', loanData);
            const result = await this.apiCall('/loans', 'POST', loanData);

            this.showToast(`Loan of ₹${amount} approved successfully!`, 'success');

            // Reset form
            document.getElementById('loanForm').reset();
            this.calculateLoanDetails(0);

            // Go back to user details and refresh data
            this.backToUserDetails();
            await this.loadUserDetails(this.currentUserId);
            await this.updateDashboardStats();
        } catch (error) {
            console.error('Loan application failed:', error);
            this.showToast(`Loan application failed: ${error.message}`, 'error');
        }
    }

    // Contribution Management
    async contributeThisMonth() {
        if (!this.currentUserId) {
            this.showToast('Please select a user first', 'error');
            return;
        }

        try {
            const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

            const contributionData = {
                user: this.currentUserId,
                amount: this.monthlyContribution,
                month: currentMonth
            };

            console.log('Submitting contribution:', contributionData);
            const result = await this.apiCall('/contributions', 'POST', contributionData);

            this.showToast(`Monthly contribution of ₹${this.monthlyContribution} added!`, 'success');
            await this.loadUserDetails(this.currentUserId);
            await this.updateDashboardStats();
        } catch (error) {
            console.error('Contribution failed:', error);
            if (error.message.includes('already contributed')) {
                this.showToast('You have already contributed this month!', 'warning');
            } else {
                this.showToast(`Contribution failed: ${error.message}`, 'error');
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
        // Store the user ID for verification
        this.pendingUserId = userId;

        // Show email verification modal instead of directly showing user details
        this.showEmailVerification(userId);
    }

    showEmailVerification(userId) {
        // Get user info for the modal
        const user = this.getUserById(userId);
        if (!user) {
            this.showToast('User not found', 'error');
            return;
        }

        // Show the email verification modal
        document.getElementById('emailVerificationModal').classList.add('active');
        document.getElementById('verificationEmail').focus();

        // Reset any previous error
        document.getElementById('emailError').style.display = 'none';
        document.getElementById('verificationEmail').value = '';
    }

    async verifyEmailAndShowDetails() {
        const enteredEmail = document.getElementById('verificationEmail').value.trim().toLowerCase();
        const errorElement = document.getElementById('emailError');

        if (!enteredEmail) {
            this.showToast('Please enter an email address', 'error');
            return;
        }

        // Get the user data to check email
        const user = this.getUserById(this.pendingUserId);
        if (!user) {
            this.showToast('User not found', 'error');
            this.closeEmailVerification();
            return;
        }

        // Check if the entered email matches the user's email
        const userEmail = user.email ? user.email.toLowerCase() : '';

        if (enteredEmail === userEmail) {
            // Email is correct, proceed to user details
            this.currentUserId = this.pendingUserId;
            this.pendingUserId = null;

            this.closeEmailVerification();
            this.setActivePage('userDetails');
            await this.loadUserDetails(this.currentUserId);

            this.showToast('Email verified successfully!', 'success');
        } else {
            // Email is incorrect
            errorElement.style.display = 'block';
            errorElement.textContent = 'Incorrect email. Please try again.';

            // Clear the input and focus it
            document.getElementById('verificationEmail').value = '';
            document.getElementById('verificationEmail').focus();
        }
    }

    closeEmailVerification() {
        document.getElementById('emailVerificationModal').classList.remove('active');
        document.getElementById('emailVerificationForm').reset();
        document.getElementById('emailError').style.display = 'none';
        this.pendingUserId = null;
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
            const result = await this.apiCall(`/loans?user=${userId}`);
            console.log('Loan history API response:', result);

            // Handle different response structures with robust checking
            let loans = [];
            if (result && result.data && result.data.loans && Array.isArray(result.data.loans)) {
                loans = result.data.loans;
            } else if (result && result.data && Array.isArray(result.data)) {
                loans = result.data;
            } else if (result && Array.isArray(result)) {
                loans = result;
            } else {
                console.warn('Unexpected loan history response structure:', result);
                loans = [];
            }

            console.log('Processed loans array:', loans, 'Is array:', Array.isArray(loans));

            const loanHistory = document.getElementById('loanHistory');

            if (!Array.isArray(loans) || loans.length === 0) {
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
            const loanHistory = document.getElementById('loanHistory');
            if (loanHistory) {
                loanHistory.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i>
                        <h3>Error Loading Loans</h3>
                        <p>Failed to load loan history</p>
                    </div>
                `;
            }
        }
    }

    async loadContributionHistory(userId) {
        try {
            const result = await this.apiCall(`/contributions?user=${userId}`);
            console.log('Contribution history API response:', result);

            // Handle different response structures with robust checking
            let contributions = [];
            if (result && result.data && result.data.contributions && Array.isArray(result.data.contributions)) {
                contributions = result.data.contributions;
            } else if (result && result.data && Array.isArray(result.data)) {
                contributions = result.data;
            } else if (result && Array.isArray(result)) {
                contributions = result;
            } else {
                console.warn('Unexpected contribution history response structure:', result);
                contributions = [];
            }

            console.log('Processed contributions array:', contributions, 'Is array:', Array.isArray(contributions));

            const contributionHistory = document.getElementById('contributionHistory');

            if (!Array.isArray(contributions) || contributions.length === 0) {
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
                    <div class="history-date">${new Date(contrib.createdAt || contrib.date).toLocaleDateString()}</div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load contribution history:', error);
            const contributionHistory = document.getElementById('contributionHistory');
            if (contributionHistory) {
                contributionHistory.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i>
                        <h3>Error Loading Contributions</h3>
                        <p>Failed to load contribution history</p>
                    </div>
                `;
            }
        }
    }

    async showLoanApplication() {
        // Check if user is selected
        if (!this.currentUserId) {
            this.showToast('Please select a user first', 'error');
            this.showDashboard();
            return;
        }

        this.setActivePage('loanApplication');

        // Reset form and calculations
        document.getElementById('loanForm').reset();
        this.calculateLoanDetails(0);

        // Load available funds and set limits
        await this.updateMaxLoanAmount();

        // Display current user info
        const user = this.getUserById(this.currentUserId);
        if (user) {
            const loanUserInfo = document.getElementById('loanUserInfo');
            const loanUserName = document.getElementById('loanUserName');
            if (loanUserInfo && loanUserName) {
                loanUserName.textContent = user.name;
                loanUserInfo.style.display = 'block';
            }
            console.log('Applying loan for user:', user.name);
        }
    }

    async updateMaxLoanAmount() {
        try {
            // Use the same logic as dashboard - get totals from API response
            const result = await this.apiCall('/dashboard');
            const stats = result.data;

            console.log('Dashboard stats for loan calculation:', stats);

            const totalContributions = stats.totalAvailableFunds || 0;
            const totalActiveLoanAmounts = stats.totalActiveLoans || 0;
            const totalLoanPayments = 0; // Not tracked separately yet

            const maxLoanAmount = Math.max(0, totalContributions - totalActiveLoanAmounts);

            console.log('Loan calculation:', { totalContributions, totalActiveLoanAmounts, maxLoanAmount });

            // Update the available funds display
            document.getElementById('totalContributionsLoan').textContent = `₹${totalContributions}`;
            document.getElementById('totalLoanPayments').textContent = `₹${totalLoanPayments}`;
            document.getElementById('totalActiveLoansLoan').textContent = `₹${totalActiveLoanAmounts}`;
            document.getElementById('availableFundsLoan').textContent = `₹${maxLoanAmount}`;

            // Update the input max attribute and display text
            const loanInput = document.getElementById('loanAmount');
            const maxLoanText = document.getElementById('maxLoanText');

            if (loanInput && maxLoanText) {
                loanInput.setAttribute('max', maxLoanAmount);
                maxLoanText.textContent = `Maximum loan amount: ₹${maxLoanAmount.toLocaleString()}`;

                // If there's not enough money available, show warning
                if (maxLoanAmount <= 0) {
                    maxLoanText.innerHTML = `<span style="color: #dc3545;">No funds available for loans. Need more contributions!</span>`;
                    loanInput.disabled = true;
                    const submitBtn = document.querySelector('#loanForm button[type="submit"]');
                    if (submitBtn) submitBtn.disabled = true;
                } else {
                    loanInput.disabled = false;
                    const submitBtn = document.querySelector('#loanForm button[type="submit"]');
                    if (submitBtn) submitBtn.disabled = false;

                    // Validate current amount if any
                    const currentAmount = parseFloat(loanInput.value) || 0;
                    if (currentAmount > 0) {
                        this.validateLoanAmount(currentAmount);
                    }
                }
            }

            return maxLoanAmount;
        } catch (error) {
            console.error('Failed to update max loan amount:', error);
            // Set default values if error
            const elements = [
                'totalContributionsLoan',
                'totalLoanPayments',
                'totalActiveLoansLoan',
                'availableFundsLoan'
            ];

            elements.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = '₹0';
            });

            const maxLoanText = document.getElementById('maxLoanText');
            if (maxLoanText) {
                maxLoanText.innerHTML = `<span style="color: #dc3545;">Error loading fund information!</span>`;
            }
            return 0;
        }
    }

    calculateLoanDetails(amount) {
        if (!amount || amount <= 0) {
            document.getElementById('calcPrincipal').textContent = '₹0';
            document.getElementById('calcInterest').textContent = '₹0';
            document.getElementById('calcTotal').textContent = '₹0';
            return;
        }

        const monthlyInterest = (amount * this.interestRate) / 12;
        const total = amount + monthlyInterest;

        document.getElementById('calcPrincipal').textContent = `₹${amount.toLocaleString()}`;
        document.getElementById('calcInterest').textContent = `₹${Math.round(monthlyInterest).toLocaleString()}`;
        document.getElementById('calcTotal').textContent = `₹${Math.round(total).toLocaleString()}`;
    }

    validateLoanAmount(amount) {
        const loanInput = document.getElementById('loanAmount');
        const maxLoanText = document.getElementById('maxLoanText');
        const submitBtn = document.querySelector('#loanForm button[type="submit"]');

        if (!loanInput || !maxLoanText) return;

        const maxAmount = parseFloat(loanInput.getAttribute('max')) || 0;

        // Reset styles
        loanInput.style.borderColor = '';

        if (amount < 100 && amount > 0) {
            loanInput.style.borderColor = '#dc3545';
            maxLoanText.innerHTML = `<span style="color: #dc3545;">Minimum loan amount is ₹100</span>`;
            if (submitBtn) submitBtn.disabled = true;
        } else if (amount > maxAmount && maxAmount > 0) {
            loanInput.style.borderColor = '#dc3545';
            maxLoanText.innerHTML = `<span style="color: #dc3545;">Amount exceeds available funds (₹${maxAmount.toLocaleString()})</span>`;
            if (submitBtn) submitBtn.disabled = true;
        } else if (amount >= 100 && amount <= maxAmount) {
            loanInput.style.borderColor = '#28a745';
            maxLoanText.innerHTML = `<span style="color: #28a745;">✓ Valid loan amount</span>`;
            if (submitBtn) submitBtn.disabled = false;
        } else {
            maxLoanText.textContent = `Maximum loan amount: ₹${maxAmount.toLocaleString()}`;
            if (submitBtn) submitBtn.disabled = false;
        }
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
            const result = await this.apiCall(`/payments?loan=${loanId}`);
            console.log('Payment history API response:', result);

            // Handle different response structures with robust checking
            let payments = [];
            if (result && result.data && result.data.payments && Array.isArray(result.data.payments)) {
                payments = result.data.payments;
            } else if (result && result.data && Array.isArray(result.data)) {
                payments = result.data;
            } else if (result && Array.isArray(result)) {
                payments = result;
            } else {
                console.warn('Unexpected payment history response structure:', result);
                payments = [];
            }

            console.log('Processed payments array:', payments, 'Is array:', Array.isArray(payments));

            const paymentHistory = document.getElementById('paymentHistory');

            if (!Array.isArray(payments) || payments.length === 0) {
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
                    <div class="payment-date">${new Date(payment.createdAt || payment.date).toLocaleDateString()}</div>
                    ${payment.note ? `<div class="payment-note">"${payment.note}"</div>` : ''}
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load payment history:', error);
            const paymentHistory = document.getElementById('paymentHistory');
            if (paymentHistory) {
                paymentHistory.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i>
                        <h3>Error Loading Payments</h3>
                        <p>Failed to load payment history</p>
                    </div>
                `;
            }
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
                loan: this.currentLoanId,  // Backend expects 'loan', not 'loanId'
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
            this.showToast(`Payment failed: ${error.message}`, 'error');
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
            console.warn('Cannot load contributions chart: users is not array');
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
            console.warn('Cannot load loans chart: users is not array');
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

    showBackendErrorMessage() {
        const dashboard = document.getElementById('dashboard');
        dashboard.innerHTML = `
            <div class="container" style="text-align: center; padding: 50px;">
                <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 30px; margin: 20px auto; max-width: 600px;">
                    <h2 style="color: #856404; margin-bottom: 20px;">
                        <i class="fas fa-exclamation-triangle"></i> Backend Connection Error
                    </h2>
                    <p style="color: #856404; margin-bottom: 20px;">
                        Cannot connect to the backend server at: <br>
                        <code style="background: #f8f9fa; padding: 5px; border-radius: 4px;">${this.apiBaseUrl}</code>
                    </p>
                    <div style="text-align: left; background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0;">
                        <h4 style="margin: 0 0 10px 0;">If you're the developer:</h4>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>Make sure the backend server is running</li>
                            <li>Check if the backend URL is correct</li>
                            <li>Verify CORS settings on the backend</li>
                            <li>Check browser console for more details</li>
                        </ul>
                    </div>
                    <button class="btn btn-primary" onclick="location.reload()">
                        <i class="fas fa-redo"></i> Retry Connection
                    </button>
                </div>
            </div>
        `;
    }
}

// Initialize the app when DOM is fully loaded
let app;

// Wait for DOM to be fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM fully loaded, initializing MoneyManager...');
        app = new MoneyManager();
    });
} else {
    // DOM is already loaded
    console.log('DOM already loaded, initializing MoneyManager...');
    app = new MoneyManager();
}

// Global functions for HTML onclick events
function showDashboard() {
    if (app) app.showDashboard();
}

function showCreateUser() {
    if (app) app.showCreateUser();
}

function closeCreateUser() {
    if (app) app.closeCreateUser();
}

function contributeThisMonth() {
    if (app) app.contributeThisMonth();
}

function showLoanApplication() {
    if (app) app.showLoanApplication();
}

function backToUserDetails() {
    if (app) app.backToUserDetails();
}

function closeEmailVerification() {
    if (app) app.closeEmailVerification();
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (app && e.target.classList.contains('modal')) {
        if (e.target.id === 'createUserModal') {
            app.closeCreateUser();
        } else if (e.target.id === 'emailVerificationModal') {
            app.closeEmailVerification();
        }
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (app && e.key === 'Escape') {
        const createUserModal = document.getElementById('createUserModal');
        const emailVerificationModal = document.getElementById('emailVerificationModal');

        if (createUserModal && createUserModal.classList.contains('active')) {
            app.closeCreateUser();
        } else if (emailVerificationModal && emailVerificationModal.classList.contains('active')) {
            app.closeEmailVerification();
        }
    }
});

console.log('SmallCircle Money Management App Loaded Successfully! (Fixed API Version)');
console.log('Features:');
console.log('- User Creation and Management');
console.log('- Monthly Contributions (₹500 default)');
console.log('- Loan Application with 20% Annual Interest');
console.log('- Compound Interest Calculation');
console.log('- Visual Dashboard with Charts');
console.log('- Loan and Contribution History');
console.log('- Responsive Design');
console.log('- Backend API Integration');
console.log('- Robust Error Handling');
console.log('- Email-based Security for User Access');
