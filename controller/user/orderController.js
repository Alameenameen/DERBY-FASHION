const mongoose = require('mongoose')
const Order = require('../../model/orderSchema');
const Address = require('../../model/addressSchema');
const Product = require('../../model/productSchema')
const Wallet = require('../../model/walletSchema')
const User = require('../../model/userSchema')
const crypto = require("crypto");
const Razorpay = require("razorpay");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');




const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// const orderSuccessPage = async (req, res) => {
//     try {
//         // console.log("user Id",req.session.user._id)
//         if (!req.session.user || !req.session.user._id) {
//             return res.redirect('/login');
//         }

//         const orderId = req.params.orderId;
//         console.log("orderrrid:",orderId)

//         if (!mongoose.Types.ObjectId.isValid(orderId)) {
//             return res.render('page-404', {
//                 user: req.session.user,
//                 error: 'Invalid order ID',
//                 page: 'page-404'
//             });
//         }

//         // Fetch order with populated product details
//         const order = await Order.findById({ _id:orderId }).populate('orderedItems.product').populate('user')
//             // console.log("orders:",order)
         
//         //  console.log(order.product.productImage)


//         if (!order) {
//             return res.render('page-404', {
//                 user: req.session.user,
//                 error: 'Order not found',
//                 page: 'page-404'
//             });
//         }


//         let displayStatus = order.status;
        
//         // If payment failed but this is the original display (not after a retry)
//         if (order.status === 'payment_failed') {
//             displayStatus = 'Pending';
//         } 
//         // If online payment is successful, set order status to Processing
//         else if (order.PaymentMethod === 'Online' && order.paymentStatus === 'Paid') {
//             displayStatus = 'Processing';
//         }

//         // Create a modified order object with the display status
//         const modifiedOrder = {
//             ...order.toObject(),
//             displayStatus: displayStatus
//         };
     

      

//         res.render('order-details', {
//             order: modifiedOrder,
//             user: req.session.user,
//             // address: order.address 
//         });

//         // console.log("orders:",order)

//     } catch (error) {
//         console.error('Error loading order details:', error);
//         res.render('page-404', {
//             user: req.session.user,
//             error: 'Error loading order details',
//             page:'page-404'
//         });
//     }
// };

const orderSuccessPage = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage price'
            })
            .populate('user');

        if (!order) {
            return res.render('page-404', {
                user: req.session.user,
                error: 'Order not found'
            });
        }

        // Ensure all items have proper status and price
        order.orderedItems.forEach(item => {
            // Sync item status with order status if not cancelled or returned
            if (item.status === 'pending' || item.status === 'processing') {
                item.status = order.status;
            }
            
            // Ensure price is set correctly
            if (!item.price || item.price <= 0) {
                item.price = item.product.price;
            }
        });

        res.render('order-details', {
            order: order,
            user: req.session.user
        });

    } catch (error) {
        console.error('Error loading order details:', error);
        res.render('page-404', {
            user: req.session.user,
            error: 'Error loading order details'
        });
    }
};

const handlePaymentCancel = async (req, res) => {
    try {
        const { razorpay_order_id } = req.body;
        
        if (!razorpay_order_id) {
            return res.status(400).json({ error: "Order ID is required" });
        }
        
        const order = await Order.findOneAndUpdate(
            { razorpayOrderId: razorpay_order_id },
            { status: "payment_failed" },
            { new: true }
        );
        
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        res.json({ success: true, orderId: order._id });
    } catch (error) {
        console.error("Error handling payment cancellation:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};



const retryPayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({ error: "Order ID is required" });
        }
        
        // Find the order
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        // Verify the order belongs to the current user
        if (order.user.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ error: "Unauthorized" });
        }
        
        // Verify order status is payment_failed
        if (order.status !== 'payment_failed') {
            return res.status(400).json({ error: "This order doesn't require payment retry" });
        }
        
        // Create new Razorpay order
        const razorpayOrder = await razorpayInstance.orders.create({
            amount: order.finalAmount * 100,
            currency: "INR",
            receipt: `order_rcptid_${Date.now()}`,
            payment_capture: 1
        });
        
        // Update order with new Razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();
        
        res.json({
            success: true,
            orderId: razorpayOrder.id,
            amount: order.finalAmount,
            currency: "INR",
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error retrying payment:', error);
        res.status(500).json({ error: error.message || 'Failed to retry payment' });
    }
};










// const cancelOrder = async (req, res) => {
//     try {
//         const orderId = req.params.orderId;
//         const userId = req.session.user._id;
        
//         console.log('Starting cancel order process for order:', orderId);
        
//         const order = await Order.findById(orderId)
//             .populate({
//                 path: 'orderedItems.product',
//                 select: '_id productName quantity sizes status'
//             });

//         if (!order) {
//             console.log('Order not found:', orderId);
//             return res.status(404).json({
//                 success: false,
//                 error: 'Order not found'
//             });
//         }

//         // Check if all items are already cancelled
//         const allItemsCancelled = order.orderedItems.every(item => 
//             item.status === 'cancelled' || item.status === 'Returned');

//         if (allItemsCancelled) {
//             return res.status(400).json({
//                 success: false,
//                 message: "All items are already cancelled or returned"
//             });
//         }

//         // Basic validation
//         if (order.status !== 'pending' && order.status !== 'processing') {
//             console.log('Invalid order status for cancellation:', order.status);
//             return res.status(400).json({
//                 success: false,
//                 error: 'Only pending and processing orders can be cancelled'
//             });
//         }

//         if (order.isCancelledByUser) {
//             console.log('Order already cancelled:', orderId);
//             return res.status(400).json({
//                 success: false,
//                 message: "Order is already cancelled."
//             });
//         }

//         const couponDiscount = order.couponApplied && order.couponDetails ? 
//         parseFloat(order.couponDetails.discountAmount || 0) : 0;

//     // Calculate refund amount for active items only
//     let refundAmount = 0;
    
//     // Sum up the price of items being cancelled
//     for (const item of order.orderedItems) {
//         if (item.status !== 'cancelled' && item.status !== 'Returned') {
//             refundAmount += item.quantity * item.price;
//             item.status = 'cancelled'; // Update item status
//         }
//     }

//         // Calculate refund amount for active items only
//         // let refundAmount = 0;
//         let originalCouponDiscount = 0;
//         let couponWillBecomeInvalid = false;

//         // Store original coupon details if applicable
//         if (order.couponApplied && order.couponDetails) {
//             originalCouponDiscount = parseFloat(order.couponDetails.discountAmount || 0);
//         }

//         // Calculate remaining total after cancellation
//         const remainingTotal = order.orderedItems.reduce((sum, item) => {
//             if (item.status !== 'cancelled' && item.status !== 'Returned') {
//                 return sum + (item.quantity * item.price);
//             }
//             return sum;
//         }, 0);

//         // Check if coupon becomes invalid
//         if (order.couponApplied && order.couponDetails && remainingTotal < parseFloat(order.couponDetails.minimumPurchase || 0)) {
//             couponWillBecomeInvalid = true;
//             refundAmount += originalCouponDiscount; // Add coupon discount to refund if it becomes invalid
//         }

