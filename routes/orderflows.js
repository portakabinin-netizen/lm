// routes/orderflows.js
const express = require("express");
const router = express.Router();
const controller = require("../controller/orderflowsController");

// Create endpoints
router.post("/po/create", controller.createPO);
router.post("/pi/create", controller.createPI);
router.post("/ti/create", controller.createTI);
router.post("/dn/create", controller.createDN);
router.post("/cn/create", controller.createCN);

// Read endpoints
router.get("/:id", controller.getById);
router.get("/by-number/:number", controller.getByNumber);
router.get("/", controller.list);

module.exports = router;
