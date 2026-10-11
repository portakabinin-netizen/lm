const axios = require("axios");
import api_url from "@/backend/routes/base_url"; // adjust path for your setup

/**
 * 🧱 Register Corporate Admin User (CorpAdmin)
 * Sends embedded corporate details + user info
 */
export const registerCorpAdmin = async (formData) => {
  try {
    const payload = {
      userDisplayName: formData.userDisplayName,
      userEmail: formData.userEmail,
      userMobile: formData.userMobile,
      userPassword: formData.userPassword,
      userRole: "CorpAdmin",
      userAadhar: formData.userAadhar,
      userDoB: formData.userDoB,

      linkedCorporate: {
        corporateName: formData.corporateName,
        corporateEmail: formData.corporateEmail,
        corporateAddress: formData.corporateAddress,
        corporateCity: formData.corporateCity,
        corporateDistrict: formData.corporateDistrict,
        corporateState: formData.corporateState,
        corporatePin: formData.corporatePin,
        corporatePAN: formData.corporatePAN,
        corporateGST: formData.corporateGST,
        apiUrls:{}
      },
    };

    const response = await axios.post(`${api_url}/auth/register`, payload);
    return response.data;
  } catch (error) {
    console.error("Admin registration error:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * 🧱 Register Non-Admin User (Sales/Project)
 * Sends corporateId reference + user info
 */
export const registerNonAdmin = async (formData) => {
  try {
    const payload = {
  userDisplayName: formData.userDisplayName,
  userEmail: formData.userEmail,
  userMobile: formData.userMobile,
  userPassword: formData.userPassword,
  userRole: formData.userRole,
  userAadhar: formData.userAadhar,
  userDoB: formData.userDoB,
  accessCorporate: ["Sales", "Project"].includes(formData.userRole)
    ? {
        corpAdminId: "",
        corporateId: formData.corporateId || "",
        accessAllow: false,
      }
    : undefined,
};
   
    const response = await axios.post(`${api_url}/auth/register`, payload);
       return response.data;
  } catch (error) {
    console.error("Non-admin registration error:", error.response?.data || error.message);
    throw error;
  }
};
