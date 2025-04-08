 const Product = require("../../model/productSchema");
 const Category = require("../../model/categorySchema");
 const Brand = require("../../model/brandSchema");
 const User = require("../../model/userSchema");

 const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
         const userData = await User.findById(userId);
        const productId = req.query.id;

        // Fetch the current product and its category
        const product = await Product.findById(productId)
        .populate('category')
        .populate('brand')
        .populate('reviews.userId', 'name')
        .exec(); 
        const findCategory = product.category;

      
        // Fetch related products based on the same category, excluding the current product
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId }, // Exclude the current product
        }).limit(4); 
        // console.log("related items:",relatedProducts)


        const allCategories = await Category.find({ isBlocked: false });
        const allBrands = await Brand.find({ isBlocked: false });


        if (req.method === 'POST') {
            const { rating, review, name, email } = req.body;

            // Validate the product exists
            if (!product) {
                req.flash('error', 'Product not found.');
                return res.redirect(`/productDetails?id=${productId}`);
            }
                    // Add the new review
                    const newReview = {
                        userId: req.user ? req.user._id : null, // Logged-in user's ID, if available
                        name: name || 'Anonymous',
                        email: email || '',
                        rating: parseInt(rating, 10),
                        review: review,
                        createdAt: new Date(),
                    };
                    product.reviews.push(newReview);
        
                    // Recalculate average rating
                    product.calculateAverageRating();
        
                    // Save the updated product
                    await product.save();
        
                    req.flash('success', 'Review submitted successfully.');
                    return res.redirect(`/productDetails?id=${productId}`);
                }



        res.render("productDetails", {
            user: userData,
            product: product,
            averageRating: product.averageRating,
            numberOfReviews: product.numberOfReviews,
            relatedProduct: relatedProducts, //  related products to the view
            quantity: product.quantity,
            category: findCategory,
            productId,
            allCategories,
            allBrands,
            sizes: product.sizes,
            successMessage: req.flash('success'),
            errorMessage: req.flash('error')
        });

        
    } catch (error) {
        console.error("Error fetching product details", error);
        res.redirect("/pageNotFound");
    }
};





// const getProductsByCategory = async (req, res) => {
//     try {
//         const { category } = req.query; // Get category ID from the query parameter
//         const { page = 1, limit = 10 } = req.query; // For pagination

//         let query = {};
//         if (category) query.category = category;

//         const products = await Product.find(query)
//             .limit(limit * 1)
//             .skip((page - 1) * limit)
//             .exec();

//         const count = await Product.countDocuments(query);

//         const categories = await Category.find(); // Fetch all categories

//         res.render('shop', {
//             products,
//             categories,
//             currentCategory: await Category.findById(category),
//             totalPages: Math.ceil(count / limit),
//             currentPage: Number(page),
//             categoryId: category,
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Server Error');
//     }
// };
const escapeRegex = (string) => {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};



const getProductsByCategory = async (req, res) => {
    try {
        const { category, sort ,search} = req.query; // Get category ID and sort parameter
        const { page = 1, limit = 10 } = req.query; // For pagination

        let query = {};
        if (category) query.category = category;


        if (search) {
            const sanitizedSearch = escapeRegex(search);
            query.$or = [
                { productName: new RegExp(sanitizedSearch, 'i') },
                { description: new RegExp(sanitizedSearch, 'i') }
            ];
        }

        // Base query
        let productsQuery = Product.find(query).populate('category');

        // Apply sorting based on the sort parameter
        switch(sort) {                                          
            case 'popularity':
                productsQuery = productsQuery.sort('-views');
                break;
            case 'price-low-high':
                productsQuery = productsQuery.sort('salePrice');
                break;
            case 'price-high-low':
                productsQuery = productsQuery.sort('-salePrice');
                break;
            case 'rating':
                productsQuery = productsQuery.sort('-averageRating');
                break;
            case 'featured':
                query.featured = true;
                break;
            case 'new-arrivals':
                productsQuery = productsQuery.sort('-createdAt');
                break;
            case 'name-asc':
                productsQuery = productsQuery.sort('productName');
                break;
            case 'name-desc':
                productsQuery = productsQuery.sort('-productName');
                break;
            default:
                productsQuery = productsQuery.sort('-createdAt'); // Default sorting
        }

        // Execute query with pagination
        const products = await productsQuery
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const count = await Product.countDocuments(query);
        const categories = await Category.find({isListed:true});

        const searchResultsInfo = search ? {
            count,
            message: `${count} results found for "${search}"`
        } : null;

        res.render('shop', {
            products,
            categories,
            currentCategory: await Category.findById(category),
            totalPages: Math.ceil(count / limit),
            currentPage: Number(page),
            categoryId: category,
            currentSort: sort || 'default',
            searchQuery: search,         
            searchResultsInfo  
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};


const submitReview = async (req, res) => {
    try {
        const { productId, rating, review, name, email } = req.body;

        // Find the product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Create the review object
        const newReview = {
            userId: req.user ? req.user._id : null, // If user is logged in
            name: name,
            email: email,
            rating: parseInt(rating),
            review: review,
            createdAt: new Date()
        };

        // Add the review to the product
        product.reviews.push(newReview);

        // Calculate new average rating
        product.calculateAverageRating();
        
        // Save the product with the new review
        await product.save();

        res.json({ 
            success: true, 
            message: 'Review submitted successfully',
            newRating: product.averageRating,
            numberOfReviews: product.numberOfReviews
        });
    } catch (error) {
        console.error('Error submitting review:', error);
        res.status(500).json({ success: false, message: 'Error submitting review' });
    }
};



module.exports ={
    productDetails,
    getProductsByCategory,
    submitReview
}