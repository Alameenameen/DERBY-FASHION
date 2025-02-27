const Product = require("../../model/productSchema");
const Category = require("../../model/categorySchema");
const User = require("../../model/userSchema");
const Cart = require("../../model/cartSchema")



const MAX_QUANTITY_PER_ITEM = 5;

const calculateCartTotal = (cart) => {
    if (!cart || !cart.items || cart.items.length === 0) {
        return {
            subtotal: 0,
            shipping: 0,
            total: 0
        };
    }

    const subtotal = cart.items.reduce((total, item) => total + item.totalPrice, 0);
    const shipping = 50 // Add shipping only if cart has items
    const total = subtotal + shipping;
    
    return { subtotal, shipping, total };
};

const getCartItemCount = (cart) => {
    if (!cart || !cart.items || cart.items.length === 0) {
        return 0;
    }
    // return cart.items.reduce((total, item) => total + item.quantity, 0);
    return cart.items.length;

};

// Get Cart
const getCart = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.redirect('/login');
        }

        const cart = await Cart.findOne({ userId: req.session.user._id })
        .populate({
            path: 'items.productId',
            select: 'productName productImage salePrice sizes'
        });

        // console.log('cart:', JSON.stringify(cart, null, 2));

            
        const totals = calculateCartTotal(cart);
        const cartCount = getCartItemCount(cart);
        req.session.cartCount = cartCount;

        res.render('cart', { 
            cart, 
            totals,
            cartCount,
            user: req.session.user ,
            maxQuantity: MAX_QUANTITY_PER_ITEM
        });
    } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).send("Error loading cart");
    }
};






              


const addToCart = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.status(401).json({ error: "Please login to add items to cart" });
        }

        const userId = req.session.user._id;
        const { productId, quantity = 1, selectedSize } = req.body;
        const quantityNum = parseInt(quantity);

        // Validate required fields
        if (!productId || !selectedSize) {
            return res.status(400).json({ error: "Product ID and selected size are required" });
        }

        // Validate product existence
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        // Validate if the size exists for the product
        const sizeInfo = product.sizes.find(size => size.size === selectedSize);
        if (!sizeInfo) {
            return res.status(400).json({ error: "Selected size is not available for this product" });
        }

        // // Check if the requested quantity exceeds the available stock for the selected size
        // if (quantityNum > sizeInfo.quantity) {
        //     return res.status(400).json({ error: `Only ${sizeInfo.quantity} item(s) available for size ${selectedSize}` });
        // }

        // // Get the appropriate price
        // const productPrice = product.salePrice || product.regularPrice;

        // Find or create the cart
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({
                userId: userId,
                items: [],
            });
        }

        // Find if the product with the selected size already exists in the cart
        const existingItemIndex = cart.items.findIndex(
            item => 
                item.productId.toString() === productId.toString() &&
                item.size === selectedSize // Check size match
        );

        // if (existingItemIndex > -1) {
        //     // Update the existing item's quantity and total price
        //     cart.items[existingItemIndex].quantity += quantityNum;
        //     cart.items[existingItemIndex].totalPrice =
        //         productPrice * cart.items[existingItemIndex].quantity;
        const existingQuantity = existingItemIndex > -1 ? cart.items[existingItemIndex].quantity : 0;
        const newTotalQuantity = existingQuantity + quantityNum;

        // Check maximum quantity limit
        if (newTotalQuantity > MAX_QUANTITY_PER_ITEM) {
            return res.status(400).json({ 
                error: `Cannot add more items. Maximum quantity limit is ${MAX_QUANTITY_PER_ITEM} per item`
            });
        }

        // Check if the requested quantity exceeds the available stock
        if (newTotalQuantity > sizeInfo.quantity) {
            return res.status(400).json({ 
                error: `Only ${sizeInfo.quantity} item(s) available for size ${selectedSize}`
            });
        }

        const productPrice = product.salePrice || product.regularPrice;

        if (existingItemIndex > -1) {
            cart.items[existingItemIndex].quantity = newTotalQuantity;
            cart.items[existingItemIndex].totalPrice = productPrice * newTotalQuantity;
        } else {
            // Add the new item to the cart
            const newItem = {
                productId: productId,
                size: selectedSize,
                quantity: quantityNum,
                price: productPrice,
                totalPrice: productPrice * quantityNum,
            };
            cart.items.push(newItem);
        }

        // Save the cart
        const savedCart = await cart.save();
        // console.log("Saved cart:", savedCart); // Debugging purposes

        // const updatedCart = await Cart.findOne({ userId });
        req.session.cartCount = getCartItemCount(savedCart);

        return res.status(200).json({
            success: true,
            message: "Item added to cart successfully",
            cartCount: req.session.cartCount
        });
        // res.redirect('/cart')

    } catch (error) {
        console.error("Error adding to cart:", error);
        if (error.name === 'ValidationError') {
            console.error("Validation error details:", error.errors);
        }
        res.status(500).json({ error: "Internal Server Error" });
    }
};




// const updateCart = async (req, res) => {
//     try {
//         const { productId, quantity, size } = req.body;
//         const userId = req.session.user._id;



//         const requestedQuantity = parseInt(quantity);

