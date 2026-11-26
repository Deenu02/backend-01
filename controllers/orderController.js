import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/order.js";
import Product from "../models/product.js";
import { isAdmin } from "./userController.js";

class CheckoutError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const nextOrderStatus = new Map([
    ["pending", "processing"],
    ["processing", "shipped"],
    ["shipped", "delivered"]
]);

export async function createOrder(req, res) {
    if (!req.user) {
        return res.status(403).json({ message: "Please login and try again" });
    }

    const { name, phone, address, products: items } = req.body ?? {};
    const customerName = typeof name === "string" && name.trim()
        ? name.trim()
        : [req.user.firstName, req.user.lastName].filter(Boolean).join(" ");

    if (!customerName || typeof phone !== "string" || !phone.trim() ||
        typeof address !== "string" || !address.trim()) {
        return res.status(400).json({ message: "Name, phone and address are required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Add at least one product to your order" });
    }

    const quantities = new Map();
    for (const item of items) {
        if (typeof item?.productId !== "string" || !item.productId.trim() ||
            !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
            return res.status(400).json({ message: "Each item needs a product ID and a positive whole quantity" });
        }
        const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
        if (!Number.isSafeInteger(quantity)) {
            return res.status(400).json({ message: "Item quantity is too large" });
        }
        quantities.set(item.productId, quantity);
    }

    try {
        const order = await mongoose.connection.transaction(async session => {
            const catalog = await Product.find({ productId: { $in: [...quantities.keys()] } }).session(session).lean();
            const byId = new Map(catalog.map(product => [product.productId, product]));
            const products = [];
            let totalInCents = 0;
            let labelledTotalInCents = 0;

            for (const [productId, quantity] of quantities) {
                const product = byId.get(productId);
                if (!product?.isAvailable) {
                    throw new CheckoutError(404, "Product " + productId + " is unavailable");
                }
                const reservation = await Product.updateOne(
                    { _id: product._id, isAvailable: true, stock: { $gte: quantity } },
                    { $inc: { stock: -quantity } },
                    { session }
                );
                if (!reservation.modifiedCount) {
                    throw new CheckoutError(409, "Insufficient stock for " + product.name);
                }

                const { name, altNames, description, images, price, labelledPrice } = product;
                products.push({
                    productInfo: { productId, name, altNames, description, images, price, labelledPrice },
                    quantity
                });
                totalInCents += Math.round(price * 100) * quantity;
                labelledTotalInCents += Math.round(labelledPrice * 100) * quantity;
            }

            return new Order({
                orderId: "ABC-" + randomUUID(),
                email: req.user.email,
                name: customerName,
                phone: phone.trim(),
                address: address.trim(),
                products,
                total: totalInCents / 100,
                labelledTotal: labelledTotalInCents / 100
            }).save({ session });
        });

        return res.status(201).json({ message: "Order created successfully", order });
    } catch (error) {
        if (error instanceof CheckoutError) {
            return res.status(error.status).json({ message: error.message });
        }
        return res.status(500).json({ message: "Failed to create order" });
    }
}

export async function getOrders(req, res) {
    if (!req.user) {
        return res.status(403).json({ message: "Please login and try again" });
    }

    if (req.query.scope === "all" && !isAdmin(req)) {
        return res.status(403).json({ message: "Administrator access is required" });
    }

    try {
        const showAll = isAdmin(req) && req.query.scope !== "mine";
        const orders = await Order.find(showAll ? {} : { email: req.user.email }).sort({ date: -1 });
        return res.json(orders);
    } catch {
        return res.status(500).json({ message: "Failed to get orders" });
    }
}

export async function updateOrderStatus(req, res) {
    if (!isAdmin(req)) {
        return res.status(403).json({ message: "Administrator access is required" });
    }

    const { status } = req.body ?? {};
    const previous = [...nextOrderStatus].find(([, next]) => next === status)?.[0];
    if (!previous) {
        return res.status(400).json({ message: "Choose processing, shipped or delivered" });
    }

    const { orderId } = req.params;
    try {
        const updated = await Order.findOneAndUpdate(
            { orderId, status: previous },
            { $set: { status } },
            { new: true }
        );
        if (updated) return res.json(updated);

        const current = await Order.findOne({ orderId });
        if (!current) return res.status(404).json({ message: "Order not found" });
        if (current.status === status) return res.json(current);
        return res.status(409).json({ message: "Order status changed. Refresh and try again." });
    } catch {
        return res.status(500).json({ message: "Failed to update order status" });
    }
}
