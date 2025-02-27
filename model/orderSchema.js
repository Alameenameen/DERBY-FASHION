
const mongoose = require("mongoose")
const {Schema} = mongoose;




const orderSchema = new Schema({

    orderedItems:[{
        product:{
            type:Schema.Types.ObjectId,
            ref:"Product",
            required:true
        },
        quantity:{
            type:Number,
            required:true
        },
        size: { // Track size for size-based quantities
            type: String,
            // required: true,
        },
        price:{
            type:Number,
            default: 0
        },
        status:{
            type:String,
            default:'pending',
            enum:['pending','payment_failed','processing','shipped','delivered','cancelled','Return Request','Returned']
        },
        returnCompletedAt: {
            type: Date
        }
    }],
    // totalPrice:{
    //     type:Number,
    //     required:true
    // },
    // discount:{
    //     type:Number,
    //     default:0
    // },
  
    finalAmount:{
        type:Number,
        // required:true
    },
    address: {
        name: { type: String, required: true },
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        phone: { type: String, required: true }
    },
    originalPaidAmount: { type: Number, default: 0 },
totalRefundedAmount: { type: Number, default: 0 },
    user:{
        type:Schema.Types.ObjectId,
        ref:'User',
        // required:true
    },
    invoiceDate:{
        type:Date
    },
    status:{
        type:String,
       default:'pending',
        enum:['pending','payment_failed','processing','shipped','delivered','cancelled','Return Request','Returned']
    },
    isCancelledByUser: {
        type: Boolean,
        default: false, // Default to false (not cancelled by user)
    },
    createdOn:{
        type:Date,
        default:Date.now,
        required : true
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    couponDetails: {
        couponId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Coupon'
        },
        couponName: String,
        discountAmount: Number
    },
    PaymentMethod:{
        type:String,
        enum: ['COD', 'Online', 'Wallet']
    },
    walletAmountUsed: {
        type: Number,
        default: 0
    },
    deliveredDate: Date,
    returnRequestedAt: Date,
    returnReason: {
        type: String,
        trim: true,
        maxlength: 500 
    },
    shippingCharge: {
        type: Number,
        default: 0
    },
    shippingChargeRefunded: {
        type: Boolean,
        default: false
    },
    razorpayOrderId: {   
        type: String,
        required: function() { return this.PaymentMethod !== "COD" && this.PaymentMethod !== "Wallet"; }
    },
    razorpayPaymentId: {  
        type: String
    },
    returnCompletedAt: {
        type: Date
    },
    refundStatus: {
        isRefunded: {
            type: Boolean,
            default: false
        },
        refundedAmount: {
            type: Number
        },
        refundedAt: {
            type: Date
        },
        refundMethod: {
            type: String,
            enum: ['wallet', 'bank'],
            default: 'wallet'
        }
    },
    cancelledAt: {
        type: Date
    }
})



const Order = mongoose.model("Order",orderSchema);

module.exports = Order;