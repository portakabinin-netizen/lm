const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/** 🧱 CREATE USER (Admin / Normal) */
exports.create = async (data) => {
    const Users = mongoose.model("Users");
    const { userMobile, userPassword, corporateId } = data;

    const existing = await Users.findOne({ userMobile });
    if (existing) throw new Error("Mobile number already registered");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userPassword, salt);

    const user = new Users({
        ...data,
        userPassword: hashedPassword,
    });

    await user.save();

    // 🔗 Handle Corporate Linkage if needed
    if (corporateId && corporateId !== "None") {
        const Corporates = mongoose.model("Corporates");
        const corp = await Corporates.findById(corporateId);
        if (corp) {
            corp.linkedUsers.push(user._id);
            await corp.save();
        }
    }

    return user;
};

/** 🔍 FIND BY MOBILE (Internal Use) */
exports.findByMobile = async (mobile) => {
    const Users = mongoose.model("Users");
    return await Users.findOne({ userMobile: mobile, userActive: true });
};

/** 🔍 CHECK UNIQUE FIELDS */
exports.checkExists = async (filter) => {
    const Users = mongoose.model("Users");
    return await Users.exists(filter);
};