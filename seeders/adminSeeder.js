const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Admin = require('../models/Admin');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const seedSuperAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if super admin already exists
        const existingAdmin = await Admin.findOne({ adminRole: 'super_admin' });

        if (existingAdmin) {
            console.log('⚠️ Super Admin already exists:');
            console.log(`   Email: ${existingAdmin.email}`);
            console.log(`   Name: ${existingAdmin.fullName}`);
            await mongoose.connection.close();
            process.exit(0);
        }

        // Create super admin
        const superAdmin = new Admin({
            fullName: 'Super Admin',
            email: 'admin@medislot.com',
            password: 'Admin@123456',
            adminRole: 'super_admin',
        });

        await superAdmin.save();

        console.log('\n🎉 Super Admin created successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   Email:    admin@medislot.com`);
        console.log(`   Password: Admin@123456`);
        console.log(`   Role:     Super Admin`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n⚠️  IMPORTANT: Change the password after first login!\n');

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeder Error:', error.message);
        await mongoose.connection.close();
        process.exit(1);
    }
};

seedSuperAdmin();