//         // Sum up the price of items being cancelled
//         for (const item of order.orderedItems) {
//             if (item.status !== 'cancelled' && item.status !== 'Returned') {
//                 refundAmount += item.quantity * item.price;
//                 item.status = 'cancelled'; // Update item status
//             }
//         }

//         // Process quantity restoration
//         for (const orderItem of order.orderedItems) {
//             if (orderItem.status === 'cancelled') { // Only restore for newly cancelled items
//                 try {
//                     console.log('===== STARTING QUANTITY RESTORATION =====');
                    
//                     const quantityToRestore = parseInt(orderItem.quantity, 10);
//                     if (isNaN(quantityToRestore)) {
//                         console.error('Invalid quantity format:', orderItem.quantity);
//                         continue;
//                     }
                    
//                     const productId = orderItem.product._id || orderItem.product;
//                     const product = await Product.findById(productId);
                    
//                     if (!product) {
//                         console.error(`Product not found for ID: ${productId}`);
//                         continue;
//                     }

//                     console.log('Order Item Details:', {
//                         productId: productId,
//                         quantity: quantityToRestore,
//                         size: orderItem.size,
//                         productSizes: product.sizes
//                     });

//                     const updatedQuantity = product.quantity + quantityToRestore;
//                     const sizeToRestore = orderItem.size;
//                     let updatedSizes = [...product.sizes];

//                     if (sizeToRestore) {
//                         const sizeIndex = updatedSizes.findIndex(s => s.size === sizeToRestore);
//                         if (sizeIndex !== -1) {
//                             console.log(`Updating size ${sizeToRestore} quantity:`, {
//                                 before: updatedSizes[sizeIndex].quantity,
//                                 adding: quantityToRestore,
//                                 after: updatedSizes[sizeIndex].quantity + quantityToRestore
//                             });
                            
//                             updatedSizes[sizeIndex].quantity += quantityToRestore;
//                         } else {
//                             console.log(`Adding new size ${sizeToRestore}`);
//                             updatedSizes.push({
//                                 size: sizeToRestore,
//                                 quantity: quantityToRestore
//                             });
//                         }
//                     }

//                     const newStatus = updatedQuantity > 0 ? 'Available' : 'out of stock';
                    
//                     const updatedProduct = await Product.findByIdAndUpdate(
//                         productId,
//                         {
//                             $set: {
//                                 quantity: updatedQuantity,
//                                 sizes: updatedSizes,
//                                 status: newStatus
//                             }
//                         },
//                         { new: true }
//                     );

//                     console.log('Updated Product:', {
//                         id: updatedProduct._id,
//                         totalQuantity: updatedProduct.quantity,
//                         sizes: updatedProduct.sizes,
//                         status: updatedProduct.status
//                     });

//                 } catch (error) {
//                     console.error('Error restoring quantity:', error);
//                     throw error;
//                 }
//             }
//         }

//         // Adjust refund for shipping if all items are cancelled and no items were delivered
//         const deliveredItems = order.orderedItems.filter(item => item.status === 'delivered').length;
//         if (order.orderedItems.every(item => item.status === 'cancelled') && deliveredItems === 0) {
//             const shippingCharge = parseFloat(order.shippingCharge || 50);
//             refundAmount += shippingCharge;
//         }

//         // Process refund if needed
//         if (order.PaymentMethod !== 'COD' && refundAmount > 0) {
//             console.log(`Processing refund for order ${orderId}, amount: ${refundAmount}`);
            
//             try {
//                 const refundSuccess = await processRefund(
//                     orderId,
//                     userId,
//                     refundAmount,
//                     'Order cancellation refund' + (couponWillBecomeInvalid ? ' (coupon invalidated)' : ''),
//                     null, // Full order cancellation, no itemId
//                     'cancel'
//                 );

//                 if (!refundSuccess) {
//                     throw new Error('Failed to process refund');
//                 }
//                 console.log('Refund processed successfully');
//             } catch (refundError) {
//                 console.error('Refund processing failed:', refundError);
//                 throw new Error('Failed to process refund: ' + refundError.message);
//             }
//         }

//         // Update coupon status if it became invalid
//         if (couponWillBecomeInvalid) {
//             order.couponApplied = false;
//             order.couponDetails.invalidatedAt = new Date();
//         }

//         // Calculate new final amount
//         const newFinalAmount = Math.max(0, order.finalAmount - refundAmount);

//         // Update order status
//         const updatedOrder = await Order.findByIdAndUpdate(
//             orderId,
//             {
//                 $set: {
//                     status: 'cancelled',
//                     isCancelledByUser: true,
//                     cancelledAt: new Date(),
//                     finalAmount: newFinalAmount,
//                     'orderedItems': order.orderedItems, 
//                     couponApplied: order.couponApplied,// Update all item statuses
//                     couponApplied: !couponWillBecomeInvalid, // Update coupon status
//                     couponDetails: couponWillBecomeInvalid ? { ...order.couponDetails, invalidatedAt: new Date() } : order.couponDetails
//                 }
//             },
//             { new: true }
//         );

//         console.log('Order updated:', {
//             id: updatedOrder._id,
//             newStatus: updatedOrder.status,
//             cancelledAt: updatedOrder.cancelledAt,
//             newFinalAmount: updatedOrder.finalAmount,
//             couponApplied: updatedOrder.couponApplied
//         });

//         res.json({ 
//             success: true,
//             message: 'Order cancelled successfully and quantities restored',
//             orderSummary: {
//                 currentTotal: newFinalAmount,
//                 refundedAmount: refundAmount,
//                 couponValid: !couponWillBecomeInvalid,
//                 discount: couponWillBecomeInvalid ? 0 : originalCouponDiscount,
//                 shippingCharge: couponWillBecomeInvalid || allItemsCancelled ? 0 : parseFloat(order.shippingCharge || 50)
//             }
//         });

//     } catch (error) {
//         console.error('Error cancelling order:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to cancel order',
//             details: error.message
//         });
//     }
// };

