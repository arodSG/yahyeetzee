import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { check } from 'express-validator';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { validationErrorHandler } from '../middleware/validationErrorHandler.js';
import db from '../utils/DBUtil.js';
import { generateJWT, getEmailWaitTimeRemaining } from '../utils/Util.js';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

router.post('/signup', [
    check('username').notEmpty().withMessage('Username is required'),
    check('password').notEmpty().withMessage('Password is required'),
    check('email').isEmail().withMessage('Valid email is required')
], validationErrorHandler, async (req, res) => {
    const { username, password, email } = req.body;

    try {
        const isUsernameValid = validateUsername(username);

        if(!isUsernameValid) {
            return res.status(400).json({ message: 'Username is invalid' });
        }

        const existingUser = await db.getUser(username);

        if(existingUser) {
            return res.status(400).json({ message: 'Username or Email already in use' });
        }

        const isPasswordValid = validatePassword(password);

        if(!isPasswordValid) {
            return res.status(400).json({ message: 'Password requirements not met' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const token = generateJWT(null, username, '10m');
        await db.insertUser(username, hashedPassword, email);
        console.log(`${username} signed up`);
        await sendVerificationEmail(email, token);
        await db.updateVerificationSendDate(email);
        res.json({ status: 201, message: 'User created successfully' });
    } catch(err) {
        console.log(err);
        res.status(500).json({ status: 500, message: 'Signup error' });
    }
});

router.post('/login', [
    check('username').notEmpty().withMessage('Username/Email is required'),
    check('password').notEmpty().withMessage('Password is required')
], validationErrorHandler, async (req, res, next) => {
    const { username, password } = req.body;
    const user = await db.getUser(username);

    if(!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const hashedPassword = user.password;
    const isMatch = await bcrypt.compare(password, hashedPassword);

    if(!isMatch) {
        console.log('Authentication failed: Invalid credentials');
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    if(!user.is_verified) {
        const emailWaitTimeRemaining = getEmailWaitTimeRemaining(user.verification_send_date);

        if(user.verification_send_date && emailWaitTimeRemaining >= 0) {
            return res.status(401).json({ message: `Email not verified - Please wait ${emailWaitTimeRemaining} more ${emailWaitTimeRemaining === 1 ? 'minute' : 'minutes'} before requesting another email.` });
        }
        else {
            const token = generateJWT(user.id, user.username, '10m');
            await sendVerificationEmail(user.email, token);
            await db.updateVerificationSendDate(user.email);
            return res.status(401).json({ message: `Email not verified - New verification email sent to ${user.email}` });
        }
    }
    else {
        const token = generateJWT(user.id, user.username, '30d');
        res.cookie('loggedInToken', token, {
            secure: process.env.NODE_ENV === 'prod',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        console.log(`${user.username} logged in`);
        return res.redirect('/');
    }
});

router.post('/forgotpassword', [
    check('username').notEmpty().withMessage('Username/Email is required'),
], validationErrorHandler, async (req, res, next) => {
    const { username } = req.body;

    try {
        const user = await db.getUser(username);

        if(!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if(!user.is_verified) {
            return res.status(404).json({ message: 'Email not verified' });
        }

        const emailWaitTimeRemaining = getEmailWaitTimeRemaining(user.verification_send_date);

        if(emailWaitTimeRemaining >= 0) {
            res.status(500).json({ message: `Please wait ${emailWaitTimeRemaining} more ${emailWaitTimeRemaining === 1 ? 'minute' : 'minutes'} before requesting another email.` });
        }
        else {
            const token = generateJWT(user.id, user.username, '10m');
            await sendPasswordResetEmail(user.email, token);
            await db.updateVerificationSendDate(user.email);
            res.json({ status: 200, message: 'Password reset email sent' });
        }
    }
    catch(error) {
        console.log(error);
        res.status(500).json({ message: 'Password reset error' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('connect.sid');
    res.clearCookie('loggedInToken');
    res.json({ message: 'Logged out successfully' });
});

router.get('/verify/:token', verifyToken, async (req, res, next) => {
    const username = req.user.username;

    try {
        const user = await db.getUser(username);

        if(!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if(user.is_verified) {
            console.log(`User ${username} already verified`);
            return res.redirect('/login');
        }

        await db.verifyUser(user.id);

        console.log(`${username} verified their email`);
        res.cookie('redirectedAfterVerification', true);
        return res.redirect('/login');
    }
    catch(error) {
        console.log(error);
        res.status(500).json({ message: 'Email verification error' });
    }
});

router.post('/resetpassword', [
    check('token').notEmpty().withMessage('Token is required'),
    check('password').notEmpty().withMessage('Password is required')
], validationErrorHandler, verifyToken, async (req, res, next) => {
    const username = req.user.username;
    const newPassword = req.body.password;

    try {
        const user = await db.getUser(username);

        if(!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if(!user.is_verified) {
            return res.status(404).json({ message: 'Email not verified' });
        }

        const isPasswordValid = validatePassword(newPassword);

        if(!isPasswordValid) {
            return res.status(400).json({ message: 'Password requirements not met' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.updatePassword(user.id, hashedPassword);
        console.log(`${username} reset their password`);
        res.json({ status: 200, message: 'Password successfully reset' });
    }
    catch(error) {
        console.log(error);
        res.status(500).json({ message: 'Email verification error' });
    }
});

function validateUsername(username) {
    const profanityMatcher = new RegExpMatcher({
        ...englishDataset.build(),
        ...englishRecommendedTransformers,
    });

    return /^[a-zA-Z0-9]*$/.test(username) && username.length >= 3 && !profanityMatcher.hasMatch(username);
}

function validatePassword(password) {
    return /[a-zA-Z]/.test(password) && /[0-9]/.test(password) && password.length >= 8;
}

export async function sendVerificationEmail(to, token) {
    console.log('Sending verification email to', to);

    const { data, error } = await resend.emails.send({
        from: `Yahyeetzee <${process.env.RESEND_FROM_ADDRESS}>`,
        to,
        subject: 'Verify your account',
        html: `<p>Click <a href="${process.env.ROOT_URL}/auth/verify/${token}">here</a> to verify your account and log in</p>`
    });

    if(error) {
        console.error('Failed to send email:', error);
        return;
    }

    console.log('Email sent successfully:', data.id);
}

async function sendPasswordResetEmail(to, token) {
    console.log('Sending password reset email to', to);

    const { data, error } = await resend.emails.send({
        from: `Yahyeetzee <${process.env.RESEND_FROM_ADDRESS}>`,
        to,
        subject: 'Reset your password',
        html: `<p>Click <a href="${process.env.ROOT_URL}/resetpassword?token=${token}">here</a> to reset your password</p>`
    });

    if(error) {
        console.error('Failed to send email:', error);
        return;
    }

    console.log('Email sent successfully:', data.id);
}

function verifyToken(req, res, next) {
    const token = req.params.token || req.body.token;

    if(!token) {
        return res.status(401).json({ status: 401, message: 'Unauthorized' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if(err) {
            return res.status(403).json({ status: 403, message: 'Forbidden' });
        }
        req.user = user;
        next();
    });
}

export default router;