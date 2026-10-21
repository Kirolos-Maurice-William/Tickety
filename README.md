# Tickety

Tickety is a full-stack ticket booking web application built with Node.js, Express, and MongoDB. It supports booking across six categories: cinema, concerts, football matches, buses, trains, and flights.

## Features

- Interactive seat map for cinema screenings across four formats (Standard, MAX, IMAX, Gold Class)
- Class and quantity selection for concerts, football matches, buses, trains, and flights
- Search and filtering by category, city, route, price, and availability
- Guest session support so visitors can browse, book, and cancel tickets without signing in first
- Account registration and login that preserves tickets booked during a guest session
- Digital ticket passes with SVG QR codes and booking reference numbers
- Full or partial cancellation (release specific cinema seats or reduce ticket quantity)

## Tech Stack

- Backend: Node.js, Express, Mongoose, JSON Web Tokens (JWT), bcryptjs
- Database: MongoDB (with an automatic in-memory fallback when `MONGO_URI` is not set)
- Frontend: HTML, CSS, vanilla JavaScript

## Project Structure

- `src/app.js` - Express server setup and page routes
- `src/routes/` - REST API endpoints for authentication, events, bookings, and inquiries
- `src/models/` - Mongoose schemas (`User`, `Event`, `Booking`, `Message`)
- `src/lib/` - Pricing rules, category definitions, and database store logic
- `src/seed/` - Initial event catalogue and seat map data
- `public/` - Frontend pages, styles, scripts, and event images

## Running Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. Open `http://localhost:3000` in your browser.

By default, the app starts with a seeded in-memory dataset if `MONGO_URI` is not provided. To connect to MongoDB, create a `.env` file in the root directory:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=3000
```

## License

MIT
