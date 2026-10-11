const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Users } = require("../models/UsersCorporates");

/** 🧱 CREATE USER (Admin / Normal) */
exports.create = async (data) => {
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
    return user;
};

/** 🔍 FIND BY MOBILE (Internal Use) */
exports.findByMobile = async (mobile) => {
    return await Users.findOne({ userMobile: mobile, userActive: true });
};

/** 🔍 CHECK UNIQUE FIELDS */
exports.checkExists = async (filter) => {
    return await Users.exists(filter);
};