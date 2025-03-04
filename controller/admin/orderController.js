const Order = require('../../model/orderSchema');
const Product = require('../../model/productSchema');
const Address = require('../../model/addressSchema');
const Wallet = require('../../model/walletSchema');



    // Get all orders
    const getAllOrders = async (req, res) => {
        try {

            const { startDate, endDate, status } = req.query;
        
            // Build filter object
            let filter = {
                status: { $ne: 'payment_failed' }
            };
            
            // Add date filter if both dates are provided
            if (startDate && endDate) {
                filter.createdOn = {
                    $gte: new Date(startDate),
                    $lte: new Date(new Date(endDate).setHours(23, 59, 59))
                };
            }
            
            // Add status filter if provided
            if (status && status !== 'all') {
                filter.status = status;
            } else if (status === 'all') {
                // If 'all' is selected, remove the default status exclusion but still exclude payment_failed
                delete filter.status;
                filter.status = { $ne: 'payment_failed' };
            }

            const orders = await Order.find(filter)
                .populate({
                    path: 'orderedItems.product',
                    select: 'productName productImage salePrice'
                })
                .populate('user', 'name email')
                .sort({ createdOn: -1 });
    

                // console.log("total orders:",orders)
            // Pass additional details like status if needed
            res.render('orders', {
                orders,  // Rendered data
                currentPage: 'orders',
                filters: {
                    startDate: startDate || '',
                    endDate: endDate || '',
                    status: status || ''
                }  
            });
        } catch (error) {
            console.error('Error fetching orders:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching orders',
                error: error.message
            });
        }
    };
    
    const processRefund = async (orderId, userId, amount, reason) => {
        try {
            const order = await Order.findById(orderId);
            if (!order) throw new Error('Order not found');
    
            // Find or create wallet with proper error handling
            let wallet = await Wallet.findOne({ user: userId });
            console.log('wallet before:', wallet);
    
            if (!wallet) {
                wallet = new Wallet({ 
                    user: userId,
                    balance: 0,
                    transactions: []
                });
                // Save the new wallet first
                await wallet.save();
                console.log('Created new wallet');
            }
    
            // Ensure amount is a number
            const refundAmount = Number(amount);
            if (isNaN(refundAmount) || refundAmount <= 0) {
                throw new Error(`Invalid refund amount: ${amount}`);
            }
    
            // Update wallet with transaction
            wallet.balance += refundAmount;
            wallet.transactions.push({
                amount: refundAmount,
                type: 'credit',
                description: reason,
                orderId: orderId,
                timestamp: new Date()
            });
    
            // Save wallet changes
            const updatedWallet = await wallet.save();
            console.log('Updated wallet balance:', updatedWallet.balance);
    
            // Update order status
            order.refundStatus = {
                isRefunded: true,
                refundedAmount: refundAmount,
                refundedAt: new Date(),
                refundMethod: 'wallet'
            };
    
            await order.save();
    
            console.log(`Refund processed successfully: Amount ${refundAmount} credited to wallet for order ${orderId}`);
            return true;
        } catch (error) {
            console.error('Refund processing error:', error);
            throw error; // Re-throw to handle it in the calling function
        }
    };


  


    

// const updateOrderStatus = async (req, res) => {
//     try {
//         const orderId = req.params.id;
//         const { status, itemId } = req.body;

//         const existingOrder = await Order.findById(orderId)
//             .populate({
//                 path: 'orderedItems.product',
//                 select: '_id productName quantity sizes status salePrice'
//             });

//         if (!existingOrder) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Order not found'
//             });
//         }

//         // Check if order is cancelled by user
//         if (existingOrder.isCancelledByUser) {
//             return res.status(403).json({
//                 success: false,
//                 message: "Order has been cancelled by the user. Status updates are not allowed."
//             });
//         }

//         // Check if status update is allowed
//         if ((existingOrder.status === 'delivered' ||
//              existingOrder.status === 'Return Request' ||
//              existingOrder.status === 'Returned') &&
//             status !== 'Return Request' &&
//             status !== 'Returned') {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Only Return Request or Returned status are allowed at this stage'
//             });
//         }

