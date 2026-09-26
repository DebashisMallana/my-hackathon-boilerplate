const { z } = require("zod");

// Validation for creating a product
const productSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Name is required"),

    sku: z
        .string()
        .trim()
        .min(1, "SKU is required"),

    categoryId: z
        .number()
        .int("Category ID must be an integer"),

    unitId: z
        .number()
        .int("Unit ID must be an integer"),
});

// Validation for updating a product
const productUpdateSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, "Name cannot be empty")
            .optional(),

        sku: z
            .string()
            .trim()
            .min(1, "SKU cannot be empty")
            .optional(),

        categoryId: z
            .number()
            .int("Category ID must be an integer")
            .optional(),

        unitId: z
            .number()
            .int("Unit ID must be an integer")
            .optional(),
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message: "At least one field is required for update",
        }
    );

module.exports = {
    productSchema,
    productUpdateSchema,
};