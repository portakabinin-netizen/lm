const express = require("express");
const router = express.Router();
const Purchase = require("../models/purchase");

// Helper – Ensure a Purchase document exists
async function getPurchaseDoc() {
  let doc = await Purchase.findOne();
  if (!doc) doc = await Purchase.create({});
  return doc;
}

/* ==============================
   VENDORS
============================== */

// Add Vendor
router.post("/vendor/add", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    purchase.vendors.push(req.body);
    await purchase.save();
    res.status(201).json(purchase.vendors.at(-1));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all Vendors
router.get("/vendor", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    res.json(purchase.vendors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*/ GET Vendor by ID (Query)
router.get("/vendor/rate", async (req, res) => {
  try {
    const { _id } = req.query;   // get id from request
    
    const purchase = await getPurchaseDoc(); // main doc containing vendors
    
    if(!_id) return res.json(purchase.vendors); // if no ID → return all

    const vendor = purchase.vendors.find(v => v._id.toString() === _id);

    if(!vendor) return res.status(404).json({ message: "Vendor not found" });

    res.json(vendor);
  } 
  catch (err) {
    res.status(500).json({ error: err.message });
  }
});*/


// Update Vendor
router.put("/vendor/:id", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    const vendor = purchase.vendors.id(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    Object.assign(vendor, req.body);
    await purchase.save();
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Vendor
router.delete("/vendor/:id", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    purchase.vendors.id(req.params.id)?.deleteOne();
    await purchase.save();
    res.json({ message: "Vendor removed" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ==============================
   CATEGORIES
============================== */

// Add Category
router.post("/category/add", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    purchase.categories.push(req.body);
    await purchase.save();
    res.status(201).json(purchase.categories.at(-1));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all Categories
router.get("/category", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    res.json(purchase.categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Get category by Id
router.get("/category/single/:categoryId", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();

    // Find category using subdocument id
    const category = purchase.categories.id(req.params.categoryId);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    res.status(200).json({ 
      message: "Category Found",
      data: category 
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Category
router.put("/category/:id", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    const category = purchase.categories.id(req.params.id);
    if (!category) return res.status(404).json({ error: "Category not found" });

    category.categoryName = req.body.categoryName || category.categoryName;
    await purchase.save();
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Category
router.delete("/category/:id", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    purchase.categories.id(req.params.id)?.deleteOne();
    await purchase.save();
    res.json({ message: "Category removed" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ==============================
   PRODUCTS (inside categories)
============================== */

// Add Product
router.post("/add", async (req, res) => {
  try {
       const { productName, description, UoM, margin, categoryId } = req.body;

    if (!productName || !description || !UoM || !categoryId) {
       return res.status(400).json({ error: "All fields are required" });
    }
    const purchase = await getPurchaseDoc();
    if (!purchase) {
      return res.status(404).json({ error: "Purchase document not found" });
    }
    
    const category = purchase.categories.id(categoryId);
    if (!category) {
      
      return res.status(404).json({ error: "Category not found" });
    }
    const newProduct = { productName, description, UoM, margin: margin ?? 10 };
    category.products.push(newProduct);
    await purchase.save();
    const result = category.products.at(-1);
    
    return res.status(201).json({ message: "Product Added", data: result });

  } catch (err) {
    console.log("\n🔥 ERROR:", err.message);
    console.log(err.stack);
    return res.status(400).json({ error: err.message });
  }
});



// Update Product
router.put("/:categoryId/:productId", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    const category = purchase.categories.id(req.params.categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });

    const product = category.products.id(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    Object.assign(product, req.body);
    await purchase.save();
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Product
router.delete("/:categoryId/:productId", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    const category = purchase.categories.id(req.params.categoryId);
    category.products.id(req.params.productId)?.deleteOne();
    await purchase.save();
    res.json({ message: "Product removed" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =================================================
   Vendor's categorywise products rate
===================================================== */

router.post("/rate/add", async (req, res) => {
  try {
    const payload = req.body;

    if (!Array.isArray(payload) || payload.length === 0)
      return res.status(400).json({ error: "Payload must be an array" });

    const purchase = await getPurchaseDoc();
    if (!purchase)
      return res.status(404).json({ error: "Purchase Document Not Found" });

    for (const item of payload) {

      const {
        vendorId,
        categoryId,
        categoryName = "NA",   
        productId,
        productName,
        description = "",      
        UoM = "NOS",         
        price
      } = item;

      if (!vendorId || !categoryId || !productId || !price)
        continue;

      let vendor = purchase.vendors.id(vendorId);

      // if vendor does not exist → create vendor entry
      if (!vendor) {
        vendor = {
          _id: vendorId,
          productCost: []
        };
        purchase.vendors.push(vendor);
      }

      let category = vendor.productCost.find(c => c.categoryId == categoryId);

      // if category missing → create
      if (!category) {
        category = {
          categoryId,
          categoryName,
          products: []
        };
        vendor.productCost.push(category);
      }

      // find if product exists
      let product = category.products.find(p => p.productId == productId);

      if (product) {
        // 🔥 UPDATE
        product.price = price;
        product.UoM = UoM;
        product.description = description;
      } else {
        // 🔥 INSERT
        category.products.push({
          productId,
          productName,
          description,
          UoM,
          price
        });
      }
    }

    await purchase.save();

    return res.status(201).json({
      message: "Vendor Price List Updated Successfully 🔥",
      insertedRecords: payload.length
    });

  } catch (err) {
    console.log("❌ Update Vendor Rate Error:", err);
    return res.status(500).json({ error: err.message });
  }
});


// Update Product
router.put("rate/:categoryId/:productId", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    const category = purchase.categories.id(req.params.categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });

    const product = category.products.id(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    Object.assign(product, req.body);
    await purchase.save();
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Product
router.delete("rate/:categoryId/:productId", async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    const category = purchase.categories.id(req.params.categoryId);
    category.products.id(req.params.productId)?.deleteOne();
    await purchase.save();
    res.json({ message: "Product removed" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get vendor by Id
router.get("/rate/vendor/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;

    // Find Purchase document that contains this vendor
    const purchase = await Purchase.findOne({ "vendors._id": vendorId });
    if (!purchase)
      return res.status(404).json({ message: "Vendor Not Found" });

    const vendor = purchase.vendors.find(v => v._id.toString() === vendorId);
    const categories = purchase.categories || [];

    // ---------- GROUPING HERE ----------
    const grouped = {};

    vendor.productCost?.forEach(pc => {
      const category = categories.find(c => c._id.toString() === pc.categoryId?.toString());
      const categoryName = category?.categoryName || "Uncategorized";

      // create category bucket if not exists
      if (!grouped[pc.categoryId]) {
        grouped[pc.categoryId] = {
          categoryId: pc.categoryId,
          categoryName,
          products: []
        };
      }

      // push products into this category
      pc.products?.forEach(prod => {
        grouped[pc.categoryId].products.push({
          productId: prod.productId || prod._id,
          productName: prod.productName,
          description: prod.description ?? "-",
          price: prod.price ?? 0,
          UoM: prod.UoM ?? "-"
        });
      });
    });
   
    // final structured response
    return res.status(200).json({
      vendorId,
      vendorName: vendor.vendorName,
      contactPerson: vendor.contactPerson,
      mobileNo: vendor.mobileNo,
      productCost: Object.values(grouped) 
    });

  } catch (err) {
    console.log("RATE FETCH ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