//         let shouldRefund = false;
//         let refundedAmount = 0;
//         const userId = existingOrder.user;

//         if (itemId) {
//             const item = existingOrder.orderedItems.find(i => i._id.toString() === itemId);
//             if (item) {
//                 // Don't allow item status updates if order is in special status
//                 if (['Return Request', 'Returned', 'cancelled'].includes(existingOrder.status)) {
//                     return res.status(400).json({
//                         success: false,
//                         message: 'Cannot update individual item status when order is returned or cancelled'
//                     });
//                 }

//                 if (status === "Returned") {
//                     item.status = "Returned";
//                     shouldRefund = true;
//                     refundedAmount = item.product.salePrice * item.quantity;
//                 } else if (status === "cancelled" && ['pending', 'processing'].includes(item.status)) {
//                     item.status = "cancelled";
//                     shouldRefund = true;
//                     refundedAmount = item.product.salePrice * item.quantity;
//                 }
//             }
//         } 
//         // Case 2: Admin updates the entire order
//         else {
//             if (['Returned', 'cancelled', 'Return Request'].includes(status)) {
//                 existingOrder.status = status;
//                 existingOrder.orderedItems.forEach(item => {
//                     // Only update items that aren't already cancelled or returned
//                     if (!['cancelled', 'Returned'].includes(item.status)) {
//                         item.status = status;
//                         if (['Returned', 'cancelled'].includes(status)) {
//                             shouldRefund = true;
//                             refundedAmount += item.product.salePrice * item.quantity;
//                         }
//                     }
//                 });
//             }
//         }

//         // 🛠 **Process refund and restore inventory when status is changed**
//         if (shouldRefund) {
//             try {
//                 for (const orderItem of existingOrder.orderedItems) {
//                     if (orderItem.status === "Returned" || orderItem.status === "cancelled") {
//                         const quantityToRestore = parseInt(orderItem.quantity, 10);
//                         if (isNaN(quantityToRestore)) {
//                             console.error('Invalid quantity format:', orderItem.quantity);
//                             continue;
//                         }

//                         const productId = orderItem.product._id || orderItem.product;
//                         const product = await Product.findById(productId);

//                         if (!product) {
//                             console.error(`Product not found for ID: ${productId}`);
//                             continue;
//                         }

//                         // Update total quantity
//                         const updatedQuantity = product.quantity + quantityToRestore;

//                         // Update size-specific quantity
//                         let updatedSizes = [...product.sizes];
//                         if (orderItem.size) {
//                             const sizeIndex = updatedSizes.findIndex(s => s.size === orderItem.size);
//                             if (sizeIndex !== -1) {
//                                 updatedSizes[sizeIndex].quantity += quantityToRestore;
//                             } else {
//                                 updatedSizes.push({
//                                     size: orderItem.size,
//                                     quantity: quantityToRestore
//                                 });
//                             }
//                         }

//                         // Update product in database
//                         await Product.findByIdAndUpdate(
//                             productId,
//                             {
//                                 $set: {
//                                     quantity: updatedQuantity,
//                                     sizes: updatedSizes,
//                                     status: updatedQuantity > 0 ? 'Available' : 'Out of Stock'
//                                 }
//                             }
//                         );
//                     }
//                 }

//                 // 🛠 **Process refund if payment was online or wallet**
//                 if (refundedAmount > 0 && ["Online", "Wallet"].includes(existingOrder.PaymentMethod)) {
//                     try {
//                         await processRefund(orderId, userId, refundedAmount, "Order returned");

//                         existingOrder.refundStatus = {
//                             isRefunded: true,
//                             refundedAmount,
//                             refundedAt: new Date(),
//                             refundMethod: "wallet"
//                         };
//                     } catch (error) {
//                         console.error('Refund failed:', error);
//                         return res.status(500).json({
//                             success: false,
//                             message: 'Refund processing failed',
//                             error: error.message
//                         });
//                     }
//                 }
//             } catch (error) {
//                 console.error('Error processing return:', error);
//                 return res.status(500).json({
//                     success: false,
//                     message: 'Error processing return and refund',
//                     error: error.message
//                 });
//             }
//         }

//         // Update delivery date if order is marked as delivered
//         if (status === 'delivered') {
//             existingOrder.deliveredDate = new Date();
//         }

