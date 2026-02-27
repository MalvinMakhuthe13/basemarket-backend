require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./src/routes/auth");
const listingRoutes = require("./src/routes/listings");

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: false
}));

app.use(express.json());

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () =>
      console.log("Server running")
    );
  })
  .catch(err => console.log(err));