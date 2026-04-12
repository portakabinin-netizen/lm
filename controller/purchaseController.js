const Purchase = require("../models/purchase");

// Helper – Ensure a Purchase document exists for a given corporate linkage
async function getPurchaseHub(filters) {
  const { corpAdminId, corporateId } = filters;
  if (!corpAdminId || !corporateId) {
    throw new Error("Identity missing – access denied.");
  }

  let hub = await Purchase.findById(corpAdminId);
  if (!hub) {
    hub = await Purchase.create({ _id: corpAdminId, corporateData: {} });
  }

  if (!hub.corporateData.has(corporateId)) {
    hub.corporateData.set(corporateId, { vendors: [], categories: [] });
    await hub.save();
  }

  return hub;
}

/* VENDORS */
exports.addVendor = async (req, res) => {
  try {
    const corpAdminId = req.body.corpAdminId || req.query.corpAdminId || req.user?.corpAdminId;
    const corporateId = req.body.corporateId || req.query.corporateId || req.user?.corporateId;

    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);

    const vendorData = { ...req.body };
    // Ensure nested IDs don't conflict with main IDs if they were sent in body
    delete vendorData.corpAdminId; 

    data.vendors.push(vendorData);
    hub.markModified("corporateData");
    await hub.save();

    res.status(201).json(data.vendors.at(-1));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getVendors = async (req, res) => {
  try {
    const corpAdminId = req.query.corpAdminId || req.body.corpAdminId || req.user?.corpAdminId;
    const corporateId = req.query.corporateId || req.body.corporateId || req.user?.corporateId;

    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    if (!data) return res.json({ vendors: [], categories: [] });

    const categories = data.categories || [];
    const vendors = (data.vendors || []).map(v => {
      const vendorObj = v.toObject ? v.toObject() : v;
      vendorObj.productCost?.forEach(pc => {
        const cat = categories.find(c => c._id.toString() === pc.categoryId?.toString());
        pc.categoryName = cat?.categoryName || "NA";
        pc.hsn_sac = cat?.hsn_sac || "";
        pc.products?.forEach(p => {
          const prod = cat?.products.find(cp => cp._id.toString() === p.productId?.toString());
          p.productName = prod?.productName || "Unknown Product";
          p.description = prod?.description || "";
          p.hsn_sac = prod?.hsn_sac || cat?.hsn_sac || "";
        });
      });
      return vendorObj;
    });

    // Return both as requested
    res.json({ vendors, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const corpAdminId = req.body.corpAdminId || req.query.corpAdminId || req.user?.corpAdminId;
    const corporateId = req.body.corporateId || req.query.corporateId || req.user?.corporateId;

    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    const vendor = data.vendors.id(id);

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const updateData = { ...req.body };
    delete updateData.corpAdminId;
    delete updateData.corporateId;

    Object.assign(vendor, updateData);
    hub.markModified("corporateData");
    await hub.save();
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const corpAdminId = req.query.corpAdminId || req.body.corpAdminId || req.user?.corpAdminId;
    const corporateId = req.query.corporateId || req.body.corporateId || req.user?.corporateId;

    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);

    const vendor = data.vendors.id(id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    vendor.deleteOne();
    hub.markModified("corporateData");
    await hub.save();
    res.json({ success: true, message: "Vendor removed" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* CATEGORIES */
exports.addCategory = async (req, res) => {
  try {
    const { categoryName, hsn_sac } = req.body;
    const corporateId = req.body.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    if (!categoryName?.trim()) return res.status(400).json({ error: "Category name is required" });

    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    data.categories.push({ categoryName: categoryName.trim(), hsn_sac: hsn_sac?.trim() || "" });
    hub.markModified("corporateData");
    await hub.save();
    res.status(201).json(data.categories.at(-1));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const corporateId = req.body.corporateId || req.query.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    const category = data.categories.id(req.params.categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });

    const { categoryName, hsn_sac } = req.body;
    if (categoryName !== undefined) category.categoryName = categoryName.trim();
    if (hsn_sac    !== undefined) category.hsn_sac    = hsn_sac.trim();

    hub.markModified("corporateData");
    await hub.save();
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const corporateId = req.query.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    const category = data.categories.id(req.params.categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });
    if (category.products?.length > 0)
      return res.status(400).json({ error: "Remove all products before deleting this category" });

    category.deleteOne();
    hub.markModified("corporateData");
    await hub.save();
    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const corpAdminId = req.query.corpAdminId || req.body.corpAdminId || req.user?.corpAdminId;
    const corporateId = req.query.corporateId || req.body.corporateId || req.user?.corporateId;

    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    res.json(data ? data.categories : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const corporateId = req.query.corporateId || req.body.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    const category = data.categories.id(req.params.categoryId);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.status(200).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* PRODUCTS */
exports.addProduct = async (req, res) => {
  try {
    const { productName, description, UoM, margin, hsn_sac, categoryId } = req.body;
    const corporateId = req.body.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    
    if (!productName || !description || !UoM || !categoryId)
      return res.status(400).json({ error: "productName, description, UoM and categoryId are required" });

    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    const category = data.categories.id(categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });

    category.products.push({
      productName: productName.trim(),
      description: description.trim(),
      UoM: UoM.trim(),
      hsn_sac: hsn_sac?.trim() || "",
      margin: margin ?? 15,
    });
    hub.markModified("corporateData");
    await hub.save();
    res.status(201).json(category.products.at(-1));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { categoryId, productId } = req.params;
    const corporateId = req.query.corporateId || req.body.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    const category = data.categories.id(categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });
    const product = category.products.id(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const { productName, description, UoM, margin, hsn_sac } = req.body;
    if (productName !== undefined) product.productName = productName.trim();
    if (description !== undefined) product.description = description.trim();
    if (UoM         !== undefined) product.UoM         = UoM.trim();
    if (hsn_sac     !== undefined) product.hsn_sac     = hsn_sac.trim();
    if (margin      !== undefined) product.margin       = margin;

    hub.markModified("corporateData");
    await hub.save();
    res.json({ message: "Product updated", data: product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { categoryId, productId } = req.params;
    const corporateId = req.query.corporateId || req.body.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    const category = data.categories.id(categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });
    const product = category.products.id(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    product.deleteOne();
    hub.markModified("corporateData");
    await hub.save();
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* VENDOR RATES */
exports.addVendorRates = async (req, res) => {
  try {
    const payload = req.body;
    if (!Array.isArray(payload)) return res.status(400).json({ error: "Payload must be array" });

    const corporateId = payload[0]?.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    
    for (const item of payload) {
      const { vendorId, categoryId, productId, price, UoM } = item;
      if (!vendorId || !categoryId || !productId || !price) continue;

      let vendor = data.vendors.id(vendorId);
      if (!vendor) {
        vendor = { _id: vendorId, productCost: [] };
        data.vendors.push(vendor);
      }

      let pc = vendor.productCost.find(c => c.categoryId == categoryId);
      if (!pc) {
        pc = { categoryId, products: [] };
        vendor.productCost.push(pc);
      }

      let product = pc.products.find(p => p.productId == productId);
      if (product) {
        Object.assign(product, { price, UoM });
      } else {
        pc.products.push({ productId, UoM, price });
      }
    }
    hub.markModified("corporateData");
    await hub.save();
    res.status(201).json({ message: "Vendor Price List Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getVendorRatesById = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const corporateId = req.query.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    if (!data) return res.status(404).json({ message: "Data Not Found for Corporate" });

    const vendor = data.vendors.id(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor Not Found" });
    
    const categories = data.categories || [];
    const grouped = {};

    vendor.productCost?.forEach(pc => {
      const catEntry = categories.find(c => c._id.toString() === pc.categoryId?.toString());
      if (!grouped[pc.categoryId]) {
        grouped[pc.categoryId] = { categoryId: pc.categoryId, categoryName: catEntry?.categoryName || "Uncategorized", products: [] };
      }
      pc.products?.forEach(prod => {
        const catProd = catEntry?.products.find(p => p._id.toString() === prod.productId.toString());
        grouped[pc.categoryId].products.push({
          productId: prod.productId || prod._id,
          productName: catProd?.productName || "Unknown Product",
          description: catProd?.description || "",
          price: prod.price,
          UoM: prod.UoM || catProd?.UoM || "PCS"
        });
      });
    });

    res.json({
      vendorId,
      vendorName: vendor.vendorName,
      contactPerson: vendor.contactPerson,
      mobileNo: vendor.mobileNo,
      productCost: Object.values(grouped)
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server Error" });
  }
};

/* GET /product/vendor/by-category/:categoryId
   Returns list of vendors that have at least one rate entry for the given category */
exports.getVendorsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const corporateId = req.query.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);
    
    const matched = [];
    data.vendors.forEach(v => {
      const hasCat = v.productCost?.some(
        pc => pc.categoryId?.toString() === categoryId
      );
      if (hasCat) {
        matched.push({
          _id: v._id,
          vendorName: v.vendorName,
          mobileNo: v.mobileNo,
          contactPerson: v.contactPerson,
          vendorAddress: v.vendorAddress,
          vendorGST: v.vendorGST,
        });
      }
    });
    res.json(matched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET /product/rate/vendor/:vendorId/category/:categoryId
   Returns buy-rate products for a specific vendor+category combo */
exports.getVendorRatesByCategory = async (req, res) => {
  try {
    const { vendorId, categoryId } = req.params;
    const corporateId = req.query.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getPurchaseHub({ corpAdminId, corporateId });
    const data = hub.corporateData.get(corporateId);

    const vendor = data.vendors.id(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found in this corporate catalog" });

    const pc = vendor.productCost?.find(
      c => c.categoryId?.toString() === categoryId
    );

    // Also pull catalogue products for the category to fill in HSN / UoM defaults
    const catEntry = data.categories.id(categoryId);
    const catProducts = catEntry?.products ?? [];

    const products = (pc?.products ?? []).map(p => {
      const catalogProd = catProducts.find(
        cp => cp._id?.toString() === (p.productId?.toString())
      );
      return {
        productId:   p.productId || p._id,
        productName: catalogProd?.productName || "Unknown Product",
        price:       p.price,
        UoM:         p.UoM || catalogProd?.UoM || "PCS",
        hsn_sac:     catalogProd?.hsn_sac || catEntry?.hsn_sac || "",
        description: catalogProd?.description || "",
      };
    });

    res.json({
      vendorId,
      vendorName: vendor.vendorName,
      categoryId,
      categoryName: catEntry?.categoryName || pc?.categoryName || "",
      products,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};