const cancelOrder = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.user._id;
        
        console.log('Starting cancel order process for order:', orderId);
        
        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                select: '_id productName quantity sizes status'
            });

        if (!order) {
            console.log('Order not found:', orderId);
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if all items are already cancelled
        const allItemsCancelled = order.orderedItems.every(item => 
            item.status === 'cancelled' || item.status === 'Returned');

        if (allItemsCancelled) {
            return res.status(400).json({
                success: false,
                message: "All items are already cancelled or returned"
            });
        }

        // Basic validation
        if (order.status !== 'pending' && order.status !== 'processing') {
            console.log('Invalid order status for cancellation:', order.status);
            return res.status(400).json({
                success: false,
                error: 'Only pending and processing orders can be cancelled'
            });
        }

        if (order.isCancelledByUser) {
            console.log('Order already cancelled:', orderId);
            return res.status(400).json({
                success: false,
                message: "Order is already cancelled."
            });
        }

        // Get coupon details
        const couponDiscount = order.couponApplied && order.couponDetails ? 
            parseFloat(order.couponDetails.discountAmount || 0) : 0;

        // Mark items to be cancelled and calculate their total value
        let cancelledItemsTotal = 0;
        for (const item of order.orderedItems) {
            if (item.status !== 'cancelled' && item.status !== 'Returned') {
                cancelledItemsTotal += item.quantity * item.price;
                item.status = 'cancelled'; // Update item status
            }
        }

        // For a full order cancellation, refund exactly what the customer paid (finalAmount)
        // This automatically includes any coupon discounts that were applied
        let refundAmount = 0;
        const allItemsNowCancelled = order.orderedItems.every(item => 
            item.status === 'cancelled' || item.status === 'Returned');
            
        if (allItemsNowCancelled) {
            // Refund the exact amount that was paid
            refundAmount = order.finalAmount;
        } else {
            // For partial cancellations, calculate the proportion of the order being cancelled
            const totalOrderValue = order.orderedItems.reduce((sum, item) => 
                sum + (item.quantity * item.price), 0);
                
            // Calculate what percentage of the original order is being cancelled
            const cancellationPercentage = cancelledItemsTotal / totalOrderValue;
            
            // Apply that percentage to the final amount that was paid
            refundAmount = order.finalAmount * cancellationPercentage;
        }

        // Process quantity restoration
        for (const orderItem of order.orderedItems) {
            if (orderItem.status === 'cancelled') { // Only restore for newly cancelled items
                try {
                    console.log('===== STARTING QUANTITY RESTORATION =====');
                    
                    const quantityToRestore = parseInt(orderItem.quantity, 10);
                    if (isNaN(quantityToRestore)) {
                        console.error('Invalid quantity format:', orderItem.quantity);
                        continue;
                    }
                    
                    const productId = orderItem.product._id || orderItem.product;
                    const product = await Product.findById(productId);
                    
                    if (!product) {
                        console.error(`Product not found for ID: ${productId}`);
                        continue;
                    }

                    console.log('Order Item Details:', {
                        productId: productId,
                        quantity: quantityToRestore,
                        size: orderItem.size,
                        productSizes: product.sizes
                    });

                    const updatedQuantity = product.quantity + quantityToRestore;
                    const sizeToRestore = orderItem.size;
                    let updatedSizes = [...product.sizes];

                    if (sizeToRestore) {
                        const sizeIndex = updatedSizes.findIndex(s => s.size === sizeToRestore);
                        if (sizeIndex !== -1) {
                            console.log(`Updating size ${sizeToRestore} quantity:`, {
                                before: updatedSizes[sizeIndex].quantity,
                                adding: quantityToRestore,
                                after: updatedSizes[sizeIndex].quantity + quantityToRestore
                            });
                            
                            updatedSizes[sizeIndex].quantity += quantityToRestore;
                        } else {
                            console.log(`Adding new size ${sizeToRestore}`);
                            updatedSizes.push({
                                size: sizeToRestore,
                                quantity: quantityToRestore
                            });
                        }
                    }

                    const newStatus = updatedQuantity > 0 ? 'Available' : 'out of stock';
                    
                    const updatedProduct = await Product.findByIdAndUpdate(
                        productId,
                        {
                            $set: {
                                quantity: updatedQuantity,
                                sizes: updatedSizes,
                                status: newStatus
                            }
                        },
                        { new: true }
                    );

                    console.log('Updated Product:', {
                        id: updatedProduct._id,
                        totalQuantity: updatedProduct.quantity,
                        sizes: updatedProduct.sizes,
                        status: updatedProduct.status
                    });

                } catch (error) {
                    console.error('Error restoring quantity:', error);
                    throw error;
                }
            }
        }

        // Process refund if needed for non-COD orders
        if (order.PaymentMethod !== 'COD' && refundAmount > 0) {
            console.log(`Processing refund for order ${orderId}, amount: ${refundAmount}`);
            
            try {
                const refundSuccess = await processRefund(
                    orderId,
                    userId,
                    refundAmount,
                    'Order cancellation refund',
                    null, // Full order cancellation, no itemId
                    'cancel'
                );

                if (!refundSuccess) {
                    throw new Error('Failed to process refund');
                }
                console.log('Refund processed successfully');
            } catch (refundError) {
                console.error('Refund processing failed:', refundError);
                throw new Error('Failed to process refund: ' + refundError.message);
            }
        }

        // Calculate new final amount (should be 0 for full cancellations)
        const newFinalAmount = allItemsNowCancelled ? order.finalAmount : order.finalAmount - refundAmount;

        // Update order status
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            {
                $set: {
                    status: 'cancelled',
                    isCancelledByUser: true,
                    cancelledAt: new Date(),
                    finalAmount: newFinalAmount,
                    'orderedItems': order.orderedItems, // Update all item statuses
                    // Keep coupon details for historical purposes
                    couponApplied: order.couponApplied,
                    couponDetails: order.couponDetails
                }
            },
            { new: true }
        );

        console.log('Order updated:', {
            id: updatedOrder._id,
            newStatus: updatedOrder.status,
            cancelledAt: updatedOrder.cancelledAt,
            newFinalAmount: updatedOrder.finalAmount,
            couponApplied: updatedOrder.couponApplied
        });

        res.json({ 
            success: true,
            message: 'Order cancelled successfully and quantities restored',
            orderSummary: {
                originalTotal: order.finalAmount,  // What they originally paid
                currentTotal: newFinalAmount,      // What they now owe (usually 0 for full cancellation)
                refundedAmount: refundAmount,      // What was refunded
                couponApplied: order.couponApplied,
                couponDiscount: couponDiscount
            }
        });

    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel order',
            details: error.message
        });
    }
};


