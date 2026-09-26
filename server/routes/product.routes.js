const express = require('express');
const validate = require('../middleware/validate');
const { idParamSchema } = require('../validators/common.validator');
const {
    productSchema,
    productUpdateSchema,
    productQuerySchema
} = require('../validators/product.validator');
const {
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    listCategories,
    listUnits
} = require('../controllers/product.controller');

module.exports = ({ pool }) => {
    const router = express.Router();

    router.get('/categories', listCategories(pool));
    router.get('/units', listUnits(pool));
    router.get('/products', validate(productQuerySchema, 'query'), listProducts(pool));
    router.get('/products/:id', validate(idParamSchema, 'params'), getProduct(pool));
    router.post('/products', validate(productSchema, 'body'), createProduct(pool));
    router.patch(
        '/products/:id',
        validate(idParamSchema, 'params'),
        validate(productUpdateSchema, 'body'),
        updateProduct(pool)
    );

    return router;
};
