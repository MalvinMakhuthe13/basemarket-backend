const User = require("../models/User");

module.exports = async function requirePhoneVerified(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ message: "No token provided" });

    const user = await User.findById(userId).select("phone emailVerified");
    if (!user) return res.status(401).json({ message: "User not found" });

    if (!(user.phone?.verified || user.emailVerified)) {
      return res.status(403).json({ needsVerification: true, message: "Please verify your account to continue." });
    }

    req.userPhone = user.phone;
    next();
  } catch (e) {
    return res.status(500).json({ message: "Verification check failed" });
  }
};
