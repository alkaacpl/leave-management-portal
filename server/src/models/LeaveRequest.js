import mongoose from 'mongoose';
import { LEAVE_STATUS, LEAVE_STATUS_VALUES } from '../config/constants.js';
import { formatDateOnly } from '../utils/dates.js';

const { Schema } = mongoose;

const leaveRequestSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    // Stored as UTC midnight of the calendar date; serialised as "YYYY-MM-DD".
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    // Working days (Mon-Fri), always calculated on the server.
    days: { type: Number, required: true, min: 1 },
    // Balance year the request is charged to (requests may not span years).
    year: { type: Number, required: true },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
    status: { type: String, enum: LEAVE_STATUS_VALUES, default: LEAVE_STATUS.PENDING },
    // Reporting manager responsible for review (at application time; updated on review).
    manager: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    managerRemarks: { type: String, trim: true, maxlength: 500, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        if (ret.startDate instanceof Date) ret.startDate = formatDateOnly(ret.startDate);
        if (ret.endDate instanceof Date) ret.endDate = formatDateOnly(ret.endDate);
        return ret;
      },
    },
  },
);

leaveRequestSchema.path('endDate').validate(function endAfterStart(value) {
  return !this.startDate || !value || value >= this.startDate;
}, 'End date must be on or after the start date.');

leaveRequestSchema.index({ employee: 1, startDate: -1 });
leaveRequestSchema.index({ employee: 1, status: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index({ status: 1, createdAt: -1 });

export const LeaveRequest = mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', leaveRequestSchema);
