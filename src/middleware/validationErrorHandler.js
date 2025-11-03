import { validationResult } from 'express-validator';

export const validationErrorHandler = (req, res, next) => {
    const errors = validationResult(req);
    
    if(!errors.isEmpty()) { // Return the first error message if validation fails
        return res.status(400).json({ status: 400, message: errors.array()[0].msg });
    }

    next();
};