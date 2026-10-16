import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { ROLE_VALUES, ROLES } from '../config/constants.js';

const { Schema } = mongoose;
const BCRYPT_ROUNDS = 10;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email address is invalid.'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.EMPLOYEE, index: true },
    department: { type: String, trim: true, maxlength: 100, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    manager: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Set when an administrator creates the account or resets its password: the user must
    // choose their own password before using the portal.
    mustChangePassword: { type: Boolean, default: false },
    // Tokens issued before this moment are rejected (sign-out everywhere on password change).
    passwordChangedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.passwordChangedAt;
        ret.mustChangePassword = Boolean(ret.mustChangePassword);
        return ret;
      },
    },
  },
);

userSchema.methods.verifyPassword = function verifyPassword(password) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
