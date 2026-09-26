const { z } = require('zod');

const positiveId = z.coerce.number().int().positive();
const quantity = z.coerce.number().finite().positive();
const countedQuantity = z.coerce.number().finite().nonnegative();
const receiptItems = z.array(z.object({
    productId: positiveId,
    locationId: positiveId,
    quantity,
})).min(1);
const transferItems = z.array(z.object({
    productId: positiveId,
    quantity
})).min(1);
const adjustmentItems = z.array(z.object({
    productId: positiveId,
    countedQuantity
})).min(1);
const receiptSchema = z.object({ supplierName: z.string().trim().min(1).max(150), warehouseId: positiveId, items: receiptItems });
const deliverySchema = z.object({ warehouseId: positiveId, items: receiptItems });
const transferSchema = z.object({ fromLocationId: positiveId, toLocationId: positiveId, items: transferItems })
    .refine((value) => value.fromLocationId !== value.toLocationId, { message: 'Source and destination must differ', path: ['toLocationId'] });
const adjustmentSchema = z.object({ locationId: positiveId, items: adjustmentItems });
const itemSchemas = {
    receipts: z.object({ productId: positiveId, locationId: positiveId, quantity }),
    deliveries: z.object({ productId: positiveId, locationId: positiveId, quantity }),
    transfers: z.object({ productId: positiveId, quantity }),
    adjustments: z.object({ productId: positiveId, countedQuantity })
};

module.exports = { receiptSchema, deliverySchema, transferSchema, adjustmentSchema, itemSchemas };
