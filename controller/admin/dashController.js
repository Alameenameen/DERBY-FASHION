// routes/adminRoutes.js
// const express = require('express');
// const router = express.Router();
const Order = require('../../model/orderSchema');
const Product = require('../../model/productSchema');
const Category = require("../../model/categorySchema");
const Brand = require('../../model/brandSchema'); // Assuming Brand model exists
const mongoose = require("mongoose");

// Helper function to get date range based on filter
const getDateRange = (filter, customStartDate, customEndDate) => {
  const now = new Date();
  const start = new Date();
  const end = new Date();
  

//   console.log("Filter:", filter);
//   console.log("Custom Start Date:", customStartDate);
//   console.log("Custom End Date:", customEndDate);
//   console.log("Date Range:", getDateRange(filter, customStartDate, customEndDate));

  switch (filter) {
    case "daily":
      start.setHours(0, 0, 0, 0);
      break;
    case "weekly":
      start.setDate(now.getDate() - 7);
      break;
    case "monthly":
      start.setMonth(now.getMonth() - 1);
      break;
    case "yearly":
      start.setFullYear(now.getFullYear() - 1);
      break;
    case "custom":
      return {
        start: new Date(customStartDate),
        end: new Date(customEndDate)
      };
    default:
      // Default to all-time
      start.setFullYear(2000);
  }
  
  return { start, end };
};

// Get dashboard data with filter options
const getDashboardData = async (req, res) => {
  try {
    const { filter, customStartDate, customEndDate } = req.query;
    const { start, end } = getDateRange(filter, customStartDate, customEndDate);
    
    // Date filter for queries
    const dateFilter = {
      createdOn: { $gte: start, $lte: end }
    };


    console.log("Date Filter:", dateFilter);
    
    const statusFilter = { status: "delivered" };

    // Get sales summary (total revenue, orders count)
    const salesSummary = await Order.aggregate([
      { $match: { ...dateFilter, ...statusFilter } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$finalAmount" },
          orderCount: { $sum: 1 }
        }
      }
    ]);



    const orderStatusCounts = await Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]);

      const orderStatusCountsObj = {};
      orderStatusCounts.forEach(status => {
        orderStatusCountsObj[status._id] = status.count;
      });

    // Sales over time (for line chart)
    const timeGrouping = filter === "daily" ? 
      { $dateToString: { format: "%H:00", date: "$createdOn" } } :
      filter === "weekly" ?
      { $dateToString: { format: "%Y-%m-%d", date: "$createdOn" } } :
      filter === "monthly" ?
      { $dateToString: { format: "%Y-%m-%d", date: "$createdOn" } } :
      { $dateToString: { format: "%Y-%m", date: "$createdOn" } };

    const salesOverTime = await Order.aggregate([
      { $match: { ...dateFilter, ...statusFilter} },
      {
        $group: {
          _id: timeGrouping,
          revenue: { $sum: "$finalAmount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Top 10 Products
    const topProducts = await Order.aggregate([
      { $match: { ...dateFilter, ...statusFilter } },
      { $unwind: "$orderedItems" },
      {
        $group: {
          _id: "$orderedItems.product",
          totalQuantity: { $sum: "$orderedItems.quantity" },
          totalRevenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } }
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: "$productInfo" },
      {
        $project: {
          _id: 1,
          productName: "$productInfo.productName",
          totalQuantity: 1,
          totalRevenue: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    // Top 10 Categories
    const topCategories = await Order.aggregate([
      { $match: { ...dateFilter, ...statusFilter } },
      { $unwind: "$orderedItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: "$productInfo" },
      {
        $group: {
          _id: "$productInfo.category",
          totalQuantity: { $sum: "$orderedItems.quantity" },
          totalRevenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } }
        }
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      { $unwind: "$categoryInfo" },
      {
        $project: {
          _id: 1,
          categoryName: "$categoryInfo.name",
          totalQuantity: 1,
          totalRevenue: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    // Top 10 Brands
    const topBrands = await Order.aggregate([
      { $match: { ...dateFilter, ...statusFilter} },
      { $unwind: "$orderedItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: "$productInfo" },
      {
        $group: {
          _id: "$productInfo.brand",
          totalQuantity: { $sum: "$orderedItems.quantity" },
          totalRevenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } }
        }
      },
      {
        $lookup: {
          from: "brands",
          localField: "_id",
          foreignField: "_id",
          as: "brandInfo"
        }
      },
      { $unwind: "$brandInfo" },
      {
        $project: {
          _id: 1,
          brandName: "$brandInfo.brandName",
          totalQuantity: 1,
          totalRevenue: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      salesSummary: salesSummary[0] || { totalRevenue: 0, orderCount: 0 },
      salesOverTime,
      orderStatusCounts: orderStatusCountsObj,
      topProducts,
      topCategories,
      topBrands,
    });
  } catch (error) {
    console.error("Dashboard data error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
}

// Get data for ledger book - optional
// const getLedgerData = async (req, res) => {
//   try {
//     const { filter, customStartDate, customEndDate } = req.query;
//     const { start, end } = getDateRange(filter, customStartDate, customEndDate);
    
//     const orders = await Order.find({
//       createdOn: { $gte: start, $lte: end }
//     })
//     .sort({ createdOn: -1 })
//     .populate('user', 'name email')
//     .populate('orderedItems.product', 'productName salePrice');
    
//     res.json(orders);
//   } catch (error) {
//     console.error("Ledger data error:", error);
//     res.status(500).json({ error: "Failed to fetch ledger data" });
//   }
// };

module.exports = {
    getDashboardData,
    getDateRange
}