//         // Save the updated order
//         existingOrder.status = status;
//         await existingOrder.save();

//         res.status(200).json({
//             success: true,
//             message: 'Order status updated successfully, refund processed (if applicable)',
//             order: existingOrder
//         });

//     } catch (error) {
//         console.error('Error updating order status:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error updating order status',
//             error: error.message
//         });
//     }
// };



    // const getOrderDetails = async (req, res) => {
    //     try {
    //         const orderId = req.params.id;
    //         const order = await Order.findById(orderId)
    //             .populate({
    //                 path: 'orderedItems.product',
    //                 select: 'productName productImage salePrice'
    //             })
    //             .populate('user', 'name email')
    //             .populate('address');
    
    //         if (!order) {
    //             return res.status(404).render('error', {
    //                 message: 'Order not found',
    //                 currentPage: 'orders'
    //             });
    //         }
    
    //         // Calculate total amount if it's not already present
    //         const totalAmount = order.orderedItems.reduce((total, item) => {
    //             return total + (item.product.salePrice * item.quantity);
    //         }, 0);
    
    //         // Combine the order data with calculated total
    //         const orderData = {
    //             ...order.toObject(),
    //             totalAmount: totalAmount
    //         };
    
    //         console.log("Order Data:", orderData); // For debugging
    
    //         res.render('orderdetails', {
    //             order: orderData,
    //             currentPage: 'orders'
    //         });
    //     } catch (error) {
    //         console.error('Error fetching order details:', error);
    //         res.status(500).render('error', {
    //             message: 'Error fetching order details',
    //             currentPage: 'orders'
    //         });
    //     }
    // };

    // const updateItemStatus = async (req, res) => {
    //     try {
    //         const orderId = req.params.id;
    //         const { itemId, status } = req.body;
    
    //         const order = await Order.findById(orderId)
    //             .populate({
    //                 path: 'orderedItems.product',
    //                 select: '_id productName quantity sizes status salePrice'
    //             });
    
    //         if (!order) {
    //             return res.status(404).json({
    //                 success: false,
    //                 message: 'Order not found'
    //             });
    //         }
    
    //         // Find the specific item
    //         const item = order.orderedItems.id(itemId);
    //         if (!item) {
    //             return res.status(404).json({
    //                 success: false,
    //                 message: 'Order item not found'
    //             });
    //         }
    
    //         // Check if status update is allowed
    //         if (['delivered', 'cancelled'].includes(item.status)) {
    //             return res.status(400).json({
    //                 success: false,
    //                 message: 'Cannot update status of items that are delivered, cancelled, or returned'
    //             });
    //         }
    
    //         // Update the item status
    //         item.status = status;
    
    //         // If item is being returned or cancelled, handle inventory and refund
    //         if ( status === 'cancelled') {
    //             // Restore inventory
    //             const product = await Product.findById(item.product._id);
    //             if (product) {
    //                 product.quantity += item.quantity;
                    
    //                 // Update size-specific quantity if applicable
    //                 if (item.size) {
    //                     const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
    //                     if (sizeIndex !== -1) {
    //                         product.sizes[sizeIndex].quantity += item.quantity;
    //                     }
    //                 }
                    
    //                 await product.save();
    //             }
    
    //             // Process refund if payment was online or wallet
    //             if (order.PaymentMethod === 'Online' || order.PaymentMethod === 'Wallet') {
    //                 const refundAmount = (item.price || item.product.salePrice) * item.quantity;
    //             if (!isNaN(refundAmount) && refundAmount > 0) {
    //                 await processRefund(orderId, order.user, refundAmount, `Refund for ${status} item`);
    //             }
    //         }
    //         }

    //         const allItemsCancelled = order.orderedItems.every(item => item.status === 'cancelled');
    //         if (allItemsCancelled) {
    //             order.status = 'cancelled';
    //         }
    
    
    //         // Save the updated order
    //         await order.save();
    
    //         res.status(200).json({
    //             success: true,
    //             message: 'Item status updated successfully'
    //         });
    
    //     } catch (error) {
    //         console.error('Error updating item status:', error);
    //         res.status(500).json({
    //             success: false,
    //             message: 'Error updating item status',
    //             error: error.message
    //         });
    //     }
    // };


    // const getOrderDetails = async (req, res) => {
    //     try {
    //         const orderId = req.params.id;
    //         const order = await Order.findById(orderId)
    //             .populate({
    //                 path: 'orderedItems.product',
    //                 select: 'productName productImage salePrice'
    //             })
    //             .populate('user', 'name email')
    //             .populate('address');
    
    //         if (!order) {
    //             return res.status(404).render('error', {
    //                 message: 'Order not found',
    //                 currentPage: 'orders'
    //             });
    //         }
    
    //         // Calculate subtotal (items total)
    //         const subtotal = order.orderedItems.reduce((total, item) => {
    //             return total + (item.product.salePrice * item.quantity);
    //         }, 0);
    
    //         // Get coupon discount amount
    //         let couponDiscount = 0;
    //         if (order.couponApplied && order.couponDetails && order.couponDetails.discountAmount) {
    //             couponDiscount = order.couponDetails.discountAmount;
    //         }
            
    //         // Get shipping charge
    //         const shippingCharge = order.shippingCharge || 50;
    
    //         // Calculate final total amount
    //         const totalAmount = subtotal - couponDiscount + shippingCharge;
    
    //         // Combine the order data with calculated values
    //         const orderData = {
    //             ...order.toObject(),
    //             subtotal: subtotal,
    //             couponDiscount: couponDiscount,
    //             shippingCharge: shippingCharge,
    //             totalAmount: totalAmount
    //         };

            
    
    //         console.log("Order Data:", orderData); // For debugging
    
    //         res.render('orderdetails', {
    //             order: orderData,
    //             currentPage: 'orders'
    //         });
    //     } catch (error) {
    //         console.error('Error fetching order details:', error);
    //         res.status(500).render('error', {
    //             message: 'Error fetching order details',
    //             currentPage: 'orders'
    //         });
    //     }
    // };

    // const updateItemStatus = async (req, res) => {
    //     try {
    //         const orderId = req.params.id;
    //         const { itemId, status } = req.body;
    
    //         const order = await Order.findById(orderId)
    //             .populate({
    //                 path: 'orderedItems.product',
    //                 select: '_id productName quantity sizes status salePrice'
    //             });
    
    //         if (!order) {
    //             return res.status(404).json({ success: false, message: 'Order not found' });
    //         }
    
    //         // Find the specific item
    //         const item = order.orderedItems.find(i => i._id.toString() === itemId);
    //         if (!item) {
    //             return res.status(404).json({ success: false, message: 'Order item not found' });
    //         }
    
    //         // Restrict status change options
    //         if (['Cancelled', 'Returned'].includes(item.status)) {
    //             return res.status(400).json({ success: false, message: 'Cannot update status of cancelled or returned items' });
    //         }
    
    //         // Allow only "Cancelled" when item status is "Processing" or "Pending"
    //         if (status === 'Cancelled' && ['Processing', 'Pending'].includes(item.status)) {
    //             item.status = 'Cancelled';
    //         } 
    //         // Allow only "Returned" when item is in "Return Request"
    //         else if (status === 'Returned' && item.status === 'Return Request') {
    //             item.status = 'Returned';
    
    //             // Restore inventory if returned
    //             const product = await Product.findById(item.product._id);
    //             if (product) {
    //                 product.quantity += item.quantity;
                    
    //                 if (item.size) {
    //                     const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
    //                     if (sizeIndex !== -1) {
    //                         product.sizes[sizeIndex].quantity += item.quantity;
    //                     }
    //                 }
    
    //                 await product.save();
    //             }
    
    //             // Process refund for returns
    //             if (['Online', 'Wallet'].includes(order.PaymentMethod)) {
    //                 const refundAmount = (item.product.salePrice || item.price) * item.quantity;
    //                 if (!isNaN(refundAmount) && refundAmount > 0) {
    //                     await processRefund(orderId, order.user, refundAmount, 'Refund for returned item');
    //                 }
    //             }
    
    //             // Check if all items are returned
    //             const allItemsReturned = order.orderedItems.every(i => i.status === 'Returned');
    //             if (allItemsReturned) {
    //                 order.status = 'Returned';
    //             }
    //         } 
    //         // Any other status change is not allowed
    //         else {
    //             return res.status(400).json({ success: false, message: 'Invalid status change request' });
    //         }
    
    //         // Explicitly mark array as modified
    //         order.markModified('orderedItems');
    
    //         // Save updated order
    //         await order.save();
    
    //         res.status(200).json({ success: true, message: 'Item status updated successfully' });
    
    //     } catch (error) {
    //         console.error('Error updating item status:', error);
    //         res.status(500).json({ success: false, message: 'Error updating item status', error: error.message });
    //     }
    // };
    


    // const updateOrderStatus = async (req, res) => {
    //     try {
    //         const orderId = req.params.id;
    //         const { status } = req.body;
    
    //         const order = await Order.findById(orderId).populate({
    //             path: 'orderedItems.product',
    //             select: '_id productName quantity sizes status salePrice',
    //         });
    
    //         if (!order) {
    //             return res.status(404).json({
    //                 success: false,
    //                 message: 'Order not found',
    //             });
    //         }
    
    //         // Define valid status transitions
    //         const statusRules = {
    //             'cancelled': {
    //                 validFrom: ['pending', 'processing'],
    //                 itemStatus: 'cancelled',
    //             },
    //             'Returned': {
    //                 validFrom: ['Return Request'],
    //                 itemStatus: 'Returned',
    //             },
    //             'processing': {
    //                 validFrom: ['pending'],
    //                 itemStatus: 'processing',
    //             },
    //             'shipped': {
    //                 validFrom: ['processing'],
    //                 itemStatus: 'shipped',
    //             },
    //             'delivered': {
    //                 validFrom: ['shipped'],
    //                 itemStatus: 'delivered',
    //             },
    //             'Return Request': {
    //                 validFrom: ['delivered'],
    //                 itemStatus: 'Return Request',
    //             }
    //         };
    
    //         // Check if requested status is valid
    //         if (!statusRules[status]) {
    //             return res.status(400).json({
    //                 success: false,
    //                 message: 'Invalid order status requested',
    //             });
    //         }
    
    //         // Check if status transition is valid
    //         if (!statusRules[status].validFrom.includes(order.status)) {
    //             return res.status(400).json({
    //                 success: false,
    //                 message: `Order status cannot be changed to ${status} from ${order.status}`,
    //             });
    //         }
    
    //         const previousOrderStatus = order.status;
            
    //         // Update order and all items statuses
    //         order.status = status;
            
    //         // Update all item statuses to match order status for relevant transitions
    //         if (['cancelled', 'Returned', 'processing', 'shipped', 'delivered', 'Return Request'].includes(status)) {
    //             // For these statuses, update all eligible items
    //             for (const item of order.orderedItems) {
    //                 // Only update items that are eligible for the status change
    //                 if (status === 'cancelled' && ['pending', 'processing'].includes(item.status)) {
    //                     item.status = 'cancelled';
    //                 } 
    //                 else if (status === 'Returned' && item.status === 'Return Request') {
    //                     item.status = 'Returned';
    //                     item.returnCompletedAt = new Date();
    //                 }
    //                 else if (status === 'processing' && item.status === 'pending') {
    //                     item.status = 'processing';
    //                 }
    //                 else if (status === 'shipped' && item.status === 'processing') {
    //                     item.status = 'shipped';
    //                 }
    //                 else if (status === 'delivered' && item.status === 'shipped') {
    //                     item.status = 'delivered';
    //                 }
    //                 else if (status === 'Return Request' && item.status === 'delivered') {
    //                     item.status = 'Return Request';
    //                 }
    //             }
    //         }
            
    //         // Set special timestamps based on status
    //         if (status === 'cancelled') {
    //             order.cancelledAt = new Date();
    //         } else if (status === 'Returned') {
    //             order.returnCompletedAt = new Date();
    //         } else if (status === 'delivered') {
    //             order.deliveredAt = new Date();
    //         } else if (status === 'Return Request') {
    //             order.returnRequestedAt = new Date();
    //         }
    
    //         // Process refunds for cancelled or returned orders
    //         if (['cancelled', 'Returned'].includes(status) && 
    //             ['Online', 'Wallet'].includes(order.PaymentMethod)) {
                
    //             // Calculate refund amount for all affected items
    //             let refundAmount = 0;
                
    //             for (const item of order.orderedItems) {
    //                 if (item.status === status) {
    //                     refundAmount += item.price * item.quantity;
                        
    //                     // Restore product inventory
    //                     const productId = item.product._id || item.product;
    //                     const product = await Product.findById(productId);
                        
    //                     if (product) {
    //                         const quantityToRestore = parseInt(item.quantity, 10);
    //                         const updatedQuantity = product.quantity + quantityToRestore;
                            
    //                         let updatedSizes = [...product.sizes];
    //                         if (item.size) {
    //                             const sizeIndex = updatedSizes.findIndex((s) => s.size === item.size);
    //                             if (sizeIndex !== -1) {
    //                                 updatedSizes[sizeIndex].quantity += quantityToRestore;
    //                             } else {
    //                                 updatedSizes.push({
    //                                     size: item.size,
    //                                     quantity: quantityToRestore,
    //                                 });
    //                             }
    //                         }
                            
    //                         await Product.findByIdAndUpdate(productId, {
    //                             $set: {
    //                                 quantity: updatedQuantity,
    //                                 sizes: updatedSizes,
    //                                 status: updatedQuantity > 0 ? 'Available' : 'Out of Stock',
    //                             },
    //                         });
    //                     }
    //                 }
    //             }
                
    //             if (refundAmount > 0) {
    //                 await processRefund(orderId, order.user, refundAmount, `Order ${status}`);
    //                 order.totalRefundedAmount = (order.totalRefundedAmount || 0) + refundAmount;
    //             }
    //         }
    
    //         await order.save();
    
    //         res.status(200).json({
    //             success: true,
    //             message: `Order status updated from ${previousOrderStatus} to ${status} successfully`,
    //             order: {
    //                 _id: order._id,
    //                 status: order.status,
    //             },
    //         });
    //     } catch (error) {
    //         console.error('Error updating order status:', error);
    //         res.status(500).json({
    //             success: false,
    //             message: 'Error updating order status',
    //             error: error.message,
    //         });
    //     }
    // };

    const updateOrderStatus = async (req, res) => {
        try {
            const orderId = req.params.id;
            const { status } = req.body;
    
            const order = await Order.findById(orderId).populate({
                path: 'orderedItems.product',
                select: '_id productName quantity sizes status salePrice',
            });
    
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found',
                });
            }
    
            // Define valid status transitions
            const statusRules = {
                'cancelled': {
                    validFrom: ['pending', 'processing'],
                    itemStatus: 'cancelled',
                },
                'Returned': {
                    validFrom: ['Return Request'],
                    itemStatus: 'Returned',
                },
                'processing': {
                    validFrom: ['pending'],
                    itemStatus: 'processing',
                },
                'shipped': {
                    validFrom: ['processing'],
                    itemStatus: 'shipped',
                },
                'delivered': {
                    validFrom: ['shipped'],
                    itemStatus: 'delivered',
                },
                'Return Request': {
                    validFrom: ['delivered'],
                    itemStatus: 'Return Request',
                }
            };
    
            if (!statusRules[status]) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order status requested',
                });
            }
    
            if (!statusRules[status].validFrom.includes(order.status)) {
                return res.status(400).json({
                    success: false,
                    message: `Order status cannot be changed to ${status} from ${order.status}`,
                });
            }
    
            const previousOrderStatus = order.status;
            order.status = status;
    
            // Synchronize all active item statuses with order status
            for (const item of order.orderedItems) {
                // Skip items that are already cancelled or returned
                if (!['cancelled', 'Returned'].includes(item.status)) {
                    // For Return Request, only update if item is delivered
                    if (status === 'Return Request' && item.status !== 'delivered') {
                        continue;
                    }
                    // For Returned, only update if item is in Return Request
                    if (status === 'Returned' && item.status !== 'Return Request') {
                        continue;
                    }
                    item.status = statusRules[status].itemStatus;
                    
                    // Set item-specific timestamps
                    if (status === 'Returned') {
                        item.returnCompletedAt = new Date();
                    } else if (status === 'Return Request') {
                        item.returnRequestedAt = new Date();
                    }
                }
            }
    
            // Set order-level timestamps
            if (status === 'cancelled') {
                order.cancelledAt = new Date();
            } else if (status === 'Returned') {
                order.returnCompletedAt = new Date();
            } else if (status === 'delivered') {
                order.deliveredDate = new Date();
            } else if (status === 'Return Request') {
                order.returnRequestedAt = new Date();
            }
    
            // Process refunds
            if (['cancelled', 'Returned'].includes(status) && 
                ['Online', 'Wallet'].includes(order.PaymentMethod)) {
                let refundAmount = 0;
    
                for (const item of order.orderedItems) {
                    if (item.status === status) {
                        refundAmount += item.price * item.quantity;
                        // Restore inventory logic remains the same
                        const productId = item.product._id || item.product;
                        const product = await Product.findById(productId);
                        
                        if (product) {
                            const quantityToRestore = parseInt(item.quantity, 10);
                            const updatedQuantity = product.quantity + quantityToRestore;
                            let updatedSizes = [...product.sizes];
                            
                            if (item.size) {
                                const sizeIndex = updatedSizes.findIndex((s) => s.size === item.size);
                                if (sizeIndex !== -1) {
                                    updatedSizes[sizeIndex].quantity += quantityToRestore;
                                } else {
                                    updatedSizes.push({
                                        size: item.size,
                                        quantity: quantityToRestore,
                                    });
                                }
                            }
    
                            await Product.findByIdAndUpdate(productId, {
                                $set: {
                                    quantity: updatedQuantity,
                                    sizes: updatedSizes,
                                    status: updatedQuantity > 0 ? 'Available' : 'Out of Stock',
                                },
                            });
                        }
                    }
                }
    
                if (refundAmount > 0) {
                    await processRefund(orderId, order.user, refundAmount, `Order ${status}`);
                    order.totalRefundedAmount = (order.totalRefundedAmount || 0) + refundAmount;
                }
            }
    
            await order.save();
    
            res.status(200).json({
                success: true,
                message: `Order status updated from ${previousOrderStatus} to ${status} successfully`,
                order: {
                    _id: order._id,
                    status: order.status,
                },
            });
        } catch (error) {
            console.error('Error updating order status:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating order status',
                error: error.message,
            });
        }
    };


    const getOrderDetails = async (req, res) => {
        try {
            const orderId = req.params.id;
            

            if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).render('admin-error', {
                    message: 'Invalid order ID format',
                    currentPage: 'orders'
                });
            }

            const order = await Order.findById(orderId)
                .populate({
                    path: 'orderedItems.product',
                    select: 'productName productImage salePrice'
                })
                .populate('user', 'name email phone');
            
            if (!order) {
                return res.status(404).render('error', {
                    message: 'Order not found',
                    currentPage: 'orders'
                });
            }
    
            // Calculate subtotal
            let subtotal = 0;
            order.orderedItems.forEach(item => {
                subtotal += item.price * item.quantity;
            });
    
            // Format dates for display
            const formattedCreatedDate = order.createdOn ? new Date(order.createdOn).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'N/A';
    
            const formattedDeliveredDate = order.deliveredDate ? new Date(order.deliveredDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'N/A';
    
            // Check if each item can be cancelled or returned
            order.orderedItems.forEach(item => {
                // Can only cancel if status is pending or processing
                item.canBeCancelled = ['pending', 'processing'].includes(item.status);
                
                // Can only mark as returned if status is Return Request
                item.canBeReturned = item.status === 'Return Request';
            });
            
            res.render('orderdetails', {
                order,
                subtotal,
                formattedCreatedDate,
                formattedDeliveredDate,
                currentPage: 'orders'
            });
        } catch (error) {
            console.error('Error fetching order details:', error);
            res.status(500).render('admin-error', {
                message: 'Error fetching order details',
                error: error.message,
                currentPage: 'orders'
            });
        }
    };
    
   
    const updateItemStatus = async (req, res) => {
        try {
            const orderId = req.params.id;
            const { itemId, status } = req.body;
    
            // Find the order and populate product information
            const order = await Order.findById(orderId)
                .populate({
                    path: 'orderedItems.product',
                    select: '_id productName quantity sizes status salePrice'
                });
    
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }
    
            // Find the specific item in the order
            const item = order.orderedItems.find(i => i._id.toString() === itemId);
            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Ordered item not found'
                });
            }
    
            // Check if status change is valid based on current status
            if (status === 'cancelled') {
                if (!['pending', 'processing'].includes(item.status)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Item can only be cancelled if status is pending or processing'
                    });
                }
            } else if (status === 'Returned') {
                if (item.status !== 'Return Request') {
                    return res.status(400).json({
                        success: false,
                        message: 'Item can only be marked as returned if a return request exists'
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status change requested'
                });
            }
    
            // Process the status change
            const previousStatus = item.status;
            item.status = status;
    
            // Process refund and restore inventory if item is cancelled or returned
            if (['cancelled', 'Returned'].includes(status)) {
                let shouldRefund = true;
                let refundedAmount = item.price * item.quantity;
                const userId = order.user;
    
                try {
                    // Restore product inventory
                    const productId = item.product._id || item.product;
                    const product = await Product.findById(productId);
    
                    if (product) {
                        const quantityToRestore = parseInt(item.quantity, 10);
                        
                        // Update total quantity
                        const updatedQuantity = product.quantity + quantityToRestore;
    
                        // Update size-specific quantity if applicable
                        let updatedSizes = [...product.sizes];
                        if (item.size) {
                            const sizeIndex = updatedSizes.findIndex(s => s.size === item.size);
                            if (sizeIndex !== -1) {
                                updatedSizes[sizeIndex].quantity += quantityToRestore;
                            } else {
                                updatedSizes.push({
                                    size: item.size,
                                    quantity: quantityToRestore
                                });
                            }
                        }
    
                        // Update product in database
                        await Product.findByIdAndUpdate(
                            productId,
                            {
                                $set: {
                                    quantity: updatedQuantity,
                                    sizes: updatedSizes,
                                    status: updatedQuantity > 0 ? 'Available' : 'Out of Stock'
                                }
                            }
                        );
    
                        // Process refund if payment was online or wallet
                        if (refundedAmount > 0 && ["Online", "Wallet"].includes(order.PaymentMethod)) {
                            await processRefund(orderId, userId, refundedAmount, `Item ${status}`);
    
                            // Update refund status in the order
                            order.totalRefundedAmount = (order.totalRefundedAmount || 0) + refundedAmount;
                            if (status === 'Returned') {
                                item.returnCompletedAt = new Date();
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing refund or inventory:', error);
                    return res.status(500).json({
                        success: false,
                        message: 'Error processing refund or inventory',
                        error: error.message
                    });
                }
            }
    
            // Update order status based on item statuses
            const allItemsStatuses = order.orderedItems.map(i => i.status);
            const activeItems = order.orderedItems.filter(i => 
                !['cancelled', 'Returned'].includes(i.status)
            );
    
            // If all items are in Return Request status, update order status
            if (activeItems.length > 0 && activeItems.every(i => i.status === 'Return Request')) {
                order.status = 'Return Request';
            }
            // If all items are Returned, update order status
            else if (order.orderedItems.length > 0 && order.orderedItems.every(i => i.status === 'Returned')) {
                order.status = 'Returned';
                order.returnCompletedAt = new Date();
            }
            // If all items are cancelled, update order status
            else if (order.orderedItems.length > 0 && order.orderedItems.every(i => i.status === 'cancelled')) {
                order.status = 'cancelled';
                order.cancelledAt = new Date();
            }
    
            // Save the order
            await order.save();
    
            res.status(200).json({
                success: true,
                message: `Item status updated from ${previousStatus} to ${status} successfully`,
                order: {
                    _id: order._id,
                    status: order.status
                }
            });
    
        } catch (error) {
            console.error('Error updating item status:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating item status',
                error: error.message
            });
        }
    };

    
   

module.exports = {
    getAllOrders,
    updateOrderStatus,
    getOrderDetails,
    processRefund,
    updateItemStatus
}