const calculateOrderTotals = (order) => {
    const summary = {
        originalSubtotal: 0,
        originalTotal:0,
        currentTotal:0,
        currentSubtotal: 0,
        refundedAmount: 0,
        shippingCharge: parseFloat(order.shippingCharge || 50),
        isFullyReturnedOrCancelled: false,
        activeItems: 0,
        returnRequestItems: 0,
        couponDiscount: 0
    };

    // Calculate all subtotals
    order.orderedItems.forEach(item => {
        const itemTotal = parseFloat((item.quantity * item.price).toFixed(2));
        summary.originalSubtotal += itemTotal;
        
        if (item.status === 'Return Request') {
            summary.returnRequestItems++;
            summary.refundedAmount += itemTotal;
        } else if (item.status === 'cancelled' || item.status === 'Returned') {
            summary.refundedAmount += itemTotal;
        } else {
            summary.activeItems++;
            summary.currentSubtotal += itemTotal;
        }
    });

    // Check if order is fully returned/cancelled
    summary.isFullyReturnedOrCancelled = order.orderedItems.every(item => 
        ['cancelled', 'Returned', 'Return Request'].includes(item.status)
    );

    // Apply coupon discount if it exists (even for historical view)
    if (order.couponApplied && order.couponDetails) {
        summary.couponDiscount = parseFloat(order.couponDetails.discountAmount || 0);
    }

    // Calculate original totals WITH coupon discount (what the customer actually paid)
    summary.originalSubtotalWithDiscount = summary.originalSubtotal - summary.couponDiscount;
    summary.originalTotal = summary.originalSubtotalWithDiscount + summary.shippingCharge;
    
    // For fully returned/cancelled orders
    if (summary.isFullyReturnedOrCancelled) {
        // For online payments, the refund should be exactly what the customer paid
        if (order.PaymentMethod === 'Online' || order.PaymentMethod === 'Wallet') {
            // Ensure refund includes coupon discount
            if (order.finalAmount) {
                // Use the stored final amount if available (most accurate)
                summary.refundedAmount = parseFloat(order.finalAmount);
            } else {
                // Otherwise calculate it
                summary.refundedAmount = summary.originalTotal;
            }
        }
        summary.currentTotal = 0;
    } else {
        // Calculate current total for active orders
        summary.currentTotal = summary.currentSubtotal;
        
        // Apply coupon if applicable
        if (order.couponApplied && order.couponDetails) {
            summary.currentTotal -= summary.couponDiscount;
        }
        
        // Add shipping charge to current total
        summary.currentTotal += summary.shippingCharge;
    }

    // Ensure all monetary values are fixed to 2 decimal places
    summary.originalSubtotal = parseInt(summary.originalSubtotal.toFixed(2));
    summary.currentSubtotal = parseInt(summary.currentSubtotal.toFixed(2));
    summary.refundedAmount = parseInt(summary.refundedAmount.toFixed(2));
    summary.originalTotal = parseInt(summary.originalTotal.toFixed(2));
    summary.currentTotal = parseInt(summary.currentTotal.toFixed(2));
    summary.couponDiscount = parseInt(summary.couponDiscount.toFixed(2));

    return summary;
};


const processRefund = async (orderId, userId, amount, reason, itemId = null, actionType = 'cancel') => {
    try {
        const order = await Order.findById(orderId);
        if (!order) throw new Error('Order not found');
        
        // No refund needed for COD orders
        if (order.PaymentMethod === 'COD') {
            return true;
        }
        
        // Find or create wallet
        let wallet = await Wallet.findOne({ user: userId });
        console.log('wallet before:', wallet);
        
        if (!wallet) {
            wallet = new Wallet({ 
                user: userId,
                balance: 0,
                transactions: []
            });
            await wallet.save();
            console.log('Created new wallet');
        }
        
        // Ensure amount is a valid number
        let refundAmount = parseFloat(Number(amount).toFixed(2));
        if (isNaN(refundAmount) || refundAmount <= 0) {
            throw new Error(`Invalid refund amount: ${amount}`);
        }
        
        // Individual item refund handling
        if (itemId) {
            const itemIndex = order.orderedItems.findIndex(item => 
                item._id.toString() === itemId.toString()
            );
            
            if (itemIndex !== -1) {
                order.orderedItems[itemIndex].status = actionType === 'cancel' ? 'cancelled' : 'Returned';
                
                // For individual items, calculate proportional refund including coupon effect
                if (!amount) {
                    const itemValue = order.orderedItems[itemIndex].quantity * order.orderedItems[itemIndex].price;
                    const totalValue = order.orderedItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
                    const proportion = itemValue / totalValue;
                    
                    // Apply proportion to the actual amount paid (finalAmount includes coupon)
                    refundAmount = order.finalAmount * proportion;
                }
            }
        }
        
        // Update wallet with transaction
        wallet.balance += refundAmount;
        wallet.transactions.push({
            amount: refundAmount,
            type: 'credit',
            description: reason,
            orderId: orderId,
            itemId: itemId || undefined,
            timestamp: new Date()
        });
        
        // Save wallet changes
        const updatedWallet = await wallet.save();
        console.log('Updated wallet balance:', updatedWallet.balance);
        
        // Update order refund status
        if (!order.refundStatus) {
            order.refundStatus = {
                isRefunded: true,
                refundedAmount: refundAmount,
                refundedAt: new Date(),
                refundMethod: 'wallet',
                shippingRefunded: !itemId // Only mark shipping as refunded for full order cancellations
            };
        } else {
            // Add to the existing refunded amount
            order.refundStatus.refundedAmount = 
                parseFloat((parseFloat(order.refundStatus.refundedAmount || 0) + refundAmount).toFixed(2));
            order.refundStatus.refundedAt = new Date();
            
            // Mark shipping as refunded for full order cancellations
            if (!itemId) {
                order.refundStatus.shippingRefunded = true;
            }
        }
        
        await order.save();
        console.log(`Refund processed successfully: Amount ${refundAmount} credited to wallet for order ${orderId}`);
        return true;
    } catch (error) {
        console.error('Refund processing error:', error);
        throw error;
    }
};

const requestReturn = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const { returnReason } = req.body;
        
        console.log('Starting return request process for order:', orderId);
        console.log('Return reason:', returnReason);

        // Validate return reason
        const validReasons = [
            'Wrong Size', 
            'Damaged Product', 
            'Not as Described', 
            'Changed Mind', 
            'Quality Issue', 
            'Other'
        ];

        if (!returnReason || !validReasons.includes(returnReason)) {
            console.log('Invalid return reason:', returnReason);
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid return reason'
            });
        }

        if (returnReason === 'Other' && (!req.body.otherReason || req.body.otherReason.trim().length < 10)) {
            console.log('Insufficient details for "Other" reason');
            return res.status(400).json({
                success: false,
                error: 'Please provide more detailed information for "Other" reason'
            });
        }

        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                select: '_id productName quantity sizes status'
            });

        if (!order) {
            console.log('Order not found:', orderId);
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Validation checks
        if (order.status !== 'delivered') {
            return res.status(400).json({
                success: false,
                error: 'Only delivered orders can be returned'
            });
        }

        const sevenDaysInMilliseconds = 7 * 24 * 60 * 60 * 1000;
        const deliveredDate = new Date(order.deliveredDate);
        
        if (isNaN(deliveredDate.getTime())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid delivery date'
            });
        }
        
        const isWithinReturnPeriod = (new Date() - deliveredDate) < sevenDaysInMilliseconds;
        if (!isWithinReturnPeriod) {
            return res.status(400).json({
                success: false,
                error: 'Return period has expired'
            });
        }

        if (order.status === 'Return Request' || order.status === 'Returned') {
            return res.status(400).json({
                success: false,
                error: 'Return already processed'
            });
        }

        // Update order status to Return Request
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            {
                $set: {
                    status: 'Return Request',
                    returnRequestedAt: new Date(),
                    returnReason: returnReason === 'Other' ? 
                        `${returnReason}: ${req.body.otherReason}` : returnReason
                }
            },
            { new: true }
        );

        return res.json({
            success: true,
            message: 'Return request submitted successfully'
        });

    } catch (error) {
        console.error('Error requesting return:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to request return',
            details: error.message
        });
    }
};



