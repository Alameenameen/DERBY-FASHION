const User = require("../../model/userSchema");
const Wallet = require("../../model/walletSchema");
const Order = require("../../model/orderSchema")
const Razorpay = require('razorpay');
const crypto = require('crypto');
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const getWalletBalance = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const wallet = await Wallet.findOne({ user: userId });
        
        res.json({
            success: true,
            balance: wallet ? wallet.balance : 0
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch wallet balance" });
    }
}

// Get wallet transactions
const getWalletTransactions = async(req, res) => {
    try {
        const userId = req.session.user._id;
        const wallet = await Wallet.findOne({ user: userId })
            .populate('transactions.orderId', 'orderedItems');
        
        res.json({
            success: true,
            transactions: wallet ? wallet.transactions : []
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch transactions" });
    }
}



const addMoneyToWallet = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.session.user._id;

        console.log('Creating Razorpay order for amount:', amount);

        if (!amount || amount < 1) {
            return res.status(400).json({
                success: false,
                error: "Invalid amount"
            });
        }

        // Validate Razorpay instance
        if (!razorpayInstance) {
            console.error('Razorpay instance not initialized');
            return res.status(500).json({
                success: false,
                error: "Payment gateway not configured"
            });
        }

        const orderOptions = {
            amount: Math.round(amount * 100), // Convert to paise and ensure it's an integer
            currency: "INR",
            receipt: `wallet_${Date.now()}`,
            payment_capture: 1
        };

        console.log('Order options:', orderOptions);

        const razorpayOrder = await razorpayInstance.orders.create(orderOptions);
        console.log('Razorpay order created:', razorpayOrder);

        res.json({
            success: true,
            orderId: razorpayOrder.id,
            amount: amount,
            currency: "INR",
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({
            success: false,
            error: "Failed to process wallet recharge",
            details: error.message
        });
    }
};

const verifyWalletRecharge = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
        const userId = req.session.user._id;

        console.log('Verifying payment:', {
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            amount: amount
        });

        // Verify signature
        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            console.error('Razorpay secret key not configured');
            return res.status(500).json({
                success: false,
                error: "Payment verification configuration missing"
            });
        }

        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            console.error('Signature verification failed');
            return res.status(400).json({
                success: false,
                error: "Payment verification failed"
            });
        }

        // Update wallet
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            console.log('Creating new wallet for user:', userId);
            wallet = new Wallet({ user: userId });
        }

        const parsedAmount = parseInt(amount);
        wallet.balance += parsedAmount;
        wallet.transactions.push({
            amount: parsedAmount,
            type: 'credit',
            description: 'Wallet recharge',
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id
        });

        await wallet.save();
        console.log('Wallet updated successfully');

        res.json({
            success: true,
            balance: wallet.balance
        });
    } catch (error) {
        console.error('Error verifying wallet recharge:', error);
        res.status(500).json({
            success: false,
            error: "Failed to verify wallet recharge",
            details: error.message
        });
    }
};

// Backend route for wallet verification
const verifyWalletUpdate = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const wallet = await Wallet.findOne({ user: userId });
        
        if (!wallet) {
            return res.status(404).json({
                success: false,
                error: 'Wallet not found'
            });
        }

        // Get recent transactions
        const recentTransactions = wallet.transactions
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 5);

        res.json({
            success: true,
            wallet: {
                balance: wallet.balance,
                recentTransactions
            }
        });
    } catch (error) {
        console.error('Error verifying wallet:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify wallet update'
        });
    }
};





module.exports = {
    addMoneyToWallet,
    verifyWalletRecharge,
    getWalletBalance,
    getWalletTransactions,
    verifyWalletUpdate
}