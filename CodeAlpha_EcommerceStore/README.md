# CodeAlpha_EcommerceStore

**Task 1: Simple E-commerce Store** — CodeAlpha Full Stack Development Internship

## Features

- Product listings with details page
- Session-based shopping cart
- User registration and login
- Order processing with order history
- SQLite database for products, users, and orders

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Express.js (Node.js)
- **Database:** SQLite (better-sqlite3)

## Setup

```bash
npm install
npm start
```

Open [http://localhost:3001](http://localhost:3001)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List all products |
| GET | `/api/products/:id` | Product details |
| POST | `/api/cart/add` | Add to cart |
| GET | `/api/cart` | View cart |
| POST | `/api/orders` | Place order (auth required) |
| POST | `/api/register` | Register user |
| POST | `/api/login` | Login user |