const getUserOrders = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.redirect('/login');
        }

        // Fetch orders with populated product details
        const orders = await Order.find({ user: req.session.user._id })
            .populate('orderedItems.product')
            .populate('user')
            .sort({ createdOn: -1 }) // Most recent orders first
            .lean();


            console.log(orders)

        // Format orders for display
        const formattedOrders = orders.map(order => {
            // Calculate total items in order
            const totalItems = order.orderedItems.reduce((sum, item) => sum + item.quantity, 0);
            
            return {
                orderId: order._id,
                date: new Date(order.createdOn).toLocaleDateString(),
                status: order.status,
                total: order.finalAmount,
                paymentMethod: order.PaymentMethod,
                itemCount: totalItems,
                canReturn: order.status === 'delivered' && 
                          new Date() - new Date(order.createdOn) < 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
            };
        });

        console.log("FORMA",formattedOrders)

        return res.render('user/profile', {
            orders: formattedOrders,
            user: req.session.user,
            activeTab: 'orders'
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', {
            user: req.session.user,
            error: 'Error fetching orders'
        });
    }
};



// const processRefund = async (orderId, userId, amount, reason, itemId = null, actionType = 'cancel') => {
//     try {
//         const order = await Order.findById(orderId);
//         if (!order) throw new Error('Order not found');

//         if (order.PaymentMethod === 'COD') {
//             return true;
//         }

//         // Find or create wallet with proper error handling
//         let wallet = await Wallet.findOne({ user: userId });
//         console.log('wallet before:', wallet);

//         if (!wallet) {
//             wallet = new Wallet({ 
//                 user: userId,
//                 balance: 0,
//                 transactions: []
//             });
//             // Save the new wallet first
//             await wallet.save();
//             console.log('Created new wallet');
//         }

//         // Ensure amount is a number
//         let refundAmount = Number(amount);
//         if (isNaN(refundAmount) || refundAmount <= 0) {
//             throw new Error(`Invalid refund amount: ${amount}`);
//         }

//         // Check if this is a complete order cancellation or individual item
//         const isFullOrder = !itemId;
        
//         // If processing an individual item, mark it as cancelled
//         if (itemId) {
//             const itemIndex = order.orderedItems.findIndex(item => 
//                 item._id.toString() === itemId.toString()
//             );
            
//             if (itemIndex !== -1) {
//                 order.orderedItems[itemIndex].status = actionType === 'cancel' ? 'cancelled' : 'Returned';
//             }
//         }
        
//         // Check if all items are now cancelled or returned
//         const allItemsProcessed = order.orderedItems.every(item => 
//             item.status === 'cancelled' || item.status === 'Returned'
//         );
        
//         // Get delivered items count
//         const deliveredItems = order.orderedItems.filter(item => 
//             item.status === 'delivered'
//         ).length;
        
//         // Include shipping charge in the refund only if:
//         // 1. All items are cancelled/returned AND
//         // 2. No items were ever delivered AND
//         // 3. Shipping hasn't been refunded already
//         if (allItemsProcessed && deliveredItems === 0 && !order.refundStatus?.shippingRefunded) {
//             // Get shipping charge - if not defined in schema use a default calculation
//             const shippingCharge = order.shippingCharge || 
//                                    (order.finalAmount - order.orderedItems.reduce((sum, item) => 
//                                        sum + (item.price * item.quantity), 0));
            
//             if (shippingCharge > 0) {
//                 refundAmount += shippingCharge;
//                 console.log(`Including shipping charge of ${shippingCharge} in refund`);
//             }
//         }

//         // Update wallet with transaction
//         wallet.balance += refundAmount;
//         wallet.transactions.push({
//             amount: refundAmount,
//             type: 'credit',
//             description: reason,
//             orderId: orderId,
//             itemId: itemId || undefined,
//             timestamp: new Date()
//         });

//         // Save wallet changes
//         const updatedWallet = await wallet.save();
//         console.log('Updated wallet balance:', updatedWallet.balance);

//         // Update order status
//         if (!order.refundStatus) {
//             order.refundStatus = {
//                 isRefunded: true,
//                 refundedAmount: refundAmount,
//                 refundedAt: new Date(),
//                 refundMethod: 'wallet',
//                 shippingRefunded: allItemsProcessed && deliveredItems === 0
//             };
//         } else {
//             // Add to the existing refunded amount
//             order.refundStatus.refundedAmount = 
//                 (order.refundStatus.refundedAmount || 0) + refundAmount;
//             order.refundStatus.refundedAt = new Date();
            
//             // Mark shipping as refunded if applicable
//             if (allItemsProcessed && deliveredItems === 0) {
//                 order.refundStatus.shippingRefunded = true;
//             }
//         }

//         await order.save();

//         console.log(`Refund processed successfully: Amount ${refundAmount} credited to wallet for order ${orderId}`);
//         return true;
//     } catch (error) {
//         console.error('Refund processing error:', error);
//         throw error; // Re-throw to handle it in the calling function
//     }
// };


// Controller function for returning an individual order item
const returnOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body; // Reason for return from the form
        
        const order = await Order.findById(orderId)
            .populate('orderedItems.product')
            .populate('couponDetails.couponId');
        
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        // Find the item using findIndex
        const itemIndex = order.orderedItems.findIndex(item =>
            item._id.toString() === itemId.toString()
        );
        
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }
        
        const item = order.orderedItems[itemIndex];
        
        // Validate return eligibility
        if (item.status === 'cancelled' || item.status === 'Returned' || item.status === 'Return Request') {
            return res.status(400).json({
                success: false,
                error: 'Item is already cancelled, returned, or has a pending return request'
            });
        }
        
        if (order.status !== 'delivered') {
            return res.status(400).json({
                success: false,
                error: 'Only delivered orders can be returned'
            });
        }
        
        // Calculate days since delivery
        const deliveredDate = new Date(order.deliveredAt);
        const currentDate = new Date();
        const daysSinceDelivery = Math.floor((currentDate - deliveredDate) / (1000 * 60 * 60 * 24));
        
        // Check if return is within allowed period (e.g., 7 days)
        const RETURN_WINDOW_DAYS = 7;
        if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
            return res.status(400).json({
                success: false,
                error: `Return period of ${RETURN_WINDOW_DAYS} days has expired`
            });
        }
        
        // Update item status to 'Return Request'
        item.status = 'Return Request';
        
        // Add return request details
        if (!order.returnRequests) {
            order.returnRequests = [];
        }
        
        order.returnRequests.push({
            itemId: itemId,
            reason: reason || 'No reason provided',
            requestedAt: new Date(),
            status: 'pending'
        });
        
        // Check if all items are now in return or cancelled state
        const isFullyReturned = order.orderedItems.every(item =>
            ['cancelled', 'Returned', 'Return Request'].includes(item.status)
        );
        
        if (isFullyReturned) {
            order.status = 'Return Request';
        }
        
        await order.save();
        const summary = calculateOrderTotals(order);
        
        res.json({
            success: true,
            message: 'Return request submitted successfully',
            orderSummary: {
                isFullyReturnedOrCancelled: summary.isFullyReturnedOrCancelled,
                currentTotal: summary.currentTotal,
                returnRequestItems: summary.returnRequestItems,
                status: order.status
            }
        });
    } catch (error) {
        console.error('Error processing return request:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process return request',
            details: error.message
        });
    }
};





