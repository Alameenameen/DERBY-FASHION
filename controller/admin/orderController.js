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
    
    //         // Check if order is cancelled
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
    
    //         // Case 1: Admin updates a single item to "Returned"
    //         if (itemId) {
    //             const item = existingOrder.orderedItems.find(i => i._id.toString() === itemId);
    //             if (item && status === "Returned") {
    //                 item.status = "Returned";
    //                 shouldRefund = true;
    //             }
    //         } 
    //         // Case 2: Admin updates the entire order to "Returned"
    //         else if (status === "Returned") {
    //             existingOrder.status = "Returned";
    //             existingOrder.orderedItems.forEach(item => {
    //                 if (item.status === "Return Request") {
    //                     item.status = "Returned";
    //                     shouldRefund = true;
    //                 }
    //             });
    //         }
    
    //         // Process refund and restore inventory when status is changed to "Returned"
    //         if (shouldRefund) {
    //             try {
    //                 let refundedAmount = 0;
    
    //                 for (const orderItem of existingOrder.orderedItems) {
    //                     if (orderItem.status === "Returned") {
    //                         refundedAmount += orderItem.price * orderItem.quantity;
    
    //                         // Restore inventory quantities
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
    
    //                 // Process refund if payment was online or wallet
    //                 if (existingOrder.PaymentMethod === "Online" || existingOrder.PaymentMethod === "Wallet") {
    //                     existingOrder.refundStatus = {
    //                         isRefunded: true,
    //                         refundedAmount,
    //                         refundedAt: new Date(),
    //                         refundMethod: "wallet"
    //                     };
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
    
    //         // Update the order
    //         const updateData = status === 'delivered'
    //             ? { status, deliveredDate: new Date() }
    //             : { status };
    
    //         const updatedOrder = await Order.findByIdAndUpdate(
    //             orderId,
    //             updateData,
    //             { new: true }
    //         );
    
    //         res.status(200).json({
    //             success: true,
    //             message: 'Order status updated successfully',
    //             order: updatedOrder
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
    



//     const updateOrderStatus = async (req, res) => {
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
//                 } else if (status === "cancelled" && ['pending', 'processing'].includes(item.status)) {
//                     item.status = "cancelled";
//                     shouldRefund = true;
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
//                         }
//                     }
//                 });
//             }
//         }

//         // Process refund and restore inventory when status is changed
//         if (shouldRefund) {
//             try {
//                 let refundedAmount = 0;

//                 for (const orderItem of existingOrder.orderedItems) {
//                     if (orderItem.status === "Returned" || orderItem.status === "cancelled") {
//                         // Calculate refund using the stored price or product price
//                         const itemPrice = orderItem.price || orderItem.product.salePrice;
//                         if (!isNaN(itemPrice)) {
//                             refundedAmount += itemPrice * orderItem.quantity;
//                         }

//                         // Restore inventory quantities
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

//                 // Process refund if payment was online or wallet and there's a valid amount
//                 if (refundedAmount > 0 && (existingOrder.PaymentMethod === "Online" || existingOrder.PaymentMethod === "Wallet")) {
//                     existingOrder.refundStatus = {
//                         isRefunded: true,
//                         refundedAmount,
//                         refundedAt: new Date(),
//                         refundMethod: "wallet"
//                     };
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
//             message: 'Order status updated successfully',
//             order: existingOrder
//         });

//     }catch (error) {
//         console.error('Error updating order status:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error updating order status',
//             error: error.message
//         });
//     }
// };


const updateOrderStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status, itemId } = req.body;

        const existingOrder = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                select: '_id productName quantity sizes status salePrice'
            });

        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order is cancelled by user
        if (existingOrder.isCancelledByUser) {
            return res.status(403).json({
                success: false,
                message: "Order has been cancelled by the user. Status updates are not allowed."
            });
        }

        // Check if status update is allowed
        if ((existingOrder.status === 'delivered' ||
             existingOrder.status === 'Return Request' ||
             existingOrder.status === 'Returned') &&
            status !== 'Return Request' &&
            status !== 'Returned') {
            return res.status(400).json({
                success: false,
                message: 'Only Return Request or Returned status are allowed at this stage'
            });
        }

        let shouldRefund = false;
        let refundedAmount = 0;
        const userId = existingOrder.user;

        if (itemId) {
            const item = existingOrder.orderedItems.find(i => i._id.toString() === itemId);
            if (item) {
                // Don't allow item status updates if order is in special status
                if (['Return Request', 'Returned', 'cancelled'].includes(existingOrder.status)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot update individual item status when order is returned or cancelled'
                    });
                }

                if (status === "Returned") {
                    item.status = "Returned";
                    shouldRefund = true;
                    refundedAmount = item.product.salePrice * item.quantity;
                } else if (status === "cancelled" && ['pending', 'processing'].includes(item.status)) {
                    item.status = "cancelled";
                    shouldRefund = true;
                    refundedAmount = item.product.salePrice * item.quantity;
                }
            }
        } 
        // Case 2: Admin updates the entire order
        else {
            if (['Returned', 'cancelled', 'Return Request'].includes(status)) {
                existingOrder.status = status;
                existingOrder.orderedItems.forEach(item => {
                    // Only update items that aren't already cancelled or returned
                    if (!['cancelled', 'Returned'].includes(item.status)) {
                        item.status = status;
                        if (['Returned', 'cancelled'].includes(status)) {
                            shouldRefund = true;
                            refundedAmount += item.product.salePrice * item.quantity;
                        }
                    }
                });
            }
        }

        // 🛠 **Process refund and restore inventory when status is changed**
        if (shouldRefund) {
            try {
                for (const orderItem of existingOrder.orderedItems) {
                    if (orderItem.status === "Returned" || orderItem.status === "cancelled") {
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

                        // Update total quantity
                        const updatedQuantity = product.quantity + quantityToRestore;

                        // Update size-specific quantity
                        let updatedSizes = [...product.sizes];
                        if (orderItem.size) {
                            const sizeIndex = updatedSizes.findIndex(s => s.size === orderItem.size);
                            if (sizeIndex !== -1) {
                                updatedSizes[sizeIndex].quantity += quantityToRestore;
                            } else {
                                updatedSizes.push({
                                    size: orderItem.size,
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
                    }
                }

                // 🛠 **Process refund if payment was online or wallet**
                if (refundedAmount > 0 && ["Online", "Wallet"].includes(existingOrder.PaymentMethod)) {
                    try {
                        await processRefund(orderId, userId, refundedAmount, "Order returned");

                        existingOrder.refundStatus = {
                            isRefunded: true,
                            refundedAmount,
                            refundedAt: new Date(),
                            refundMethod: "wallet"
                        };
                    } catch (error) {
                        console.error('Refund failed:', error);
                        return res.status(500).json({
                            success: false,
                            message: 'Refund processing failed',
                            error: error.message
                        });
                    }
                }
            } catch (error) {
                console.error('Error processing return:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Error processing return and refund',
                    error: error.message
                });
            }
        }

        // Update delivery date if order is marked as delivered
        if (status === 'delivered') {
            existingOrder.deliveredDate = new Date();
        }

        // Save the updated order
        existingOrder.status = status;
        await existingOrder.save();

        res.status(200).json({
            success: true,
            message: 'Order status updated successfully, refund processed (if applicable)',
            order: existingOrder
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating order status',
            error: error.message
        });
    }
};



    const getOrderDetails = async (req, res) => {
        try {
            const orderId = req.params.id;
            const order = await Order.findById(orderId)
                .populate({
                    path: 'orderedItems.product',
                    select: 'productName productImage salePrice'
                })
                .populate('user', 'name email')
                .populate('address');
    
            if (!order) {
                return res.status(404).render('error', {
                    message: 'Order not found',
                    currentPage: 'orders'
                });
            }
    
            // Calculate total amount if it's not already present
            const totalAmount = order.orderedItems.reduce((total, item) => {
                return total + (item.product.salePrice * item.quantity);
            }, 0);
    
            // Combine the order data with calculated total
            const orderData = {
                ...order.toObject(),
                totalAmount: totalAmount
            };
    
            console.log("Order Data:", orderData); // For debugging
    
            res.render('orderdetails', {
                order: orderData,
                currentPage: 'orders'
            });
        } catch (error) {
            console.error('Error fetching order details:', error);
            res.status(500).render('error', {
                message: 'Error fetching order details',
                currentPage: 'orders'
            });
        }
    };

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

    const updateItemStatus = async (req, res) => {
        try {
            const orderId = req.params.id;
            const { itemId, status } = req.body;
    
            const order = await Order.findById(orderId)
                .populate({
                    path: 'orderedItems.product',
                    select: '_id productName quantity sizes status salePrice'
                });
    
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
    
            // Find the specific item
            const item = order.orderedItems.id(itemId);
            if (!item) {
                return res.status(404).json({ success: false, message: 'Order item not found' });
            }
    
            // Prevent updates on cancelled, delivered, or already returned items
            if (['cancelled', 'Returned'].includes(item.status)) {
                return res.status(400).json({ success: false, message: 'Cannot update status of cancelled or returned items' });
            }
    
            if (status === 'Return Request') {
                item.status = 'Return Request';
            } else if (status === 'Returned' && item.status === 'Return Request') {
                item.status = 'Returned';
    
                // Restore inventory if returned
                const product = await Product.findById(item.product._id);
                if (product) {
                    product.quantity += item.quantity;
                    
                    if (item.size) {
                        const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
                        if (sizeIndex !== -1) {
                            product.sizes[sizeIndex].quantity += item.quantity;
                        }
                    }
    
                    await product.save();
                }
    
                // Process refund for returns
                if (['Online', 'Wallet'].includes(order.PaymentMethod)) {
                    const refundAmount = (item.product.salePrice || item.price) * item.quantity;
                    if (!isNaN(refundAmount) && refundAmount > 0) {
                        await processRefund(orderId, order.user, refundAmount, 'Refund for returned item');
                    }
                }
    
                // Check if all items are returned
                const allItemsReturned = order.orderedItems.every(i => i.status === 'Returned');
                if (allItemsReturned) {
                    order.status = 'Returned';
                }
            }
    
            // Explicitly mark array as modified
            order.markModified('orderedItems');
    
            // Save updated order
            await order.save();
    
            res.status(200).json({ success: true, message: 'Item status updated successfully' });
    
        } catch (error) {
            console.error('Error updating item status:', error);
            res.status(500).json({ success: false, message: 'Error updating item status', error: error.message });
        }
    };
    
    

module.exports = {
    getAllOrders,
    updateOrderStatus,
    getOrderDetails,
    processRefund,
    updateItemStatus
}