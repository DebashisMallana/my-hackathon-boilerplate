const { z } = require('zod');

const productSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    sku: z.string().trim().min(1, 'SKU is required'),
    categoryId: z.number().int('Category ID must be an integer').positive(),
    unitId: z.number().int('Unit ID must be an integer').positive()
});

const productUpdateSchema = z.object({
    name: z.string().trim().min(1, 'Name cannot be empty').optional(),
    sku: z.string().trim().min(1, 'SKU cannot be empty').optional(),
    categoryId: z.number().int('Category ID must be an integer').positive().optional(),
    unitId: z.number().int('Unit ID must be an integer').positive().optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update'
});

const productQuerySchema = z.object({
    search: z.string().trim().optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    unitId: z.coerce.number().int().positive().optional()
});

module.exports = {
    productSchema,
    productUpdateSchema,
    productQuerySchema
};
