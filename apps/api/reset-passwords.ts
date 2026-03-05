import { db, sql } from './src/db/connection.js';
import { users } from './src/db/schema.js';
import { hashPassword } from './src/auth/auth.js';

async function resetPasswords() {
    console.log('🔄 Resetting passwords for all users to "password123"...');
    try {
        const passwordHash = await hashPassword('password123');
        const result = await db.update(users).set({ passwordHash }).returning({ email: users.email });
        console.log(`✅ Successfully updated passwords for ${result.length} users:`);
        result.forEach(r => console.log(`   - ${r.email}`));
    } catch (error) {
        console.error('❌ Failed to reset passwords:', error);
    } finally {
        await sql.end();
        process.exit(0);
    }
}

resetPasswords();
