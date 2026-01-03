const Purchase = require("../models/purchase");

// Helper – Ensure a Purchase document exists
async function getPurchaseDoc() {
  let doc = await Purchase.findOne();
  if (!doc) doc = await Purchase.create({});
  return doc;
}

/* VENDORS */
exports.addVendor = async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    purchase.vendors.push(req.body);
    await purchase.save();
    res.status(201).json(purchase.vendors.at(-1));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getVendors = async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    res.json(purchase.vendors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateVendor = async (req, res) => {
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
};

exports.deleteVendor = async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    purchase.vendors.id(req.params.id)?.deleteOne();
    await purchase.save();
    res.json({ message: "Vendor removed" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* CATEGORIES */
exports.addCategory = async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    purchase.categories.push(req.body);
    await purchase.save();
    res.status(201).json(purchase.categories.at(-1));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    res.json(purchase.categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const purchase = await getPurchaseDoc();
    const category = purchase.categories.id(req.params.categoryId);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.status(200).json({ message: "Category Found", data: category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* PRODUCTS */
exports.addProduct = async (req, res) => {
  try {
    const { productName, description, UoM, margin, categoryId } = req.body;
    if (!productName || !description || !UoM || !categoryId) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const purchase = await getPurchaseDoc();
    const category = purchase.categories.id(categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });
    
    category.products.push({ productName, description, UoM, margin: margin ?? 10 });
    await purchase.save();
    res.status(201).json({ message: "Product Added", data: category.products.at(-1) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* VENDOR RATES */
exports.addVendorRates = async (req, res) => {
  try {
    const payload = req.body;
    if (!Array.isArray(payload)) return res.status(400).json({ error: "Payload must be array" });

    const purchase = await getPurchaseDoc();
    for (const item of payload) {
      const { vendorId, categoryId, productId, price, productName, UoM, description } = item;
      if (!vendorId || !categoryId || !productId || !price) continue;

      let vendor = purchase.vendors.id(vendorId);
      if (!vendor) {
        vendor = { _id: vendorId, productCost: [] };
        purchase.vendors.push(vendor);
      }

      let category = vendor.productCost.find(c => c.categoryId == categoryId);
      if (!category) {
        category = { categoryId, categoryName: item.categoryName || "NA", products: [] };
        vendor.productCost.push(category);
      }

      let product = category.products.find(p => p.productId == productId);
      if (product) {
        Object.assign(product, { price, UoM, description });
      } else {
        category.products.push({ productId, productName, description, UoM, price });
      }
    }
    await purchase.save();
    res.status(201).json({ message: "Vendor Price List Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getVendorRatesById = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const purchase = await Purchase.findOne({ "vendors._id": vendorId });
    if (!purchase) return res.status(404).json({ message: "Vendor Not Found" });

    const vendor = purchase.vendors.id(vendorId);
    const categories = purchase.categories || [];
    const grouped = {};

    vendor.productCost?.forEach(pc => {
      const category = categories.find(c => c._id.toString() === pc.categoryId?.toString());
      if (!grouped[pc.categoryId]) {
        grouped[pc.categoryId] = { categoryId: pc.categoryId, categoryName: category?.categoryName || "Uncategorized", products: [] };
      }
      pc.products?.forEach(prod => {
        grouped[pc.categoryId].products.push({
          productId: prod.productId || prod._id,
          productName: prod.productName,
          price: prod.price,
          UoM: prod.UoM
        });
      });
    });

    res.json({ vendorId, vendorName: vendor.vendorName, productCost: Object.values(grouped) });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
};