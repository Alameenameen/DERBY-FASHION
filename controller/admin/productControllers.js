const Product  = require("../../model/productSchema");
const Category = require("../../model/categorySchema");
const Brand = require("../../model/brandSchema")
const User = require("../../model/userSchema")
const fs = require("fs");
const path = require("path")
const sharp = require("sharp");


const getSizesByType = (type) => {
    switch (type) {
        case 'Clothing':
            return ['S', 'M', 'L', 'XL', 'XXL'];
        case 'Footwear':
            return ['5', '6', '7', '8', '9', '10'];
        default:
            return [];
    }
};


const getProductAddPage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });
        res.render("add-products", {
            cat: categories,
            brands: brands,
            getSizesByType: getSizesByType // Pass the utility function to the view
        });
    } catch (error) {
        res.redirect("/pageerror");
    }
};


const addProducts = async (req, res) => {
    try {
        const {
            productName,
            description,
            regularPrice,
            // salePrice,
            color,
            category,
            brand,
            sizes, // This will be an array of objects with size and quantity
            croppedImages = [],
        } = req.body;

        // Validation checks...
        if (!productName || !description || !regularPrice || !category ||!brand) {
            return res.status(400).json({ error: "All required fields must be filled." });
        }

        let sizeQuantities = [];
        try {
            if (sizes && sizes !== "undefined" && sizes !== "null") {
                sizeQuantities = JSON.parse(sizes);
                // Validate size data structure
                if (!Array.isArray(sizeQuantities)) {
                    throw new Error("Invalid size data format");
                }
            }
        } catch (error) {
            console.error("Error parsing sizes:", error, "Raw sizes value:", sizes);
            return res.status(400).json({ error: "Invalid size data format" });
        }

        //category data

        const categoryData = await Category.findOne({ name: category });
        if (!categoryData) {
            return res.status(400).json({ error: `Category '${category}' not found.` });
        }


//brand  data
        const brandData = await Brand.findById(brand);
        if (!brandData || brandData.isBlocked) {
            return res.status(400).json({ error: "Invalid or blocked brand selected." });
        }

        const totalQuantity = sizeQuantities.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)

        // Process images... (your existing image processing code)
        const images = [];

                // Process and save each cropped  image 
                if (Array.isArray(croppedImages) && croppedImages.length > 0) {
                    for (const [index, base64Image] of croppedImages.entries()) {
                        const matches = base64Image.match(/^data:image\/(png|jpeg);base64,(.+)$/);
        
                        if (!matches || matches.length !== 3) {
                            return res.status(400).json({ error: `Invalid image format for image ${index + 1}` });
                        }
        
                        const imageBuffer = Buffer.from(matches[2], 'base64');
                        const filename = `cropped-img-${Date.now()}-${index + 1}.png`;
                        const filepath = path.join('public','uploads', filename);
        
                        try {
                            fs.writeFileSync(filepath, imageBuffer);
                            images.push(filename);
                        } catch (error) {
                            console.error(`Failed to save image ${index + 1}:`, error.message);
                            return res.status(500).json({ error: "Error saving images. Please try again." });
                        }
                    }
                
                } else {
                    return res.status(400).json({ error: "No images provided or invalid data." });
                }
        

        const newProduct = new Product({
            productName,
            description,
            category: categoryData._id,
            brand: brandData._id,
            regularPrice,
            salePrice : regularPrice,
            color,
            sizes: sizeQuantities,
            quantity: totalQuantity, // Store total quantity
            productImage: images,
            status: totalQuantity > 0 ? "Available" : "out of stock"
        });

        await newProduct.save();
        return res.redirect("/admin/addProducts?success=true");
    } catch (error) {
        console.error("Error adding product:", error.message);
        return res.status(500).redirect("/admin/pageerror");
    }
};





const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = req.query.page || 1;
        const limit = 5;

        
        const productData = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ],
        })
        .sort({createdOn:1})
        .limit(limit)
        .skip((page - 1) * limit)
        .populate("category") 
        .populate("brand")
        .exec();

        const count = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ],
        }).countDocuments();

        const category = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        if (category) {
            res.render("products", {
                data: productData,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                cat: category,
                brands: brands, 
                searchQuery: search 
            });
        } else {
            res.render("page-404");
        }
    } catch (error) {
        console.error("Error in getAllProducts:", error);
        res.redirect("/admin/pageerror");
    }
};




