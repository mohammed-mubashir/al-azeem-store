const express = require("express");
const supabase = require("../db/supabase");

const router = express.Router();

router.post("/calculate", async (req, res) => {
  try {
    const people = Number(req.body.people);

    if (!people || people <= 0) {
      return res.status(400).json({
        error: "Please provide a valid number of people."
      });
    }

    // Get bulk-order quantity rules
    const { data: rules, error: rulesError } = await supabase
      .from("bulk_order_rules")
      .select("*")
      .order("id", { ascending: true });

    if (rulesError) {
      console.error("Bulk order rules error:", rulesError);
      return res.status(500).json({
        error: "Could not load bulk order rules."
      });
    }

    // Get actual store products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select(`
        id,
        name,
        unit,
        sale_type,
        package_size,
        stock_qty,
        retail_price,
        wholesale_price,
        image_url
      `);

    if (productsError) {
      console.error("Products error:", productsError);
      return res.status(500).json({
        error: "Could not load store products."
      });
    }

    // Get approved bulk-product mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from("bulk_product_mappings")
      .select("*");

    if (mappingsError) {
      console.error("Bulk product mappings error:", mappingsError);
      return res.status(500).json({
        error: "Could not load product mappings."
      });
    }

    const multiplier = people / 100;

    const items = rules.map((rule) => {
      const requiredQuantity = Number(
        (rule.base_quantity * multiplier).toFixed(2)
      );

      // Look for an approved mapping first
      const mapping = mappings.find(
        (m) => Number(m.rule_id) === Number(rule.id)
      );

      let product = null;
      let recommendation = null;

      if (mapping) {
        product = products.find(
          (p) => Number(p.id) === Number(mapping.product_id)
        );
      }

      // If no mapping exists, try exact product-name matching
      if (!product) {
        product = products.find(
          (p) =>
            p.name &&
            p.name.trim().toLowerCase() ===
              rule.item_name.trim().toLowerCase()
        );
      }

      // If exact match isn't available, try partial matching
      if (!product) {
        product = products.find(
          (p) =>
            p.name &&
            p.name.toLowerCase().includes(rule.item_name.toLowerCase())
        );
      }

      if (product) {
        const stockQty = Number(product.stock_qty || 0);
        const packageSize = Number(product.package_size || 1);

        // If an approved mapping exists, use its actual quantity
        // instead of assuming package_size equals the required unit.
        if (mapping) {
          const packageQuantity = Number(mapping.package_quantity);

          const packagesNeeded = Math.ceil(
            requiredQuantity / packageQuantity
          );

          const maxPackagesAvailable =
            product.sale_type === "bag"
              ? Math.floor(stockQty / packageSize)
              : Math.floor(stockQty / packageSize);

          recommendation = {
            productId: product.id,
            productName: product.name,
            saleType: product.sale_type,
            packageSize,
            packageQuantity,
            packageUnit: mapping.package_unit,
            packagesNeeded,
            maxPackagesAvailable,
            totalQuantity: Number(
              (packagesNeeded * packageQuantity).toFixed(2)
            ),
            stockSufficient: maxPackagesAvailable >= packagesNeeded,
            price: Number(
              product.wholesale_price || product.retail_price || 0
            ),
            imageUrl: product.image_url || null
          };
        } else if (product.sale_type === "bag") {
          const bagsNeeded = Math.ceil(
            requiredQuantity / packageSize
          );

          const maxBagsAvailable = Math.floor(
            stockQty / packageSize
          );

          recommendation = {
            productId: product.id,
            productName: product.name,
            saleType: "bag",
            packageSize,
            bagsNeeded,
            maxBagsAvailable,
            totalQuantity: Number(
              (bagsNeeded * packageSize).toFixed(2)
            ),
            stockSufficient: maxBagsAvailable >= bagsNeeded,
            price: Number(
              product.wholesale_price || product.retail_price || 0
            ),
            imageUrl: product.image_url || null
          };
        } else {
          recommendation = {
            productId: product.id,
            productName: product.name,
            saleType: "unit",
            packageSize,
            quantity: requiredQuantity,
            stockSufficient: stockQty >= requiredQuantity,
            price: Number(
              product.wholesale_price || product.retail_price || 0
            ),
            imageUrl: product.image_url || null
          };
        }
      }

      return {
        itemName: rule.item_name,
        romanName: rule.roman_name,
        requiredQuantity,
        unit: rule.unit,
        recommendation
      };
    });

    res.json({
      people,
      items
    });
  } catch (err) {
    console.error("Bulk order calculation error:", err);

    res.status(500).json({
      error: "Something went wrong."
    });
  }
});

module.exports = router;