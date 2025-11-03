import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import db from '../utils/DBUtil.js';
import { generateJWT, getEmailWaitTimeRemaining } from '../utils/Util.js';
import { sendVerificationEmail } from '../routes/auth.js';

passport.use(new LocalStrategy(async (username, password, done) => {
    const user = await db.getUser(username);

    if(!user) {
        return done(null, false, { message: 'Invalid credentials' });
    }

    const hashedPassword = user.password;
    const isMatch = await bcrypt.compare(password, hashedPassword);

    if(!isMatch) {
        return done(null, false, { message: 'Invalid credentials' });
    }

    if(!user.is_verified) {
        const emailWaitTimeRemaining = getEmailWaitTimeRemaining(user.verification_send_date);

        if(user.verification_send_date && emailWaitTimeRemaining >= 0) {
            return done(null, false, { message: `Email not verified - Please wait ${emailWaitTimeRemaining} more ${emailWaitTimeRemaining === 1 ? 'minute' : 'minutes'} before requesting another email.` });
        }
        else {
            const token = generateJWT(user.username);
            await sendVerificationEmail(user.email, token);
            await db.updateVerificationSendDate(user.email);
            return done(null, false, { message: `Email not verified - New verification email sent to ${user.email}` });
        }
    }

    return done(null, user);
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    const user = await db.getUserById(id);
    done(null, user);
});