const getEditProduct = async (req, res) => {
    try {
        const id = req.query.id;
        const product = await Product.findOne({ _id: id })
            .populate("category")
            .populate("brand");
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        if (!product) {
            return res.redirect("/admin/pageerror");
        }

        res.render("edit-product", {
            product: product,
            cat: categories,
            brands: brands,
            getSizesByType: getSizesByType
        });
    } catch (error) {
        console.error("Error in getEditProduct:", error);
        res.redirect("/admin/pageerror");
    }
};


const editProducts = async (req, res) => {
    try {
        const id = req.params.id;
        const {
            productName,
            description,
            regularPrice,
            // salePrice,
            color,
            category,
            brand,
            sizes,
            croppedImages = [],
            // existingImages = []
        } = req.body;

        let existingImagesArray = [];
        
        // Parse existingImages if it exists - it could be a JSON string
        if (req.body.existingImages) {
            try {
                if (typeof req.body.existingImages === 'string') {
                    // Try to parse as JSON first (if it's an array in string form)
                    existingImagesArray = JSON.parse(req.body.existingImages);
                } else {
                    // If it's already an array
                    existingImagesArray = req.body.existingImages;
                }
                
                // Make sure it's an array
                if (!Array.isArray(existingImagesArray)) {
                    existingImagesArray = [existingImagesArray];
                }
            } catch (e) {
                // If parsing fails, treat it as a string
                existingImagesArray = [req.body.existingImages];
            }
        }
        
        console.log('Existing images from request:', existingImagesArray);

        // Validation checks
        if (!productName || !description || !regularPrice || !category || !brand) {
            return res.status(400).json({ error: "All required fields must be filled." });
        }

        // Find existing product
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        
        // Handle offer/sale price
        let salePrice;
        if (product.offer && product.offer.isActive) {
            const offerPrice = regularPrice - (regularPrice * (product.offer.percentage / 100));
            salePrice = parseInt(offerPrice);
        }

        // Parse and validate sizes
        let sizeQuantities = [];
        try {
            if (sizes && sizes !== "undefined" && sizes !== "null") {
                sizeQuantities = JSON.parse(sizes);
                if (!Array.isArray(sizeQuantities)) {
                    throw new Error("Invalid size data format");
                }
            }
        } catch (error) {
            console.error("Error parsing sizes:", error, "Raw sizes value:", sizes);
            return res.status(400).json({ error: "Invalid size data format" });
        }

        // Get category data
        const categoryData = await Category.findOne({ name: category });
        if (!categoryData) {
            return res.status(400).json({ error: `Category '${category}' not found.` });
        }

        // Get brand data
        const brandData = await Brand.findById(brand);
        if (!brandData || brandData.isBlocked) {
            return res.status(400).json({ error: "Invalid or blocked brand selected." });
        }

        // Calculate total quantity
        const totalQuantity = sizeQuantities.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

        // Find images to delete (FIX: use existingImagesArray instead of undefined existingImages)
        const imagesToDelete = product.productImage.filter(
            img => !existingImagesArray.includes(img)
        );

        console.log('Images to delete:', imagesToDelete);

        // Actually delete files from server
        imagesToDelete.forEach(img => {
            const imagePath = path.join('public', 'uploads', img);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        });
        
        // Process new images
        let updatedImages = product.productImage.filter(img => existingImagesArray.includes(img));
        console.log('Retained images:', updatedImages); // Start with existing images

        if (Array.isArray(croppedImages) && croppedImages.length > 0) {
            for (const [index, base64Image] of croppedImages.entries()) {
                const matches = base64Image.match(/^data:image\/(png|jpeg);base64,(.+)$/);

                if (!matches || matches.length !== 3) {
                    return res.status(400).json({ error: `Invalid image format for image ${index + 1}` });
                }

                const imageBuffer = Buffer.from(matches[2], 'base64');
                const filename = `cropped-img-${Date.now()}-${index + 1}.png`;
                const filepath = path.join('public', 'uploads', filename);

                try {
                    fs.writeFileSync(filepath, imageBuffer);
                    updatedImages.push(filename);
                } catch (error) {
                    console.error(`Failed to save image ${index + 1}:`, error.message);
                    return res.status(500).json({ error: "Error saving images. Please try again." });
                }
            }
        }

        // Update product
        const updateFields = {
            productName,
            description,
            category: categoryData._id,
            brand: brandData._id,
            regularPrice,
            // salePrice,
            color,
            sizes: sizeQuantities,
            quantity: totalQuantity,
            productImage: updatedImages,
            status: totalQuantity > 0 ? "Available" : "out of stock"
        };

        // Add salePrice to updateFields if it exists
        if (salePrice !== undefined) {
            updateFields.salePrice = salePrice;
        }

        await Product.findByIdAndUpdate(id, updateFields, { new: true });
        return res.redirect("/admin/products?success=true");
    } catch (error) {
        console.error("Error updating product:", error.message);
        return res.status(500).redirect("/admin/pageerror");
    }
};