//         // Check maximum quantity limit
//         if (requestedQuantity > MAX_QUANTITY_PER_ITEM) {
//             req.session.message = {
//                 type: 'warning',
//                 content: `Quantity adjusted to ${MAX_QUANTITY_PER_ITEM} (maximum allowed per item)`
//             };
//             return res.redirect('/cart');
//         }
//         // First, fetch the product to check available quantity
//         const product = await Product.findById(productId);
//         if (!product) {
//             return res.status(404).json({ error: "Product not found" });
//         }

//         // Find the specific size variant's quantity
//         const sizeVariant = product.sizes.find(s => s.size === size);
//         if (!sizeVariant) {
//             return res.status(404).json({ error: "Size variant not found" });
//         }

//         // Get the available quantity for this size
//         // const availableQuantity = sizeVariant.quantity;
//         const availableQuantity = Math.min(sizeVariant.quantity, MAX_QUANTITY_PER_ITEM);


//         // Validate the requested quantity against available stock
        

      
//             // If requested quantity exceeds available stock, set it to maximum available
//             const cart = await Cart.findOne({ userId });
//             const itemIndex = cart.items.findIndex(
//                 item => 
//                     item.productId.toString() === productId &&
//                     item.size === size
//             );

//             if (itemIndex > -1) {
//                 const productPrice = product.salePrice || product.regularPrice;
//                 const finalQuantity = Math.min(requestedQuantity, availableQuantity);
                
//                 cart.items[itemIndex].quantity = finalQuantity;
//                 cart.items[itemIndex].totalPrice = productPrice * finalQuantity;
//                 await cart.save();
                
//                 req.session.cartCount = getCartItemCount(cart);
    
//                 if (finalQuantity !== requestedQuantity) {
//                     req.session.message = {
//                         type: 'warning',
//                         content: `Quantity adjusted to ${finalQuantity} (maximum available)`
//                     };
//                 }
//             } else {
//                 return res.status(404).json({ error: "Item not found in cart" });
//             }
//         // const updatedCart = await Cart.findOne({ userId });
//         // req.session.cartCount = getCartItemCount(updatedCart);

//         res.redirect('/cart');
//     } catch (error) {
//         console.error("Error updating cart:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// };
const updateCart = async (req, res) => {
    try {
        const { productId, quantity, size } = req.body;
        const userId = req.session.user._id;
        const requestedQuantity = parseInt(quantity);

        // First, check maximum quantity limit
        if (requestedQuantity > MAX_QUANTITY_PER_ITEM) {
            req.session.message = {
                type: 'warning',
                content: `Quantity adjusted to ${MAX_QUANTITY_PER_ITEM} (maximum allowed per item)`
            };
            return res.redirect('/cart');
        }

        // Get product and check availability
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        // Find the specific size variant
        const sizeVariant = product.sizes.find(s => s.size === size);
        if (!sizeVariant) {
            return res.status(404).json({ error: "Size variant not found" });
        }

        // Get current stock level
        const availableQuantity = sizeVariant.quantity;

        // If requested quantity exceeds available stock
        if (requestedQuantity > availableQuantity) {
            req.session.message = {
                type: 'warning',
                content: `Only ${availableQuantity} items are available in stock for size ${size}. Quantity has been adjusted.`
            };
            
            const cart = await Cart.findOne({ userId });
            const itemIndex = cart.items.findIndex(
                item => 
                    item.productId.toString() === productId &&
                    item.size === size
            );

            if (itemIndex > -1) {
                const productPrice = product.salePrice || product.regularPrice;
                // Set quantity to available stock
                cart.items[itemIndex].quantity = availableQuantity;
                cart.items[itemIndex].totalPrice = productPrice * availableQuantity;
                await cart.save();
                req.session.cartCount = getCartItemCount(cart);
            }
            
            return res.redirect('/cart');
        }

        // Normal update flow when stock is available
        const cart = await Cart.findOne({ userId });
        const itemIndex = cart.items.findIndex(
            item => 
                item.productId.toString() === productId &&
                item.size === size
        );

        if (itemIndex > -1) {
            const productPrice = product.salePrice || product.regularPrice;
            cart.items[itemIndex].quantity = requestedQuantity;
            cart.items[itemIndex].totalPrice = productPrice * requestedQuantity;
            await cart.save();
            req.session.cartCount = getCartItemCount(cart);
        } else {
            return res.status(404).json({ error: "Item not found in cart" });
        }

        res.redirect('/cart');
    } catch (error) {
        console.error("Error updating cart:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Remove from Cart
const removeFromCart = async (req, res) => {
    try {
        const { productId,size } = req.body;
        const userId = req.session.user._id;

        const cart = await Cart.findOneAndUpdate(
            { userId },
            { $pull: { items: { productId,  size  } } },
            { new: true }
        );


        req.session.cartCount = getCartItemCount(cart);
        // res.status(200).json({ message: "Item removed from cart" });
        res.redirect('/cart');
    } catch (error) {
        console.error("Error removing from cart:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Clear Cart
// const clearCart = async (req, res) => {
//     try {
//         const userId = req.session.user._id;

//         await Cart.findOneAndUpdate({ userId }, { items: [] });
//         res.status(200).json({ message: "Cart cleared" });
//     } catch (error) {
//         console.error("Error clearing cart:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// };

module.exports = {
    getCart,
    addToCart,
    updateCart,
    removeFromCart,
   
};
