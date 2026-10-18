const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

// Helper to ensure valid tenant models
const getModels = (req) => {
  if (!req.tenantModels) throw new Error('Tenant database not initialized for this request.');
  return req.tenantModels;
};

/* ── CATEGORIES ───────────────────────────────────────────────────────────── */
exports.getCategories = async (req, res) => {
  try {
    const { Categories } = getModels(req);
    const categories = await Categories.find().sort({ createdAt: -1 }).lean();
    // Return array directly, with fallback support for object readers
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const { Categories } = getModels(req);
    const cat = await Categories.findById(req.params.categoryId).lean();
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addCategory = async (req, res) => {
  try {
    const { Categories } = getModels(req);
    const categoryName = (req.body.categoryName || req.body.name || '').trim();
    const hsn_sac = (req.body.hsn_sac || '').trim();

    if (!categoryName) return res.status(400).json({ error: 'Category name is required' });

    const newCat = new Categories({
      categoryName,
      name: categoryName,
      hsn_sac,
      products: [],
    });
    await newCat.save();
    res.status(201).json(newCat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { Categories } = getModels(req);
    const category = await Categories.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const { categoryName, name, hsn_sac, description } = req.body;
    if (categoryName !== undefined) {
      category.categoryName = categoryName.trim();
      category.name = categoryName.trim();
    }
    if (name !== undefined) {
      category.name = name.trim();
      if (!category.categoryName) category.categoryName = name.trim();
    }
    if (hsn_sac !== undefined) category.hsn_sac = hsn_sac.trim();
    if (description !== undefined) category.description = description.trim();

    await category.save();
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { Categories } = getModels(req);
    const category = await Categories.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    if (category.products && category.products.length > 0) {
      return res.status(400).json({ error: 'Category contains products. Remove products first.' });
    }

    await Categories.findByIdAndDelete(req.params.categoryId);
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ── PRODUCTS ─────────────────────────────────────────────────────────────── */
exports.addProduct = async (req, res) => {
  try {
    const { Categories } = getModels(req);
    const { categoryId, productName, name, description, hsn_sac, UoM, unit, margin, price, tax_rate } = req.body;

    const pName = (productName || name || '').trim();
    if (!categoryId || !pName) {
      return res.status(400).json({ error: 'Category and Product Name are required' });
    }

    const category = await Categories.findById(categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const newProd = {
      productName: pName,
      description: (description || pName).trim(),
      hsn_sac: (hsn_sac || category.hsn_sac || '').trim(),
      UoM: (UoM || unit || 'PCS').trim(),
      margin: margin ?? 15,
      price: parseFloat(price) || 0,
      tax_rate: parseFloat(tax_rate) || 18,
      active: true,
    };

    category.products.push(newProd);
    await category.save();

    const added = category.products[category.products.length - 1];
    res.status(201).json(added);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { Categories } = getModels(req);
    const { categoryId, productId } = req.params;

    const category = await Categories.findById(categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const product = category.products.id(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { productName, name, description, hsn_sac, UoM, unit, margin, price, tax_rate, active } = req.body;
    if (productName !== undefined) product.productName = productName.trim();
    if (name !== undefined && !productName) product.productName = name.trim();
    if (description !== undefined) product.description = description.trim();
    if (hsn_sac !== undefined) product.hsn_sac = hsn_sac.trim();
    if (UoM !== undefined) product.UoM = UoM.trim();
    if (unit !== undefined && !UoM) product.UoM = unit.trim();
    if (margin !== undefined) product.margin = margin;
    if (price !== undefined) product.price = parseFloat(price) || 0;
    if (tax_rate !== undefined) product.tax_rate = parseFloat(tax_rate) || 18;
    if (active !== undefined) product.active = active;

    await category.save();
    res.json({ success: true, message: 'Product updated', data: product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { Categories } = getModels(req);
    const { categoryId, productId } = req.params;

    const category = await Categories.findById(categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const product = category.products.id(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    product.deleteOne();
    await category.save();

    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ── VENDOR RATES ─────────────────────────────────────────────────────────── */
exports.getVendorRatesByCategory = async (req, res) => {
  try {
    const { VendorRates } = getModels(req);
    const { vendorId, categoryId } = req.params;

    const rates = await VendorRates.find({ vendorId, categoryId }).lean();
    const products = rates.map((r) => {
      const bPrice = r.buyPrice !== undefined && r.buyPrice !== null ? r.buyPrice : r.price;
      const sPrice = r.salePrice !== undefined && r.salePrice !== null ? r.salePrice : 0;
      return {
        productId: r.productId,
        price: bPrice,
        buyPrice: bPrice,
        salePrice: sPrice,
        UoM: r.UoM || 'PCS',
      };
    });

    res.json({
      vendorId,
      categoryId,
      products,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addVendorRates = async (req, res) => {
  try {
    const { VendorRates, Categories } = getModels(req);
    const payload = req.body;
    if (!Array.isArray(payload)) {
      return res.status(400).json({ error: 'Payload must be an array of rate items' });
    }

    for (const item of payload) {
      const {
        vendorId,
        categoryId,
        price,
        buyPrice,
        salePrice,
        UoM,
        productName,
        description,
        categoryName,
      } = item;

      let productId = item.productId;
      if (!vendorId || !categoryId || !productName) continue;

      const numBuy = buyPrice !== undefined && buyPrice !== null && buyPrice !== ''
        ? Number(buyPrice)
        : (price !== undefined && price !== null && price !== '' ? Number(price) : 0);
      const numSale = salePrice !== undefined && salePrice !== null && salePrice !== ''
        ? Number(salePrice)
        : 0;

      // Ensure valid productId
      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        productId = new mongoose.Types.ObjectId();
      }

      await VendorRates.findOneAndUpdate(
        { vendorId, categoryId, productId },
        {
          $set: {
            vendorId,
            categoryId,
            productId,
            price: numBuy,
            buyPrice: numBuy,
            salePrice: numSale,
            UoM: UoM || 'PCS',
            productName: productName || '',
            description: description || '',
            categoryName: categoryName || '',
          },
        },
        { upsert: true, new: true }
      );

      // Also ensure product exists in Categories collection
      try {
        const cat = await Categories.findById(categoryId);
        if (cat) {
          const prodInCat = cat.products.find(
            (p) => String(p._id) === String(productId) || (p.productName && p.productName.toLowerCase() === productName.toLowerCase())
          );
          if (prodInCat) {
            prodInCat.buyPrice = numBuy;
            prodInCat.salePrice = numSale;
            if (numSale > 0) prodInCat.price = numSale;
            await cat.save();
          } else {
            cat.products.push({
              _id: productId,
              productName: productName.trim(),
              description: (description || productName).trim(),
              hsn_sac: cat.hsn_sac || '',
              UoM: UoM || 'PCS',
              price: numSale,
              buyPrice: numBuy,
              salePrice: numSale,
              active: true,
            });
            await cat.save();
          }
        }
      } catch (catSyncErr) {
        console.warn('Category product sync warning:', catSyncErr.message);
      }
    }

    res.status(201).json({ success: true, message: 'Vendor Price List Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getVendorRatesById = async (req, res) => {
  try {
    const { Parties, VendorRates, Categories } = getModels(req);
    const { vendorId } = req.params;

    const vendor = await Parties.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ message: 'Vendor Not Found' });

    const rates = await VendorRates.find({ vendorId }).lean();
    const categories = await Categories.find().lean();

    const grouped = {};
    rates.forEach((r) => {
      const cId = String(r.categoryId);
      const cat = categories.find((c) => String(c._id) === cId);
      if (!grouped[cId]) {
        grouped[cId] = {
          categoryId: cId,
          categoryName: cat?.categoryName || cat?.name || r.categoryName || 'Uncategorized',
          products: [],
        };
      }
      const catProd = cat?.products?.find((p) => String(p._id) === String(r.productId));
      const bPrice = r.buyPrice !== undefined && r.buyPrice !== null ? r.buyPrice : r.price;
      const sPrice = r.salePrice !== undefined && r.salePrice !== null
        ? r.salePrice
        : (catProd?.salePrice !== undefined && catProd?.salePrice !== null ? catProd?.salePrice : (catProd?.price || 0));

      grouped[cId].products.push({
        productId: r.productId,
        productName: catProd?.productName || r.productName || 'Product',
        description: catProd?.description || r.description || '',
        hsn_sac: catProd?.hsn_sac || cat?.hsn_sac || '',
        price: bPrice,
        buyPrice: bPrice,
        salePrice: sPrice,
        UoM: r.UoM || catProd?.UoM || 'PCS',
      });
    });

    res.json({
      _id: vendor._id,
      vendorName: vendor.name || vendor.vendorName || '',
      contactPerson: vendor.contact_person || vendor.contactPerson || '',
      mobileNo: vendor.mobile || vendor.mobileNo || '',
      vendorAddress: vendor.billingAddress?.line1 || vendor.vendorAddress || '',
      productCost: Object.values(grouped),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── BULK EXCEL UPLOADS ───────────────────────────────────────────────────── */
exports.generateTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();

    const vendorsSheet = workbook.addWorksheet('Vendors');
    vendorsSheet.columns = [
      { header: 'VendorName', key: 'vendorName', width: 25 },
      { header: 'MobileNo', key: 'mobileNo', width: 18 },
      { header: 'ContactPerson', key: 'contactPerson', width: 22 },
      { header: 'VendorAddress', key: 'vendorAddress', width: 30 },
      { header: 'VendorGST', key: 'vendorGST', width: 18 },
    ];
    vendorsSheet.addRow({
      vendorName: 'Sample Vendor',
      mobileNo: '9876543210',
      contactPerson: 'John Doe',
      vendorAddress: '123 Industrial Area',
      vendorGST: '',
    });

    const catSheet = workbook.addWorksheet('Categories');
    catSheet.columns = [
      { header: 'CategoryName', key: 'categoryName', width: 25 },
      { header: 'HSN_SAC', key: 'hsn_sac', width: 18 },
    ];
    catSheet.addRow({ categoryName: 'Hardware', hsn_sac: '8413' });

    const prodSheet = workbook.addWorksheet('Products');
    prodSheet.columns = [
      { header: 'CategoryName', key: 'categoryName', width: 25 },
      { header: 'ProductName', key: 'productName', width: 25 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'UoM', key: 'UoM', width: 12 },
      { header: 'Margin', key: 'margin', width: 12 },
      { header: 'HSN_SAC', key: 'hsn_sac', width: 18 },
      { header: 'Price', key: 'price', width: 12 },
    ];
    prodSheet.addRow({
      categoryName: 'Hardware',
      productName: 'Sample Product',
      description: 'Standard item',
      UoM: 'PCS',
      margin: 15,
      hsn_sac: '8413',
      price: 500,
    });

    const ratesSheet = workbook.addWorksheet('ItemRates');
    ratesSheet.columns = [
      { header: 'VendorMobile', key: 'vendorMobile', width: 18 },
      { header: 'CategoryName', key: 'categoryName', width: 25 },
      { header: 'ProductName', key: 'productName', width: 25 },
      { header: 'Price', key: 'price', width: 12 },
      { header: 'UoM', key: 'UoM', width: 12 },
    ];
    ratesSheet.addRow({
      vendorMobile: '9876543210',
      categoryName: 'Hardware',
      productName: 'Sample Product',
      price: 450,
      UoM: 'PCS',
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Purchase_Bulk_Upload_Template.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.uploadBulk = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { Categories, Parties, VendorRates } = getModels(req);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    // 1. Process Vendors
    const vendorsSheet = workbook.getWorksheet('Vendors') || workbook.getWorksheet(1);
    if (vendorsSheet) {
      vendorsSheet.eachRow(async (row, rowNumber) => {
        if (rowNumber > 1) {
          const name = row.getCell(1).value?.toString().trim();
          const mobile = row.getCell(2).value?.toString().replace(/\D/g, '');
          const contact_person = row.getCell(3).value?.toString().trim();
          const address = row.getCell(4).value?.toString().trim();
          const gst = row.getCell(5).value?.toString().trim().toUpperCase();

          if (name && mobile) {
            const existing = await Parties.findOne({ mobile, type: 'Supplier' });
            if (!existing) {
              const item = new Parties({
                name,
                mobile,
                contact_person: contact_person || name,
                billingAddress: { line1: address || '' },
                gst: gst || '',
                type: 'Supplier',
                active: true,
              });
              await item.save();
            }
          }
        }
      });
    }

    // 2. Process Categories
    const catSheet = workbook.getWorksheet('Categories');
    if (catSheet) {
      for (let i = 2; i <= catSheet.rowCount; i++) {
        const row = catSheet.getRow(i);
        const categoryName = row.getCell(1).value?.toString().trim();
        const hsn_sac = row.getCell(2).value?.toString().trim();

        if (categoryName) {
          const existing = await Categories.findOne({
            categoryName: { $regex: new RegExp(`^${categoryName}$`, 'i') },
          });
          if (!existing) {
            await Categories.create({
              categoryName,
              name: categoryName,
              hsn_sac: hsn_sac || '',
              products: [],
            });
          }
        }
      }
    }

    // 3. Process Products
    const prodSheet = workbook.getWorksheet('Products');
    if (prodSheet) {
      for (let i = 2; i <= prodSheet.rowCount; i++) {
        const row = prodSheet.getRow(i);
        const categoryName = row.getCell(1).value?.toString().trim();
        const productName = row.getCell(2).value?.toString().trim();
        const description = row.getCell(3).value?.toString().trim();
        const UoM = row.getCell(4).value?.toString().trim() || 'PCS';
        const margin = parseFloat(row.getCell(5).value) || 15;
        const hsn_sac = row.getCell(6).value?.toString().trim() || '';
        const price = parseFloat(row.getCell(7).value) || 0;

        if (categoryName && productName) {
          const cat = await Categories.findOne({
            categoryName: { $regex: new RegExp(`^${categoryName}$`, 'i') },
          });
          if (cat) {
            const prodExists = cat.products.some(
              (p) => p.productName.toLowerCase() === productName.toLowerCase()
            );
            if (!prodExists) {
              cat.products.push({
                productName,
                description: description || productName,
                UoM,
                margin,
                hsn_sac: hsn_sac || cat.hsn_sac || '',
                price,
                active: true,
              });
              await cat.save();
            }
          }
        }
      }
    }

    // 4. Process Item Rates
    const ratesSheet = workbook.getWorksheet('ItemRates');
    if (ratesSheet) {
      for (let i = 2; i <= ratesSheet.rowCount; i++) {
        const row = ratesSheet.getRow(i);
        const vendorMobile = row.getCell(1).value?.toString().replace(/\D/g, '');
        const categoryName = row.getCell(2).value?.toString().trim();
        const productName = row.getCell(3).value?.toString().trim();
        const price = parseFloat(row.getCell(4).value);
        const UoM = row.getCell(5).value?.toString().trim() || 'PCS';

        if (vendorMobile && categoryName && productName && !isNaN(price)) {
          const vendor = await Parties.findOne({ mobile: vendorMobile, type: 'Supplier' });
          const cat = await Categories.findOne({
            categoryName: { $regex: new RegExp(`^${categoryName}$`, 'i') },
          });
          if (vendor && cat) {
            const prod = cat.products.find(
              (p) => p.productName.toLowerCase() === productName.toLowerCase()
            );
            if (prod) {
              await VendorRates.findOneAndUpdate(
                { vendorId: vendor._id, categoryId: cat._id, productId: prod._id },
                {
                  $set: {
                    vendorId: vendor._id,
                    categoryId: cat._id,
                    productId: prod._id,
                    price,
                    UoM,
                    productName: prod.productName,
                    categoryName: cat.categoryName,
                  },
                },
                { upsert: true }
              );
            }
          }
        }
      }
    }

    res.json({ success: true, message: 'Bulk upload completed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