async function restoreProductQuantity(item) {
    try {
        const product = await Product.findById(item.product._id);
        if (!product) {
            throw new Error(`Product not found: ${item.product._id}`);
        }

        console.log('Restoring quantity for product:', {
            productId: product._id,
            currentQuantity: product.quantity,
            restoringQuantity: item.quantity,
            size: item.size
        });

        // Update total quantity
        const updatedQuantity = product.quantity + item.quantity;
        
        // Update size quantity if applicable
        let updatedSizes = [...product.sizes];
        if (item.size) {
            const sizeIndex = updatedSizes.findIndex(s => s.size === item.size);
            if (sizeIndex !== -1) {
                console.log(`Updating existing size ${item.size}:`, {
                    currentQty: updatedSizes[sizeIndex].quantity,
                    addingQty: item.quantity,
                    newQty: updatedSizes[sizeIndex].quantity + item.quantity
                });
                updatedSizes[sizeIndex].quantity += item.quantity;
            } else {
                console.log(`Adding new size ${item.size} with quantity ${item.quantity}`);
                updatedSizes.push({
                    size: item.size,
                    quantity: item.quantity
                });
            }
        }

        // Update product
        const updatedProduct = await Product.findByIdAndUpdate(
            product._id,
            {
                $set: {
                    quantity: updatedQuantity,
                    sizes: updatedSizes,
                    status: updatedQuantity > 0 ? 'Available' : 'out of stock'
                }
            },
            { new: true }
        );

        console.log('Product updated successfully:', {
            id: updatedProduct._id,
            newQuantity: updatedProduct.quantity,
            newSizes: updatedProduct.sizes,
            newStatus: updatedProduct.status
        });

    } catch (error) {
        console.error('Error restoring product quantity:', error);
        throw error;
    }
}








const validateAndApplyCoupon = async (order, couponId) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon || !coupon.isList) {
        throw new Error('Invalid coupon');
    }

    // Check if coupon is within valid date range
    const now = new Date();
    if (now < coupon.startOn || now > coupon.expireOn) {
        throw new Error('Coupon has expired or not yet active');
    }

    // Calculate current subtotal excluding cancelled/returned items
    const currentSubtotal = order.orderedItems.reduce((sum, item) => 
        item.status !== 'cancelled' && item.status !== 'Returned' ? 
        sum + (item.quantity * item.price) : sum, 0);

    // Check minimum purchase requirement
    if (currentSubtotal < coupon.minimumPrice) {
        throw new Error(`Minimum purchase amount of ₹${coupon.minimumPrice} required`);
    }

    // Calculate discount
    let discountAmount;
    if (coupon.amountType === 'percentage') {
        discountAmount = (currentSubtotal * coupon.offerPrice) / 100;
    } else {
        discountAmount = coupon.offerPrice;
    }

    return {
        couponId: coupon._id,
        couponName: coupon.name,
        discountAmount: discountAmount
    };
}



// const calculateOrderTotals = (order) => {
//     const summary = {
//         originalSubtotal: 0,
//         currentSubtotal: 0,
//         refundedAmount: 0,
//         shippingCharge: parseInt(order.shippingCharge || 50),
//         isFullyReturnedOrCancelled: false,
//         activeItems: 0,
//         returnRequestItems: 0,
//         couponDiscount: 0  // Initialize with 0
//     };

//     // Calculate all subtotals
//     order.orderedItems.forEach(item => {
//         const itemTotal = item.quantity * item.price;
//         summary.originalSubtotal += itemTotal;
        
//         if (item.status === 'Return Request') {
//             summary.returnRequestItems++;
//             summary.refundedAmount += itemTotal;
//         } else if (item.status === 'cancelled' || item.status === 'Returned') {
//             summary.refundedAmount += itemTotal;
//         } else {
//             summary.activeItems++;
//             summary.currentSubtotal += itemTotal;
//         }
//     });

//     // Check if order is fully returned/cancelled
//     summary.isFullyReturnedOrCancelled = order.orderedItems.every(item => 
//         ['cancelled', 'Returned', 'Return Request'].includes(item.status)
//     );

//     // Apply coupon discount - even for cancelled orders to maintain history
//     if (order.couponApplied && order.couponDetails && order.couponDetails.discountAmount) {
//         summary.couponDiscount = parseFloat(order.couponDetails.discountAmount);
//     }

//     // Calculate final amounts
//     summary.originalTotal = summary.originalSubtotal + summary.shippingCharge - summary.couponDiscount;
    
//     // Handle shipping charge in refund calculation
//     if (summary.isFullyReturnedOrCancelled) {
//         if (order.PaymentMethod === 'Online' || order.PaymentMethod === 'Wallet') {
//             // For fully cancelled orders, we want to include the discounted price in the refund
//             summary.refundedAmount = summary.originalTotal;
//         }
//         summary.currentTotal = 0;
//     } else {
//         summary.currentTotal = summary.currentSubtotal + summary.shippingCharge - summary.couponDiscount;
//     }

//     return summary;
// };



const updateOrderAfterModification = async (order, totals) => {
    // Update order document with new calculations
    const updates = {
        finalAmount: totals.finalAmount,
        shippingCharge: totals.shippingCharge
    };

    // Update coupon details
    if (order.couponApplied !== (totals.discount > 0)) {
        updates.couponApplied = totals.discount > 0;
        if (!totals.discount) {
            updates.couponDetails = null;
        } else if (order.couponDetails) {
            updates['couponDetails.discountAmount'] = totals.discount;
        }
    }

    // Sync order status with items
    const allReturned = order.orderedItems.every(item => item.status === 'Returned');

    if (allReturned) {
        updates.status = 'Returned'; // Ensure order status is updated
    } else {
    const allItemStatuses = order.orderedItems.map(item => item.status);
    const uniqueStatuses = new Set(allItemStatuses);

    if (uniqueStatuses.size === 1) {
        // If all items have the same status
        const status = allItemStatuses[0];
        if (['cancelled', 'Returned', 'Return Request'].includes(status)) {
            updates.status = status;
            if (status === 'cancelled') {
                updates.cancelledAt = new Date();
            }
        }
    }
}

    return await Order.findByIdAndUpdate(
        order._id,
        { $set: updates },
        { new: true }
    );
};



const cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const order = await Order.findById(orderId)
            .populate('orderedItems.product')
            .populate('couponDetails.couponId');
       
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        // Find the item using findIndex instead of .id()
        const itemIndex = order.orderedItems.findIndex(item => 
            item._id.toString() === itemId.toString()
        );
        
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }
        
        const item = order.orderedItems[itemIndex];
        
        if (item.status === 'cancelled' || item.status === 'Returned') {
            return res.status(400).json({
                success: false,
                error: 'Item is already cancelled or returned'
            });
        }
        
        if (!['pending', 'processing'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                error: 'Only pending or processing orders can be cancelled'
            });
        }
        
        // Update item status
        item.status = 'cancelled';
        
        const isFullyCancelled = order.orderedItems.every(item =>
            item.status === 'cancelled' || item.status === 'Returned'
        );
       
        // Process refund for online/wallet payments
        if ((order.PaymentMethod === 'Online' || order.PaymentMethod === 'Wallet')) {
            const refundAmount = item.quantity * item.price;
           
            try {
                const refundSuccess = await processRefund(
                    order._id,
                    order.user,
                    refundAmount,
                    'Item cancellation refund',
                    itemId,  // Pass the itemId
                    'cancel' // Specify the action type
                );
               
                if (!refundSuccess) {
                    throw new Error('Failed to process refund');
                }
            } catch (refundError) {
                console.error('Refund processing failed:', refundError);
                throw new Error('Failed to process refund: ' + refundError.message);
            }
        }
        
        // Update order status if needed
        if (isFullyCancelled) {
            order.status = 'cancelled';
            order.cancelledAt = new Date();
        }
        
        await order.save();
        const summary = await calculateOrderTotals(order);
        
        res.json({
            success: true,
            message: 'Item cancelled successfully',
            orderSummary: {
                isFullyCancelled: summary.isFullyCancelled,
                currentTotal: summary.currentTotal,
                refundedAmount: summary.showRefund ? summary.refundedAmount : 0,
                status: order.status
            }
        });
    } catch (error) {
        console.error('Error cancelling order item:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel order item',
            details: error.message
        });
    }
};



const processReturnRefund = async (order, refundAmount) => {
    if (order.PaymentMethod === 'COD') {
        return true;
    }

    try {
        // Calculate refund amount for returned items
        const itemsToRefund = order.orderedItems.filter(item => 
            item.status === 'Returned' || item.status === 'Return Request'
        );
        
        const totalRefundAmount = itemsToRefund.reduce((total, item) => 
            total + (item.quantity * item.price), 0
        );

        // If all items are returned, add shipping charge to refund
        const allItemsReturned = order.orderedItems.every(item => 
            item.status === 'Returned' || item.status === 'Return Request'
        );

        const finalRefundAmount = allItemsReturned ? 
            totalRefundAmount + (order.shippingCharge || 50) : 
            totalRefundAmount;

        // Use your existing processRefund function
        const refundSuccess = await processRefund(
            order._id,
            order.user,
            finalRefundAmount,
            'Return refund'
        );

        if (!refundSuccess) {
            throw new Error('Failed to process refund');
        }

        return true;
    } catch (error) {
        console.error('Return refund processing error:', error);
        throw error;
    }
};




