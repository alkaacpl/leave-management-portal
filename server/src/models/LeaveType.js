import mongoose from 'mongoose';

const { Schema } = mongoose;

const leaveTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_]{2,10}$/, 'Code must be 2-10 letters, digits or underscores.'],
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    defaultAnnualEntitlement: { type: Number, required: true, min: 0, max: 365 },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const LeaveType = mongoose.models.LeaveType || mongoose.model('LeaveType', leaveTypeSchema);
