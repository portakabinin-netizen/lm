const mongoose = require("mongoose");

const attendanceLogSchema = new mongoose.Schema(
    {
        employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: "StaffBook", required: true },
        corporateId:  { type: String, required: true },
        corpAdminId:  { type: mongoose.Schema.Types.ObjectId, required: true },
        date:         { type: Date, default: Date.now },
        status:       { type: String, enum: ["Present", "Absent", "On Leave", "Late"], default: "Present" },
        location: {
            latitude:  Number,
            longitude: Number,
            address:   String,
        },
        site_name:    { type: String, trim: true },
        recorded_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
        remarks:      { type: String, trim: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AttendanceLog", attendanceLogSchema);
