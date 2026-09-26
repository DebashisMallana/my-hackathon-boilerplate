const express = require('express');
const validate = require('../middleware/validate');
const { idParamSchema } = require('../validators/common.validator');
const { receiptSchema, deliverySchema, transferSchema, adjustmentSchema, itemSchemas } = require('../validators/document.validator');
const { createDocument, addItem, validateDocument } = require('../controllers/document.controller');

module.exports = ({ pool }) => {
    const router = express.Router();
    const configs = [
        ['receipts', receiptSchema],
        ['deliveries', deliverySchema],
        ['transfers', transferSchema],
        ['adjustments', adjustmentSchema]
    ];
    for (const [name, schema] of configs) {
        router.post(`/${name}`, validate(schema, 'body'), createDocument(pool, name));
        router.post(`/${name}/:id/items`, validate(idParamSchema, 'params'), validate(itemSchemas[name], 'body'), addItem(pool, name));
        router.post(`/${name}/:id/validate`, validate(idParamSchema, 'params'), validateDocument(pool, name));
    }
    return router;
};
