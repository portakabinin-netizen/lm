const express = require("express");
const router = express.Router();

const { generatePONumber } = require("../controller/generateNumber");
const PurchaseOrder = require("../models/orderflows");
const {formatDate} = require("../middleware/validateAuth");

// CREATE PO
router.post("/po/create", async (req, res) => {
  try {
    const {
      vendorId,
      vendorName,
      vendorAddress,
      vendorGST,
      vendorMobile,
      orderDate,
      deliveryDate,
      deliveryAddress,
      deliveryState,
      deliveryPIN,
      items,
      grandTotal,
    } = req.body;

    const poNumber = await generatePONumber();

    const newPO = await PurchaseOrder.create({
      poNumber,
      vendorId,
      vendorName,
      vendorAddress,
      vendorGST,
      vendorMobile,
      orderDate ,
      deliveryDate ,
      deliveryAddress,
      deliveryState,
      deliveryPIN,
      items,
      grandTotal,
    });
    

    res.json({
      success: true,
      poNumber,
      purchaseOrder: {
        ...newPO._doc,
        orderDate: formatDate(newPO.orderDate),
        deliveryDate: formatDate(newPO.deliveryDate)
      }
    });
  } catch (err) {
    console.log("PO Create Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// GET Single PO
router.get("/po/:id", async (req, res) => {
  try {
    const data = await PurchaseOrder.findById(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(404).json({ message: "Not found" });
  }
});

module.exports = router;
