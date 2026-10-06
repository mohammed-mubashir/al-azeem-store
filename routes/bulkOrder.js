const express = require("express");
const supabase = require("../db/supabase");

const router = express.Router();

function convertQuantity(quantity, fromUnit, toUnit) {
  const from = String(fromUnit || "").toLowerCase().trim();
  const to = String(toUnit || "").toLowerCase().trim();

  if (from === to) return quantity;

  // grams ↔ kilograms
  if (from === "g" && to === "kg") {
    return quantity / 1000;
  }

  if (from === "kg" && to === "g") {
    return quantity * 1000;
  }

  // millilitres ↔ litres
  if (from === "ml" && to === "l") {
    return quantity / 1000;
  }

  if (from === "l" && to === "ml") {
    return quantity * 1000;
  }

  // If units are unknown, leave unchanged.
  return quantity;
}

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
      // This is the actual quantity the customer needs.
      // Keep this in the rule's original unit.
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

        // =====================================================
        // MAPPED PRODUCT
        // =====================================================
        if (mapping) {
          const packageQuantity = Number(mapping.package_quantity);
          const packageUnit = mapping.package_unit;

          // Convert the required quantity into the same unit
          // used by the package mapping before calculating packs.
          const requiredInPackageUnit = convertQuantity(
            requiredQuantity,
            rule.unit,
            packageUnit
          );

          const packagesNeeded = Math.ceil(
            requiredInPackageUnit / packageQuantity
          );

          const maxPackagesAvailable = Math.floor(
            stockQty / packageSize
          );

          recommendation = {
            productId: product.id,
            productName: product.name,
            saleType: product.sale_type,
            packageSize,
            packageQuantity,
            packageUnit,

            // Customer's actual requirement stays unchanged.
            requiredQuantity,
            requiredUnit: rule.unit,

            // Package information is kept for future cart handling.
            packagesNeeded,
            maxPackagesAvailable,

            totalQuantity: Number(
              (packagesNeeded * packageQuantity).toFixed(2)
            ),

            stockSufficient:
              maxPackagesAvailable >= packagesNeeded,

            price: Number(
              product.wholesale_price ||
              product.retail_price ||
              0
            ),

            imageUrl: product.image_url || null
          };

        // =====================================================
        // BAG PRODUCT WITHOUT MAPPING
        // =====================================================
        } else if (product.sale_type === "bag") {

          const requiredInPackageUnit = convertQuantity(
            requiredQuantity,
            rule.unit,
            product.unit
          );

          const bagsNeeded = Math.ceil(
            requiredInPackageUnit / packageSize
          );

          const maxBagsAvailable = Math.floor(
            stockQty / packageSize
          );

          recommendation = {
            productId: product.id,
            productName: product.name,
            saleType: "bag",
            packageSize,

            // Keep customer's actual requirement.
            requiredQuantity,
            requiredUnit: rule.unit,

            // Package information for future use.
            bagsNeeded,
            maxBagsAvailable,

            totalQuantity: Number(
              (bagsNeeded * packageSize).toFixed(2)
            ),

            stockSufficient:
              maxBagsAvailable >= bagsNeeded,

            price: Number(
              product.wholesale_price ||
              product.retail_price ||
              0
            ),

            imageUrl: product.image_url || null
          };

        // =====================================================
        // NORMAL UNIT PRODUCT
        // =====================================================
        } else {

          recommendation = {
            productId: product.id,
            productName: product.name,
            saleType: "unit",
            packageSize,

            // Exact quantity required by the customer.
            quantity: requiredQuantity,
            requiredQuantity,
            requiredUnit: rule.unit,

            stockSufficient:
              stockQty >= requiredQuantity,

            price: Number(
              product.wholesale_price ||
              product.retail_price ||
              0
            ),

            imageUrl: product.image_url || null
          };
        }
      }

      return {
        itemName: rule.item_name,
        romanName: rule.roman_name,

        // This is what the customer actually needs.
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

router.post("/understand", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({
        error: "Please enter your bulk order requirement."
      });
    }

    const match = message.match(/\b(\d+)\s*(?:people|persons|log|logo|pax)?\b/i);

    if (!match) {
      return res.status(400).json({
        error: "Please mention the number of people."
      });
    }

    const people = Number(match[1]);

    if (!people || people <= 0) {
      return res.status(400).json({
        error: "Please provide a valid number of people."
      });
    }

    res.json({
      people,
      message
    });

  } catch (err) {
    console.error("Bulk order understanding error:", err);

    res.status(500).json({
      error: "Could not understand the request."
    });
  }
});

module.exports = router;