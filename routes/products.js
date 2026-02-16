const express = require("express");
const Product = require("../models/Product");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// CREATE PRODUCT (Protected)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { title, description, price } = req.body;

    const newProduct = new Product({
      title,
      description,
      price,
      owner: req.user.id
    });

    await newProduct.save();
    res.status(201).json(newProduct);

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET ALL PRODUCTS
router.get("/", async (req, res) => {
  const products = await Product.find().populate("owner", "name email");
  res.json(products);
});

module.exports = router;

// UPDATE PRODUCT (Owner Only)
router.put("/:id", authMiddleware, async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) return res.status(404).json({ message: "Not found" });

  if (product.owner.toString() !== req.user.id) {
    return res.status(403).json({ message: "Not authorized" });
  }

  const updated = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  res.json(updated);
});

// DELETE PRODUCT (Owner Only)
router.delete("/:id", authMiddleware, async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) return res.status(404).json({ message: "Not found" });

  if (product.owner.toString() !== req.user.id) {
    return res.status(403).json({ message: "Not authorized" });
  }

  await product.deleteOne();
  res.json({ message: "Product deleted" });
});
