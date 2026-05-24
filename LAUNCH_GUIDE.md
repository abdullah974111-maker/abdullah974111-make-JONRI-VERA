# Royal Reels Casino - Launch Guide

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Node.js 18+ (for local development)
- Git

### Step 1: Clone & Setup
```bash
git clone https://github.com/abdullah974111-maker/abdullah974111-make-JONRI-VERA.git
cd abdullah974111-make-JONRI-VERA
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env and add your credentials
```

### Step 3: Launch with Docker Compose
```bash
docker-compose up -d
```

This will start:
- ✅ PostgreSQL Database (Port 5432)
- ✅ Redis Cache (Port 6379)
- ✅ Node.js API Server (Port 3001)
- ✅ React Frontend (Port 3000)
- ✅ Adminer Database UI (Port 8080)

### Step 4: Access the Platform
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001
- **Database Admin**: http://localhost:8080

---

## 📋 Services Overview

### Frontend (React)
- Modern UI with real-time game updates
- WebSocket integration for live features
- Responsive design (mobile & desktop)

### Backend API (Node.js/Express)
- RESTful API endpoints
- JWT authentication
- Real-time WebSocket support
- Payment processing
- Game logic execution

### Database (PostgreSQL)
- User profiles & accounts
- Game history & transactions
- Audit logs
- Wallet management

### Cache Layer (Redis)
- Session management
- Game state caching
- Leaderboards
- Real-time data

---

## 🔧 Development Commands

### View Logs
```bash
docker-compose logs -f api
docker-compose logs -f frontend
```

### Stop Services
```bash
docker-compose down
```

### Reset Database
```bash
docker-compose down -v
docker-compose up -d
```

### Run Migrations
```bash
docker-compose exec api npm run migrate
```

---

## 🔐 Security Checklist

- [ ] Change JWT_SECRET in .env
- [ ] Set strong DB_PASSWORD
- [ ] Configure CORS properly
- [ ] Set up SSL certificates
- [ ] Enable rate limiting
- [ ] Configure firewall rules
- [ ] Add payment gateway keys
- [ ] Set up KYC verification

---

## 📊 Initial Setup

### 1. Create Admin User
```bash
docker-compose exec api npm run seed:admin
```

### 2. Load Game Templates
```bash
docker-compose exec api npm run seed:games
```

### 3. Initialize Wallets
```bash
docker-compose exec api npm run seed:wallets
```

---

## 🚨 Troubleshooting

### Port Already in Use
```bash
# Change ports in docker-compose.yml
# Or kill existing processes
lsof -i :3000
kill -9 <PID>
```

### Database Connection Error
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Verify credentials in .env
cat .env | grep DB_
```

### Frontend Can't Connect to API
```bash
# Update REACT_APP_API_URL in .env
# Rebuild frontend
docker-compose build frontend
docker-compose up -d frontend
```

---

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh JWT token

### Games
- `GET /api/games` - List all games
- `POST /api/games/play` - Start a game
- `POST /api/games/result` - Submit game result

### Wallet
- `GET /api/wallet/balance` - Get user balance
- `POST /api/wallet/deposit` - Deposit funds
- `POST /api/wallet/withdraw` - Withdraw funds

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/kyc` - Submit KYC verification

---

## 🎮 Features Ready to Use

✅ User registration & authentication  
✅ Multiple games (Slots, Roulette, etc.)  
✅ Wallet & balance management  
✅ Real-time leaderboards  
✅ Payment processing  
✅ KYC/AML verification  
✅ Admin dashboard  
✅ Analytics & reporting  

---

## 📞 Support

For issues or questions:
1. Check logs: `docker-compose logs`
2. Review ARCHITECTURE.md for system design
3. Check .env configuration
4. Verify all services are running: `docker-compose ps`

---

**Status**: 🟢 Ready to Launch  
**Last Updated**: 2026-05-24  
**Version**: 1.0
