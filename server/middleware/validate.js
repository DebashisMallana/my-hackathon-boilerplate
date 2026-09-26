function validate(schema, source) {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);

        if (!result.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: result.error.issues.map((issue) => issue.message)
            });
        }

        req.validated = req.validated || {};
        req.validated[source] = result.data;
        return next();
    };
}

module.exports = validate;