const generateInvoice = async (order) => {
    // Create a new PDF document
    const doc = new PDFDocument();
    
    // Create absolute path for invoices directory
    const invoicesDir = path.join(process.cwd(), 'public', 'invoices');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
    }
    
    // Create absolute path for the invoice file
    const filePath = path.join(invoicesDir, `invoice-${order._id}.pdf`);
    
    // Create write stream
    const writeStream = fs.createWriteStream(filePath);
    
    // Handle writeStream errors
    writeStream.on('error', (error) => {
        console.error('Error writing to file:', error);
        throw error;
    });

    // Pipe the PDF into the write stream
    doc.pipe(writeStream);
    
    // Ensure all values exist and are numbers with default values
    const ensureNumber = (value) => {
        return typeof value === 'number' && !isNaN(value) ? value : 0;
    };

    // Safe toFixed function that handles undefined values
    const safeToFixed = (value, digits = 2) => {
        const num = ensureNumber(value);
        return num.toFixed(digits);
    };

    // Ensure order has expected structure
    if (!order) {
        order = {};
    }
    
    if (!order.orderedItems) {
        order.orderedItems = [];
    }
    
    if (!order.address) {
        order.address = {};
    }

    // Add company logo and header
    doc.fontSize(25).text('DERBY FASHIONS', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text('Tax Invoice/Bill of Supply/Cash Memo', { align: 'center' });
    
    // Add a horizontal line
    doc.moveDown();
    doc.moveTo(50, doc.y)
       .lineTo(550, doc.y)
       .stroke();
    doc.moveDown();

    // Create a two-column layout for order details and shipping address
    const leftColumnX = 50;
    const rightColumnX = 300;
    let startY = doc.y;

    // Left column - Order details
    doc.fontSize(12).text('Order Details:', leftColumnX, startY, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10)
        .text(`Order ID: ${order._id || 'N/A'}`, leftColumnX)
        .text(`Date: ${order.createdOn ? new Date(order.createdOn).toLocaleDateString() : 'N/A'}`, leftColumnX)
        .text(`Payment Method: ${order.PaymentMethod || 'Not specified'}`, leftColumnX);

    // Right column - Shipping address
    doc.fontSize(12).text('Shipping Address:', rightColumnX, startY, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10)
        .text(order.address.name || 'Name not provided', rightColumnX)
        .text(order.address.street || 'Street not provided', rightColumnX)
        .text(`${order.address.city || ''}, ${order.address.state || ''} - ${order.address.zipCode || ''}`, rightColumnX)
        .text(`Phone: ${order.address.phone || 'Not provided'}`, rightColumnX);

    // Move to the end of the longest column
    doc.moveDown(5);
    
    // Add a horizontal line
    doc.moveTo(50, doc.y)
       .lineTo(550, doc.y)
       .stroke();
    doc.moveDown();

    // Create items table
    doc.fontSize(14).text('Order Items', { align: 'center' });
    doc.moveDown();

    // Table headers with borders
    let tableTop = doc.y;
    const tableLeft = 50;
    const tableRight = 550;
    const tableBottom = tableTop + 20 + (order.orderedItems.length || 0) * 30;
    
    // Table column widths
    const col1Width = 250;  // Product name
    const col2Width = 70;   // Quantity
    const col3Width = 90;   // Price
    const col4Width = 90;   // Total
    
    // Draw table header background
    doc.fillColor('#f0f0f0')
       .rect(tableLeft, tableTop, tableRight - tableLeft, 20)
       .fill();
    
    // Reset fill color to black
    doc.fillColor('#000000');
    
    // Draw table headers
    doc.fontSize(10)
        .text('Product', tableLeft + 5, tableTop + 5, { width: col1Width, align: 'left' })
        .text('Quantity', tableLeft + col1Width + 5, tableTop + 5, { width: col2Width, align: 'center' })
        .text('Price', tableLeft + col1Width + col2Width + 5, tableTop + 5, { width: col3Width, align: 'right' })
        .text('Total', tableLeft + col1Width + col2Width + col3Width + 5, tableTop + 5, { width: col4Width, align: 'right' });
    
    // Draw horizontal line after header
    doc.moveTo(tableLeft, tableTop + 20)
       .lineTo(tableRight, tableTop + 20)
       .stroke();
    
    // Add items
    if (Array.isArray(order.orderedItems) && order.orderedItems.length > 0) {
        order.orderedItems.forEach((item, index) => {
            const y = tableTop + 25 + (index * 30);
            
            // Ensure item and its properties exist
            if (!item) {
                item = {};
            }
            
            const quantity = ensureNumber(item.quantity);
            const price = ensureNumber(item.price);
            const itemTotal = quantity * price;
            
            const productName = item.product ? (item.product.productName || 'Product Not Found') : 'Product Not Found';
            
            doc.text(productName, tableLeft + 5, y, { width: col1Width, align: 'left' })
               .text(quantity.toString(), tableLeft + col1Width + 5, y, { width: col2Width, align: 'center' })
               .text(`₹${safeToFixed(price)}`, tableLeft + col1Width + col2Width + 5, y, { width: col3Width, align: 'right' })
               .text(`₹${safeToFixed(itemTotal)}`, tableLeft + col1Width + col2Width + col3Width + 5, y, { width: col4Width, align: 'right' });
            
            // Draw horizontal line after each item
            doc.moveTo(tableLeft, y + 15)
               .lineTo(tableRight, y + 15)
               .stroke();
        });
    } else {
        doc.text('No items in this order', tableLeft + 5, tableTop + 25);
    }

    // Calculate order totals safely
    const calculateSafeTotals = () => {
        let originalSubtotal = 0;
        
        // Calculate subtotal
        if (Array.isArray(order.orderedItems)) {
            originalSubtotal = order.orderedItems.reduce((total, item) => {
                if (!item) return total;
                const quantity = ensureNumber(item.quantity);
                const price = ensureNumber(item.price);
                return total + (quantity * price);
            }, 0);
        }
        
        // Calculate discount
        let discount = 0;
        if (order.couponApplied && order.couponDetails) {
            discount = ensureNumber(order.couponDetails.discountAmount);
        }
        
        // Calculate shipping charge
        const shippingCharge = ensureNumber(order.shippingCharge);
        
        // Calculate final amount
        const finalAmount = originalSubtotal - discount + shippingCharge;
        
        // Calculate refunded amount
        const refundedAmount = ensureNumber(order.refundedAmount);
        
        return {
            originalSubtotal,
            discount,
            shippingCharge,
            finalAmount,
            refundedAmount
        };
    };

    // Use our safe calculation function
    const totals = calculateSafeTotals();
    
    // Move down from the table
    doc.moveDown(2);
    
    // Add totals section with box
    const totalsStartY = doc.y;
    const totalsWidth = 200;
    const totalsLeft = tableRight - totalsWidth;
    let totalsHeight = 0;
    
    // Draw totals box with light background
    doc.fillColor('#f8f8f8');
    
    // Count the number of total lines to determine box height
    let totalLines = 3; // Start with subtotal, shipping, final amount
    if (order.couponApplied && order.couponDetails) totalLines++;
    if (totals.refundedAmount > 0) totalLines++;
    
    totalsHeight = totalLines * 20 + 10; // Height calculation
    
    // Draw the box
    doc.rect(totalsLeft, totalsStartY, totalsWidth, totalsHeight).fill();
    
    // Reset fill color to black for text
    doc.fillColor('#000000');
    
    // Add total lines
    let totalY = totalsStartY + 10;
    doc.fontSize(10)
        .text('Subtotal:', totalsLeft + 10, totalY, { width: totalsWidth / 2, align: 'left' })
        .text(`₹${safeToFixed(totals.originalSubtotal)}`, totalsLeft + totalsWidth / 2, totalY, { width: totalsWidth / 2, align: 'right' });
    
    totalY += 20;
    if (order.couponApplied && order.couponDetails) {
        doc.text(`Discount (${order.couponDetails.couponName || 'Coupon'}):`
            , totalsLeft + 10, totalY, { width: totalsWidth / 2, align: 'left' })
           .text(`-₹${safeToFixed(totals.discount)}`, totalsLeft + totalsWidth / 2, totalY, { width: totalsWidth / 2, align: 'right' });
        totalY += 20;
    }
    
    doc.text('Shipping Charge:', totalsLeft + 10, totalY, { width: totalsWidth / 2, align: 'left' })
       .text(`₹${safeToFixed(totals.shippingCharge)}`, totalsLeft + totalsWidth / 2, totalY, { width: totalsWidth / 2, align: 'right' });
    
    totalY += 20;
    // Draw a line before final amount
    doc.moveTo(totalsLeft + 10, totalY - 5)
       .lineTo(totalsLeft + totalsWidth - 10, totalY - 5)
       .stroke();
    
    // Final amount in bold
    doc.font('Helvetica-Bold')
       .text('Final Amount:', totalsLeft + 10, totalY, { width: totalsWidth / 2, align: 'left' })
       .text(`₹${safeToFixed(totals.finalAmount)}`, totalsLeft + totalsWidth / 2, totalY, { width: totalsWidth / 2, align: 'right' });
    
    // Reset font
    doc.font('Helvetica');
    
    totalY += 20;
    if (totals.refundedAmount > 0) {
        doc.text('Refunded Amount:', totalsLeft + 10, totalY, { width: totalsWidth / 2, align: 'left' })
           .text(`₹${safeToFixed(totals.refundedAmount)}`, totalsLeft + totalsWidth / 2, totalY, { width: totalsWidth / 2, align: 'right' });
    }

    // Add footer
    doc.moveDown(4)
       .fontSize(8)
       .text('This is a computer-generated invoice and does not require a physical signature.', { align: 'center' });
    
    // Add company footer information
    const footerY = doc.page.height - 50;
    doc.fontSize(8)
       .text('DERBY FASHIONS | Address: 123 Business Street, City - PIN | Phone: +91 XXXXXXXXXX | Email: derby@gmail.com', 50, footerY, { align: 'center', width: 500 });

    // Return a promise that resolves when the PDF is finished
    return new Promise((resolve, reject) => {
        // Handle stream finish
        writeStream.on('finish', () => {
            resolve(filePath);
        });

        // Handle stream error
        writeStream.on('error', reject);

        // Finalize the PDF
        doc.end();
    });
};

// Download invoice controller
const downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage price'
            });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Generate invoice
        const invoicePath = await generateInvoice(order);

        // Verify file exists before sending
        if (!fs.existsSync(invoicePath)) {
            throw new Error('Generated invoice file not found');
        }

        // Send file
        res.download(invoicePath, `invoice-${orderId}.pdf`, (err) => {
            if (err) {
                console.error('Error during download:', err);
                // Only send error response if headers haven't been sent
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error downloading invoice' });
                }
            }
            // Delete file after sending (in background)
            fs.unlink(invoicePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting invoice file:', unlinkErr);
            });
        });

    } catch (error) {
        console.error('Error in downloadInvoice:', error);
        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error generating invoice' });
        }
    }
};


module.exports = {
    orderSuccessPage,
    cancelOrder,
    requestReturn,
    getUserOrders,
    processRefund,
    handlePaymentCancel,
    retryPayment,
    cancelOrderItem,
    returnOrderItem,
    calculateOrderTotals,
    updateOrderAfterModification,
    validateAndApplyCoupon,
    processReturnRefund,
    // updateOrderStatusAfterReturn,
    generateInvoice,
    downloadInvoice
    // approveReturn
};