const deleteSingleImage = async (req, res) => {
    try {
        const { imageNameToServer, productIdToServer } = req.body;

        console.log("Request body:", req.body); // Debugging

        const product = await Product.findById(productIdToServer);
        if (!product) {
            console.error("Product not found with ID:", productIdToServer);
            return res.status(404).send({ status: false, message: "Product not found" });
        }

        console.log("Product before update:", product);

        // Update product by removing the image
        await Product.updateOne({ _id: productIdToServer }, { $pull: { productImage: imageNameToServer } });

        const imagePath = path.join(process.cwd(), 'public','uploads',imageNameToServer);

        console.log("Image path:", imagePath);

        if (fs.existsSync(imagePath)) {
            try {
                fs.unlinkSync(imagePath);
                console.log(`Image ${imageNameToServer} deleted successfully`);
            } catch (err) {
                console.error(`Error deleting image / image not found: ${err.message}`);
            }
        } else {
            console.log(`Image ${imageNameToServer} not found on the server.`);
        }

        res.send({ status: true });
    } catch (error) {
        console.error("Error in deleteImage:", error);
        res.redirect("/pageerror");
    }
};


const blockProduct = async(req,res)=>{
    try {
        const id = req.query.id
        await Product.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/products")
    } catch (error) {
        res.redirect("/pageerror")
    }
}

const unblockProduct = async(req,res)=>{
    try {
        const id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect("/admin/products")
    } catch (error) {
        res.redirect("/pageerror")
    }
}


const getOffer = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);
        
        if (!product || !product.offer) {
            return res.status(404).json({ error: "Offer not found" });
        }

        res.json(product.offer);
    } catch (error) {
        console.error("Error fetching offer:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const addOffer = async (req, res) => {
    try {
      const { productId, percentage, startDate, endDate } = req.body;
      
      if (!productId || !percentage || !startDate || !endDate) {
        return res.status(400).json({ error: "All fields are required" });
      }
  
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
  
      const category = await Category.findById(product.category);
      let categoryOffer = category && category.categoryOffer && category.categoryOffer.isActive
          ? category.categoryOffer.percentage
          : 0;

      // Determine the highest offer
      const highestOffer = Math.max(categoryOffer, percentage);

      // Calculate the final sale price based on the highest offer
      const offerPrice = product.regularPrice - (product.regularPrice * (highestOffer / 100));

      const offer = {
        percentage,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: true
      };
  
      product.offer = offer;
      product.salePrice = parseInt(offerPrice);
      
      await product.save();
      
      res.status(200).json({ message: "Offer added successfully" });
    } catch (error) {
      console.error("Error adding offer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  
  const editOffer = async (req, res) => {
    try {
      const { productId, percentage, startDate, endDate } = req.body;
      
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
  
      const category = await Category.findById(product.category);
        let categoryOffer = category && category.categoryOffer && category.categoryOffer.isActive
            ? category.categoryOffer.percentage
            : 0;

        // Determine the highest offer
        const highestOffer = Math.max(categoryOffer, percentage);

      // Calculate the new offer price
      const offerPrice = product.regularPrice - (product.regularPrice * (highestOffer / 100));

  
      product.offer = {
        percentage,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: true
      };
      product.salePrice = parseInt(offerPrice);
      
      await product.save();
      
      res.status(200).json({ message: "Offer updated successfully" });
    } catch (error) {
      console.error("Error editing offer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  
  const removeOffer = async (req, res) => {
    try {
      const { productId } = req.body;
      
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
  
      const category = await Category.findById(product.category);
      let categoryOffer = category && category.categoryOffer && category.categoryOffer.isActive
          ? category.categoryOffer.percentage
          : 0;

      
      product.offer = undefined;
      product.salePrice = parseInt(product.regularPrice - (product.regularPrice * (categoryOffer / 100)));


      
      await product.save();
      
      res.status(200).json({ message: "Offer removed successfully" });
    } catch (error) {
      console.error("Error removing offer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  

module.exports = {
    getProductAddPage,
    addProducts,
    getAllProducts,
    getEditProduct,
    editProducts,
    deleteSingleImage,
    blockProduct,
    unblockProduct,
    getOffer,
    addOffer,
    editOffer,
    removeOffer
}