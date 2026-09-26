const { z } = require('zod');

const idParamSchema = z.object({
    id: z.coerce.number().int('ID must be an integer').positive('ID must be positive')
});

module.exports = { idParamSchema };
