import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One row per employee + leave type + year.
 *
 * entitledDays and carryForwardDays are set by administrators. usedDays (approved) and
 * pendingDays (reserved by pending requests) are maintained by the leave service with
 * atomic conditional updates, so balances never go negative and are never double-deducted.
 */
const leaveBalanceSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    year: { type: Number, required: true, min: 2000, max: 2100 },
    entitledDays: { type: Number, required: true, min: 0, max: 365 },
    carryForwardDays: { type: Number, default: 0, min: 0, max: 365 },
    usedDays: { type: Number, default: 0, min: 0 },
    pendingDays: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

leaveBalanceSchema.index({ employee: 1, leaveType: 1, year: 1 }, { unique: true });
leaveBalanceSchema.index({ year: 1, employee: 1 });

leaveBalanceSchema.virtual('totalEntitled').get(function totalEntitled() {
  return this.entitledDays + (this.carryForwardDays || 0);
});

leaveBalanceSchema.virtual('availableDays').get(function availableDays() {
  return this.entitledDays + (this.carryForwardDays || 0) - this.usedDays - this.pendingDays;
});

export const LeaveBalance = mongoose.models.LeaveBalance || mongoose.model('LeaveBalance', leaveBalanceSchema);
