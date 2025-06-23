# SmallCircle - Money Management App

A comprehensive money management application designed for small groups or communities to manage contributions, loans, and payments efficiently.

## 🚀 Features

- **User Management**: Create and manage multiple users
- **Monthly Contributions**: Track monthly contributions (default ₹500)
- **Loan System**: Apply for loans with 20% annual interest rate
- **Payment Tracking**: Make partial or full loan payments
- **Dashboard Analytics**: Visual charts and statistics
- **Interest Calculation**: Automatic compound interest calculation
- **Responsive Design**: Works on desktop and mobile devices

## 🏗️ Architecture

### Frontend (Static)
- **Technology**: HTML, CSS, JavaScript (Vanilla)
- **Features**: Single Page Application with dynamic charts
- **Charts**: Chart.js for data visualization
- **Icons**: Font Awesome icons
- **Hosting**: Can be hosted anywhere (Netlify, Vercel, GitHub Pages, etc.)

### Backend (Dynamic API)
- **Technology**: Node.js, Express.js, MongoDB
- **Database**: MongoDB with Mongoose ODM
- **Features**: RESTful API with CORS support
- **Security**: Helmet for security headers
- **Logging**: Morgan for request logging
- **Hosting**: Designed for Render, Heroku, or similar platforms

## 📁 Project Structure

```
SmallCircle/
├── frontend/
│   ├── index.html          # Main HTML file
│   ├── main.js             # Frontend JavaScript logic
│   └── style.css           # Styling
├── backend/
│   ├── server.js           # Express server
│   ├── package.json        # Backend dependencies
│   ├── models/             # MongoDB models
│   │   ├── User.js
│   │   ├── Contribution.js
│   │   ├── Loan.js
│   │   └── Payment.js
│   └── routes/             # API routes
│       ├── users.js
│       ├── contributions.js
│       ├── loans-simple.js
│       ├── payments.js
│       └── dashboard-simple.js
├── index.html              # Root HTML (legacy)
├── main.js                 # Root JS (legacy)
└── main-api.js            # API utilities (legacy)
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- Git

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   # Create .env file with:
   MONGODB_URI=mongodb://localhost:27017/smallcircle
   PORT=5000
   CORS_ORIGIN=http://localhost:3000
   ```

4. **Start the server:**
   ```bash
   npm start
   # or for development:
   npm run dev
   ```

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Update API URL in main.js:**
   ```javascript
   // For local development:
   this.apiBaseUrl = 'http://localhost:5000/api';
   
   // For production (update with your backend URL):
   this.apiBaseUrl = 'https://your-backend-url.com/api';
   ```

3. **Serve the frontend:**
   - For development: Use Live Server extension in VS Code
   - For production: Upload to any static hosting service

## 🌐 Deployment

### Backend Deployment (Render)

1. **Push code to GitHub**
2. **Create new Web Service on Render**
3. **Connect GitHub repository**
4. **Configure build settings:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Root Directory: `backend`

5. **Add environment variables:**
   - `MONGODB_URI`: Your MongoDB connection string
   - `PORT`: 5000 (or let Render assign)
   - `CORS_ORIGIN`: Your frontend URL

### Frontend Deployment

1. **Update API URL** in `frontend/main.js` to your Render backend URL
2. **Deploy to static hosting:**
   - **Netlify**: Drag and drop `frontend` folder
   - **Vercel**: Connect GitHub and deploy `frontend` folder
   - **GitHub Pages**: Push `frontend` contents to `gh-pages` branch

## 📊 API Endpoints

### Users
- `GET /api/users` - Get all users
- `POST /api/users` - Create new user
- `GET /api/users/:id` - Get user details

### Contributions
- `GET /api/contributions` - Get contributions
- `POST /api/contributions` - Add contribution

### Loans
- `GET /api/loans` - Get loans
- `POST /api/loans` - Apply for loan
- `GET /api/loans/:id` - Get loan details
- `GET /api/loans/available-funds` - Get available funds

### Payments
- `GET /api/payments` - Get payments
- `POST /api/payments` - Make payment

### Dashboard
- `GET /api/dashboard` - Get dashboard statistics

## 💰 Business Logic

### Interest Calculation
- **Annual Rate**: 20%
- **Monthly Rate**: 20% ÷ 12 = 1.67%
- **Formula**: `Total Payable = Principal + (Principal × Monthly Rate)`

### Loan Eligibility
- **Minimum Loan**: ₹100
- **Maximum Loan**: Total Available Funds
- **Available Funds**: `Total Contributions + Total Payments - Active Loan Amounts`

### Monthly Contributions
- **Default Amount**: ₹500
- **Frequency**: Once per month per user
- **Tracking**: By month (YYYY-MM format)

## 🛠️ Technologies Used

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Chart.js for data visualization
- Font Awesome for icons
- Responsive CSS Grid/Flexbox

### Backend
- Node.js
- Express.js
- MongoDB with Mongoose
- CORS for cross-origin requests
- Helmet for security
- Morgan for logging
- dotenv for environment variables

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support, email [your-email] or create an issue in the GitHub repository.

## 🔄 Version History

- **v1.0.0** - Initial release with basic money management features
- Backend API with MongoDB integration
- Frontend with interactive dashboard
- Loan and contribution management
- Real-time calculations and validations
