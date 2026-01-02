const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token required",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    /* ===============================
       NORMALIZED USER CONTEXT
    =============================== */
    req.user = {
      userId: decoded.userId,
      userRole: decoded.userRole,
      corpAdminId: decoded.corpAdminId,
      corporateId: decoded.corporateId,
      corporateName: decoded.corporateName,
      userEmail: decoded.userEmail,
    };

    next();
  } catch (err) {
    console.error("JWT ERROR:", err.message);
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authMiddleware;
