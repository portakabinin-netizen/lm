
// --- Regex Patterns ---
const regex = {
  name: /^[A-Za-z0-9 .,@'-]+$/,
  mobile: /^[6-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  aadhar: /^\d{12}$/,
  pin: /^\d{6}$/,
  password: /^(?=.*[A-Z])(?=.*[!@#$%^&*()\-_=+{}[\]|;:'",.<>/?]).{8,}$/,
  url: /^https?:\/\/[^\s/$.?#].[^\s]*$/i
};

// --- Formatting Utilities (Backend Compatible) ---
const formatDate = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const formatMobile = (mobile) => {
  if (!mobile) return null;
  let m = String(mobile).replace(/\D/g, "");
  if (m.length === 12 && m.startsWith("91")) m = m.substring(2);
  if (m.length === 11 && m.startsWith("0")) m = m.substring(1);
  if (m.length !== 10) return null;

  return {
    plain: m,
    with91: `91${m}`,
    withPlus91: `+91${m}`
  };
};

// --- Middleware Logic ---
const validateAuth = (req, res, next) => {
  const {
    userEmail,
    userMobile,
    userAadhar,
    userPassword,
    corporatePAN,
    corporateGST,
    mobile // for login/otp
  } = req.body;

  const errors = [];

  // Mobile Validation (uses raw input before formatting)
  const phoneToTest = userMobile || mobile;
  if (phoneToTest && !regex.mobile.test(phoneToTest)) {
    errors.push("Invalid mobile number. 10 digits starting with 6-9 required.");
  }

  if (userEmail && !regex.email.test(userEmail)) {
    errors.push("Invalid email format.");
  }

  if (userPassword && !regex.password.test(userPassword)) {
    errors.push("Password must be 8+ chars, 1 uppercase, and 1 special char.");
  }

  if (userAadhar && !regex.aadhar.test(userAadhar)) {
    errors.push("Aadhar must be exactly 12 digits.");
  }

  if (corporatePAN && !regex.pan.test(corporatePAN)) {
    errors.push("Invalid PAN card format.");
  }

  if (corporateGST && corporateGST !== "Un-Registered") {
    if (!regex.gst.test(corporateGST)) {
      errors.push("Invalid GST number format.");
    }
  }

  if (errors.length > 0) {
    return res.status(422).json({ success: false, errors });
  }

  next();
};

// --- Exports ---
module.exports = {
  validateAuth,
  regex,
  formatDate,
  formatMobile
};