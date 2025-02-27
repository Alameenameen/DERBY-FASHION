const express = require("express");
const router = express.Router();
const adminControllers = require("../controller/admin/adminControllers");
const customerController = require("../controller/admin/customerController")
const categoryController = require("../controller/admin/categoryController")
const productControllers = require("../controller/admin/productControllers")
const brandController = require("../controller/admin/brandController")
const orderController = require("../controller/admin/orderController")
const couponController = require("../controller/admin/couponController")
const salesController = require("../controller/admin/salesController")
const dashController = require("../controller/admin/dashController")
const logger = require('../middlewares/logger');


const {adminAuth,noCache} = require("../middlewares/auth");
const {uploads,addBrandWithImage,uploadCategoryImage} = require("../helpers/multer");

router.use(noCache)

router.get("/pageerror",adminControllers.pageError);
router.get("/login",adminControllers.loadLogin);
router.post("/login",adminControllers.login);
router.get("/",adminAuth,adminControllers.loadDashboard);
router.get("/logout",adminAuth,adminControllers.logout)
router.get("/users",adminAuth,customerController.customerInfo);
router.get("/blockCustomer",adminAuth,customerController.customerBlocked);
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked);
router.get("/category",adminAuth,categoryController.categoryInfo)



router.post("/addCategory",adminAuth,uploadCategoryImage,categoryController.addCategory);
// router.post('/addCategory', ,categoryController.addCategory);
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get("/unlistCategory",adminAuth,categoryController.getunListCategory);
router.get("/editCategory",adminAuth,categoryController.getEditCategory);
router.post("/editCategory/:id",adminAuth,categoryController.editCategory)
router.get('/category/getOffer/:id',adminAuth, categoryController.getOffer);
router.post('/category/addOffer',adminAuth,categoryController.addOffer);
router.post('/category/editOffer',adminAuth,categoryController.editOffer);
router.post('/category/removeOffer',adminAuth, categoryController.removeOffer);

// product management

router.get("/addProducts",adminAuth,productControllers.getProductAddPage)
router.post("/addProducts",adminAuth,uploads.array("images",4),productControllers.addProducts)
router.get("/products",adminAuth,productControllers.getAllProducts);
router.get("/editProduct",adminAuth,productControllers.getEditProduct)
router.post("/editProduct/:id",adminAuth,uploads.array("images",4),productControllers.editProducts)
router.post("/deleteImage",adminAuth,productControllers.deleteSingleImage)
router.get('/getOffer/:id',adminAuth, productControllers.getOffer);
router.post('/addOffer',adminAuth,productControllers.addOffer);
router.post('/editOffer',adminAuth,productControllers.editOffer);
router.post('/removeOffer',adminAuth, productControllers.removeOffer);


//brand Management

router.get('/brands', brandController.getBrands)
router.post('/addBrand',addBrandWithImage,brandController.addBrand);
router.get('/brands/toggle-status/:brandId',brandController.toggleBrandStatus);
router.get('/brands/delete/:brandId',brandController.deleteBrand);


//coupons management 
router.get('/coupons',couponController.getAllCoupons);
router.post('/coupons/create', couponController.addCoupon);
router.patch('/coupons/status/:couponId', couponController.updateCouponStatus);
router.get('/coupons/:couponId', couponController.getCouponById);
router.put('/coupons/:couponId', couponController.updateCoupon);
router.delete('/coupons/:couponId', couponController.deleteCoupon);

//order managment

// router.get("/orderList",adminAuth,orderController.getAllOrders)
// router.get("/orderList/:id",adminAuth,orderController.getOrderDetails)
// router.put("/orderList/:id/updateStatus", adminAuth, orderController.updateOrderStatus);

router.get("/orderList", adminAuth, orderController.getAllOrders);
router.put("/orderList/updateStatus/:id", logger,adminAuth, orderController.updateOrderStatus);
router.get('/orderList/details/:id', adminAuth,orderController.getOrderDetails);
router.post('/orders/:id/update-item-status',logger, adminAuth,orderController.updateItemStatus);



router.get('/sales-report', salesController.getSalesReport);
router.post('/generate-report', salesController.generateReport);
router.get('/download-report/:type/:format', salesController.downloadReport);
// router.post('/custom-report', salesController.generateCustomReport);

router.get("/blockProduct",adminAuth,productControllers.blockProduct);
router.get("/unblockProduct",adminAuth,productControllers.unblockProduct);


//dashboard

// router.get('/sales-data/:filterType', adminAuth,dashController.salesData);
// router.get('/top-products',adminAuth,dashController.topProducts);
// router.get('/top-categories',adminAuth,dashController.topCategories);
// router.get('/top-brands', adminAuth,dashController.topBrands);

router.get("/dashboard/data", adminAuth, dashController.getDashboardData);
// router.get("/ledger", isAuthenticated, isAdmin, dashController.getLedgerData);





module.exports = router;